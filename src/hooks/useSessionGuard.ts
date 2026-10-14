import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { useStore } from '../store/useStore';

export function useSessionGuard() {
  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, user => {
      stopProfile?.();
      if (!user) return;
      stopProfile = onSnapshot(doc(db, 'plz_users', user.uid), snapshot => {
        if (snapshot.metadata.fromCache) return;
        const profile = snapshot.data();
        if (!profile || profile.active !== true) useStore.getState().logout();
        else if (useStore.getState().authenticatedUser?.id === user.uid) {
          const { password, ...safe } = profile;
          useStore.getState().setAuthenticatedUser({ ...safe, id: user.uid } as any);
        }
      }, error => {
        if (error.code === 'permission-denied' || error.code === 'unauthenticated') useStore.getState().logout();
      });
    });
    return () => { stopAuth(); stopProfile?.(); };
  }, []);
}
