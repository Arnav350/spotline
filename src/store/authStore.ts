import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Profile } from '../lib/types';

let _initialized = false;

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, 'display_name'>>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    if (_initialized) return;
    _initialized = true;

    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session, user: session?.user ?? null });
      if (session) {
        await get().refreshProfile();
      } else {
        set({ profile: null });
      }
      set({ loading: false });
    });

    // If onAuthStateChange doesn't fire (no session, no stored token), ensure loading clears
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      set({ loading: false });
    }

    // cleanup on HMR / dev reloads
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        subscription.unsubscribe();
        _initialized = false;
      });
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  },

  signUp: async (email, password, displayName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return error ? error.message : null;
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return error ? error.message : null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset_password=true`,
    });
    return error ? error.message : null;
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
      set({ profile: data as Profile });
    } else {
      // Profile doesn't exist yet (trigger may not have fired) — create it
      const meta = user.user_metadata ?? {};
      const fallbackName = meta.display_name || meta.full_name || meta.name || user.email?.split('@')[0] || 'User';
      const newProfile: Profile = {
        id: user.id,
        display_name: fallbackName,
      };
      await supabase.from('profiles').insert(newProfile);
      set({ profile: newProfile });
    }
  },

  updateProfile: async (updates) => {
    const { user, profile } = get();
    if (!user || !profile) return;
    await supabase.from('profiles').update(updates).eq('id', user.id);
    set({ profile: { ...profile, ...updates } });
  },
}));
