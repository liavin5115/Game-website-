/** Main App component with routing */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/common/Layout';
import { useAuthStore } from './stores/authStore';
import { authApi } from './api/client';
import { useEffect } from 'react';

// Pages
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import LobbyPage from './pages/Lobby';
import WaitingRoom from './pages/WaitingRoom';
import GamePage from './pages/Game';
import WalletPage from './pages/Wallet';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated, isVerified } = useAuthStore();
  if (!isHydrated || (isAuthenticated && !isVerified)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent" />
      </div>
    );
  }
  return (isAuthenticated && isVerified) ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated, isVerified } = useAuthStore();
  if (!isHydrated || (isAuthenticated && !isVerified)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent" />
      </div>
    );
  }
  return !(isAuthenticated && isVerified) ? <>{children}</> : <Navigate to="/lobby" replace />;
}

function App() {
  const isHydrated = useAuthStore((s) => s.isHydrated);

  // Initialize and verify auth on mount
  useEffect(() => {
    if (!isHydrated) return;
    const token = localStorage.getItem('access_token');
    if (token) {
      authApi.me()
        .then((res) => {
          useAuthStore.getState().setAuth(res.data, token);
        })
        .catch(() => {
          useAuthStore.getState().logout();
        });
    } else {
      useAuthStore.getState().logout();
    }
  }, [isHydrated]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          <PublicOnlyRoute><LoginPage /></PublicOnlyRoute>
        } />
        <Route path="/register" element={
          <PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>
        } />
        <Route element={
          <ProtectedRoute><Layout /></ProtectedRoute>
        }>
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/game/:gameId/waiting" element={<WaitingRoom />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/" element={<Navigate to="/lobby" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;