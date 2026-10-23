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
  next_game_id?: number;
  turn_deadline?: string | null;
  turn_seq?: number;
  server_time?: string;
  turn_seconds?: number;
  host_id?: number;
  max_players?: number;
  min_players?: number;
  players?: GamePlayer[];
  results?: PokerResult[];
  winners?: number[];
  pot_total?: number;
  showdown?: boolean;
  winning_cards?: string[];
  current_turn_user_id?: number;
  my_valid_actions?: string[];
  my_action_limits?: {
    min_bet_to: number;
    min_raise_to: number;
    max_bet_to: number;
  } | null;
}

export interface PokerResult {
  id: number;
  username: string;
  result: 'won' | 'lost' | 'folded' | 'split';
  payout: number;
  contribution: number;
  net: number;
  hand_name: string | null;
  revealed_cards: string[];
  hand_cards: string[];
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
  contribution?: number;
  net?: number;
  hand_name?: string | null;
  revealed_cards?: string[];
  hand_cards?: string[];
  auto_stood?: boolean;
  away?: boolean;
  connected?: boolean;
  total_bet?: number;
}

export interface GamePlayer {
  id: number;
  username: string;
  seat: number;
  bet: number;
  status: 'playing' | 'active' | 'folded' | 'away' | 'waiting';
  auto_stood?: boolean;
  away?: boolean;
  connected?: boolean;
}

export interface LobbyPlayer {
  id: number;
  username: string;
  seat: number;
  bet: number;
  status: string;
  auto_stood?: boolean;
  away?: boolean;
  connected?: boolean;
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
  games_played: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  total_won: number;
  total_lost: number;
  net: number;
  biggest_win: number;
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
  turn_seq?: number;
}

export interface ValidAction {
  type: string;
  min_amount?: number;
  max_amount?: number;
}