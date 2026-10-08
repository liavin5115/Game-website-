/** Game page - renders appropriate game component based on game type */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/client';
import { PokerTable } from '../components/games/poker/PokerTable';
import { BlackjackTable } from '../components/games/blackjack/BlackjackTable';

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', Number(gameId)],
    queryFn: async () => {
      const res = await gamesApi.get(Number(gameId));
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Game not found
      </div>
    );
  }

  switch (game.game_type) {
    case 'poker':
      return <PokerTable gameId={Number(gameId)} />;
    case 'blackjack':
      return <BlackjackTable gameId={Number(gameId)} />;
    default:
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Unknown game type: {game.game_type}
        </div>
      );
  }
}
