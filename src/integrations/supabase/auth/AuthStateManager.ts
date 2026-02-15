import { handleError } from '@/shared/lib/errorHandler';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

type AuthCallback = (event: string, session: Session | null) => void;

const AUTH_HEAL_DEBOUNCE_MS = 5000;

export class AuthStateManager {
  private listeners: Array<{id: string, callback: AuthCallback}> = [];
  private isInitialized = false;
  private __LAST_AUTH_HEAL_AT__ = 0;

  constructor(private supabase: SupabaseClient) {}

  subscribe(id: string, callback: AuthCallback) {
    this.listeners.push({ id, callback });
    return () => {
      this.listeners = this.listeners.filter(listener => listener.id !== id);
    };
  }

  private notifyListeners(event: string, session: Session | null) {
    this.listeners.forEach(({ callback }) => {
      try {
        callback(event, session);
      } catch (error) {
        handleError(error, { context: 'AuthStateManager', showToast: false });
      }
    });
  }

  private handleCoreAuth(event: string, session: Session | null) {
    try {
      this.supabase?.realtime?.setAuth?.(session?.access_token ?? null);
      
      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        setTimeout(async () => {
          try {
            const now = Date.now();
            if (now - this.__LAST_AUTH_HEAL_AT__ > AUTH_HEAL_DEBOUNCE_MS) {
              this.__LAST_AUTH_HEAL_AT__ = now;
              
              // Use ReconnectScheduler instead of direct event dispatch
              try {
                const module = await import('@/integrations/supabase/reconnect/ReconnectScheduler');
                const { getReconnectScheduler } = module;
                const scheduler = getReconnectScheduler();
                scheduler.requestReconnect({
                  source: 'AuthManager',
                  reason: `SIGNED_IN event (${event})`,
                  priority: 'high'
                });
              } catch (importError) {
                handleError(importError, { context: 'AuthStateManager', showToast: false });
              }
            }
          } catch (healError) {
            handleError(healError, { context: 'AuthStateManager', showToast: false });
          }
        }, 1000);
      }
    } catch (setAuthError) {
      handleError(setAuthError, { context: 'AuthStateManager', showToast: false });
    }
  }

  init() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.handleCoreAuth(event, session);
        this.notifyListeners(event, session);
      });
      this.isInitialized = true;
    } catch (authError) {
      handleError(authError, { context: 'AuthStateManager', showToast: false });
    }
  }
}

export function initAuthStateManager(supabase: SupabaseClient) {
  if (typeof window !== 'undefined') {
    window.__AUTH_MANAGER__ = new AuthStateManager(supabase);
    window.__AUTH_MANAGER__.init();
  }
}

