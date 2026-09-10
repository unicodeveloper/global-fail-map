'use client';

import type { AccountUser } from '@/lib/server/valyu-session';
import { create } from 'zustand';

interface AuthStore {
  user: AccountUser | null;
  loading: boolean;
  initialized: boolean;
  signInWithValyu: () => Promise<{ data?: { url: string }; error?: Error }>;
  signOut: () => Promise<{ error?: Error }>;
  initialize: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  signInWithValyu: async () => {
    const url = '/api/auth/valyu/start';
    window.location.assign(url);
    return { data: { url } };
  },
  signOut: async () => {
    try {
      const response = await fetch('/api/auth/valyu/session', {
        method: 'DELETE',
      });
      if (!response.ok)
        throw new Error('Could not sign out. Please try again.');
      set({ user: null });
      window.dispatchEvent(new Event('auth:signout'));
      return {};
    } catch {
      return { error: new Error('Could not sign out. Please try again.') };
    }
  },
  initialize: () => {
    if (get().initialized) return;
    set({ initialized: true });
    try {
      localStorage.removeItem('valyu_oauth_tokens');
      localStorage.removeItem('valyu_oauth_state');
      localStorage.removeItem('valyu_oauth_verifier');
      sessionStorage.removeItem('auth-storage');
    } catch {
      // Cookie sessions also work when browser storage is disabled.
    }
    fetch('/api/auth/valyu/session', {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
      .then(async (response) =>
        response.ok ? response.json() : { user: null },
      )
      .then((data) => set({ user: data.user || null, loading: false }))
      .catch(() => set({ user: null, loading: false }));
  },
}));
