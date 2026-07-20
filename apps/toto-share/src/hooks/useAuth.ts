import { useEffect, useCallback, useRef } from 'react';
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
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
      }
    });
    return unsub;
  }, [setUser]);

  useEffect(() => {
    if (!user) return;

    const setOffline = () => {
      const u = userRef.current;
      if (!u) return;
      const data = JSON.stringify({ online: false });
      const blob = new Blob([data], { type: 'application/json' });
      const url = `https://firestore.googleapis.com/v1/projects/betman-841e3/databases/(default)/documents/users/${u.uid}?updateMask.fieldPaths=online`;
      navigator.sendBeacon(url, blob);
      updateDoc(doc(db, 'users', u.uid), { online: false }).catch(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setOffline();
      }
    };

    window.addEventListener('beforeunload', setOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', setOffline);

    return () => {
      window.removeEventListener('beforeunload', setOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', setOffline);
    };
  }, [user]);

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
