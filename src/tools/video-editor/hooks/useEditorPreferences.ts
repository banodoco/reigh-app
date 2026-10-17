import { useCallback } from 'react';
import { useEditorSettings } from '@/tools/video-editor/settings/useEditorSettings.ts';

export type ClipTab = 'effects' | 'timing' | 'position' | 'audio' | 'text';
export type RightPanelLayoutSlot = 'compact' | 'dock';

export interface EditorPreferences {
  scaleWidth: number;
  activeClipTab: ClipTab;
  /** The selected host panel; null closes its surface without discarding its state. */
  selectedRightPanelId: string | null;
  /** Remember the selected extension independently of Inspector and Closed. */
  lastExtensionPanelId?: string | null;
  rightPanelTab?: 'inspector' | 'extensions';
  /** Legacy per-panel placement values; host:properties is the shared mode. */
  rightPanelLayoutSlotsByPanelId: Record<string, RightPanelLayoutSlot>;
  /** Data-kind lanes are optional and start hidden. */
  showDataLanes: boolean;
  /** Per-kind overrides; missing kinds follow the shared data-lane default. */
  showDataLanesByKind?: Record<string, boolean>;
  /** Read only when migrating older saved preferences. */
  showTranscriptLane?: boolean;
  assetPanel: {
    showAll: boolean;
    showHidden: boolean;
    hidden: string[];
  };
}

export const defaultPreferences: EditorPreferences = {
  scaleWidth: 160,
  activeClipTab: 'effects',
  selectedRightPanelId: 'host:properties',
  rightPanelLayoutSlotsByPanelId: {},
  showDataLanes: false,
  showDataLanesByKind: {},
  showTranscriptLane: true,
  lastExtensionPanelId: null,
  rightPanelTab: 'inspector',
  assetPanel: {
    showAll: false,
    showHidden: false,
    hidden: [],
  },
};

function normalizePreferences(value: EditorPreferences): EditorPreferences {
  // Older per-timeline records predate the panel fields. Fill only missing
  // fields so a saved user selection (including null/closed) survives reload.
  return {
    ...defaultPreferences,
    ...value,
    selectedRightPanelId: value.selectedRightPanelId === undefined
      ? defaultPreferences.selectedRightPanelId
      : value.selectedRightPanelId,
    rightPanelLayoutSlotsByPanelId: {
      ...defaultPreferences.rightPanelLayoutSlotsByPanelId,
      ...(value.rightPanelLayoutSlotsByPanelId ?? {}),
    },
    lastExtensionPanelId: value.lastExtensionPanelId ?? (value.selectedRightPanelId && value.selectedRightPanelId !== 'host:properties' ? value.selectedRightPanelId : null),
    rightPanelTab: value.rightPanelTab ?? (value.selectedRightPanelId && value.selectedRightPanelId !== 'host:properties' ? 'extensions' : 'inspector'),
    showDataLanes: value.showDataLanes ?? defaultPreferences.showDataLanes,
    showDataLanesByKind: {
      ...(value.showTranscriptLane !== undefined ? { 'astrid.transcript': value.showTranscriptLane } : {}),
      ...(value.showDataLanesByKind ?? {}),
    },
    // Retained as a read compatibility field for older consumers during migration.
    showTranscriptLane: value.showTranscriptLane ?? true,
    assetPanel: {
      ...defaultPreferences.assetPanel,
      ...value.assetPanel,
      hidden: [...(value.assetPanel?.hidden ?? defaultPreferences.assetPanel.hidden)],
    },
  };
}

export function useEditorPreferences(timelineId: string) {
  const [preferences, setPreferences] = useEditorSettings<EditorPreferences>(
    `video-editor:preferences:${timelineId}`,
    defaultPreferences,
  );

  const normalizedPreferences = normalizePreferences(preferences);

  const scale = 5;
  const scaleWidth = normalizedPreferences.scaleWidth;

  const setScaleWidth = useCallback((updater: number | ((value: number) => number)) => {
    setPreferences((current) => ({
      ...normalizePreferences(current),
      scaleWidth: typeof updater === 'function' ? (updater as (value: number) => number)(current.scaleWidth) : updater,
    }));
  }, [setPreferences]);

  const setActiveClipTab = useCallback((tab: ClipTab) => {
    setPreferences((current) => ({
      ...normalizePreferences(current),
      activeClipTab: tab,
    }));
  }, [setPreferences]);

  const setAssetPanelState = useCallback((patch: Partial<EditorPreferences['assetPanel']>) => {
    setPreferences((current) => ({
      ...normalizePreferences(current),
      assetPanel: {
        ...normalizePreferences(current).assetPanel,
        ...patch,
      },
    }));
  }, [setPreferences]);

  const setSelectedRightPanelId = useCallback((selectedRightPanelId: string | null) => {
    setPreferences((current) => {
      const normalized = normalizePreferences(current);
      return { ...normalized, selectedRightPanelId,
        ...(selectedRightPanelId ? { rightPanelTab: selectedRightPanelId === 'host:properties' ? 'inspector' as const : 'extensions' as const } : {}),
        ...(selectedRightPanelId && selectedRightPanelId !== 'host:properties' ? { lastExtensionPanelId: selectedRightPanelId } : {}),
      };
    });
  }, [setPreferences]);

  const setRightPanelLayoutSlot = useCallback((panelId: string, slot: RightPanelLayoutSlot) => {
    setPreferences((current) => {
      const normalized = normalizePreferences(current);
      return {
        ...normalized,
        rightPanelLayoutSlotsByPanelId: {
          ...normalized.rightPanelLayoutSlotsByPanelId,
          [panelId]: slot,
        },
      };
    });
  }, [setPreferences]);

  const setShowDataLanes = useCallback((showDataLanes: boolean) => {
    setPreferences((current) => ({ ...normalizePreferences(current), showDataLanes }));
  }, [setPreferences]);

  const setShowTranscriptLane = useCallback((showTranscriptLane: boolean) => {
    setPreferences((current) => ({ ...normalizePreferences(current), showTranscriptLane,
      showDataLanesByKind: { ...normalizePreferences(current).showDataLanesByKind, 'astrid.transcript': showTranscriptLane } }));
  }, [setPreferences]);

  const setDataKindLaneVisible = useCallback((kindId: string, visible: boolean) => {
    setPreferences((current) => ({ ...normalizePreferences(current),
      showDataLanesByKind: { ...normalizePreferences(current).showDataLanesByKind, [kindId]: visible } }));
  }, [setPreferences]);

  return {
    setShowTranscriptLane,
    preferences: normalizedPreferences,
    scaleWidth,
    scale,
    setScaleWidth,
    setActiveClipTab,
    setAssetPanelState,
    setSelectedRightPanelId,
    setRightPanelLayoutSlot,
    setShowDataLanes,
    setDataKindLaneVisible,
  };
}
