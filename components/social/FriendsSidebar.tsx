"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import { useRouter } from "next/navigation";
import PlayerBubble from "./PlayerBubble";
import AvatarImage from "@/components/AvatarImage";
import { useToast } from "@/components/Toast";
import { MessageSquare, UserPlus, Gamepad2, Eye, Users, Mail, Send, ChevronLeft, X } from "lucide-react";
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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [addFriendInput, setAddFriendInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"FRIENDS" | "MESSAGES" | "MAIL">("FRIENDS");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<string | null>(null);
  const [dmInput, setDmInput] = useState("");
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  /** friendId -> unread count, cleared when that thread is opened. */
  const [unread, setUnread] = useState<Record<string, number>>({});

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
      const incoming: Message = {
        id: msg.id ?? `${from}-${msg.ts ?? Date.now()}`,
        from,
        to: msg.to ? String(msg.to) : undefined,
        content: String(msg.content ?? ""),
        ts: Number(msg.ts) || Date.now(),
      };

      if (activeDmRef.current && from === activeDmRef.current) {
        setMessages((prev) => mergeMessages(prev, [incoming]));
        setTypingFrom((who) => (who === from ? null : who));
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
  }, [socket, fetchFriends]);

  // Stick to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typingFrom]);

  // ---------- actions ----------

  const openThread = (friendId: string) => {
    setActiveDmUser(friendId);
    setActiveTab("MESSAGES");
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
    }

    try {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: friendId, lobbyId }),
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

  /** Threads with something in them first, then everyone else. */
  const threads = useMemo(() => {
    return [...friends].sort((a, b) => {
      const ua = unread[a.friendId] ?? 0;
      const ub = unread[b.friendId] ?? 0;
      if (ua !== ub) return ub - ua;
      const oa = online(a.friendId) ? 1 : 0;
      const ob = online(b.friendId) ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return a.name.localeCompare(b.name);
    });
  }, [friends, unread, online]);

  if (!isConnected) return null;

  const activeFriend = activeDmUser ? friends.find((f) => f.friendId === activeDmUser) : undefined;

  const renderFriendRow = (f: Friend, isOnline: boolean) => (
    <div key={f.id} className={`friend-item${isOnline ? "" : " offline-item"}`}>
      <div className="friend-info">
        <span className="friend-avatar">
          <AvatarImage steamId={f.friendId} src={f.avatarUrl} alt={f.name} />
          <i className={`status-dot ${isOnline ? "online" : "offline"}`} />
        </span>
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
          {(unread[f.friendId] ?? 0) > 0 && <span className="dot-badge" />}
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
      <button className="friends-toggle-btn" onClick={() => setIsOpen(!isOpen)}>
        <Users size={16} />
        {t("social.friends.toggleBtn")}
        {(pendingRequests.length > 0 || totalUnread > 0) && (
          <span className="notification-badge">{pendingRequests.length + totalUnread}</span>
        )}
      </button>

      <div className={`friends-sidebar ${isOpen ? "open" : ""}`}>
        <div className="friends-header">
          <h2>{t("social.friends.header")}</h2>
          <button className="close-btn" onClick={() => setIsOpen(false)} aria-label="Close">
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
            <span>Friends</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "MESSAGES"}
            className={activeTab === "MESSAGES" ? "active" : ""}
            onClick={() => setActiveTab("MESSAGES")}
            title="Messages"
          >
            <MessageSquare size={18} />
            <span>Chat</span>
            {totalUnread > 0 && <span className="tab-badge">{totalUnread}</span>}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "MAIL"}
            className={activeTab === "MAIL" ? "active" : ""}
            onClick={() => setActiveTab("MAIL")}
            title="Invites & Add Friend"
          >
            <Mail size={18} />
            <span>Invites</span>
            {pendingRequests.length > 0 && <span className="tab-badge">{pendingRequests.length}</span>}
          </button>
        </div>

        {activeTab === "FRIENDS" && (
          <div className="friends-content">
            {friends.length === 0 && <p className="muted-text">{t("social.friends.noFriends")}</p>}

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
          </div>
        )}

        {/* Not inside .friends-content: the thread view owns the full height so
            its composer can sit on the bottom edge, which it cannot do inside a
            padded scroll container. */}
        {activeTab === "MESSAGES" && (
          activeDmUser ? (
            <div className="dm-view">
              <div className="dm-header">
                <button className="back-btn" onClick={() => setActiveDmUser(null)} aria-label="Back">
                  <ChevronLeft size={20} />
                </button>
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
              </div>

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
                          grouped ? "grouped" : "",
                          m.pending ? "pending" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <div className="dm-bubble">
                          {m.isAdmin && <span className="admin-badge" title="Staff">🛡️</span>}
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
            </div>
          ) : (
            <div className="friends-content">
              {threads.length === 0 && <p className="muted-text">No friends to message yet.</p>}
              {threads.map((f) => {
                const count = unread[f.friendId] ?? 0;
                return (
                  <button
                    key={f.id}
                    className={`friend-item thread${count > 0 ? " unread" : ""}`}
                    onClick={() => openThread(f.friendId)}
                  >
                    <div className="friend-info">
                      <span className="friend-avatar">
                        <AvatarImage steamId={f.friendId} src={f.avatarUrl} alt={f.name} />
                        <i className={`status-dot ${online(f.friendId) ? "online" : "offline"}`} />
                      </span>
                      <div className="friend-lines">
                        <span className="friend-name">{f.name}</span>
                        <span className="friend-stats">
                          {count > 0 ? `${count} new message${count > 1 ? "s" : ""}` : "Open conversation"}
                        </span>
                      </div>
                    </div>
                    {count > 0 && <span className="notification-badge">{count}</span>}
                  </button>
                );
              })}
            </div>
          )
        )}

        {activeTab === "MAIL" && (
          <div className="friends-content">
            <div className="mail-section">
              <h3>Add a friend</h3>
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
