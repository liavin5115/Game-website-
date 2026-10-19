import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

export function useGameSocket(gameId: number | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const pollingIntervalRef = useRef<number>();
  const pingIntervalRef = useRef<number>();
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const isIntentionalCloseRef = useRef(false);
  const lastCloseCodeRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const { isAuthenticated, isVerified, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [showReconnectBanner, setShowReconnectBanner] = useState(false);

  const refetchGame = useCallback(() => {
    if (gameId) {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    }
  }, [gameId, queryClient]);

  const clearAllTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = undefined;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = undefined;
    }
  }, []);

  const startPing = useCallback(() => {
    if (pingIntervalRef.current) return;
    pingIntervalRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000); // 20 seconds
  }, []);

  const stopPing = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = undefined;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current || !gameId) return;
    pollingIntervalRef.current = window.setInterval(() => {
      refetchGame();
    }, 3000);
  }, [gameId, refetchGame]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = undefined;
    }
  }, []);

  const connect = useCallback(() => {
    if (!gameId || !mountedRef.current || !isAuthenticated || !isVerified) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/game/${gameId}?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        isIntentionalCloseRef.current = false;
        lastCloseCodeRef.current = null;
        setIsConnected(true);
        setShowReconnectBanner(false);
        stopPolling();
        startPing();
        // Immediate refetch on successful (re)open
        refetchGame();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state_changed' || data.type === 'game_state') {
            refetchGame();
          } else if (data.type === 'pong') {
            // Heartbeat response received
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        stopPing();
        
        // Don't reconnect if unmounting or intentional close or no token
        if (!mountedRef.current || !localStorage.getItem('access_token')) return;
        
        lastCloseCodeRef.current = event.code;
        
        // No reconnect after intentional close or auth/permission errors
        const noReconnectCodes = [1000, 4001, 4003, 4004];
        if (isIntentionalCloseRef.current || noReconnectCodes.includes(event.code)) {
          if (event.code === 4001) {
            // Unauthorized - logout
            logout();
            navigate('/login');
          } else if (event.code === 4003) {
            // Not a participant - redirect to lobby
            navigate('/lobby');
          } else if (event.code === 4004) {
            // Game not found - redirect to lobby
            navigate('/lobby');
          }
          return;
        }

        // Show reconnecting banner
        setShowReconnectBanner(true);

        // Start polling fallback
        startPolling();

        // Exponential backoff with jitter, cap 10s
        const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (mountedRef.current && localStorage.getItem('access_token')) {
            connect();
          }
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
    }
  }, [gameId, queryClient, isAuthenticated, isVerified, refetchGame, startPing, stopPing, startPolling, stopPolling, logout, navigate]);

  // Refetch on window online event
  useEffect(() => {
    const handleOnline = () => {
      if (mountedRef.current && gameId) {
        refetchGame();
        if (!isConnected) {
          connect();
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [gameId, isConnected, refetchGame, connect]);

  // Refetch on visibility change to visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current && gameId) {
        refetchGame();
        if (!isConnected && wsRef.current?.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [gameId, isConnected, refetchGame, connect]);

  useEffect(() => {
    if (!isAuthenticated || !isVerified) {
      clearAllTimers();
      if (wsRef.current) {
        isIntentionalCloseRef.current = true;
        wsRef.current.close(1000, 'Auth changed');
        wsRef.current = null;
      }
      setIsConnected(false);
      setShowReconnectBanner(false);
      return;
    }
    
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      isIntentionalCloseRef.current = true;
      clearAllTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Unmounting');
        wsRef.current = null;
      }
      setIsConnected(false);
      setShowReconnectBanner(false);
    };
  }, [connect, isAuthenticated, isVerified, clearAllTimers]);

  return {
    isConnected,
    showReconnectBanner,
    reconnect: connect,
  };
}