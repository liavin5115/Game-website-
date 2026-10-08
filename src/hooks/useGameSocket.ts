import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useGameSocket(gameId: number | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const pollingIntervalRef = useRef<number>();
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (!gameId || !mountedRef.current) return;

    const token = localStorage.getItem('token');
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

      ws.onclose = () => {
        if (!mountedRef.current) return;

        // Start polling fallback
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = window.setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ['game', gameId] });
          }, 3000);
        }

        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (mountedRef.current) {
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
  }, [gameId, queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [connect]);
}
