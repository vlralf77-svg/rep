import { useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useStore } from '../store';
import { todayKey } from './useMatches';
import type { Pick, Selection, Match } from '../types';

export function usePicks() {
  const { user, picks, setPicks, myPicks, setMyPick, removeMyPick, matches } =
    useStore();

  useEffect(() => {
    const day = todayKey();
    const unsub = onSnapshot(collection(db, 'days', day, 'picks'), (snap) => {
      const list: Pick[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Pick, 'id'>),
      }));
      setPicks(list);
    });
    return unsub;
  }, [setPicks]);

  const submitPick = useCallback(
    async (matchId: string, selection: Selection) => {
      if (!user) return;
      const day = todayKey();
      const pickId = `${user.uid}_${matchId}`;
      await setDoc(doc(db, 'days', day, 'picks', pickId), {
        uid: user.uid,
        nickname: user.nickname,
        matchId,
        selection,
        updatedAt: serverTimestamp(),
      });
      setMyPick(matchId, selection);
    },
    [user, setMyPick],
  );

  const removePick = useCallback(
    async (matchId: string) => {
      if (!user) return;
      const day = todayKey();
      const pickId = `${user.uid}_${matchId}`;
      await deleteDoc(doc(db, 'days', day, 'picks', pickId));
      removeMyPick(matchId);
    },
    [user, removeMyPick],
  );

  const confirmCombo = useCallback(async () => {
    if (!user || Object.keys(myPicks).length === 0) return;
    const day = todayKey();
    const batch = writeBatch(db);

    Object.entries(myPicks).forEach(([matchId, selection]) => {
      const pickId = `${user.uid}_${matchId}`;
      batch.set(doc(db, 'days', day, 'picks', pickId), {
        uid: user.uid,
        nickname: user.nickname,
        matchId,
        selection,
        updatedAt: serverTimestamp(),
      });
    });

    const totalOdds = Object.entries(myPicks).reduce((acc, [matchId, sel]) => {
      const m = matches.find((x) => x.id === matchId);
      if (!m) return acc;
      const odds =
        sel === 'HOME' ? m.oddsHome : sel === 'DRAW' ? m.oddsDraw : m.oddsAway;
      return acc * odds;
    }, 1);

    batch.set(doc(db, 'days', day, 'combos', user.uid), {
      uid: user.uid,
      pickIds: Object.keys(myPicks),
      totalOdds: Math.round(totalOdds * 100) / 100,
      confirmedAt: serverTimestamp(),
    });

    await batch.commit();
    useStore.getState().setConfirmedCombo(true);
  }, [user, myPicks, matches]);

  return { picks, myPicks, submitPick, removePick, confirmCombo };
}
