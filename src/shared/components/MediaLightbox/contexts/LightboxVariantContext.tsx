/**
 * LightboxVariantContext
 *
 * Provides variant-related state to lightbox panel components without prop drilling.
 * Includes pending task count, unviewed variant count, and mark-all-viewed functionality.
 */

import React, { createContext, useContext, RefObject } from 'react';

interface LightboxVariantContextValue {
  /** Number of pending tasks that will create variants */
  pendingTaskCount: number;
  /** Number of unviewed (new) variants */
  unviewedVariantCount: number;
  /** Callback to mark all variants as viewed */
  onMarkAllViewed: () => void;
  /** Ref to the variants section for scroll-to functionality */
  variantsSectionRef: RefObject<HTMLDivElement> | null;
}

const LightboxVariantContext = createContext<LightboxVariantContextValue | null>(null);

export const LightboxVariantProvider: React.FC<{
  children: React.ReactNode;
  value: LightboxVariantContextValue;
}> = ({ children, value }) => {
  return (
    <LightboxVariantContext.Provider value={value}>
      {children}
    </LightboxVariantContext.Provider>
  );
};

export function useLightboxVariantContext(): LightboxVariantContextValue {
  const context = useContext(LightboxVariantContext);
  if (!context) {
    // Return safe defaults when used outside provider (shouldn't happen in practice)
    return {
      pendingTaskCount: 0,
      unviewedVariantCount: 0,
      onMarkAllViewed: () => {},
      variantsSectionRef: null,
    };
  }
  return context;
}

export default LightboxVariantContext;
