/** Wallet balance display */
import { useAuthStore } from '../../stores/authStore';
import { walletApi } from '../../api/client';
import { useEffect } from 'react';

export function BalanceDisplay() {
  const { user, updatePoints } = useAuthStore();

  useEffect(() => {
    walletApi.balance().then((res) => updatePoints(res.data.points));
  }, [updatePoints]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your Balance</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {user?.points?.toLocaleString() || 0} pts
          </p>
        </div>
        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
          <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </div>
  );
}