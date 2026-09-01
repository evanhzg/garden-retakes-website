"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  /** true once the server has acked our steamId — safe to emit lobby events */
  isAuthed: boolean;
  steamId?: string;
  /**
   * Every SteamID the socket server currently has a connection for.
   *
   * This used to live inside FriendsSidebar, which is the only component that
   * subscribed to the three presence events. Everything else — the player
   * card most of all — had no way to ask, so it defaulted to "offline" and
   * said so with a grey dot on people who were plainly online, including on
   * your own card. The list belongs where every consumer can reach it.
   */
  onlineUsers: string[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isAuthed: false,
  steamId: undefined,
  onlineUsers: [],
});

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
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

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
      // Ask as soon as we are known: the server answers this one only for an
      // identified socket.
      socketInstance.emit('get_online_users');
    });

    /* Presence, kept here rather than in whichever panel happens to be open.
       The server sends the whole list once and deltas after it. */
    const onSync = (ids: string[]) => setOnlineUsers(Array.isArray(ids) ? ids : []);
    const onUp = (id: string) =>
      setOnlineUsers((cur) => (cur.includes(id) ? cur : [...cur, id]));
    const onDown = (id: string) => setOnlineUsers((cur) => cur.filter((x) => x !== id));

    socketInstance.on('online_friends_sync', onSync);
    socketInstance.on('user_online', onUp);
    socketInstance.on('user_offline', onDown);

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from Game Hub Socket');
      setIsConnected(false);
      setIsAuthed(false);
      // Nobody is known to be online through a socket that is down. Keeping
      // the last list would show a page full of green dots during an outage.
      setOnlineUsers([]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.io.off('reconnect', identify);
      socketInstance.off('online_friends_sync', onSync);
      socketInstance.off('user_online', onUp);
      socketInstance.off('user_offline', onDown);
      socketInstance.disconnect();
    };
  }, [steamId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthed, steamId, onlineUsers }}>
      {children}
      {!isDemoMode && <SocketStatusBanner />}
      {steamId && <FriendsSidebar />}
      {steamId && <NotificationToast />}
    </SocketContext.Provider>
  );
};
