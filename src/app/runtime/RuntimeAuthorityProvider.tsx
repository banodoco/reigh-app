import type { ReactNode } from 'react';
import { RuntimeAuthorityContext, type RuntimeAuthority } from './runtimeAuthority';

export function RuntimeAuthorityProvider({
  value,
  children,
}: {
  value: RuntimeAuthority;
  children: ReactNode;
}) {
  return (
    <RuntimeAuthorityContext.Provider value={value}>
      {children}
    </RuntimeAuthorityContext.Provider>
  );
}
