"use client";

import React, { useState, useEffect } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import { useRouter } from "next/navigation";
import PlayerBubble from "./PlayerBubble";
import { useI18n } from "@/components/I18nProvider";
import "./social.css";

export default function FriendsSidebar() {
  const { t } = useI18n();
  const { socket, steamId, isConnected } = useSocket();
  const router = useRouter();
  
  const [isOpen, setIsOpen] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [addFriendInput, setAddFriendInput] = useState("");
  const [activeTab, setActiveTab] = useState<"FRIENDS" | "PENDING" | "ADD" | "MESSAGES">("FRIENDS");
  const [messages, setMessages] = useState<any[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<string | null>(null);
  const [dmInput, setDmInput] = useState("");

  const fetchMessages = async (targetId: string) => {
    if (!steamId) return;
    try {
      const res = await fetch(`/api/messages?targetId=${targetId}`, {
        headers: { "Authorization": `Bearer ${steamId}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === "MESSAGES" && activeDmUser) {
      fetchMessages(activeDmUser);
    }
  }, [activeTab, activeDmUser]);

  useEffect(() => {
    if (socket) {
      const handleNewMessage = (msg: any) => {
        if (msg.type === "dm" && activeDmUser && (msg.from === activeDmUser || msg.from === steamId)) {
          setMessages(prev => [...prev, msg]);
        }
      };
      socket.on("new_message", handleNewMessage);
      return () => { socket.off("new_message", handleNewMessage); };
    }
  }, [socket, activeDmUser, steamId]);

  const sendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dmInput.trim() || !activeDmUser || !steamId) return;
    const content = dmInput.trim();
    setDmInput("");

    if (content.startsWith("/invite")) {
       inviteFriend(activeDmUser);
       return;
    }

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: activeDmUser, content })
      });
      if (res.ok) {
        const data = await res.json();
        if (socket) {
          socket.emit("send_message", { type: "dm", content, targetSteamId: activeDmUser });
          // Optimistic local update isn't strictly needed if socket echoes it, but standard approach:
          setMessages(prev => [...prev, { from: steamId, content, ts: Date.now(), id: data.message.Id }]);
        }
      }
    } catch(e) {
      console.error(e);
    }
  };

  const renderClip = (content: string) => {
    const clipMatch = content.match(/https?:\/\/[^\s]+(\/clips?\/[^\s]+|\.mp4)/);
    if (clipMatch) {
      return (
        <div>
          <span>{content}</span>
          <video src={clipMatch[0]} controls style={{ maxWidth: '100%', marginTop: '8px' }} />
        </div>
      );
    }
    return content;
  };

  // Fetch friends from API
  const fetchFriends = async () => {
    if (!steamId) return;
    try {
      const res = await fetch("/api/friends", {
        headers: { "Authorization": `Bearer ${steamId}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.filter((f: any) => f.status === "ACCEPTED"));
        setPendingRequests(data.filter((f: any) => f.status === "PENDING" && !f.isRequester));
      }
    } catch (e) {
      console.error("Error fetching friends:", e);
    }
  };

  useEffect(() => {
    fetchFriends();
    
    if (socket) {
      socket.on("online_friends_sync", (users: string[]) => {
        setOnlineUsers(users);
      });
      socket.on("user_online", ({ steamId }: { steamId: string }) => {
        setOnlineUsers(prev => Array.from(new Set([...prev, steamId])));
      });
      socket.on("user_offline", ({ steamId }: { steamId: string }) => {
        setOnlineUsers(prev => prev.filter(id => id !== steamId));
      });
      socket.on("notification", (notif: any) => {
        if (notif.Type === 'FRIEND_REQUEST' || notif.Type === 'ACCEPTED') {
          fetchFriends();
        }
      });
      socket.emit("get_online_users");
    }

    return () => {
      if (socket) {
        socket.off("online_friends_sync");
        socket.off("user_online");
        socket.off("user_offline");
        socket.off("notification");
      }
    };
  }, [socket, steamId]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFriendInput || !steamId) return;
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: addFriendInput })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && socket) {
          socket.emit("send_notification", { targetSteamId: addFriendInput, notification: data.notification });
        }
        setAddFriendInput("");
        alert(t("social.friends.requestSent"));
        fetchFriends();
      } else {
        const err = await res.json();
        alert(t("social.friends.error", { error: err.error }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const respondToRequest = async (friendshipId: number, action: "ACCEPT" | "REJECT") => {
    if (!steamId) return;
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${steamId}` },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        fetchFriends();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const inviteFriend = async (friendId: string) => {
    if (!steamId || !socket) return;
    
    // We assume the user is currently in a lobby if window.location points to one
    let lobbyId = "";
    const match = window.location.pathname.match(/\/games\/lobby\/([a-zA-Z0-9]+)/);
    if (!match) {
      const rlMatch = window.location.pathname.match(/\/lobby\/([a-zA-Z0-9-]+)/);
      if (!rlMatch) {
         // create a lobby
         const res = await fetch('/api/lobby/create', { method: 'POST', headers: { "Authorization": `Bearer ${steamId}` } });
         if (res.ok) {
            const data = await res.json();
            lobbyId = data.lobbyId;
            router.push(`/lobby/${lobbyId}`);
         } else {
            alert(t("social.friends.notInLobby"));
            return;
         }
      } else {
         lobbyId = rlMatch[1];
      }
    } else {
      lobbyId = match[1];
    }
    
    try {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: friendId, lobbyId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          socket.emit("send_notification", { targetSteamId: friendId, notification: data.notification });
          alert(t("social.friends.inviteSent"));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isConnected) return null;

  return (
    <>
      <button className="friends-toggle-btn" onClick={() => setIsOpen(!isOpen)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        {t("social.friends.toggleBtn")} {pendingRequests.length > 0 && <span className="notification-badge">{pendingRequests.length}</span>}
      </button>

      <div className={`friends-sidebar ${isOpen ? "open" : ""}`}>
        <div className="friends-header">
          <h2>{t("social.friends.header")}</h2>
          <button className="close-btn" onClick={() => setIsOpen(false)}>✕</button>
        </div>

        <div className="friends-tabs">
          <button className={activeTab === "FRIENDS" ? "active" : ""} onClick={() => setActiveTab("FRIENDS")}>{t("social.friends.tabFriends")}</button>
          <button className={activeTab === "MESSAGES" ? "active" : ""} onClick={() => setActiveTab("MESSAGES")}>MESSAGES</button>
          <button className={activeTab === "PENDING" ? "active" : ""} onClick={() => setActiveTab("PENDING")}>
            {t("social.friends.tabRequests")} {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </button>
          <button className={activeTab === "ADD" ? "active" : ""} onClick={() => setActiveTab("ADD")}>{t("social.friends.tabAdd")}</button>
        </div>

        <div className="friends-content">
          {activeTab === "FRIENDS" && (
            <div className="friends-list">
              {friends.length === 0 ? <p className="muted-text">{t("social.friends.noFriends")}</p> : null}
              {friends.map(f => {
                const isOnline = onlineUsers.includes(f.friendId);
                return (
                  <div key={f.id} className="friend-item">
                    <div className="friend-info">
                      <div className={`status-dot ${isOnline ? "online" : "offline"}`} />
                      <PlayerBubble steamId={f.friendId} name={f.name}>
                        <span className="friend-name">{f.name}</span>
                      </PlayerBubble>
                    </div>
                    <div className="friend-actions">
                      <button className="btn-msg" onClick={() => { setActiveDmUser(f.friendId); setActiveTab("MESSAGES"); }}>DM</button>
                      {isOnline && (
                        <button className="btn-invite" onClick={() => inviteFriend(f.friendId)}>{t("social.friends.inviteBtn")}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "MESSAGES" && (
            <div className="messages-tab">
              {!activeDmUser ? (
                <div className="friends-list">
                   {friends.map(f => (
                     <div key={f.id} className="friend-item" onClick={() => setActiveDmUser(f.friendId)} style={{cursor: 'pointer'}}>
                        <PlayerBubble steamId={f.friendId} name={f.name}>
                          <span className="friend-name">{f.name}</span>
                        </PlayerBubble>
                     </div>
                   ))}
                </div>
              ) : (
                <div className="dm-view">
                  <div className="dm-header">
                     <button onClick={() => setActiveDmUser(null)}>Back</button>
                     <span>{friends.find(f => f.friendId === activeDmUser)?.name || activeDmUser}</span>
                  </div>
                  <div className="dm-messages" style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, padding: '8px' }}>
                     {messages.map((m, i) => (
                        <div key={i} className={`dm-message ${m.from === steamId ? 'own' : 'other'}`} style={{ alignSelf: m.from === steamId ? 'flex-end' : 'flex-start', background: m.from === steamId ? 'var(--color-primary)' : 'var(--color-surface)', padding: '6px 10px', borderRadius: '8px' }}>
                           {m.isAdmin && <span title="Admin/Mod" style={{ marginRight: '4px' }}>🛡️</span>}
                           {renderClip(m.content)}
                        </div>
                     ))}
                  </div>
                  <form onSubmit={sendDm} className="dm-input-form" style={{ display: 'flex', gap: '8px', padding: '8px' }}>
                     <input type="text" value={dmInput} onChange={e => setDmInput(e.target.value)} placeholder="Type a message or /invite..." style={{ flex: 1 }} />
                     <button type="submit">Send</button>
                  </form>
                </div>
              )}
            </div>
          )}

          {activeTab === "PENDING" && (
            <div className="pending-list">
              {pendingRequests.length === 0 ? <p className="muted-text">{t("social.friends.noPending")}</p> : null}
              {pendingRequests.map(r => (
                <div key={r.id} className="pending-item">
                  <span>{r.name}</span>
                  <div className="pending-actions">
                    <button className="btn-accept" onClick={() => respondToRequest(r.id, "ACCEPT")}>✓</button>
                    <button className="btn-reject" onClick={() => respondToRequest(r.id, "REJECT")}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "ADD" && (
            <form onSubmit={handleAddFriend} className="add-friend-form">
              <input 
                type="text" 
                placeholder={t("social.friends.steamIdPlaceholder")} 
                value={addFriendInput} 
                onChange={e => setAddFriendInput(e.target.value)} 
              />
              <button type="submit" className="btn-primary">{t("social.friends.sendRequest")}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
