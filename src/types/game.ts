// Game types matching backend JSON responses

export type GameStatus = 'waiting' | 'in_progress' | 'finished' | 'cancelled';

export interface Player {
  id: number;
  username: string;
  seat: number;
  bet: number;
  status: string;
}

export interface GameState {
  phase: string;
  current_player: number;
  players: Array<{
    id: number;
    username: string;
    chips: number;
    cards: string[];
    bet: number;
    status: string;
    doubled?: boolean;
  }>;
  community_cards: string[];
  pot: number;
  current_bet: number;
  min_raise: number;
  winner: number | null;
  metadata: {
    dealer_hidden?: boolean;
    dealer_cards?: string[];
  };
}

export interface Game {
  id: number;
  game_type: string;
  status: GameStatus;
  buy_in: number;
  pot: number;
  host_id: number;
  max_players: number;
  min_players: number;
  players: Player[];
  winner_id: number | null;
  state: GameState;
  current_turn_user_id: number | null;
  my_valid_actions: string[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface LobbyGame {
  id: number;
  game_type: string;
  status: GameStatus;
  buy_in: number;
  pot: number;
  host_id: number;
  max_players: number;
  min_players: number;
  players: Player[];
  created_at: string;
}
