import { createContext, useContext } from 'react';
import type { TimelinePlaybackContextValue } from '@/tools/video-editor/hooks/useTimelineState.types';

const TimelinePlaybackContext = createContext<TimelinePlaybackContextValue | null>(null);

export function TimelinePlaybackContextProvider({
  value,
  children,
}: {
  value: TimelinePlaybackContextValue;
  children: React.ReactNode;
}) {
  return (
    <TimelinePlaybackContext.Provider value={value}>
      {children}
    </TimelinePlaybackContext.Provider>
  );
}

export function useTimelinePlaybackContext(): TimelinePlaybackContextValue {
  const context = useContext(TimelinePlaybackContext);
  if (!context) {
    throw new Error('useTimelinePlaybackContext must be used within TimelinePlaybackContextProvider');
  }

  return context;
}
