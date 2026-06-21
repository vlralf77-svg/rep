import { useEffect, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useStore } from '../store';

export function useAuth() {
  const { user, setUser } = useStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
      }
    });
    return unsub;
  }, [setUser]);

  const login = useCallback(async (nickname: string) => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const profile = {
      uid,
      nickname,
      joinedAt: Date.now(),
      online: true,
    };
    await setDoc(doc(db, 'users', uid), {
      ...profile,
      joinedAt: serverTimestamp(),
    });
    setUser(profile);
    return profile;
  }, [setUser]);

  const updateOnline = useCallback(async (online: boolean) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { online });
  }, [user]);

  const logout = useCallback(async () => {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { online: false });
    }
    await auth.signOut();
    setUser(null);
  }, [user, setUser]);

  return { user, login, logout, updateOnline };
}
