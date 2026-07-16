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

import FriendsSidebar from "../social/FriendsSidebar";
import NotificationToast from "../social/NotificationToast";

export const SocketProvider = ({ children, steamId }: { children: React.ReactNode, steamId?: string }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // In production, this should point to your actual domain
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001');

    socketInstance.on('connect', () => {
      console.log('Connected to Game Hub Socket:', socketInstance.id);
      setIsConnected(true);

      if (steamId) {
        socketInstance.emit('authenticate', { steamId });
      }
    });

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
      socketInstance.disconnect();
    };
  }, [steamId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthed, steamId }}>
      {children}
      {steamId && <FriendsSidebar />}
      {steamId && <NotificationToast />}
    </SocketContext.Provider>
  );
};
