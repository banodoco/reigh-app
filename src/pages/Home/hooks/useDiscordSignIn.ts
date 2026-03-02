import { useCallback } from 'react';
import { getSupabaseClientResult } from '@/integrations/supabase/client';
import { runAuthSupabaseOperation } from './auth/runAuthSupabaseOperation';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';

type OAuthIntentCacheResult = OperationResult<{ cached: boolean }>;

function cacheOAuthIntentFlag(): OAuthIntentCacheResult {
  try {
    localStorage.setItem('oauthInProgress', 'true');
    return operationSuccess({ cached: true }, { policy: 'best_effort' });
  } catch (error) {
    return operationFailure(error, {
      policy: 'degrade',
      recoverable: true,
      errorCode: 'oauth_intent_cache_failed',
      message: 'Unable to cache OAuth intent in local storage.',
      cause: error,
    });
  }
}

export function useDiscordSignIn() {
  return useCallback(async () => {
    const supabaseResult = getSupabaseClientResult();
    if (!supabaseResult.ok) {
      return operationFailure(supabaseResult.error, {
        policy: 'degrade',
        recoverable: true,
        errorCode: 'supabase_runtime_uninitialized',
        message: 'Supabase runtime is not initialized yet.',
      });
    }
    const supabase = supabaseResult.client;
    const intentCacheResult = cacheOAuthIntentFlag();
    if (!intentCacheResult.ok) {
      normalizeAndPresentError(intentCacheResult.error, {
        context: 'useDiscordSignIn.cacheOauthIntent',
        showToast: false,
        logData: {
          errorCode: intentCacheResult.errorCode,
          policy: intentCacheResult.policy,
          recoverable: intentCacheResult.recoverable,
        },
      });
    }

    const oauthStartResult = await runAuthSupabaseOperation({
      context: 'useDiscordSignIn.startOAuth',
      errorCode: 'discord_oauth_start_failed',
      showToast: true,
      toastTitle: 'Failed to start Discord sign-in. Please try again.',
      run: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            redirectTo: window.location.origin,
          },
        });

        if (error) {
          throw error;
        }

        return { started: true as const };
      },
    });

    if (!oauthStartResult.ok) {
      return oauthStartResult;
    }

    return operationSuccess(
      {
        ...oauthStartResult.value,
        oauthIntentCached: intentCacheResult.ok,
      },
      {
        policy: intentCacheResult.ok ? oauthStartResult.policy : 'degrade',
      },
    );
  }, []);
}
