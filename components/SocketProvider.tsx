"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  /** true once the server has acked our steamId — safe to emit lobby events */
  isAuthed: boolean;
  steamId?: string;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false, isAuthed: false, steamId: undefined });

export const useSocket = () => useContext(SocketContext);

import FriendsSidebar from "./social/FriendsSidebar";
import NotificationToast from "./social/NotificationToast";
import SocketStatusBanner from "./social/SocketStatusBanner";

export const SocketProvider = ({
  children,
  steamId,
  isDemoMode = false,
}: {
  children: React.ReactNode;
  steamId?: string;
  /**
   * A demo is a pitch, and the connection banner is plumbing.
   *
   * "Waking up game server… (28s)" is honest and useful to a player waiting to
   * queue, and to somebody being shown the tournament system it is a red
   * warning strip announcing that the site is not ready. The socket still
   * connects; only the commentary is suppressed.
   */
  isDemoMode?: boolean;
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // NEXT_PUBLIC_SOCKET_URL wins; else localhost in dev, the Render host in prod.
    //
    // The special value "same-origin" is for self-hosted deployments where
    // server.js runs Next and Socket.IO in one process: io() with no argument
    // targets the page's own origin, so a single build serves every hostname
    // the box answers on (the raw EC2 name, dev.retakes.fr, games.dev.…)
    // instead of baking one domain in at build time.
    const configured = process.env.NEXT_PUBLIC_SOCKET_URL;
    const socketUrl = configured === "same-origin"
      ? null
      : configured
        || (process.env.NODE_ENV === "development"
          ? "http://localhost:3001"
          : "https://node-sockets-reeeeetakes.onrender.com");
    const socketInstance = socketUrl ? io(socketUrl) : io();

    /**
     * Identify, every time there is a connection to identify on.
     *
     * The server drops `send_message` from a socket with no steamId on it —
     * silently, because there is nobody to tell — so a socket that never
     * authenticated is a chat that never delivers live. The reconcile poll then
     * makes it look like messages take thirty seconds rather than like
     * something is broken, which is why this took a while to see.
     */
    const identify = () => {
      if (steamId) socketInstance.emit('authenticate', { steamId });
    };

    socketInstance.on('connect', () => {
      console.log('Connected to Game Hub Socket:', socketInstance.id);
      setIsConnected(true);
      identify();
    });

    // And once now, because `connect` may already have fired before this
    // listener was attached — socket.io can connect synchronously off a warm
    // transport, and then the handler above never runs at all.
    if (socketInstance.connected) {
      setIsConnected(true);
      identify();
    }

    // A reconnect gives a NEW server-side socket with none of the old one's
    // identity or rooms on it. Without this, chat works until the first blip
    // and is quietly dead afterwards.
    socketInstance.io.on('reconnect', identify);

    socketInstance.on('authenticated', () => {
      setIsAuthed(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from Game Hub Socket');
      setIsConnected(false);
      setIsAuthed(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.io.off('reconnect', identify);
      socketInstance.disconnect();
    };
  }, [steamId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthed, steamId }}>
      {children}
      {!isDemoMode && <SocketStatusBanner />}
      {steamId && <FriendsSidebar />}
      {steamId && <NotificationToast />}
    </SocketContext.Provider>
  );
};
