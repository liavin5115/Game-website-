/** Wallet page */
import { TransactionHistory } from '../components/wallet/TransactionHistory';
import { BalanceDisplay } from '../components/wallet/BalanceDisplay';

export default function WalletPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wallet</h1>
      <BalanceDisplay />
      <TransactionHistory />
    </div>
  );
}