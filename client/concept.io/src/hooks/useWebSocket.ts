import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';

interface UseWebSocketProps {
  projectId: string;
  userId: string;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  socket: WebSocket | null;
  isConnected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  send: (data: any) => boolean;
}

export const useWebSocket = ({
  projectId,
  userId,
  autoConnect = true,
}: UseWebSocketProps): UseWebSocketReturn => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        // Join the project room
        ws.send(JSON.stringify({
          type: 'join',
          payload: { roomId: projectId },
          userId,
          roomId: projectId,
        }));
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setSocket(null);

        // Attempt reconnection
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          setTimeout(connect, delay);
        } else {
          setError('Failed to connect after multiple attempts');
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      setSocket(ws);
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [projectId, userId, socket]);

  const disconnect = useCallback(() => {
    if (socket) {
      reconnectAttempts.current = maxReconnectAttempts; // Prevent reconnection
      socket.close();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  const send = useCallback((data: any): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message');
      return false;
    }

    try {
      socket.send(JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('Failed to send WebSocket message:', err);
      return false;
    }
  }, [socket]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // Only run on mount/unmount

  return {
    socket,
    isConnected,
    error,
    connect,
    disconnect,
    send,
  };
};

export default useWebSocket;
