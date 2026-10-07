import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type PreviewMediaFailure = Readonly<{
  clipId: string;
  source: string;
  posterUrl: string | null;
  identity: string;
}>;

export type PreviewMediaFailurePolicy = Readonly<{
  enabled: boolean;
  failure: PreviewMediaFailure | null;
  retryPending: boolean;
  retryTokenFor: (clipId: string, source: string) => number;
  reportFailure: (failure: Omit<PreviewMediaFailure, 'identity'>, attemptToken: number) => void;
  retry: () => void;
  markFrameReady: (clipId: string, source: string, attemptToken: number) => void;
  markRetryFailed: (clipId: string, source: string, attemptToken: number) => void;
  syncActiveClips: (activeClipIds: readonly string[]) => void;
}>;

const PreviewMediaFailureContext = createContext<PreviewMediaFailurePolicy | null>(null);

export function PreviewMediaFailurePolicyProvider({
  children,
  policy,
}: {
  children: ReactNode;
  policy: PreviewMediaFailurePolicy | null;
}) {
  return <PreviewMediaFailureContext.Provider value={policy}>{children}</PreviewMediaFailureContext.Provider>;
}

export function previewMediaFailureIdentity(clipId: string, source: string): string {
  return `${clipId}\u0000${source}`;
}

export function PublicPreviewMediaFailureProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [failure, setFailure] = useState<PreviewMediaFailure | null>(null);
  const [retryState, setRetryState] = useState<{identity: string; token: number; pending: boolean}>({
    identity: '', token: 0, pending: false,
  });
  const retryStateRef = useRef(retryState);
  retryStateRef.current = retryState;
  const failureRef = useRef(failure);
  failureRef.current = failure;

  const reportFailure = useCallback((input: Omit<PreviewMediaFailure, 'identity'>, attemptToken: number) => {
    if (!enabled) return;
    const identity = previewMediaFailureIdentity(input.clipId, input.source);
    const currentRetry = retryStateRef.current;
    if (currentRetry.identity === identity && attemptToken < currentRetry.token) return;
    setFailure((current) => current?.identity === identity
      ? current
      : {...input, identity});
    setRetryState((current) => {
      if (current.identity === identity && attemptToken < current.token) return current;
      // Remotion may report the original decode failure after the user starts
      // retrying because its media callback is updated through a mutable ref.
      // Keep the explicit attempt pending until a real frame arrives or the
      // bounded retry window expires.
      if (current.identity === identity && current.pending && attemptToken === current.token) return current;
      return {identity, token: current.identity === identity ? current.token : attemptToken, pending: false};
    });
  }, [enabled]);

  const retry = useCallback(() => {
    const currentFailure = failure;
    if (!enabled || !currentFailure || retryState.pending) return;
    setRetryState((current) => ({
      identity: currentFailure.identity,
      token: current.identity === currentFailure.identity ? current.token + 1 : 1,
      pending: true,
    }));
  }, [enabled, failure, retryState.pending]);

  const markFrameReady = useCallback((clipId: string, source: string, attemptToken: number) => {
    const identity = previewMediaFailureIdentity(clipId, source);
    const currentRetry = retryStateRef.current;
    if (attemptToken === 0 || currentRetry.identity !== identity || currentRetry.token !== attemptToken
      || failureRef.current?.identity !== identity) return;
    setFailure((active) => active?.identity === identity ? null : active);
    setRetryState((current) => current.identity === identity && current.token === attemptToken && current.pending
      ? {...current, pending: false}
      : current);
  }, []);

  const markRetryFailed = useCallback((clipId: string, source: string, attemptToken: number) => {
    const identity = previewMediaFailureIdentity(clipId, source);
    setRetryState((current) => current.identity === identity && current.token === attemptToken && current.pending
      ? {...current, pending: false}
      : current);
  }, []);

  const syncActiveClips = useCallback((activeClipIds: readonly string[]) => {
    const active = new Set(activeClipIds);
    setFailure((current) => current && !active.has(current.clipId) ? null : current);
    setRetryState((current) => current.pending && !active.has(current.identity.split('\u0000')[0])
      ? {...current, pending: false}
      : current);
  }, []);

  const retryTokenFor = useCallback((clipId: string, source: string) => {
    const identity = previewMediaFailureIdentity(clipId, source);
    return retryState.identity === identity ? retryState.token : 0;
  }, [retryState.identity, retryState.token]);

  const value = useMemo<PreviewMediaFailurePolicy>(() => ({
    enabled,
    failure,
    retryPending: retryState.pending && retryState.identity === failure?.identity,
    retryTokenFor,
    reportFailure,
    retry,
    markFrameReady,
    markRetryFailed,
    syncActiveClips,
  }), [enabled, failure, markFrameReady, markRetryFailed, reportFailure, retry, retryState.identity, retryState.pending, retryTokenFor, syncActiveClips]);

  return <PreviewMediaFailurePolicyProvider policy={value}>{children}</PreviewMediaFailurePolicyProvider>;
}

export function useOptionalPreviewMediaFailure(): PreviewMediaFailurePolicy | null {
  return useContext(PreviewMediaFailureContext);
}
