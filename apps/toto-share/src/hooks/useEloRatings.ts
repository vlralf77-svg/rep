import { useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useStore } from '../store';
import { DEFAULT_RATING, updateRatings } from '../utils/elo';

export interface EloEntry {
  rating: number;
  matches: number;
  lastUpdated: any;
}

export function useEloRatings() {
  const eloRatings = useStore((s) => s.eloRatings);
  const setEloRatings = useStore((s) => s.setEloRatings);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'eloRatings'), (snap) => {
      const map: Record<string, EloEntry> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as EloEntry;
      });
      setEloRatings(map);
    });
    return unsub;
  }, [setEloRatings]);

  const recordResult = useCallback(
    async (
      homeTeam: string,
      awayTeam: string,
      result: 'HOME' | 'DRAW' | 'AWAY',
      matchId: string,
    ) => {
      const homeRef = doc(db, 'eloRatings', homeTeam);
      const awayRef = doc(db, 'eloRatings', awayTeam);
      const logRef = doc(db, 'eloResults', matchId);

      const logSnap = await getDoc(logRef);
      if (logSnap.exists()) return;

      const [homeSnap, awaySnap] = await Promise.all([
        getDoc(homeRef),
        getDoc(awayRef),
      ]);

      const homeRating = homeSnap.exists()
        ? (homeSnap.data() as EloEntry).rating
        : DEFAULT_RATING;
      const awayRating = awaySnap.exists()
        ? (awaySnap.data() as EloEntry).rating
        : DEFAULT_RATING;
      const homeMatches = homeSnap.exists()
        ? (homeSnap.data() as EloEntry).matches
        : 0;
      const awayMatches = awaySnap.exists()
        ? (awaySnap.data() as EloEntry).matches
        : 0;

      const updated = updateRatings(homeRating, awayRating, result);

      await Promise.all([
        setDoc(homeRef, {
          rating: updated.home,
          matches: homeMatches + 1,
          lastUpdated: serverTimestamp(),
        }),
        setDoc(awayRef, {
          rating: updated.away,
          matches: awayMatches + 1,
          lastUpdated: serverTimestamp(),
        }),
        setDoc(logRef, {
          homeTeam,
          awayTeam,
          result,
          homeBefore: homeRating,
          awayBefore: awayRating,
          homeAfter: updated.home,
          awayAfter: updated.away,
          createdAt: serverTimestamp(),
        }),
      ]);
    },
    [],
  );

  const getTeamRating = useCallback(
    (teamName: string): number => {
      return eloRatings[teamName]?.rating ?? DEFAULT_RATING;
    },
    [eloRatings],
  );

  const getTeamMatches = useCallback(
    (teamName: string): number => {
      return eloRatings[teamName]?.matches ?? 0;
    },
    [eloRatings],
  );

  return { eloRatings, getTeamRating, getTeamMatches, recordResult };
}
