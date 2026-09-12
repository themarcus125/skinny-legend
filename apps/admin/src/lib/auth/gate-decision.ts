import type { AdminUser } from '@/lib/api/types';

export type GateDecision =
  | { kind: 'loading' }
  | { kind: 'sign-in' }
  /** `message` is whatever `AuthState.error` holds: a message key, or raw developer text (see AuthState). */
  | { kind: 'error'; message: string }
  | { kind: 'not-authorized' }
  | { kind: 'allow' };

export interface GateInput {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  user: AdminUser | null;
  error: string | null;
}

/**
 * The dashboard is admin-only: the API answers `POST /auth/session` for any signed-in user,
 * so the role/status check happens here as well as on every /admin/* call (403 forbidden).
 */
export function gateDecision(state: GateInput): GateDecision {
  if (state.status === 'loading') return { kind: 'loading' };
  if (state.status === 'signed-out') return { kind: 'sign-in' };
  if (state.status === 'error') return { kind: 'error', message: state.error ?? 'auth.signInFailed' };
  const user = state.user;
  if (!user || user.role !== 'admin' || user.status !== 'active') return { kind: 'not-authorized' };
  return { kind: 'allow' };
}
