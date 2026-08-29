"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSocket } from "@/components/games/SocketProvider";
import { useRouter } from "next/navigation";
import PlayerBubble from "./PlayerBubble";
import AvatarImage from "@/components/AvatarImage";
import AvatarStatus from "@/components/social/AvatarStatus";
import { useToast } from "@/components/Toast";
import { MessageSquare, UserPlus, Gamepad2, Eye, Users, Mail, Send, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./social.css";

type Friend = {
  id: number;
  friendId: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  isRequester: boolean;
  elo?: number;
  lastSeen?: string | number;
  inLobby?: boolean;
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

type Message = {
  id: number | string;
  from: string;
  to?: string;
  content: string;
  ts: number;
  isAdmin?: boolean;
  /** Set on a message we have drawn but not yet had confirmed by the server. */
  pending?: boolean;
};

/**
 * A slow reconciliation, not a live feed.
 *
 * Delivery is the socket relay's job. This exists only so a thread that was
 * open while the socket was down catches up, and it is deliberately far too
 * slow to be the thing anyone notices working. The previous one-second poll was
 * doing the delivering, which is why messages arrived with a visible lag and
 * the tab issued 3,600 requests an hour per open conversation.
 */
const RECONCILE_MS = 30_000;
/** How long a "typing" indicator survives without another keystroke. */
const TYPING_TTL_MS = 4_000;
const TYPING_PING_MS = 2_000;

const sameDay = (a: number, b: number) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

const dayLabel = (ts: number) => {
  const now = new Date();
  const then = new Date(ts);
  if (sameDay(ts, now.getTime())) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(ts, yesterday.getTime())) return "Yesterday";
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Newest-first by time, then by id, so an optimistic line settles in place. */
const mergeMessages = (a: Message[], b: Message[]): Message[] => {
  const byId = new Map<string, Message>();
  for (const m of [...a, ...b]) {
    const key = String(m.id);
    const existing = byId.get(key);
    // A confirmed message always beats the optimistic copy of itself.
    if (!existing || existing.pending) byId.set(key, m);
  }
  return Array.from(byId.values()).sort((x, y) => x.ts - y.ts);
};

export default function FriendsSidebar() {
  const { t } = useI18n();
  const { socket, steamId, isConnected } = useSocket();
  const router = useRouter();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);

  /**
   * Pinned open by a deliberate click, rather than by the pointer being here.
   *
   * The panel opens on hover and closes when the pointer leaves, which is right
   * for a glance and wrong for anything that takes both hands — reading a
   * thread, typing a reply, accepting a request. The expand button pins it, and
   * the close button unpins it, so a hover is a peek and a click is a decision.
   */
  const [isPinned, setIsPinned] = useState(false);

  /* Same open-now / close-soon pair as components/AvatarMenu.tsx. The delay is
     what makes the gap between the rail and the panel crossable — without it
     the panel closes in the few pixels between them. */
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setIsOpen(true);
  }, []);

  const closeSoon = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      // A player resume is portalled to <body>, so moving the pointer onto one
      // is physically a mouseleave from the panel that opened it. Closing here
      // would shut the panel out from under whatever the reader just clicked.
      if (document.querySelector(".player-bubble")) return;

      // A pin outranks the pointer leaving.
      setIsPinned((pinned) => {
        if (!pinned) setIsOpen(false);
        return pinned;
      });
    }, 220);
  }, []);

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  /**
   * The panel shrinks when you click away from it.
   *
   * It is a fixed overlay down the side of every page, so leaving it open is
   * leaving a third of a phone screen covered by something you have finished
   * with. Closing on an outside click is what every other panel on this site
   * does, and the one that did not was this one.
   *
   * Capture phase, and the bubble is excluded: a player resume opened FROM the
   * rail is portalled to <body>, so a plain contains() check would see a click
   * inside the bubble as a click outside the panel and shut it underneath.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (panelRef.current?.contains(target)) return;
      if (railRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(".player-bubble, .friends-bubble")) return;

      setIsPinned(false);
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isOpen]);


  /**
   * Publish the header's real height as --social-top.
   *
   * The rail and the panel both run from directly under the header to the
   * bottom of the viewport, so they need that number. globals.css already
   * carries a warning about the last attempt at this: a hard-coded 72px that
   * "broke whenever the header wrapped". Measuring is the fix — a wrapped
   * header on a narrow screen reports its wrapped height, and the rail follows.
   */
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        "--social-top",
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [addFriendInput, setAddFriendInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  // MESSAGES went with the Chat tab: those conversations are in the friends
  // list now, under their own headings.
  const [activeTab, setActiveTab] = useState<"FRIENDS" | "MAIL">("FRIENDS");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<string | null>(null);
  const [dmInput, setDmInput] = useState("");
  /** Collapsed to its header, like every chat dock people already use. */
  const [dockMinimised, setDockMinimised] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  /** Mirror for the socket handler, which closes over its first render. */
  const dockMinimisedRef = useRef(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  /** friendId -> unread count, cleared when that thread is opened. */
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    dockMinimisedRef.current = dockMinimised;
  }, [dockMinimised]);

  /**
   * A click outside the dock folds it away.
   *
   * Minimised rather than closed, and the distinction matters: closing loses
   * the thread and you have to find the person again, whereas folding leaves
   * the header in the corner with a count of whatever arrived while you were
   * elsewhere. Closing is what the X is for, and it is right there.
   *
   * The friends panel is exempt — clicking a different conversation in the list
   * is the most obvious next thing to do, and folding the dock on the way would
   * fight it.
   */
  useEffect(() => {
    if (!activeDmUser || dockMinimised) return;

    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (dockRef.current?.contains(target)) return;
      if (target.closest?.(".friends-sidebar, .friends-rail, .friends-fab, .player-bubble")) return;

      setDockMinimised(true);
    };

    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [activeDmUser, dockMinimised]);

  const logRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside socket handlers, which are registered once — a ref keeps them
  // seeing the current thread without re-subscribing on every open/close.
  const activeDmRef = useRef<string | null>(null);
  activeDmRef.current = activeDmUser;

  const online = useCallback((id: string) => onlineUsers.includes(id), [onlineUsers]);

  const friendName = useCallback(
    (id: string) => friends.find((f) => f.friendId === id)?.name ?? id,
    [friends]
  );

  // ---------- data ----------

  const fetchMessages = useCallback(async (targetId: string) => {
    if (!steamId) return;
    try {
      const res = await fetch(`/api/messages?targetId=${targetId}`, {
        headers: { Authorization: `Bearer ${steamId}` },
      });
      if (!res.ok) return;
      const data: Message[] = await res.json();
      // Merged rather than replaced: a replace would drop an optimistic line
      // sent between the request going out and the response coming back.
      setMessages((prev) => mergeMessages(prev, data));
    } catch {
      /* the reconcile is best-effort by design */
    }
  }, [steamId]);

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

  // Opening a thread loads it once; after that the socket delivers.
  useEffect(() => {
    if (!activeDmUser) return;
    setMessages([]);
    fetchMessages(activeDmUser);
    setUnread((u) => ({ ...u, [activeDmUser]: 0 }));
    const interval = setInterval(() => fetchMessages(activeDmUser), RECONCILE_MS);
    return () => clearInterval(interval);
  }, [activeDmUser, fetchMessages]);

  // ---------- sockets ----------

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: any) => {
      if (msg?.type !== "dm" && msg?.type !== "direct") return;
      const from = String(msg.from);
      const to = msg.to ? String(msg.to) : undefined;
      const incoming: Message = {
        id: msg.id ?? `${from}-${msg.ts ?? Date.now()}`,
        from,
        to,
        content: String(msg.content ?? ""),
        ts: Number(msg.ts) || Date.now(),
      };

      // My own message, echoed back so my other tabs catch up. The tab that
      // sent it already has the line under the same id, so merging is a no-op
      // there and a real append everywhere else. Never unread: I wrote it.
      if (steamId && from === steamId) {
        if (activeDmRef.current && to === activeDmRef.current) {
          setMessages((prev) => mergeMessages(prev, [incoming]));
        }
        return;
      }

      if (activeDmRef.current && from === activeDmRef.current) {
        setMessages((prev) => mergeMessages(prev, [incoming]));
        setTypingFrom((who) => (who === from ? null : who));

        // Open but folded away is not read. Without this the badge on a
        // minimised dock could never count anything, because the thread being
        // "active" was taken to mean somebody was looking at it.
        if (dockMinimisedRef.current) {
          setUnread((u) => ({ ...u, [from]: (u[from] ?? 0) + 1 }));
        }
        return;
      }
      // Not the open thread: count it so the tab and the row can say so.
      setUnread((u) => ({ ...u, [from]: (u[from] ?? 0) + 1 }));
    };

    const onTyping = ({ from }: { from: string }) => {
      if (!activeDmRef.current || String(from) !== activeDmRef.current) return;
      setTypingFrom(String(from));
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingFrom(null), TYPING_TTL_MS);
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
    socket.on("dm_typing", onTyping);
    socket.on("online_friends_sync", onSync);
    socket.on("user_online", onUserOnline);
    socket.on("user_offline", onUserOffline);
    socket.on("notification", onNotification);
    socket.emit("get_online_users");

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("dm_typing", onTyping);
      socket.off("online_friends_sync", onSync);
      socket.off("user_online", onUserOnline);
      socket.off("user_offline", onUserOffline);
      socket.off("notification", onNotification);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
    // steamId is read inside onNewMessage to recognise my own echo, so the
    // handler has to be rebuilt when it arrives — without it the first render
    // captures undefined and every echo is treated as somebody else's message.
  }, [socket, fetchFriends, steamId]);

  // Stick to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typingFrom]);

  // ---------- actions ----------

  const openThread = (friendId: string) => {
    setActiveDmUser(friendId);
    // No longer switches tabs. The dock is its own surface, so opening a chat
    // from the friends list should not also throw away the list you were
    // reading — which is what jumping to MESSAGES did.
    setDockMinimised(false);
    setUnread((u) => ({ ...u, [friendId]: 0 }));
  };

  const sendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = dmInput.trim();
    if (!content || !activeDmUser || !steamId) return;
    setDmInput("");

    if (content.startsWith("/invite")) {
      inviteFriend(activeDmUser);
      return;
    }

    // Drawn immediately under a temporary id, then reconciled with the row the
    // server actually wrote. Both copies carry the same id after that, so the
    // merge collapses them instead of showing the line twice — which is what
    // the old optimistic-plus-poll pair did.
    const tempId = `pending-${Date.now()}`;
    const optimistic: Message = { id: tempId, from: steamId, to: activeDmUser, content, ts: Date.now(), pending: true };
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: activeDmUser, content }),
      });
      if (!res.ok) throw new Error("send failed");
      const data = await res.json();
      const id = data?.message?.Id ?? tempId;
      const ts = data?.message?.CreatedAtUtc ? new Date(data.message.CreatedAtUtc).getTime() : optimistic.ts;

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id, ts, pending: false } : m))
      );
      socket?.emit("send_message", { type: "dm", targetSteamId: activeDmUser, content, id, ts });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDmInput(content);
      toast("Message not sent — try again.", "error");
    }
  };

  const onDmInput = (value: string) => {
    setDmInput(value);
    if (!socket || !activeDmUser) return;
    const now = Date.now();
    // Throttled: a keystroke is not an event worth a packet.
    if (now - lastTypingSent.current < TYPING_PING_MS) return;
    lastTypingSent.current = now;
    socket.emit("dm_typing", { targetSteamId: activeDmUser });
  };

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

  const { onlineFriends, offlineFriends } = useMemo(() => {
    const on: Friend[] = [];
    const off: Friend[] = [];
    for (const f of friends) (online(f.friendId) ? on : off).push(f);
    const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name);
    return { onlineFriends: on.sort(byName), offlineFriends: off.sort(byName) };
  }, [friends, online]);

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
    if (isOpen) loadThreads();
  }, [isOpen, loadThreads]);

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

  const activeFriend = activeDmUser ? friends.find((f) => f.friendId === activeDmUser) : undefined;

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
          presence={isOnline ? "online" : "offline"}
          size={34}
        />
        <PlayerBubble steamId={f.friendId} name={f.name} isFriend>
          <div className="friend-lines">
            <span className="friend-name">{f.name}</span>
            <span className="friend-stats">
              {isOnline
                ? f.elo
                  ? `Elo ${f.elo}`
                  : "Online"
                : f.lastSeen
                  ? `Last seen ${new Date(f.lastSeen).toLocaleDateString()}`
                  : "Offline"}
            </span>
          </div>
        </PlayerBubble>
      </div>
      <div className="friend-actions">
        <button className="btn-social" onClick={() => openThread(f.friendId)} title="Chat">
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
        {f.inLobby ? (
          <button className="btn-social" onClick={() => router.push("/lobby")} title="Spectate">
            <Eye size={16} />
          </button>
        ) : isOnline ? (
          <button className="btn-social" onClick={() => router.push("/lobby")} title="Play">
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
      <div
        className={`friends-rail ${isOpen ? "hidden" : ""}`}
        ref={railRef}
        role="button"
        tabIndex={0}
        aria-label={t("social.friends.toggleBtn")}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onFocus={openNow}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setIsPinned(true);
          setIsOpen(true);
        }}
      >
        {/* The expand arrow is gone.
            Hovering the rail opens the panel and clicking any avatar opens that
            person's chat, so the arrow was a third way to do what two other
            gestures already did — and it took the top slot, which is where the
            eye lands first. What it usefully carried was the unread count, so
            that stays as a badge on the rail itself rather than on a control.
            The rail keeps its keyboard route: it is focusable and Enter opens
            it, which is what the button was actually needed for. */}
        {(pendingRequests.length > 0 || totalUnread > 0) && (
          <span className="friends-rail-badge" aria-hidden>
            {pendingRequests.length + totalUnread}
          </span>
        )}

        {/* Everybody, online first.
            The rail used to render `onlineFriends` only, so a friend going
            offline vanished from the bar entirely — which reads as "they
            removed me" rather than "they logged off". Both groups are here
            now, told apart by treatment rather than by absence: online in
            colour behind an accent ring, offline desaturated behind a dark
            one. The divider is what makes it a ranking instead of a list with
            some faded entries in it. */}
        <div className="friends-rail-list">
          {onlineFriends.map((f) => (
            <PlayerBubble key={f.id} steamId={f.friendId} name={f.name} isFriend>
              <span className="friends-rail-friend is-online" title={f.name} aria-label={f.name}>
                <AvatarStatus
                  steamId={f.friendId}
                  name={f.name}
                  src={f.avatarUrl}
                  presence="online"
                  size={34}
                />
                {(unread[f.friendId] ?? 0) > 0 && <span className="dot-badge" />}
              </span>
            </PlayerBubble>
          ))}

          {onlineFriends.length > 0 && offlineFriends.length > 0 && (
            <span className="friends-rail-split" aria-hidden />
          )}

          {offlineFriends.map((f) => (
            <PlayerBubble key={f.id} steamId={f.friendId} name={f.name} isFriend>
              <span className="friends-rail-friend is-offline" title={f.name} aria-label={f.name}>
                <AvatarStatus
                  steamId={f.friendId}
                  name={f.name}
                  src={f.avatarUrl}
                  presence="offline"
                  size={34}
                />
                {(unread[f.friendId] ?? 0) > 0 && <span className="dot-badge" />}
              </span>
            </PlayerBubble>
          ))}

          {friends.length === 0 && (
            <span className="friends-rail-none" title={t("social.friends.noneOnline")}>
              <Users size={16} />
            </span>
          )}
        </div>
      </div>


      {/* The chat is a dock, not a panel view.
          It used to live inside the sidebar, which meant reading a message
          required the whole 330px panel open over the page, and closing the
          panel to get on with something closed the conversation with it. As a
          card anchored to the corner it behaves the way every chat people
          already use behaves: independent of whatever else is open, and small
          enough to leave the page usable behind it.

          Portalled to <body> so the sidebar's transform and overflow cannot
          clip or move it. */}
      {activeDmUser && typeof document !== "undefined" && createPortal(
        <div className={`dm-dock ${dockMinimised ? "minimised" : ""}`} ref={dockRef}>
                <div className="dm-view">
                  {/* The whole header toggles the dock, the way every chat
                      card people already use behaves — but the two buttons
                      inside it stop the click, or closing a conversation would
                      also collapse the one underneath it. */}
                  <div
                    className="dm-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setDockMinimised((v) => {
                        // Opening it back up clears what accumulated.
                        if (v && activeDmUser) setUnread((u) => ({ ...u, [activeDmUser]: 0 }));
                        return !v;
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDockMinimised((v) => {
                          if (v && activeDmUser) setUnread((u) => ({ ...u, [activeDmUser]: 0 }));
                          return !v;
                        });
                      }
                    }}
                  >
                    <span className="dm-header-avatar">
                      <AvatarImage steamId={activeDmUser} src={activeFriend?.avatarUrl} alt="" />
                      <i className={`status-dot ${online(activeDmUser) ? "online" : "offline"}`} />
                    </span>
                    <div className="dm-header-info">
                      <span className="dm-header-name">{activeFriend?.name ?? activeDmUser}</span>
                      <span className={`dm-header-status ${online(activeDmUser) ? "on" : ""}`}>
                        {typingFrom === activeDmUser
                          ? "typing…"
                          : online(activeDmUser)
                            ? "Online"
                            : "Offline"}
                      </span>
                    </div>

                    {/* What arrived while it was folded away. The whole point
                        of minimising rather than closing is that the corner
                        keeps counting. */}
                    {dockMinimised && (unread[activeDmUser] ?? 0) > 0 && (
                      <span className="dm-unread">{unread[activeDmUser]}</span>
                    )}

                    <button
                      className="dm-x"
                      aria-label={t("commands.close")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDmUser(null);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Everything below the header folds.
                      `height: auto` on the card could not animate — the CSS
                      transitioned a value the browser will not interpolate, so
                      the dock snapped shut. Framer measures the content and
                      animates the real height, which is the whole difference
                      between folding and vanishing.

                      The composer goes with it, which is what makes a collapsed
                      dock a title bar: a text box you cannot see the
                      conversation above is an invitation to type into nothing. */}
                  <AnimatePresence initial={false}>
                    {!dockMinimised && (
                      <motion.div
                        className="dm-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      >
                  <div className="dm-messages" ref={logRef}>
                    {messages.length === 0 && <div className="dm-empty">No messages yet. Say hi.</div>}
                    {messages.map((m, i) => {
                      const mine = m.from === steamId;
                      const prev = messages[i - 1];
                      const newDay = !prev || !sameDay(prev.ts, m.ts);
                      // A run from one person inside a couple of minutes is one
                      // block: repeating the avatar and the clock on every line
                      // turns a short exchange into a wall of chrome.
                      const grouped = !newDay && prev && prev.from === m.from && m.ts - prev.ts < 120_000;
                      return (
                        <React.Fragment key={m.id}>
                          {newDay && <div className="dm-day">{dayLabel(m.ts)}</div>}
                          <div
                            className={[
                              "dm-msg",
                              mine ? "own" : "other",
                              m.isAdmin ? "staff" : "",
                              grouped ? "grouped" : "",
                              m.pending ? "pending" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            <div className="dm-bubble">
                              <MessageBody content={m.content} />
                            </div>
                            {!grouped && <time className="dm-time">{timeLabel(m.ts)}</time>}
                          </div>
                        </React.Fragment>
                      );
                    })}
                    {typingFrom === activeDmUser && (
                      <div className="dm-msg other">
                        <div className="dm-bubble typing">
                          <i /><i /><i />
                        </div>
                      </div>
                    )}
                  </div>
    
                  <form onSubmit={sendDm} className="dm-input">
                    <input
                      type="text"
                      value={dmInput}
                      onChange={(e) => onDmInput(e.target.value)}
                      placeholder="Message, or /invite"
                      maxLength={2000}
                    />
                    <button type="submit" disabled={!dmInput.trim()} aria-label="Send">
                      <Send size={16} />
                    </button>
                  </form>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
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
        onClick={() => setIsOpen(true)}
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
      <div
        className={`friends-sidebar ${isOpen ? "open" : ""} ${isPinned ? "pinned" : ""}`}
        ref={panelRef}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
      >
        <div className="friends-header">
          <h2>{t("social.friends.header")}</h2>
          <button
            className="close-btn"
            onClick={() => {
              setIsPinned(false);
              setIsOpen(false);
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="friends-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "FRIENDS"}
            className={activeTab === "FRIENDS" ? "active" : ""}
            onClick={() => setActiveTab("FRIENDS")}
            title={t("social.friends.tabFriends")}
          >
            <Users size={18} />
            <span>{t("social.friends.tabFriends")}</span>
            {totalUnread > 0 && <span className="tab-badge">{totalUnread}</span>}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "MAIL"}
            className={activeTab === "MAIL" ? "active" : ""}
            onClick={() => setActiveTab("MAIL")}
            title={t("social.friends.tabInvites")}
          >
            <Mail size={18} />
            <span>{t("social.friends.tabInvites")}</span>
            {pendingRequests.length > 0 && <span className="tab-badge">{pendingRequests.length}</span>}
          </button>
        </div>

        {activeTab === "FRIENDS" && (
          <div className="friends-content">
            {friends.length === 0 && adminThreads.length === 0 && (
              <p className="muted-text">{t("social.friends.noFriends")}</p>
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
                        presence={onlineUsers.includes(a.steamId) ? "online" : "offline"}
                        size={34}
                      />
                      <div className="friend-lines">
                        <span className="friend-name">{a.name}</span>
                        <span className="friend-stats">{t("social.friends.adminRow")}</span>
                      </div>
                    </div>
                    <div className="friend-actions">
                      <button className="btn-social" onClick={() => openThread(a.steamId)} title="Chat">
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
                <div className="friends-category-title">Online — {onlineFriends.length}</div>
                {onlineFriends.map((f) => renderFriendRow(f, true))}
              </>
            )}

            {offlineFriends.length > 0 && (
              <>
                <div className="friends-category-title mt-4">Offline — {offlineFriends.length}</div>
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
                      presence={online(f.friendId) ? "online" : "offline"}
                      size={34}
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
        {activeTab === "MAIL" && (
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
                        presence={onlineUsers.includes(sug.steamId) ? "online" : "offline"}
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
              <form onSubmit={handleAddFriend} className="add-friend-form">
                <input
                  type="text"
                  placeholder="SteamID64 or nickname"
                  value={addFriendInput}
                  onChange={(e) => setAddFriendInput(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={!addFriendInput.trim() || addBusy}>
                  {addBusy ? "Sending…" : t("social.friends.sendRequest")}
                </button>
              </form>
            </div>

            <div className="mail-section mt-4">
              <h3>Friend requests</h3>
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
                      <button className="btn-accept" onClick={() => respondToRequest(r.id, "ACCEPT")} aria-label="Accept">✓</button>
                      <button className="btn-reject" onClick={() => respondToRequest(r.id, "REJECT")} aria-label="Reject">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
function MessageBody({ content }: { content: string }) {
  const clip = useMemo(() => {
    const match = content.match(/https?:\/\/[^\s]+/);
    if (!match) return null;
    try {
      const url = new URL(match[0]);
      const local =
        typeof window !== "undefined" && url.host === window.location.host;
      if (!local) return null;
      if (!/\.mp4$/i.test(url.pathname) && !/\/clips?\//.test(url.pathname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }, [content]);

  if (!clip) return <>{content}</>;

  return (
    <>
      <span>{content}</span>
      <video src={clip} controls preload="metadata" className="dm-clip" />
    </>
  );
}
