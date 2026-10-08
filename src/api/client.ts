import type { Game, LobbyGame } from '../types/game';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  return res.json();
}

export const gamesApi = {
  create: async (game_type: string, buy_in?: number): Promise<Game> => {
    return request<Game>('/games/create', {
      method: 'POST',
      body: JSON.stringify({ game_type, buy_in }),
    });
  },

  join: async (game_id: number): Promise<Game> => {
    return request<Game>('/games/join', {
      method: 'POST',
      body: JSON.stringify({ game_id }),
    });
  },

  leave: async (game_id: number): Promise<void> => {
    return request<void>('/games/leave', {
      method: 'POST',
      body: JSON.stringify({ game_id }),
    });
  },

  start: async (game_id: number): Promise<Game> => {
    return request<Game>('/games/start', {
      method: 'POST',
      body: JSON.stringify({ game_id }),
    });
  },

  get: async (game_id: number): Promise<Game> => {
    return request<Game>(`/games/${game_id}`);
  },

  action: async (game_id: number, action: string, amount: number = 0): Promise<Game> => {
    return request<Game>('/games/action', {
      method: 'POST',
      body: JSON.stringify({ game_id, action, amount }),
    });
  },
};

export const lobbyApi = {
  games: async (game_type?: string): Promise<LobbyGame[]> => {
    const params = game_type ? `?game_type=${game_type}` : '';
    return request<LobbyGame[]>(`/lobby/games${params}`);
  },
};
