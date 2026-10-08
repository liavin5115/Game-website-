/** Axios client with auth interceptors */
import axios from 'axios';

const API_BASE = '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Wallet endpoints
export const walletApi = {
  balance: () => api.get('/wallet/balance'),
  transactions: (params?: { limit?: number; offset?: number }) =>
    api.get('/wallet/transactions', { params }),
  dailyBonus: () => api.post('/wallet/daily-bonus'),
  summary: () => api.get('/wallet/summary'),
};

// Game endpoints
export const gamesApi = {
  types: () => api.get('/games/types'),
  create: (data: { game_type: string; buy_in?: number }) =>
    api.post('/games/create', data),
  join: (data: { game_id: number }) => api.post('/games/join', data),
  leave: (data: { game_id: number }) => api.post('/games/leave', data),
  start: (data: { game_id: number }) => api.post('/games/start', data),
  action: (data: { game_id: number; action: string; amount?: number }) =>
    api.post('/games/action', data),
  get: (gameId: number) => api.get(`/games/${gameId}`),
  history: (params?: { status?: string }) =>
    api.get('/games/my/history', { params }),
};

// Lobby endpoints
export const lobbyApi = {
  games: (gameType?: string) =>
    api.get('/lobby/games', { params: { game_type: gameType } }),
};