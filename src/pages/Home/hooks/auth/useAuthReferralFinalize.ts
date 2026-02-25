import { useCallback } from 'react';
import { getSupabaseClient } from '@/integrations/supabase/client';
import {
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import { getStorageItem, removeStorageItems } from './storage';
import { runAuthSupabaseOperation } from './runAuthSupabaseOperation';

const REFERRAL_KEYS = [
  'referralCode',
  'referralSessionId',
  'referralFingerprint',
  'referralTimestamp',
] as const;

export function useAuthReferralFinalize() {
  return useCallback(async (): Promise<OperationResult<{ finalized: boolean }>> => {
    const supabase = getSupabaseClient();
    const referralSessionId = getStorageItem(
      'referralSessionId',
      'useAuthReferralFinalize.read.referralSessionId',
    );
    const referralFingerprint = getStorageItem(
      'referralFingerprint',
      'useAuthReferralFinalize.read.referralFingerprint',
    );
    const referralCode = getStorageItem(
      'referralCode',
      'useAuthReferralFinalize.read.referralCode',
    );

    if (!referralCode || !referralSessionId || !referralFingerprint) {
      return operationSuccess({ finalized: false });
    }

    return runAuthSupabaseOperation({
      context: 'useAuthReferralFinalize.finalize',
      errorCode: 'referral_finalize_failed',
      showToast: false,
      run: async () => {
        const { error } = await supabase.rpc('create_referral_from_session', {
          p_session_id: referralSessionId,
          p_fingerprint: referralFingerprint,
        });
        if (error) {
          throw error;
        }
        removeStorageItems(REFERRAL_KEYS, 'useAuthReferralFinalize.cleanup');
        return { finalized: true };
      },
    });
  }, []);
}
