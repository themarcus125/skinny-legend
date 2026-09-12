'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { API_BASE_URL, createAdminApi, describeError, IS_MOCK } from '@/lib/api';
import type { AdminApi } from '@/lib/api/client';
import type { AdminUser } from '@/lib/api/types';
import { firebaseAuth, googleProvider, isFirebaseConfigured } from './firebase';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  user: AdminUser | null;
  /**
   * A message key under messages/*.json (`errors.*` from describeError, or `auth.*`) that the
   * gate renders with `t()`. The two build-time env misconfigurations are the exception: raw
   * English developer text, never localised (the console cannot even reach the API then).
   */
  error: string | null;
  /** True once a Firebase user is signed in, even if the app rejected their session (disabled/pending). */
  hasFirebaseUser: boolean;
  api: AdminApi;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

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
  const [hasFirebaseUser, setHasFirebaseUser] = useState(false);

  // Guards against a slow `loadSession` call finishing after a newer sign-out (or a newer
  // sign-in) has already moved the state on. Every intentional transition — an
  // onAuthStateChanged callback, or an explicit sign-out — bumps this; `loadSession` captures
  // the value it started with and drops its result if the counter has since moved.
  const generationRef = useRef(0);

  const loadSession = useCallback(
    async (generation: number) => {
      try {
        const profile = await api.session();
        if (generationRef.current !== generation) return;
        setUser(profile);
        setError(null);
        setStatus('signed-in');
      } catch (err) {
        if (generationRef.current !== generation) return;
        console.error('[auth] POST /auth/session failed', err);
        setUser(null);
        setError(describeError(err));
        setStatus('error');
      }
    },
    [api],
  );

  useEffect(() => {
    if (IS_MOCK) {
      const generation = generationRef.current;
      void loadSession(generation);
      return;
    }
    if (!API_BASE_URL) {
      setError('Missing NEXT_PUBLIC_API_BASE_URL');
      setStatus('error');
      return;
    }
    if (!isFirebaseConfigured()) {
      setError('Missing NEXT_PUBLIC_FIREBASE_*');
      setStatus('error');
      return;
    }
    return onAuthStateChanged(firebaseAuth(), (firebaseUser) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      setHasFirebaseUser(Boolean(firebaseUser));
      if (!firebaseUser) {
        queryClient.clear();
        setUser(null);
        setError(null);
        setStatus('signed-out');
        return;
      }
      setStatus('loading');
      void loadSession(generation);
    });
  }, [loadSession, queryClient]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(firebaseAuth(), googleProvider());
    } catch (err) {
      // Keep the real cause (popup blocked, unauthorised domain, misconfigured consent screen)
      // in the console; the user only ever sees the catalogue message.
      console.error('[auth] Google sign-in failed', err);
      setError('auth.googleFailed');
      setStatus('error');
    }
  }, []);

  const signOutUser = useCallback(async () => {
    generationRef.current += 1;
    queryClient.clear();
    if (IS_MOCK) {
      setUser(null);
      setHasFirebaseUser(false);
      setStatus('signed-out');
      return;
    }
    try {
      await signOut(firebaseAuth());
    } catch (err) {
      console.error('[auth] Sign-out failed', err);
      setError('auth.signOutFailed');
      setStatus('error');
    }
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ status, user, error, hasFirebaseUser, api, signIn, signOutUser }),
    [status, user, error, hasFirebaseUser, api, signIn, signOutUser],
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
