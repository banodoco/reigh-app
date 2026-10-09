import type { ReactNode } from 'react';
import { ASTRID_TOOL_CATALOG, resolveToolLaunch } from '@/shared/lib/tooling/toolCatalog';

/** Bind the host route to its admitted pack entry before mounting the existing Tool page. */
export function ToolLaunchBoundary({ toolId, children }: { toolId: string; children: ReactNode }) {
  const resolution = resolveToolLaunch(ASTRID_TOOL_CATALOG, toolId);
  if (!resolution.available) {
    return (
      <main role="alert" data-testid="tool-unavailable" data-reason={resolution.reason}>
        <h1>Video Editor unavailable</h1>
        <p>This build does not contain a current, compatible Video Editor entry.</p>
      </main>
    );
  }
  return <>{children}</>;
}
