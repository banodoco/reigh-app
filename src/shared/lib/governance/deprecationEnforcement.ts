import { isPastRemovalTarget, type DeprecationPolicy } from '@/shared/lib/governance/deprecationPolicy';
import {
  normalizeAndPresentAndRethrow,
  normalizeAndPresentError,
} from '@/shared/lib/errorHandling/runtimeError';

const signaledDeprecations = new Set<string>();

interface DeprecationSignalOptions {
  alias: string;
  policy: DeprecationPolicy;
  remediation?: string;
  enforcement?: 'warn' | 'throw' | 'auto';
}

function resolveEnforcementMode(mode: DeprecationSignalOptions['enforcement']): 'warn' | 'throw' {
  if (mode === 'warn' || mode === 'throw') {
    return mode;
  }

  const metaEnv = typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    : undefined;
  const nodeEnv = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
  const isTestMode = nodeEnv === 'test' || metaEnv?.MODE === 'test' || metaEnv?.VITEST === 'true';
  const explicit = metaEnv?.VITE_DEPRECATION_ENFORCEMENT;

  if (explicit === 'throw') {
    return isTestMode ? 'warn' : 'throw';
  }
  if (explicit === 'warn') {
    return 'warn';
  }

  if (isTestMode) {
    return 'warn';
  }

  return nodeEnv === 'production' ? 'warn' : 'throw';
}

/**
 * Emits a one-time runtime signal when a deprecated alias is used past its removal target.
 * Returns true when the usage is past target, false otherwise.
 */
export function signalPastRemovalTargetUsage({
  alias,
  policy,
  remediation,
  enforcement = 'auto',
}: DeprecationSignalOptions): boolean {
  if (!isPastRemovalTarget(policy)) {
    return false;
  }

  const key = `${alias}:${policy.removeBy}`;
  if (signaledDeprecations.has(key)) {
    return true;
  }

  signaledDeprecations.add(key);
  const suffix = remediation ? ` ${remediation}` : '';
  const message = `[deprecation] ${alias} is past removal target ${policy.removeBy} (owner: ${policy.owner}).${suffix}`;
  const mode = resolveEnforcementMode(enforcement);
  const logData = {
    alias,
    owner: policy.owner,
    removeBy: policy.removeBy,
    mode,
  };

  if (mode === 'throw') {
    normalizeAndPresentAndRethrow(new Error(message), {
      context: 'deprecationEnforcement.signalPastRemovalTargetUsage',
      showToast: false,
      logData,
    });
  }

  normalizeAndPresentError(new Error(message), {
    context: 'deprecationEnforcement.signalPastRemovalTargetUsage',
    showToast: false,
    logData,
  });
  return true;
}
