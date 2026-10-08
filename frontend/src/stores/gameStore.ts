/** Game state management */
import { create } from 'zustand';
import type { Game, GameState, PlayerState, LobbyGame } from '../types';

interface GameStore {
  currentGame: Game | null;
  gameState: GameState | null;
  myPlayer: PlayerState | null;
  lobbyGames: LobbyGame[];
  setCurrentGame: (game: Game | null) => void;
  setGameState: (state: GameState) => void;
  setMyPlayer: (player: PlayerState | null) => void;
  setLobbyGames: (games: LobbyGame[]) => void;
  updatePlayerInState: (playerId: number, updates: Partial<PlayerState>) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentGame: null,
  gameState: null,
  myPlayer: null,
  lobbyGames: [],
  setCurrentGame: (game) => set({ currentGame: game }),
  setGameState: (state) => set({ gameState: state }),
  setMyPlayer: (player) => set({ myPlayer: player }),
  setLobbyGames: (games) => set({ lobbyGames: games }),
  updatePlayerInState: (playerId, updates) =>
    set((state) => ({
      gameState: state.gameState
        ? {
            ...state.gameState,
            players: state.gameState.players.map((p) =>
              p.id === playerId ? { ...p, ...updates } : p
            ),
          }
        : null,
    })),
  clearGame: () =>
    set({ currentGame: null, gameState: null, myPlayer: null }),
}));