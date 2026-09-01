"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSocket } from "@/components/SocketProvider";
import { useRouter } from "next/navigation";
import PlayerBubble from "./PlayerBubble";
import AvatarImage from "@/components/AvatarImage";
import AvatarStatus from "@/components/social/AvatarStatus";
import { useLivePlayers, presenceOf, gameStateOf } from "@/components/social/useLivePlayers";
import { friendOrder, shownPresence, type ChosenStatus } from "@/lib/presence";
import TournamentRail from "@/components/social/TournamentRail";
import StatusBubble from "@/components/social/StatusBubble";
import ChatDock from "./ChatDock";
import { useToast } from "@/components/Toast";
import {
  MessageSquare,
  UserPlus,
  Gamepad2,
  Users,
  Mail,
  Send,
  X,
  Trophy,
  Search,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  MessageBody,
  RECONCILE_MS,
  dayLabel,
  mergeMessages,
  sameDay,
  timeLabel,
  type Message,
} from "./chatShared";
import "./social.css";

type Friend = {
  id: number;
  friendId: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  isRequester: boolean;
  /** The status they chose: online | away | dnd | invisible, or null. */
  presence?: ChosenStatus;
  /** When they were last around, epoch ms, or null if never recorded. */
  lastSeen?: number | null;
  /* elo and inLobby were declared here and never populated by /api/friends —
     the route selects neither. They are gone rather than left as optional
     fields that are always undefined. */
};

/** One conversation with somebody who is not on the friends list. */
type DmThread = {
  steamId: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  fromMe: boolean;
  /** Staff. They get their own category above the friends list. */
  isAdmin?: boolean;
};

/**
 * How many conversations may be docked at once.
 *
 * Four is where a row of them stops being a row and starts being a second
 * taskbar. Opening a fifth drops the oldest window — never its unread count.
 */
const MAX_DOCKS = 4;

/**
 * Above this many, a dock is too narrow for a name and shows only the avatar.
 *
 * Two full conversations side by side are still readable; three are not, and a
 * dock that keeps its name at the cost of clipping every message is worse than
 * one that admits it has no room.
 */
const COMPACT_ABOVE = 2;

/**
 * The mark beside the section you are in.
 *
 * One element that framer moves between the three buttons — that is what the
 * shared layoutId means — rather than a border colour that switches off one
 * and on another. Three buttons is exactly the case where the eye can follow
 * the move and learn the relationship between them.
 */
function RailFlag() {
  return (
    <motion.span
      className="friends-nav-flag"
      layoutId="socialRailFlag"
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
    />
  );
}

