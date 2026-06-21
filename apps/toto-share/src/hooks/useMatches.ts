import { useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useStore } from '../store';
import type { Match } from '../types';

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useMatches() {
  const { matches, setMatches } = useStore();

  useEffect(() => {
    const day = todayKey();
    const q = query(
      collection(db, 'days', day, 'matches'),
      orderBy('startTime', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Match[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Match, 'id'>),
      }));
      setMatches(list);
    });
    return unsub;
  }, [setMatches]);

  return { matches, todayKey };
}

export { todayKey };
