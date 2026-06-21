import { create } from 'zustand';
import type { Match, Pick, UserProfile, Selection } from '../types';

interface AppState {
  user: UserProfile | null;
  matches: Match[];
  picks: Pick[];
  onlineUsers: UserProfile[];
  myPicks: Record<string, Selection>;
  confirmedCombo: boolean;

  setUser: (user: UserProfile | null) => void;
  setMatches: (matches: Match[]) => void;
  setPicks: (picks: Pick[]) => void;
  setOnlineUsers: (users: UserProfile[]) => void;
  setMyPick: (matchId: string, selection: Selection) => void;
  removeMyPick: (matchId: string) => void;
  clearMyPicks: () => void;
  setConfirmedCombo: (v: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  matches: [],
  picks: [],
  onlineUsers: [],
  myPicks: {},
  confirmedCombo: false,

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
  clearMyPicks: () => set({ myPicks: {}, confirmedCombo: false }),
  setConfirmedCombo: (v) => set({ confirmedCombo: v }),
}));
