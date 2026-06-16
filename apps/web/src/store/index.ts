import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppStore {
  selectedLeague: string;
  favorites: number[];
  setLeague: (league: string) => void;
  toggleFavorite: (matchId: number) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      selectedLeague: 'PL',
      favorites: [],
      setLeague: (league) => set({ selectedLeague: league }),
      toggleFavorite: (matchId) => {
        const favs = get().favorites;
        set({ favorites: favs.includes(matchId) ? favs.filter(id => id !== matchId) : [...favs, matchId] });
      },
    }),
    { name: 'sports-app-store' }
  )
);
