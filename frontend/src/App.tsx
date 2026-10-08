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
  const { isAuthenticated, isHydrated } = useAuthStore();
  console.log('ProtectedRoute:', { isAuthenticated, isHydrated });
  if (!isHydrated) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent" /></div>;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAuthStore();
  if (!isHydrated) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent" /></div>;
  return !isAuthenticated ? <>{children}</> : <Navigate to="/lobby" />;
}

function App() {
  // Initialize auth on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      authApi.me()
        .then((res) => {
          useAuthStore.getState().setAuth(res.data, token);
        })
        .catch(() => {
          localStorage.removeItem('access_token');
        });
    }
  }, []);

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
          <Route path="/" element={<Navigate to="/lobby" />} />
        </Route>
        <Route path="*" element={<Navigate to="/lobby" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;