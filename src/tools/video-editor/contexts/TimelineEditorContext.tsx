import { createContext, useContext, useMemo } from 'react';
import type {
  TimelineEditorContextValue,
  TimelineEditorDataContextValue,
  TimelineEditorOpsContextValue,
} from '@/tools/video-editor/hooks/useTimelineState.types';

const TimelineEditorDataContext = createContext<TimelineEditorDataContextValue | null>(null);
const TimelineEditorOpsContext = createContext<TimelineEditorOpsContextValue | null>(null);

export function TimelineEditorDataContextProvider({
  value,
  children,
}: {
  value: TimelineEditorDataContextValue;
  children: React.ReactNode;
}) {
  return (
    <TimelineEditorDataContext.Provider value={value}>
      {children}
    </TimelineEditorDataContext.Provider>
  );
}

export function TimelineEditorOpsContextProvider({
  value,
  children,
}: {
  value: TimelineEditorOpsContextValue;
  children: React.ReactNode;
}) {
  return (
    <TimelineEditorOpsContext.Provider value={value}>
      {children}
    </TimelineEditorOpsContext.Provider>
  );
}

export function useTimelineEditorData(): TimelineEditorDataContextValue {
  const context = useContext(TimelineEditorDataContext);
  if (!context) {
    throw new Error('useTimelineEditorData must be used within TimelineEditorDataContextProvider');
  }

  return context;
}

export function useTimelineEditorOps(): TimelineEditorOpsContextValue {
  const context = useContext(TimelineEditorOpsContext);
  if (!context) {
    throw new Error('useTimelineEditorOps must be used within TimelineEditorOpsContextProvider');
  }

  return context;
}

/**
 * @deprecated Prefer `useTimelineEditorData()` and `useTimelineEditorOps()`.
 */
export function useTimelineEditorContext(): TimelineEditorContextValue {
  const data = useTimelineEditorData();
  const ops = useTimelineEditorOps();

  return useMemo(
    () => ({ ...data, ...ops }),
    [data, ops],
  );
}
