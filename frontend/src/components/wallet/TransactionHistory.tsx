/** Transaction history component */
import { useEffect, useState } from 'react';
import { walletApi } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import type { Transaction, WalletSummary } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

const typeLabels: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  game_buyin: 'Game Buy-in',
  game_win: 'Game Win',
  game_loss: 'Game Loss',
  daily_bonus: 'Daily Bonus',
  refund: 'Refund',
};

const typeColors: Record<string, string> = {
  deposit: 'text-green-600 dark:text-green-400',
  withdrawal: 'text-red-600 dark:text-red-400',
  game_buyin: 'text-yellow-600 dark:text-yellow-400',
  game_win: 'text-green-600 dark:text-green-400',
  game_loss: 'text-red-600 dark:text-red-400',
  daily_bonus: 'text-blue-600 dark:text-blue-400',
  refund: 'text-purple-600 dark:text-purple-400',
};

export function TransactionHistory() {
  const { isAuthenticated } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [dailyBonus, setDailyBonus] = useState<{ claimed: boolean; amount: number; message: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();
  }, [isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [txRes, sumRes] = await Promise.all([
        walletApi.transactions({ limit: 20 }),
        walletApi.summary(),
      ]);
      setTransactions(txRes.data);
      setSummary(sumRes.data);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
    } finally {
      setLoading(false);
    }
  };

  const claimDailyBonus = async () => {
    try {
      const res = await walletApi.dailyBonus();
      setDailyBonus(res.data);
      setShowModal(true);
      loadData();
    } catch (err) {
      console.error('Failed to claim daily bonus:', err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Please log in to view your wallet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance & Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Won</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary?.total_won?.toLocaleString() || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Lost</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summary?.total_lost?.toLocaleString() || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Net</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {summary?.net?.toLocaleString() || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Games Played</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {((summary?.total_won || 0) + (summary?.total_lost || 0)) > 0 ? '—' : '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Bonus</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Claim {100} points once per day
          </p>
          <Button onClick={claimDailyBonus} className="w-full" loading={loading}>
            Claim Bonus
          </Button>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No transactions yet</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {transactions.map((tx) => (
              <div key={tx.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${typeColors[tx.type] || 'text-gray-600'} bg-opacity-10`}
                  >
                    {tx.amount > 0 ? '+' : '−'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {typeLabels[tx.type] || tx.type}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    Balance: {tx.balance_after.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily Bonus Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Daily Bonus">
        <div className="text-center">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            dailyBonus?.claimed ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'
          }`}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {dailyBonus?.claimed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              )}
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {dailyBonus?.claimed ? 'Bonus Claimed!' : 'Already Claimed'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {dailyBonus?.message}
          </p>
          {dailyBonus?.claimed && (
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              +{dailyBonus.amount} pts
            </p>
          )}
          <Button onClick={() => setShowModal(false)} className="w-full mt-4">
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}