import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';

export function useGameSocket(gameId: number | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const pollingIntervalRef = useRef<number>();
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const queryClient = useQueryClient();
  const { isAuthenticated, isVerified } = useAuthStore();

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
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = undefined;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state_changed' || data.type === 'game_state') {
            queryClient.invalidateQueries({ queryKey: ['game', gameId] });
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = (event) => {
        // Don't reconnect if unmounting or intentional close
        if (!mountedRef.current || !localStorage.getItem('access_token')) return;

        // Start polling fallback
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = window.setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ['game', gameId] });
          }, 3000);
        }

        // Only reconnect if not closed intentionally (code 1000)
        if (event.code !== 1000) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (mountedRef.current && localStorage.getItem('access_token')) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
    }
  }, [gameId, queryClient, isAuthenticated, isVerified]);

  useEffect(() => {
    if (!isAuthenticated || !isVerified) return;
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close(1000, 'Unmounting');
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = undefined;
      }
    };
  }, [connect, isAuthenticated, isVerified]);
}
