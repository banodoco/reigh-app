import { useLayoutEffect, useState } from 'react';
import type { PublicAstridEnvironment } from './publicAstridLifecycle';
import { createPublicAstridSkySession, type PublicAstridSkySession } from './publicAstridSkySession';

/** Creates the owner for standalone Home/Vision renders; Site passes its one owner to both pages. */
export function usePublicAstridSkySession(
  supplied: PublicAstridSkySession | undefined,
  environment: PublicAstridEnvironment,
): PublicAstridSkySession {
  const [owned] = useState(() => supplied ?? createPublicAstridSkySession({ environment }));
  const session = supplied ?? owned;
  useLayoutEffect(() => {
    session.setEnvironment(environment);
  }, [environment, session]);
  useLayoutEffect(() => {
    if (supplied) return undefined;
    session.mount();
    return () => session.destroy();
  }, [session, supplied]);
  return session;
}
