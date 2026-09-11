'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { createAdminApi, describeError, IS_MOCK } from '@/lib/api';
import type { AdminApi } from '@/lib/api/client';
import type { AdminUser } from '@/lib/api/types';
import { firebaseAuth, googleProvider, isFirebaseConfigured } from './firebase';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  user: AdminUser | null;
  error: string | null;
  api: AdminApi;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useMemo(
    () =>
      createAdminApi(async () => {
        if (IS_MOCK) return 'mock-token';
        const current = firebaseAuth().currentUser;
        return current ? current.getIdToken() : null;
      }),
    [],
  );

  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const profile = await api.session();
      setUser(profile);
      setError(null);
      setStatus('signed-in');
    } catch (err) {
      console.error('[auth] POST /auth/session failed', err);
      setUser(null);
      setError(describeError(err));
      setStatus('error');
    }
  }, [api]);

  useEffect(() => {
    if (IS_MOCK) {
      // Mock mode has no onAuthStateChanged subscription to hang the initial session
      // fetch off; it must run once on mount instead.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadSession();
      return;
    }
    if (!isFirebaseConfigured()) {
      setError('Thiếu biến môi trường NEXT_PUBLIC_FIREBASE_*');
      setStatus('error');
      return;
    }
    return onAuthStateChanged(firebaseAuth(), (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setError(null);
        setStatus('signed-out');
        return;
      }
      setStatus('loading');
      void loadSession();
    });
  }, [loadSession]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(firebaseAuth(), googleProvider());
    } catch (err) {
      // Keep the real cause (popup blocked, unauthorised domain, misconfigured consent screen)
      // in the console; the user only ever sees the Vietnamese message.
      console.error('[auth] Google sign-in failed', err);
      setError('Đăng nhập Google thất bại. Kiểm tra cửa sổ popup và tên miền được phép trong Firebase.');
      setStatus('error');
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (IS_MOCK) {
      setUser(null);
      setStatus('signed-out');
      return;
    }
    await signOut(firebaseAuth());
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, error, api, signIn, signOutUser }),
    [status, user, error, api, signIn, signOutUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Every data page gets its AdminApi from here, so mock mode swaps in one place. */
export function useAdminApi(): AdminApi {
  return useAuth().api;
}
