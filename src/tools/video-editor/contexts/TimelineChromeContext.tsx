import { createContext, useContext } from 'react';
import type { TimelineChromeContextValue } from '@/tools/video-editor/hooks/useTimelineState.types';

const TimelineChromeContext = createContext<TimelineChromeContextValue | null>(null);

export function TimelineChromeContextProvider({
  value,
  children,
}: {
  value: TimelineChromeContextValue;
  children: React.ReactNode;
}) {
  return (
    <TimelineChromeContext.Provider value={value}>
      {children}
    </TimelineChromeContext.Provider>
  );
}

export function useTimelineChromeContext(): TimelineChromeContextValue {
  const context = useContext(TimelineChromeContext);
  if (!context) {
    throw new Error('useTimelineChromeContext must be used within TimelineChromeContextProvider');
  }

  return context;
}
