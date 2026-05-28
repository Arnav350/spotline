import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  return supabaseUrl !== '' && supabaseAnonKey !== '' && supabaseUrl.startsWith('http');
};

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

export const supabase = createClient(
  isSupabaseConfigured() ? supabaseUrl : PLACEHOLDER_URL,
  isSupabaseConfigured() ? supabaseAnonKey : PLACEHOLDER_KEY
);