export default function FriendsSidebar() {
  const { t } = useI18n();
  const { socket, steamId, isConnected } = useSocket();
  const router = useRouter();
  const toast = useToast();

  /**
   * The phone drawer. On a desktop this decides nothing.
   *
   * The panel used to be a drawer everywhere: it expanded on hover, shrank on
   * an outside click, and could be pinned open by a click with the header's
   * close button as the only way to unpin. Every reported judder came out of
   * that mechanism rather than out of tuning it — it animated `width`, which is
   * a layout property, with a backdrop-filter being re-sampled inside the
   * animating clip, while the rail unmounted and the panel mounted on the same
   * tick and the chat docks teleported to an offset sized for a width the panel
   * no longer had.
   *
   * So the mechanism is gone rather than tuned. On a desktop the rail and the
   * panel are both simply there, at fixed widths, and nothing animates.
   *
   * A phone is the one case that still needs a toggle — a full-height column
   * down the side of a phone is most of the phone — so this survives to drive
   * the FAB and a CSS class, and nothing else reads it.
   */
  const [isOpen, setIsOpen] = useState(false);

  /* The panel and the rail, for the click-away handler further down — it has
     to be declared after the state it reads. */
  const panelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  /* The --social-top measurement is gone with the header it measured.
     There is no bar across the top any more — the rails run the full height of
     the viewport — so the variable is 0 and nothing has to observe anything to
     know that. */

  /**
   * Who is in a game right now, from the same feed the left sidebar uses.
   *
   * This is the half that was missing: the dot has had an `ingame` state and
   * an accent glow for as long as it has existed, and nothing ever passed it.
   */
  const livePlayers = useLivePlayers();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [addFriendInput, setAddFriendInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  // MESSAGES went with the Chat tab: those conversations are in the friends
  // list now, under their own headings.
  type Section = "TOURNAMENTS" | "FRIENDS" | "MAIL";

  /**
   * Which section the drawer is showing, or null for closed.
   *
   * Null is the resting state. The rail is always there; the 300px of panel is
   * not, because a friends list is something you go and look at rather than
   * something that should take a third of every page you visit.
   *
   * Pressing the section you are already in closes it — the same button, the
   * same place, both ways — so there is no separate close control to find.
   */
  const [activeTab, setActiveTab] = useState<Section | null>(null);

  const openSection = useCallback((next: Section) => {
    setActiveTab((cur) => (cur === next ? null : next));
  }, []);

  /**
   * The last section that was open, kept for the length of the closing
   * animation.
   *
   * Closing sets activeTab to null, and AnimatePresence keeps the drawer
   * mounted for another 200ms to animate it out — so rendering the content
   * from activeTab emptied the panel first and faded an empty box second.
   * The content comes from here instead, which does not go null.
   */
  const lastTabRef = useRef<Section>("FRIENDS");
  if (activeTab) lastTabRef.current = activeTab;
  const shownTab = activeTab ?? lastTabRef.current;

  /**
   * Every conversation that is open, oldest first.
   *
   * This was a single `activeDmUser`, which is why opening a second
   * conversation silently threw away the first. Each id here is a dock, each
   * dock owns its own messages, and the row they sit in shares the width
   * between them — see MAX_DOCKS and `compact` below.
   */
  const [openChats, setOpenChats] = useState<string[]>([]);
  const dockRef = useRef<HTMLDivElement>(null);
  /** friendId -> unread count, cleared when that thread is visible. */
  const [unread, setUnread] = useState<Record<string, number>>({});
  /** Mirror for the socket handler, which closes over its first render. */
  const openChatsRef = useRef<string[]>([]);
  openChatsRef.current = openChats;

  /**
   * A click on the page puts the DRAWER away. Conversations stay.
   *
   * This closed the docks too for a while, on the argument that a dock holds
   * no unsent work so reopening one loses nothing. That was wrong about what
   * the two things are. The drawer is navigation — you open it, you find
   * somebody, you are done with it. A conversation is a task you are in the
   * middle of, and it is normal to click the page while having one: to read
   * the thing you are talking about, to check a scoreboard, to follow a link
   * somebody sent you. Every one of those closed the window mid-sentence.
   *
   * So the dock closes on its own X, and on nothing else.
   *
   * Capture phase, and the same exclusions: the player bubble and the status
   * menu are portalled or absolutely placed outside the panel, so a plain
   * contains() check reads a click inside them as a click outside everything
   * and shuts the thing they were opened from.
   */
  useEffect(() => {
    const somethingOpen = isOpen || activeTab !== null;
    if (!somethingOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (panelRef.current?.contains(target)) return;
      if (railRef.current?.contains(target)) return;
      if (dockRef.current?.contains(target)) return;

      const el = target as HTMLElement;
      if (el.closest?.(".player-bubble, .friends-bubble, .sb-menu, .dm-dock")) return;

      setIsOpen(false);
      setActiveTab(null);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isOpen, activeTab]);

  /**
   * A click outside the docks closes nothing.
   *
   * It used to fold the one open conversation away, which made sense when
   * there was one and it filled the corner. With a row of them, folding the
   * lot because somebody clicked the page is a lot of state to lose to a
   * stray click — and each dock already has its own header to fold it and its
   * own X to close it.
   */

  const online = useCallback((id: string) => onlineUsers.includes(id), [onlineUsers]);

  const friendName = useCallback(
    (id: string) => friends.find((f) => f.friendId === id)?.name ?? id,
    [friends]
  );

  // ---------- data ----------

  const fetchFriends = useCallback(async () => {
    if (!steamId) return;
    try {
      const res = await fetch("/api/friends", { headers: { Authorization: `Bearer ${steamId}` } });
      if (!res.ok) return;
      const data: Friend[] = await res.json();
      setFriends(data.filter((f) => f.status === "ACCEPTED"));
      setPendingRequests(data.filter((f) => f.status === "PENDING" && !f.isRequester));
    } catch {
      /* leaving the list as it was beats blanking it */
    }
  }, [steamId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ---------- sockets ----------

  useEffect(() => {
    if (!socket) return;

    /**
     * Counting only. Each dock listens for its own conversation and merges the
     * message itself, so the panel's job here is the badge — including for
     * threads with no dock open at all, which is the case a dock cannot cover.
     *
     * Incremented unconditionally, then cleared by the dock the moment it is
     * actually visible. That is what makes a folded or squeezed-down dock keep
     * counting: the old version treated "this thread is open" as "somebody is
     * reading it", so a minimised dock could never show a number.
     */
    const onNewMessage = (msg: any) => {
      if (msg?.type !== "dm" && msg?.type !== "direct") return;
      const from = String(msg.from);
      // My own message, echoed back so my other tabs catch up. Never unread: I
      // wrote it.
      if (steamId && from === steamId) return;
      setUnread((u) => ({ ...u, [from]: (u[from] ?? 0) + 1 }));
    };

    const onSync = (users: string[]) => setOnlineUsers(users.map(String));
    const onUserOnline = ({ steamId: id }: { steamId: string }) =>
      setOnlineUsers((prev) => Array.from(new Set([...prev, String(id)])));
    const onUserOffline = ({ steamId: id }: { steamId: string }) =>
      setOnlineUsers((prev) => prev.filter((x) => x !== String(id)));
    const onNotification = (notif: any) => {
      if (notif?.Type === "FRIEND_REQUEST" || notif?.Type === "ACCEPTED") fetchFriends();
    };

    socket.on("new_message", onNewMessage);
    socket.on("online_friends_sync", onSync);
    socket.on("user_online", onUserOnline);
    socket.on("user_offline", onUserOffline);
    socket.on("notification", onNotification);
    socket.emit("get_online_users");

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("online_friends_sync", onSync);
      socket.off("user_online", onUserOnline);
      socket.off("user_offline", onUserOffline);
      socket.off("notification", onNotification);
    };
    // steamId is read inside onNewMessage to recognise my own echo, so the
    // handler has to be rebuilt when it arrives — without it the first render
    // captures undefined and every echo is treated as somebody else's message.
  }, [socket, fetchFriends, steamId]);

  // ---------- actions ----------

  /**
   * Opens a conversation without closing the ones already open.
   *
   * Re-opening a thread that is already docked is deliberately a no-op on the
   * list — it keeps its place in the row rather than jumping to the end, so
   * clicking a name in the friends panel never rearranges what you were
   * reading. Oldest stays leftmost.
   *
   * Past MAX_DOCKS the oldest is dropped. Its unread count is not: closing a
   * dock loses the window, never the fact that somebody is waiting.
   */
  const openThread = (friendId: string) => {
    setOpenChats((prev) => {
      if (prev.includes(friendId)) return prev;
      const next = [...prev, friendId];
      return next.length > MAX_DOCKS ? next.slice(next.length - MAX_DOCKS) : next;
    });
    setUnread((u) => ({ ...u, [friendId]: 0 }));
  };

  const closeThread = (friendId: string) =>
    setOpenChats((prev) => prev.filter((id) => id !== friendId));

  const markRead = useCallback(
    (friendId: string) =>
      setUnread((u) => (u[friendId] ? { ...u, [friendId]: 0 } : u)),
    [],
  );

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = addFriendInput.trim();
    if (!target || !steamId || addBusy) return;
    setAddBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(t("social.friends.error", { error: data.error }), "error");
        return;
      }
      if (data.success && socket) {
        socket.emit("send_notification", { targetSteamId: target, notification: data.notification });
      }
      setAddFriendInput("");
      toast(t("social.friends.requestSent"));
      fetchFriends();
    } catch {
      toast(t("social.friends.error", { error: "network" }), "error");
    } finally {
      setAddBusy(false);
    }
  };

  const respondToRequest = async (friendshipId: number, action: "ACCEPT" | "REJECT") => {
    if (!steamId) return;
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${steamId}` },
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchFriends();
    } catch {
      toast("Could not update that request.", "error");
    }
  };

  const inviteFriend = async (friendId: string) => {
    if (!steamId || !socket) return;

    let lobbyId = "";
    /** Which lobby you are inviting them to — they are different pages. */
    let kind: "retakes" | "games" = "retakes";
    const match = window.location.pathname.match(/\/games\/lobby\/([a-zA-Z0-9]+)/);
    if (!match) {
      const rlMatch = window.location.pathname.match(/\/lobby\/([a-zA-Z0-9-]+)/);
      if (!rlMatch) {
        const res = await fetch("/api/lobby/create", {
          method: "POST",
          headers: { Authorization: `Bearer ${steamId}` },
        });
        if (!res.ok) {
          toast(t("social.friends.notInLobby"), "error");
          return;
        }
        const data = await res.json();
        lobbyId = data.lobbyId;
        router.push(`/lobby/${lobbyId}`);
      } else {
        lobbyId = rlMatch[1];
      }
    } else {
      lobbyId = match[1];
      kind = "games";
    }

    try {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: friendId, lobbyId, kind }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        socket.emit("send_notification", { targetSteamId: friendId, notification: data.notification });
        toast(t("social.friends.inviteSent"));
      }
    } catch {
      toast("Invite failed.", "error");
    }
  };

  // ---------- derived ----------

  /**
   * Everybody, in the order somebody reads a friends list.
   *
   * It was alphabetical, which is the order of a phone book: it answers "where
   * is Xavier" and never "who could I play with right now". Presence first —
   * in a game, then online, then away, then do-not-disturb — and inside each
   * group the most recently seen at the top, so a friend who logged off an
   * hour ago sits above one last seen in March.
   *
   * The rules live in lib/presence.ts with their own tests, because none of
   * this fails loudly: a wrong order just quietly stops being useful.
   */
  const sortedFriends = useMemo(
    () =>
      friendOrder(
        friends.map((f) => ({
          ...f,
          shown: shownPresence({
            connected: online(f.friendId),
            inGame: gameStateOf(f.friendId, livePlayers),
            chosen: f.presence ?? null,
          }),
          lastSeen: f.lastSeen ?? null,
        })),
      ),
    [friends, online, livePlayers],
  );

  const onlineFriends = useMemo(
    () => sortedFriends.filter((f) => f.shown !== "offline"),
    [sortedFriends],
  );
  const offlineFriends = useMemo(
    () => sortedFriends.filter((f) => f.shown === "offline"),
    [sortedFriends],
  );

  /**
   * What the rail shows: eight, and the eight that matter.
   *
   * A rail is a glance. Past eight faces it is a list you scroll, which is
   * what the panel beside it is for — and because the order above puts the
   * reachable people first, the eight it keeps are the eight worth keeping.
   */
  const RAIL_FACES = 8;
  const railFriends = useMemo(() => sortedFriends.slice(0, RAIL_FACES), [sortedFriends]);

  const totalUnread = useMemo(
    () => Object.values(unread).reduce((n, v) => n + v, 0),
    [unread]
  );

  /**
   * Every conversation with somebody who is not a friend.
   *
   * There is no Chat tab any more. It was a second list of the same people —
   * a friend appeared there whether or not a word had ever passed between you —
   * and having two places a message might be is how one of them stops being
   * checked. Friends carry their own unread count on the friends list; these
   * threads are folded in above it, and the staff ones get a category of their
   * own because a message from an admin is not a social one.
   */
  const [strangerThreads, setStrangerThreads] = useState<DmThread[]>([]);

  /**
   * People you have played with who are not friends yet.
   *
   * The add box asks for a SteamID64 or a nickname, which works for somebody
   * whose id you already have and not at all for the people most worth adding —
   * the ones you were on a roster with last night, whose id is the one thing
   * you do not know.
   */
  const [suggestions, setSuggestions] = useState<
    { steamId: string; name: string; times: number }[]
  >([]);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/threads", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStrangerThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch {
      // A failed refresh leaves the last list up; the next message reloads it.
    }
  }, []);

  // Loaded whenever the panel is open, not when a tab is selected: the threads
  // feed the admin category on the friends list now, so waiting for a tab that
  // no longer exists would mean it never loaded at all.
  useEffect(() => {
    // Always. The panel is on screen from the moment the page is, so there is
    // no "opened" moment left to hang this off — waiting for one meant a
    // permanently visible Mail tab that stayed empty until somebody toggled a
    // drawer that no longer exists.
    loadThreads();
  }, [loadThreads]);

  // Only when the tab that shows them is open: this is a join across every
  // roster the viewer has ever been on, and it is not worth running for
  // somebody who came to read their friends list.
  useEffect(() => {
    if (activeTab !== "MAIL") return;

    let alive = true;
    fetch("/api/friends/suggestions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : []);
      })
      .catch(() => {
        // A convenience, not a feature: the add box below still works.
      });

    return () => {
      alive = false;
    };
  }, [activeTab]);

  /**
   * Staff conversations, newest first.
   *
   * They leave this list when the admin closes the thread — the endpoint stops
   * returning it — which is what makes it a queue rather than a permanent
   * section somebody has to look at for ever.
   */
  const adminThreads = useMemo(
    () =>
      strangerThreads
        .filter((thread) => thread.isAdmin)
        .map((thread) => ({
          steamId: thread.steamId,
          name: thread.name,
          avatarUrl: null as string | null,
          lastAt: thread.lastAt,
        }))
        .sort((a, b) => {
          const ua = unread[a.steamId] ?? 0;
          const ub = unread[b.steamId] ?? 0;
          if (ua !== ub) return ub - ua;
          return b.lastAt.localeCompare(a.lastAt);
        }),
    [strangerThreads, unread],
  );

  const threads = useMemo(() => {
    const friendIds = new Set(friends.map((f) => f.friendId));

    // A thread that turned into a friendship is shown as a friend, and a staff
    // thread has its own category above — either would otherwise appear twice.
    const rows = strangerThreads
      .filter((thread) => !friendIds.has(thread.steamId) && !thread.isAdmin)
      .map((thread) => ({
        id: Number(thread.steamId.slice(-9)) || 0,
        friendId: thread.steamId,
        name: thread.name,
        avatarUrl: null,
        status: "stranger",
        isRequester: false,
        lastMessage: thread.lastMessage,
        lastAt: thread.lastAt,
        fromMe: thread.fromMe,
      }));

    return rows.sort((a, b) => {
      const ua = unread[a.friendId] ?? 0;
      const ub = unread[b.friendId] ?? 0;
      if (ua !== ub) return ub - ua;
      // Then by recency, which is the only ordering a message list should have.
      return b.lastAt.localeCompare(a.lastAt);
    });
  }, [friends, strangerThreads, unread]);

  if (!isConnected) return null;


  const renderFriendRow = (f: Friend, isOnline: boolean) => (
    <div
      key={f.id}
      className={
        `friend-item${isOnline ? "" : " offline-item"}` +
        // Tinted when they are waiting on a reply, so a glance down the list
        // finds them without reading every row.
        ((unread[f.friendId] ?? 0) > 0 ? " has-unread" : "")
      }
    >
      <div className="friend-info">
        <AvatarStatus
          steamId={f.friendId}
          name={f.name}
          src={f.avatarUrl}
          presence={presenceOf(f.friendId, livePlayers, isOnline)}
          size={28}
        />
        {/* The card knows what this row knows: whether they have a tab
            open, and how to start a conversation. Both were missing — the
            card had no Message button at all, which is the reason most of
            them are opened. */}
        <PlayerBubble
          steamId={f.friendId}
          name={f.name}
          isFriend
          isOnline={isOnline}
          onMessage={openThread}
        >
          <div className="friend-lines">
            <span className="friend-name">{f.name}</span>
            {/* What they are actually doing, which is the line this always
                wanted to be. It read `f.elo ? "Elo N" : "Online"` and
                `f.lastSeen ? "Last seen X" : "Offline"` — and since
                /api/friends populates neither field, every row on every screen
                said exactly "Online" or "Offline". The live feed knows more
                than that and has done all along. */}
            <span className="friend-stats">
              {t(`social.presence.${presenceOf(f.friendId, livePlayers, isOnline)}`)}
            </span>
          </div>
        </PlayerBubble>
      </div>
      <div className="friend-actions">
        <button className="btn-social" onClick={() => openThread(f.friendId)} title={t("social.friends.tabChat")}>
          <MessageSquare size={16} />
          {/* The number, not a dot. A dot says "something happened"; a person
              deciding whether to open a conversation wants to know whether it
              is one message or nine, and the row is already tinted to say that
              there is anything at all. */}
          {(unread[f.friendId] ?? 0) > 0 && (
            <span className="count-badge">{Math.min(99, unread[f.friendId] ?? 0)}</span>
          )}
        </button>
        {isOnline && (
          <button
            className="btn-social"
            onClick={() => inviteFriend(f.friendId)}
            title={t("social.friends.inviteBtn")}
          >
            <UserPlus size={16} />
          </button>
        )}
        {/* The Spectate button is gone. It was gated on `f.inLobby`, which
            /api/friends has never set — the field is declared on the Friend
            type and nothing populates it — so the branch could not run and the
            button could not be seen. Presence is now shown by the dot on the
            avatar, which is fed by a feed that actually exists. */}
        {isOnline ? (
          <button
            className="btn-social"
            onClick={() => router.push("/lobby")}
            title={t("social.friends.playBtn")}
          >
            <Gamepad2 size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {/* The rail, collapsed.
       *
       * This used to be a pill in the bottom-right corner that said "Friends"
       * and a number, so the only way to know whether anybody was around was to
       * open the panel and look. The rail says it without being asked: rounded
       * avatars down the right edge, a presence dot on each, and the expand
       * control at the top rather than a button at the bottom.
       *
       * Hidden entirely while an overlay owns the screen — the accept window
       * and the loadout gate both cover the page, and this is position:fixed. */}
      {/* One dock, two widths.
          The rail and the panel used to be two fixed elements at different
          z-indexes, so collapsing did not shrink anything — it slid a 330px
          panel off screen and revealed a separate 56px bar that had been
          sitting behind it the whole time. You could see the seam.

          Now they are two views inside one element whose WIDTH animates, and
          only one of them is rendered at a time. There is nothing behind
          anything, and the collapsed state is the same dock, narrower. */}
      <div className={`social-dock ${isOpen ? "open" : ""}`}>
      {/* The rail. First in the DOM, last on screen.

          It is a nav, so it belongs first in the reading order; it is the edge
          of the screen, so it belongs last visually. Flex `order` in social.css
          gives both — moving the markup would have traded one for the other.

          It used to sit INBOARD of the panel, which is what made it look like
          a navbar parked next to the panel rather than the edge of it. */}
      <nav className="friends-rail" ref={railRef} aria-label={t("social.header.nav")}>
        {/* You, above the rule. The three below are places to go; this one
            is who you are, and it holds the one control the site had
            nowhere for — the status you CHOOSE, as against the two it
            observes about you. */}
        {steamId && <StatusBubble steamId={steamId} />}

        <button
          className={`friends-nav-btn ${activeTab === "TOURNAMENTS" ? "active" : ""}`}
          aria-current={activeTab === "TOURNAMENTS"}
          onClick={() => openSection("TOURNAMENTS")}
          title={t("social.tournaments")}
        >
          {activeTab === "TOURNAMENTS" && <RailFlag />}
          <Trophy size={18} />
        </button>

        <button
          className={`friends-nav-btn ${activeTab === "FRIENDS" ? "active" : ""}`}
          aria-current={activeTab === "FRIENDS"}
          onClick={() => openSection("FRIENDS")}
          title={t("social.friends.tabFriends")}
        >
          {activeTab === "FRIENDS" && <RailFlag />}
          <Users size={18} />
          {totalUnread > 0 && <span className="friends-nav-badge">{totalUnread}</span>}
        </button>

        <button
          className={`friends-nav-btn ${activeTab === "MAIL" ? "active" : ""}`}
          aria-current={activeTab === "MAIL"}
          onClick={() => openSection("MAIL")}
          title={t("social.friends.tabInvites")}
        >
          {activeTab === "MAIL" && <RailFlag />}
          <Mail size={18} />
          {pendingRequests.length > 0 && (
            <span className="friends-nav-badge">{pendingRequests.length}</span>
          )}
        </button>
      </nav>


      {/* The chats are docks, not a panel view.
          They used to live inside the sidebar, which meant reading a message
          required the whole 330px panel open over the page, and closing the
          panel to get on with something closed the conversation with it. As
          cards anchored to the corner they behave the way every chat people
          already use behaves: independent of whatever else is open, and small
          enough to leave the page usable behind them.

          A ROW of them, sharing the width. Opening a second conversation used
          to replace the first, so there was never more than one and the one
          you had was lost without warning. Now each takes an equal share of
          the row and they get narrower together; past the point where a name
          would fit, `compact` drops them to just the avatar rather than
          letting the layout squash the text into nothing.

          Portalled to <body> so the sidebar's transform and overflow cannot
          clip or move them. */}
      {openChats.length > 0 && typeof document !== "undefined" && createPortal(
        <div className="dm-docks" ref={dockRef}>
          {/* Each dock animates itself; this is what lets a closed one leave
              rather than blink out from under the row. */}
          <AnimatePresence initial={false}>
          {openChats.map((id) => {
            const friend = friends.find((f) => f.friendId === id);
            return (
              <ChatDock
                key={id}
                friendId={id}
                name={friend?.name ?? id}
                avatarUrl={friend?.avatarUrl}
                isOnline={online(id)}
                steamId={steamId ?? null}
                socket={socket}
                unread={unread[id] ?? 0}
                onRead={() => markRead(id)}
                onClose={() => closeThread(id)}
                compact={openChats.length > COMPACT_ABOVE}
                onInvite={inviteFriend}
                onError={(m) => toast(m, "error")}
              />
            );
          })}
          </AnimatePresence>
        </div>,
        document.body,
      )}

      {/* The phone's way in.
          The rail is display:none below 760px — a full-height column down the
          side of a phone is most of the phone — and the button that used to
          replace it, .friends-toggle-btn, exists only as three dead rules in
          globals.css. So on a phone there was no way to open this panel at all.
          A single floating button restores it without giving up the screen. */}
      <button
        className={`friends-fab ${isOpen ? "hidden" : ""}`}
        onClick={() => {
          setIsOpen(true);
          // The rail is display:none on a phone, so the FAB is the only way in
          // — and with no section chosen it opened onto 300px of nothing.
          setActiveTab((cur) => cur ?? "FRIENDS");
        }}
        aria-label={t("social.friends.toggleBtn")}
        title={t("social.friends.toggleBtn")}
      >
        <Users size={18} />
        {(pendingRequests.length > 0 || totalUnread > 0) && (
          <span className="notification-badge">{pendingRequests.length + totalUnread}</span>
        )}
      </button>

      {/* The panel carries the hover surface, not the rail: .friends-rail.hidden
          sets pointer-events: none, so once the panel is open the rail cannot
          receive a mouseleave and the pair would latch open forever. */}
      {/* The drawer slides the 300px it occupies, on transform and opacity —
          never on width, which is what the whole panel used to animate and
          what every reported judder came out of. The space is already
          reserved by .social-dock, so nothing beside it moves. */}
      <AnimatePresence initial={false}>
      {activeTab !== null && (
      <motion.div
        className="friends-sidebar"
        ref={panelRef}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >

        {/* One section at a time, and the outgoing one leaves before the
            incoming one arrives — mode="wait", because two 300px columns
            crossing over each other in a 300px panel is a smear rather than a
            transition. */}
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={shownTab}
          className="friends-sections"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.13, ease: "easeOut" }}
        >
        {shownTab === "TOURNAMENTS" && (
          <div className="friends-content">
            <TournamentRail />
          </div>
        )}

        {shownTab === "FRIENDS" && (
          <div className="friends-content">
            {friends.length === 0 && adminThreads.length === 0 && (
              <p className="muted-text">{t("social.friends.noFriends")}</p>
            )}

            {/* Eight faces at the top, straight to a conversation.

                Above the staff group rather than under it: sitting between
                staff and the roster it read as a row of staff, which is the
                one thing it never contains.

                The list below is the whole roster and answers "who have I
                got"; this row answers "who can I talk to now", which is the
                question the panel is usually opened for. Capped at eight
                because past that it stops being a glance and becomes the list
                underneath it — and because the order puts the reachable people
                first, the eight it keeps are the eight worth keeping. */}
            {railFriends.length > 0 && (
              <div className="friends-quick">
                {railFriends.map((f, i) => (
                  <motion.button
                    key={f.friendId}
                    className="friends-quick-face"
                    title={f.name}
                    aria-label={f.name}
                    onClick={() => openThread(f.friendId)}
                    initial={{ opacity: 0, scale: 0.86 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.16, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <AvatarStatus
                      steamId={f.friendId}
                      name={f.name}
                      src={f.avatarUrl}
                      presence={f.shown}
                      size={30}
                    />
                    {(unread[f.friendId] ?? 0) > 0 && <span className="dot-badge" />}
                  </motion.button>
                ))}
              </div>
            )}

            {/* Staff first, and never mixed in with friends.
                A message from an admin is not a social one — it is usually
                about your account or a match you are in — and finding it
                sorted alphabetically among people you play with is how it gets
                missed. They leave this list when the admin closes the thread,
                which is what makes it a queue rather than a permanent section. */}
            {adminThreads.length > 0 && (
              <>
                <div className="friends-category-title is-admin">
                  {t("social.friends.adminCategory")} — {adminThreads.length}
                </div>
                {adminThreads.map((a) => (
                  <div
                    key={a.steamId}
                    className={`friend-item is-admin${(unread[a.steamId] ?? 0) > 0 ? " has-unread" : ""}`}
                  >
                    <div className="friend-info">
                      <AvatarStatus
                        steamId={a.steamId}
                        name={a.name}
                        src={a.avatarUrl}
                        presence={presenceOf(a.steamId, livePlayers, onlineUsers.includes(a.steamId))}
                        size={28}
                      />
                      <div className="friend-lines">
                        <span className="friend-name">{a.name}</span>
                        <span className="friend-stats">{t("social.friends.adminRow")}</span>
                      </div>
                    </div>
                    <div className="friend-actions">
                      <button className="btn-social" onClick={() => openThread(a.steamId)} title={t("social.friends.tabChat")}>
                        <MessageSquare size={16} />
                        {(unread[a.steamId] ?? 0) > 0 && (
                          <span className="count-badge">{Math.min(99, unread[a.steamId] ?? 0)}</span>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}


            {onlineFriends.length > 0 && (
              <>
                <div className="friends-category-title">
                  {t("social.status.online")} — {onlineFriends.length}
                </div>
                {onlineFriends.map((f) => renderFriendRow(f, true))}
              </>
            )}

            {offlineFriends.length > 0 && (
              <>
                <div className="friends-category-title mt-4">
                  {t("social.status.offline")} — {offlineFriends.length}
                </div>
                {offlineFriends.map((f) => renderFriendRow(f, false))}
              </>
            )}

            {/* Conversations with people who are not friends: a team-mate from
                a tournament, somebody who messaged off a profile. They used to
                live in a Chat tab, which was a second place a message might be
                — and two places is how one of them stops being checked. */}
            {threads.length > 0 && (
              <>
                <div className="friends-category-title mt-4">
                  {t("social.friends.otherChats")} — {threads.length}
                </div>
            {threads.map((f) => {
              const count = unread[f.friendId] ?? 0;
              return (
                <div key={f.friendId} className={`friend-item thread${count > 0 ? " unread" : ""}`}>
                  <div className="friend-info">
                    {/* Same component as the friends tab, so the two lists
                        look like one design. The old row hand-rolled an
                        avatar and a status dot and had already drifted. */}
                    <AvatarStatus
                      steamId={f.friendId}
                      name={f.name}
                      src={f.avatarUrl}
                      presence={presenceOf(f.friendId, livePlayers, online(f.friendId))}
                      size={28}
                    />
                    <div className="friend-lines">
                      <span className="friend-name">{f.name}</span>
                      <span className="friend-stats">
                        {f.fromMe && <span className="dm-you">{t("social.friends.you")} </span>}
                        {f.lastMessage}
                      </span>
                    </div>
                  </div>

                  <div className="friend-actions">
                    <button
                      className="btn-social"
                      onClick={() => openThread(f.friendId)}
                      title={t("social.friends.chat")}
                      aria-label={t("social.friends.chat")}
                    >
                      <MessageSquare size={16} />
                      {count > 0 && <span className="dot-badge" />}
                    </button>

                    {/* The action a stranger's thread actually wants. */}
                    <button
                      className="btn-social"
                      onClick={() => socket?.emit("friend_request", { targetId: f.friendId })}
                      title={t("social.friends.add")}
                      aria-label={t("social.friends.add")}
                    >
                      <UserPlus size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
              </>
            )}

          </div>
        )}

        {/* Not inside .friends-content: the thread view owns the full height so
            its composer can sit on the bottom edge, which it cannot do inside a
            padded scroll container. */}
        {shownTab === "MAIL" && (
          <div className="friends-content">
            {/* Above the box, because it is the answer to the question the box
                asks badly: the people you would actually add are here, and
                their SteamID64 is the one thing you were never going to know. */}
            {suggestions.length > 0 && (
              <div className="mail-section">
                <h3>{t("social.friends.suggestions")}</h3>
                <p className="muted-text sg-why">{t("social.friends.suggestionsWhy")}</p>

                <ul className="sg-list">
                  {suggestions.map((sug) => (
                    <li key={sug.steamId} className="sg-row">
                      <AvatarStatus
                        steamId={sug.steamId}
                        name={sug.name}
                        src={null}
                        presence={presenceOf(sug.steamId, livePlayers, onlineUsers.includes(sug.steamId))}
                        size={28}
                      />
                      <span className="sg-name">{sug.name}</span>
                      <span className="sg-times muted-text">
                        {t("social.friends.playedTogether", { n: String(sug.times) })}
                      </span>
                      <button
                        className="btn-social"
                        title={t("social.friends.add")}
                        aria-label={t("social.friends.add")}
                        onClick={() => {
                          socket?.emit("friend_request", { targetId: sug.steamId });
                          // Removed on click rather than on a refetch: the row
                          // has done its job, and leaving it there invites a
                          // second request that the server would refuse.
                          setSuggestions((prev) => prev.filter((x) => x.steamId !== sug.steamId));
                        }}
                      >
                        <UserPlus size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mail-section">
              <h3>{t("social.friends.addTitle")}</h3>
              {/* One field and one button, on one line.

                  It was an untranslated "SteamID64 or nickname" — the format
                  of the input, which is what a developer needs and not what
                  somebody adding a friend is thinking about. The placeholder
                  names the person now and the hint below carries the format,
                  which is the order those two facts are wanted in.

                  The button is an icon: the field is 300px wide in a 300px
                  panel and "Send request" beside it left room for about four
                  characters of typing. */}
              <form onSubmit={handleAddFriend} className="add-friend-form">
                <div className="aff-row">
                  <Search size={14} className="aff-icon" aria-hidden />
                  <input
                    type="text"
                    className="aff-input"
                    placeholder={t("social.friends.addPlaceholder")}
                    aria-label={t("social.friends.addTitle")}
                    value={addFriendInput}
                    onChange={(e) => setAddFriendInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="aff-go"
                    disabled={!addFriendInput.trim() || addBusy}
                    title={t("social.friends.sendRequest")}
                    aria-label={t("social.friends.sendRequest")}
                  >
                    {addBusy ? <Loader2 size={14} className="aff-spin" /> : <UserPlus size={14} />}
                  </button>
                </div>

                <span className="aff-hint">{t("social.friends.addHint")}</span>
              </form>
            </div>

            <div className="mail-section mt-4">
              <h3>{t("social.friends.pendingTitle")}</h3>
              <div className="pending-list">
                {pendingRequests.length === 0 && <p className="muted-text">{t("social.friends.noPending")}</p>}
                {pendingRequests.map((r) => (
                  <div key={r.id} className="pending-item">
                    <div className="friend-info">
                      <span className="friend-avatar sm">
                        <AvatarImage steamId={r.friendId} src={r.avatarUrl} alt={r.name} />
                      </span>
                      <span className="friend-name">{r.name}</span>
                    </div>
                    <div className="pending-actions">
                      <button className="btn-accept" onClick={() => respondToRequest(r.id, "ACCEPT")} aria-label={t("utility.accept")}>✓</button>
                      <button className="btn-reject" onClick={() => respondToRequest(r.id, "REJECT")} aria-label={t("utility.reject")}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </motion.div>
        </AnimatePresence>
      </motion.div>
      )}
      </AnimatePresence>
      </div>
    </>
  );
}

/**
 * A message body, with a clip preview when one is linked.
 *
 * The old version returned the raw string alongside a `<video>` for any URL
 * ending in .mp4 — including one pasted by someone you had just met. It now
 * only previews links from this site, and shows the rest as plain text.
 */
