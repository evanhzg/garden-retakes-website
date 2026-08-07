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
  const [activeTab, setActiveTab] = useState<"FRIENDS" | "PENDING" | "ADD">("FRIENDS");

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
    const match = window.location.pathname.match(/\/games\/lobby\/([a-zA-Z0-9]+)/);
    if (!match) {
      alert(t("social.friends.notInLobby"));
      return;
    }
    const lobbyId = match[1];
    
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
                    {isOnline && window.location.pathname.includes("/games/lobby/") && (
                      <button className="btn-invite" onClick={() => inviteFriend(f.friendId)}>{t("social.friends.inviteBtn")}</button>
                    )}
                  </div>
                );
              })}
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
