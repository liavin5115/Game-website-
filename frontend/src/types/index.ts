/** Shared TypeScript types */

export interface User {
  id: number;
  username: string;
  email: string;
  points: number;
  total_games: number;
  total_wins: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface GameType {
  type: string;
  name: string;
  min_players: number;
  max_players: number;
  default_buy_in: number;
  description: string;
}

export interface Game {
  id: number;
  game_type: string;
  status: 'waiting' | 'in_progress' | 'finished' | 'cancelled';
  buy_in: number;
  pot: number;
  player1_id: number;
  player2_id: number | null;
  winner_id: number | null;
  state: GameState;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface GameState {
  phase: string;
  current_player: number;
  players: PlayerState[];
  community_cards: string[];
  pot: number;
  current_bet: number;
  min_raise: number;
  winner: number | null;
  metadata: Record<string, unknown>;
}

export interface PlayerState {
  id: number;
  username: string;
  chips: number;
  cards: string[];
  bet: number;
  status: string;
  doubled?: boolean;
  result?: string;
  payout?: number;
}

export interface LobbyPlayer {
  id: number;
  username: string;
  seat: number;
  bet: number;
  status: string;
}

export interface LobbyGame {
  id: number;
  game_type: string;
  status: string;
  buy_in: number;
  pot: number;
  host_id: number;
  max_players: number;
  min_players: number;
  players: LobbyPlayer[];
  created_at: string;
}

export interface Transaction {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  reference_id: number | null;
  created_at: string;
}

export interface WalletSummary {
  total_deposited: number;
  total_withdrawn: number;
  total_won: number;
  total_lost: number;
  net: number;
}

export interface DailyBonusResponse {
  claimed: boolean;
  amount: number;
  new_balance: number;
  message: string;
}

export interface CreateGameRequest {
  game_type: string;
  buy_in?: number;
}

export interface JoinGameRequest {
  game_id: number;
}

export interface ActionRequest {
  game_id: number;
  action: string;
  amount?: number;
}

export interface ValidAction {
  type: string;
  min_amount?: number;
  max_amount?: number;
}