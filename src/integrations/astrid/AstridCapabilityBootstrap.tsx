import { useEffect, type ReactNode } from 'react';
import { isRuntimeDocumentMode } from '@/app/runtime/runtimeDocument';
import {
  refreshAstridCapabilityCensus,
  useAstridCapabilityCensus,
} from './capabilityCensus.ts';

/** Starts the single shared capability census before feature pollers opt in. */
export function AstridCapabilityBootstrap({ children }: { children: ReactNode }) {
  const runtimeDocumentMode = isRuntimeDocumentMode();
  const capabilityCensus = useAstridCapabilityCensus();
  useEffect(() => {
    if (runtimeDocumentMode) return;
    void refreshAstridCapabilityCensus();
  }, [runtimeDocumentMode]);

  if (runtimeDocumentMode) return <>{children}</>;

  // Do not mount any task/gallery/media consumer until the one boot census
  // resolves. This prevents a thundering herd of feature probes from racing
  // the authoritative census on an older bridge.
  if (capabilityCensus.readiness === 'checking') {
    return (
      <div role="status" className="min-h-screen grid place-items-center text-muted-foreground">
        Checking Astrid capabilities…
      </div>
    );
  }
  return children;
}
