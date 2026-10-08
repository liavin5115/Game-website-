import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useLobbySocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const pollingIntervalRef = useRef<number>();
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const connect = () => {
      if (!mountedRef.current) return;

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/lobby?token=${token}`;

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
            if (data.type === 'lobby_changed') {
              queryClient.invalidateQueries({ queryKey: ['lobby', 'games'] });
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
              queryClient.invalidateQueries({ queryKey: ['lobby', 'games'] });
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
    };

    mountedRef.current = true;
    connect();

    // Start polling immediately as fallback
    pollingIntervalRef.current = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['lobby', 'games'] });
    }, 3000);

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
  }, [queryClient]);
}
