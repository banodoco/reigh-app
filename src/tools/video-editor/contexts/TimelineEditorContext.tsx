import { createContext, useContext } from 'react';
import type { TimelineEditorContextValue } from '@/tools/video-editor/hooks/useTimelineState.types';

const TimelineEditorContext = createContext<TimelineEditorContextValue | null>(null);

export function TimelineEditorContextProvider({
  value,
  children,
}: {
  value: TimelineEditorContextValue;
  children: React.ReactNode;
}) {
  return (
    <TimelineEditorContext.Provider value={value}>
      {children}
    </TimelineEditorContext.Provider>
  );
}

export function useTimelineEditorContext(): TimelineEditorContextValue {
  const context = useContext(TimelineEditorContext);
  if (!context) {
    throw new Error('useTimelineEditorContext must be used within TimelineEditorContextProvider');
  }

  return context;
}
