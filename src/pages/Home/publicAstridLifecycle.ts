import { useEffect, useState } from 'react';

/** Retention preserves React/editor state; disposal is the owning component's unmount. */
export type PublicAstridLifecycle = 'active' | 'retained';

export interface PublicAstridEnvironment {
  visible: boolean;
  reducedMotion: boolean;
  phone: boolean;
}

function readEnvironment(): PublicAstridEnvironment {
  return {
    visible: !document.hidden,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    phone: window.matchMedia('(max-width: 640px)').matches,
  };
}

/** Site subscribes once. Standalone public adapters subscribe only without supplied inputs. */
export function usePublicAstridEnvironment(supplied?: PublicAstridEnvironment) {
  const [local, setLocal] = useState(readEnvironment);
  const standalone = supplied === undefined;
  useEffect(() => {
    if (!standalone) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const phone = window.matchMedia('(max-width: 640px)');
    const update = () => setLocal(readEnvironment());
    const queries = [motion, phone];
    for (const query of queries) {
      if (query.addEventListener) query.addEventListener('change', update);
      else query.addListener?.(update);
    }
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pageshow', update);
    update();
    return () => {
      for (const query of queries) {
        if (query.removeEventListener) query.removeEventListener('change', update);
        else query.removeListener?.(update);
      }
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pageshow', update);
    };
  }, [standalone]);
  return supplied ?? local;
}
