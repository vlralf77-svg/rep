import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedLeague: string;
  selectedStatus: string;
  favorites: number[];
  setSelectedLeague: (league: string) => void;
  setSelectedStatus: (status: string) => void;
  toggleFavorite: (matchId: number) => void;
  isFavorite: (matchId: number) => boolean;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      selectedLeague: 'PL',
      selectedStatus: 'SCHEDULED',
      favorites: [],

      setSelectedLeague: (league) => set({ selectedLeague: league }),
      setSelectedStatus: (status) => set({ selectedStatus: status }),

      toggleFavorite: (matchId) =>
        set((state) => ({
          favorites: state.favorites.includes(matchId)
            ? state.favorites.filter((id) => id !== matchId)
            : [...state.favorites, matchId],
        })),

      isFavorite: (matchId) => get().favorites.includes(matchId),
    }),
    {
      name: 'sports-prediction-store',
    }
  )
);
