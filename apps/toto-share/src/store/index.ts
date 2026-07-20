import { create } from 'zustand';
import type { Match, Pick, UserProfile, Selection } from '../types';

interface EloEntry {
  rating: number;
  matches: number;
  lastUpdated: any;
}

interface AppState {
  user: UserProfile | null;
  matches: Match[];
  picks: Pick[];
  onlineUsers: UserProfile[];
  myPicks: Record<string, Selection>;
  eloRatings: Record<string, EloEntry>;

  setUser: (user: UserProfile | null) => void;
  setMatches: (matches: Match[]) => void;
  setPicks: (picks: Pick[]) => void;
  setOnlineUsers: (users: UserProfile[]) => void;
  setMyPick: (matchId: string, selection: Selection) => void;
  removeMyPick: (matchId: string) => void;
  clearMyPicks: () => void;
  setEloRatings: (ratings: Record<string, EloEntry>) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  matches: [],
  picks: [],
  onlineUsers: [],
  myPicks: {},
  eloRatings: {},

  setUser: (user) => set({ user }),
  setMatches: (matches) => set({ matches }),
  setPicks: (picks) => set({ picks }),
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  setMyPick: (matchId, selection) =>
    set((s) => ({ myPicks: { ...s.myPicks, [matchId]: selection } })),
  removeMyPick: (matchId) =>
    set((s) => {
      const next = { ...s.myPicks };
      delete next[matchId];
      return { myPicks: next };
    }),
  clearMyPicks: () => set({ myPicks: {} }),
  setEloRatings: (ratings) => set({ eloRatings: ratings }),
}));
