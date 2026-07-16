"use client";

import React, { useState, useEffect } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import { useRouter } from "next/navigation";
import "./social.css";

export default function NotificationToast() {
  const { socket, steamId, isConnected } = useSocket();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (socket) {
      socket.on("notification", (notif: any) => {
        setNotifications(prev => [...prev, notif]);
      });
    }
    return () => {
      if (socket) socket.off("notification");
    }
  }, [socket]);

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.Id !== id));
  };

  const handleAction = (notif: any) => {
    if (notif.ActionUrl) {
      router.push(notif.ActionUrl);
    }
    removeNotification(notif.Id);
  };

  if (!isConnected || notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((notif, idx) => (
        <div key={notif.Id || idx} className="notification-toast">
          <div className="notif-content">
            <span className="notif-icon">
              {notif.Type === "GAME_INVITE" ? "🎮" : "🔔"}
            </span>
            <p>{notif.Content}</p>
          </div>
          <div className="notif-actions">
            {notif.ActionUrl && (
              <button className="btn-accept" onClick={() => handleAction(notif)}>Accept</button>
            )}
            <button className="btn-reject" onClick={() => removeNotification(notif.Id)}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
