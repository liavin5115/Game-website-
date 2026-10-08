/** Auth state management with Zustand */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isVerified: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updatePoints: (points: number) => void;
  setHydrated: (hydrated: boolean) => void;
  setVerified: (verified: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrated: false,
      isVerified: false,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        set({ user, token, isAuthenticated: Boolean(token), isVerified: true });
      },
      logout: () => {
        localStorage.removeItem('access_token');
        set({ user: null, token: null, isAuthenticated: false, isVerified: false });
      },
      updatePoints: (points) =>
        set((state) => ({
          user: state.user ? { ...state.user, points } : null,
        })),
      setHydrated: (hydrated) => set({ isHydrated: hydrated }),
      setVerified: (verified) => set({ isVerified: verified }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const hasToken = Boolean(state.token && localStorage.getItem('access_token'));
          state.isAuthenticated = hasToken;
          state.isVerified = false;
          state.isHydrated = true;
        }
      },
    }
  )
);