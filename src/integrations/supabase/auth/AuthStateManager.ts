import { handleError } from '@/shared/lib/errorHandler';

export class AuthStateManager {
  private listeners: Array<{id: string, callback: (event: string, session: any) => void}> = [];
  private isInitialized = false;
  private __LAST_AUTH_HEAL_AT__ = 0;

  constructor(private supabase: any) {}

  subscribe(id: string, callback: (event: string, session: any) => void) {
    this.listeners.push({ id, callback });
    return () => {
      this.listeners = this.listeners.filter(l => l.id !== id);
    };
  }

  private notifyListeners(event: string, session: any) {
    this.listeners.forEach(({ id, callback }) => {
      try {
        callback(event, session);
      } catch (error) {
        handleError(error, { context: 'AuthStateManager', showToast: false });
      }
    });
  }

  private handleCoreAuth(event: string, session: any) {
    try {
      this.supabase?.realtime?.setAuth?.(session?.access_token ?? null);
      
      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        setTimeout(async () => {
          try {
            const now = Date.now();
            if (now - this.__LAST_AUTH_HEAL_AT__ > 5000) {
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
      this.supabase.auth.onAuthStateChange((event: any, session: any) => {
        this.handleCoreAuth(event, session);
        this.notifyListeners(event, session);
      });
      this.isInitialized = true;
    } catch (authError) {
      handleError(authError, { context: 'AuthStateManager', showToast: false });
    }
  }
}

export function initAuthStateManager(supabase: any) {
  if (typeof window !== 'undefined') {
    (window as any).__AUTH_MANAGER__ = new AuthStateManager(supabase);
    (window as any).__AUTH_MANAGER__.init();
  }
}


