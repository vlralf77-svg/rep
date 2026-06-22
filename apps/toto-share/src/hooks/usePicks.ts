import { useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useStore } from '../store';
import { todayKey } from './useMatches';
import type { Pick, Selection, Match } from '../types';

export function usePicks() {
  const {
    user,
    picks,
    setPicks,
    myPicks,
    setMyPick,
    removeMyPick,
    clearMyPicks,
    matches,
  } = useStore();

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

  const confirmCombo = useCallback(async (stake: number = 10) => {
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
        stake,
        updatedAt: serverTimestamp(),
      });
    });

    const rawOdds = Object.entries(myPicks).reduce((acc, [matchId, sel]) => {
      const m = matches.find((x) => x.id === matchId);
      if (!m) return acc;
      const odds =
        sel === 'HOME' ? m.oddsHome : sel === 'DRAW' ? m.oddsDraw : m.oddsAway;
      return acc * odds;
    }, 1);
    const totalOdds = Math.ceil(rawOdds * 100) / 100;

    batch.set(doc(db, 'days', day, 'combos', user.uid), {
      uid: user.uid,
      pickIds: Object.keys(myPicks),
      totalOdds,
      stake,
      confirmedAt: serverTimestamp(),
    });

    await batch.commit();
    useStore.getState().setConfirmedCombo(true);
  }, [user, myPicks, matches]);

  // 픽 초기화. all=true면 전원 픽/조합 삭제(관리자), false면 본인 것만.
  const resetPicks = useCallback(
    async (all: boolean) => {
      if (!user) return;
      const day = todayKey();
      const batch = writeBatch(db);

      const pickSnap = await getDocs(collection(db, 'days', day, 'picks'));
      pickSnap.forEach((d) => {
        if (all || d.data().uid === user.uid) batch.delete(d.ref);
      });

      const comboSnap = await getDocs(collection(db, 'days', day, 'combos'));
      comboSnap.forEach((d) => {
        if (all || d.id === user.uid) batch.delete(d.ref);
      });

      await batch.commit();
      clearMyPicks();
    },
    [user, clearMyPicks],
  );

  return { picks, myPicks, submitPick, removePick, confirmCombo, resetPicks };
}
