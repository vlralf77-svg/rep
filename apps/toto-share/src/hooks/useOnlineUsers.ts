import { useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore } from '../store';
import type { UserProfile } from '../types';

export function useOnlineUsers() {
  const { onlineUsers, setOnlineUsers } = useStore();

  useEffect(() => {
    const q = query(collection(db, 'users'), where('online', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const users: UserProfile[] = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<UserProfile, 'uid'>),
      }));
      setOnlineUsers(users);
    });
    return unsub;
  }, [setOnlineUsers]);

  return { onlineUsers };
}
