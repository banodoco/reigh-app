// Centralized environment and feature flags for Supabase client/instrumentation

// Supabase configuration - environment variables required
// Note: Anon keys are designed to be public, but we require env vars for easier rotation
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing required Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Dev gating: enable heavy instrumentation only in dev/local
export const __IS_DEV_ENV__ = import.meta.env.VITE_APP_ENV === 'dev' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost');
export const __WS_INSTRUMENTATION_ENABLED__ = true; // FORCE ENABLED to catch corruption
export const __REALTIME_DOWN_FIX_ENABLED__ = __IS_DEV_ENV__;
export const __CORRUPTION_TRACE_ENABLED__ = true; // FORCE ENABLED to catch corruption

