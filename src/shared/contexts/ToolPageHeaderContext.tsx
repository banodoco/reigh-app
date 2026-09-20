import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

interface ToolPageHeaderContextType {
  header: ReactNode;
  setHeader: (header: ReactNode) => void;
  clearHeader: () => void;
  globalHeaderContent: ReactNode;
  setGlobalHeaderContent: (content: ReactNode) => void;
  clearGlobalHeaderContent: () => void;
}

const ToolPageHeaderContext = createContext<ToolPageHeaderContextType | undefined>(undefined);

interface ToolPageHeaderProviderProps {
  children: ReactNode;
}

export const ToolPageHeaderProvider: React.FC<ToolPageHeaderProviderProps> = ({ children }) => {
  const [header, setHeader] = useState<ReactNode>(null);
  const [globalHeaderContent, setGlobalHeaderContent] = useState<ReactNode>(null);

  const handleSetHeader = useCallback((newHeader: ReactNode) => setHeader(newHeader), []);
  const handleClearHeader = useCallback(() => setHeader(null), []);
  const handleSetGlobalHeaderContent = useCallback(
    (content: ReactNode) => setGlobalHeaderContent(content),
    [],
  );
  const handleClearGlobalHeaderContent = useCallback(() => setGlobalHeaderContent(null), []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    header,
    setHeader: handleSetHeader,
    clearHeader: handleClearHeader,
    globalHeaderContent,
    setGlobalHeaderContent: handleSetGlobalHeaderContent,
    clearGlobalHeaderContent: handleClearGlobalHeaderContent,
  }), [
    header,
    handleSetHeader,
    handleClearHeader,
    globalHeaderContent,
    handleSetGlobalHeaderContent,
    handleClearGlobalHeaderContent,
  ]);

  return (
    <ToolPageHeaderContext.Provider value={value}>
      {children}
    </ToolPageHeaderContext.Provider>
  );
};

export const useHeaderState = () => {
    const context = useContext(ToolPageHeaderContext);
    if (!context) {
      throw new Error('useHeaderState must be used within a ToolPageHeaderProvider');
    }
    return { header: context.header, globalHeaderContent: context.globalHeaderContent };
};

/**
 * Lets route-level tools add controls to the canonical app header without
 * mounting a second, tool-specific header. It is optional so isolated page
 * tests and embedders can continue to render the page on its own.
 */
export const useOptionalGlobalHeaderSlot = () => {
  const context = useContext(ToolPageHeaderContext);
  if (!context) {
    return {
      hasProvider: false,
      setGlobalHeaderContent: (_content: ReactNode) => undefined,
      clearGlobalHeaderContent: () => undefined,
    };
  }

  return {
    hasProvider: true,
    setGlobalHeaderContent: context.setGlobalHeaderContent,
    clearGlobalHeaderContent: context.clearGlobalHeaderContent,
  };
};
