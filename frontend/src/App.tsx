/** Main App component with routing */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/common/Layout';
import { useAuthStore } from './stores/authStore';
import { authApi, gamesApi } from './api/client';
import { useEffect, useState } from 'react';

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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isVerified = useAuthStore((s) => s.isVerified);
  const [activeGameChecked, setActiveGameChecked] = useState(false);
  const [showReturnBanner, setShowReturnBanner] = useState(false);
  const [activeGame, setActiveGame] = useState<{ id: number; status: string } | null>(null);

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

  // Check for active game after auth verified
  useEffect(() => {
    if (!isAuthenticated || !isVerified || activeGameChecked) return;
    
    const checkActiveGame = async () => {
      try {
        const res = await gamesApi.active();
        if (res.data) {
          setActiveGame(res.data);
          setShowReturnBanner(true);
        }
      } catch (e) {
        // Ignore errors
      } finally {
        setActiveGameChecked(true);
      }
    };
    
    checkActiveGame();
  }, [isAuthenticated, isVerified, activeGameChecked]);

  const handleReturnToGame = () => {
    if (activeGame) {
      const path = activeGame.status === 'in_progress' 
        ? `/game/${activeGame.id}` 
        : `/game/${activeGame.id}/waiting`;
      window.location.href = path;
    }
  };

  const handleDismissBanner = () => {
    setShowReturnBanner(false);
  };

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
          <ProtectedRoute>
            <Layout 
              showReturnBanner={showReturnBanner} 
              activeGame={activeGame}
              onReturnToGame={handleReturnToGame}
              onDismissBanner={handleDismissBanner}
            />
          </ProtectedRoute>
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