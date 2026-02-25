export type RealtimeStatus = 'connected' | 'disconnected' | 'error';
export type PollingInterval = number | false;

export interface PollingFailureInfo {
  count: number;
  lastFailure: number;
}

interface PollingPolicyInput {
  status: RealtimeStatus;
  lastEventAt?: number;
  lastStatusChangeAt: number;
  now: number;
  failureInfo?: PollingFailureInfo;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export function getPollingIntervalForRealtimeState(input: PollingPolicyInput): PollingInterval {
  const {
    status,
    lastEventAt,
    lastStatusChangeAt,
    now,
    failureInfo,
    circuitBreakerThreshold,
    circuitBreakerResetMs,
  } = input;

  const timeSinceStatusChange = now - lastStatusChangeAt;

  if (status === 'connected') {
    if (timeSinceStatusChange < 30_000) {
      return 30_000;
    }

    if (lastEventAt) {
      const eventAge = now - lastEventAt;
      if (eventAge < 60_000) {
        return false;
      }
      if (eventAge < 3 * 60_000) {
        return 60_000;
      }
    }

    return timeSinceStatusChange > 5 * 60_000 ? false : 60_000;
  }

  const disconnectedDuration = now - lastStatusChangeAt;
  const hasRecentFailures = Boolean(
    failureInfo &&
      (now - failureInfo.lastFailure) < circuitBreakerResetMs &&
      failureInfo.count >= circuitBreakerThreshold,
  );

  if (hasRecentFailures) {
    return 60_000;
  }

  if (disconnectedDuration < 30_000) {
    return 15_000;
  }

  if (disconnectedDuration < 2 * 60_000) {
    return 30_000;
  }

  if (disconnectedDuration < 5 * 60_000) {
    return 45_000;
  }

  return 60_000;
}
