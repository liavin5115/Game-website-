/** Main layout with header and navigation */
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export function Layout() {
  const { user, isAuthenticated, logout } = useAuthStore();

  const navLinks = [
    { path: '/lobby', label: 'Lobby' },
    { path: '/wallet', label: 'Wallet' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/lobby" className="text-xl font-bold text-blue-600 dark:text-blue-400">
              Game Platform
            </Link>

            <nav className="flex items-center gap-4">
              {isAuthenticated && (
                <>
                  {navLinks.map((link) => (
                    <NavLink
                      key={link.path}
                      to={link.path}
                      className={({ isActive }) =>
                        `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}

                  <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {user?.points || 0} pts
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {user?.username}
                    </span>
                    <button
                      onClick={logout}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Logout
                    </button>
                  </div>
                </>
              )}

              {!isAuthenticated && (
                <div className="flex items-center gap-2">
                  <Link to="/login" className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg">
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Register
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}