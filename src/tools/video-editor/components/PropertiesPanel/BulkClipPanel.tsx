import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  FieldLabel,
  NO_EFFECT,
  TAB_COLUMNS_CLASS,
} from '@/tools/video-editor/components/PropertiesPanel/ClipPanel';
import { continuousEffectTypes, entranceEffectTypes, exitEffectTypes } from '@/tools/video-editor/effects';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources';
import type { ClipTab } from '@/tools/video-editor/hooks/useTimelineData';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types';

const MIXED_SELECT_VALUE = '__mixed__';

type BulkScalarPatch = Partial<Pick<ClipMeta, 'speed' | 'from' | 'to' | 'x' | 'y' | 'width' | 'height' | 'opacity' | 'volume'>>;
type BulkDraftField = 'speed' | 'from' | 'to' | 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'color';
type BulkDrafts = Record<BulkDraftField, string>;

export interface BulkClipPanelProps {
  clips: ResolvedTimelineClip[];
  visibleTabs: ClipTab[];
  compositionWidth: number;
  compositionHeight: number;
  sharedEntrance: ResolvedTimelineClip['entrance'] | null;
  sharedExit: ResolvedTimelineClip['exit'] | null;
  sharedContinuous: ResolvedTimelineClip['continuous'] | null;
  sharedText: ResolvedTimelineClip['text'] | null;
  sharedEntranceType: string | null;
  sharedExitType: string | null;
  sharedContinuousType: string | null;
  sharedSpeed: number | null;
  sharedFrom: number | null;
  sharedTo: number | null;
  sharedX: number | null;
  sharedY: number | null;
  sharedWidth: number | null;
  sharedHeight: number | null;
  sharedOpacity: number | null;
  sharedVolume: number | null;
  sharedFontSize: number | null;
  sharedTextColor: string | null;
  onChange: (patch: BulkScalarPatch) => void;
  onChangeDeep: (patchFn: (existing: ClipMeta) => Partial<ClipMeta>) => void;
  onResetPosition: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  activeTab: ClipTab;
  setActiveTab: (tab: ClipTab) => void;
}

const toDraft = (value: number | string | null): string => (value === null ? '' : String(value));

const buildDrafts = (props: BulkClipPanelProps): BulkDrafts => ({
  speed: toDraft(props.sharedSpeed),
  from: toDraft(props.sharedFrom),
  to: toDraft(props.sharedTo),
  x: toDraft(props.sharedX),
  y: toDraft(props.sharedY),
  width: toDraft(props.sharedWidth),
  height: toDraft(props.sharedHeight),
  fontSize: toDraft(props.sharedFontSize ?? props.sharedText?.fontSize ?? null),
  color: toDraft(props.sharedTextColor ?? props.sharedText?.color ?? null),
});

export function BulkClipPanel(props: BulkClipPanelProps) {
  const {
    clips,
    visibleTabs,
    compositionWidth,
    compositionHeight,
    sharedEntrance,
    sharedExit,
    sharedContinuous,
    sharedText,
    sharedEntranceType,
    sharedExitType,
    sharedContinuousType,
    sharedOpacity,
    sharedVolume,
    onChange,
    onChangeDeep,
    onResetPosition,
    onToggleMute,
    onClose,
    activeTab,
    setActiveTab,
  } = props;
  const { userId } = useVideoEditorRuntime();
  const effectResources = useEffectResources(userId);
  const [drafts, setDrafts] = useState<BulkDrafts>(() => buildDrafts(props));

  useEffect(() => {
    setDrafts(buildDrafts(props));
  }, [
    props.compositionHeight,
    props.compositionWidth,
    props.sharedFrom,
    props.sharedFontSize,
    props.sharedHeight,
    props.sharedSpeed,
    props.sharedText,
    props.sharedTextColor,
    props.sharedTo,
    props.sharedWidth,
    props.sharedX,
    props.sharedY,
  ]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab('effects');
    }
  }, [activeTab, setActiveTab, visibleTabs]);

  const setDraft = (field: BulkDraftField, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
  };

  const commitScalarField = (field: Exclude<BulkDraftField, 'fontSize' | 'color'>, value: string) => {
    if (value.trim() === '') {
      return;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    switch (field) {
      case 'speed':
        onChange({ speed: Math.max(0.05, parsedValue) });
        return;
      case 'from':
        onChange({ from: Math.max(0, parsedValue) });
        return;
      case 'to':
        onChange({ to: Math.max(0, parsedValue) });
        return;
      case 'x':
        onChange({ x: parsedValue });
        return;
      case 'y':
        onChange({ y: parsedValue });
        return;
      case 'width':
        onChange({ width: Math.min(compositionWidth, Math.max(0, parsedValue)) });
        return;
      case 'height':
        onChange({ height: Math.min(compositionHeight, Math.max(0, parsedValue)) });
        return;
      default:
        return;
    }
  };

  const commitTextFontSize = (value: string) => {
    if (value.trim() === '') {
      return;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onChangeDeep((meta) => ({
      text: {
        ...(meta.text ?? sharedText ?? { content: '' }),
        fontSize: Math.max(1, parsedValue),
      },
    }));
  };

  const commitTextColor = (value: string) => {
    const normalized = value.trim();
    if (normalized === '') {
      return;
    }

    onChangeDeep((meta) => ({
      text: {
        ...(meta.text ?? sharedText ?? { content: '' }),
        color: normalized,
      },
    }));
  };

  const renderNumberInput = (
    field: Exclude<BulkDraftField, 'fontSize' | 'color'>,
    label: string,
    options?: { min?: number; max?: number; step?: number },
  ) => (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        min={options?.min}
        max={options?.max}
        step={options?.step}
        value={drafts[field]}
        placeholder="Mixed"
        onChange={(event) => setDraft(field, event.target.value)}
        onBlur={() => commitScalarField(field, drafts[field])}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitScalarField(field, drafts[field]);
          }
        }}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card/70 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {clips.length} clips selected
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Bulk settings
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          ×
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ClipTab)}>
        <TabsList className={cn('grid w-full bg-muted/60', TAB_COLUMNS_CLASS[visibleTabs.length as keyof typeof TAB_COLUMNS_CLASS] ?? 'grid-cols-4')}>
          {visibleTabs.includes('effects') && <TabsTrigger value="effects">Effects</TabsTrigger>}
          {visibleTabs.includes('timing') && <TabsTrigger value="timing">Timing</TabsTrigger>}
          {visibleTabs.includes('position') && <TabsTrigger value="position">Position</TabsTrigger>}
          {visibleTabs.includes('audio') && <TabsTrigger value="audio">Audio</TabsTrigger>}
          {visibleTabs.includes('text') && <TabsTrigger value="text">Text</TabsTrigger>}
        </TabsList>

        {visibleTabs.includes('effects') && (
          <TabsContent value="effects" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Entrance</FieldLabel>
                <Select
                  value={sharedEntranceType ?? MIXED_SELECT_VALUE}
                  onValueChange={(value) => onChangeDeep((meta) => ({
                    entrance: value === NO_EFFECT
                      ? undefined
                      : { type: value, duration: meta.entrance?.duration ?? 0.4 },
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MIXED_SELECT_VALUE} disabled>Mixed</SelectItem>
                    <SelectItem value={NO_EFFECT}>None</SelectItem>
                    {entranceEffectTypes.map((effect) => <SelectItem key={effect} value={effect}>{effect}</SelectItem>)}
                    {effectResources.entrance.length > 0 && (
                      <>
                        <div className="my-1 h-px bg-border" />
                        {effectResources.entrance.map((effect) => (
                          <SelectItem key={`custom:${effect.id}`} value={`custom:${effect.id}`}>
                            {effect.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <FieldLabel>Exit</FieldLabel>
                <Select
                  value={sharedExitType ?? MIXED_SELECT_VALUE}
                  onValueChange={(value) => onChangeDeep((meta) => ({
                    exit: value === NO_EFFECT
                      ? undefined
                      : { type: value, duration: meta.exit?.duration ?? 0.4 },
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MIXED_SELECT_VALUE} disabled>Mixed</SelectItem>
                    <SelectItem value={NO_EFFECT}>None</SelectItem>
                    {exitEffectTypes.map((effect) => <SelectItem key={effect} value={effect}>{effect}</SelectItem>)}
                    {effectResources.exit.length > 0 && (
                      <>
                        <div className="my-1 h-px bg-border" />
                        {effectResources.exit.map((effect) => (
                          <SelectItem key={`custom:${effect.id}`} value={`custom:${effect.id}`}>
                            {effect.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Continuous</FieldLabel>
                <Select
                  value={sharedContinuousType ?? MIXED_SELECT_VALUE}
                  onValueChange={(value) => onChangeDeep((meta) => ({
                    continuous: value === NO_EFFECT
                      ? undefined
                      : { type: value, intensity: meta.continuous?.intensity ?? 0.5 },
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MIXED_SELECT_VALUE} disabled>Mixed</SelectItem>
                    <SelectItem value={NO_EFFECT}>None</SelectItem>
                    {continuousEffectTypes.map((effect) => <SelectItem key={effect} value={effect}>{effect}</SelectItem>)}
                    {effectResources.continuous.length > 0 && (
                      <>
                        <div className="my-1 h-px bg-border" />
                        {effectResources.continuous.map((effect) => (
                          <SelectItem key={`custom:${effect.id}`} value={`custom:${effect.id}`}>
                            {effect.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        )}

        {visibleTabs.includes('timing') && (
          <TabsContent value="timing" className="space-y-3">
            <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              Source In and Source Out apply the same trim to all selected clips.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {renderNumberInput('speed', 'Speed', { min: 0.05, step: 0.1 })}
              {renderNumberInput('from', 'Source In', { min: 0, step: 0.1 })}
              {renderNumberInput('to', 'Source Out', { min: 0, step: 0.1 })}
            </div>
          </TabsContent>
        )}

        {visibleTabs.includes('position') && (
          <TabsContent value="position" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {renderNumberInput('x', 'X')}
              {renderNumberInput('y', 'Y')}
              {renderNumberInput('width', 'Width', { min: 0, max: compositionWidth })}
              {renderNumberInput('height', 'Height', { min: 0, max: compositionHeight })}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel>Opacity</FieldLabel>
                <span className="text-xs text-muted-foreground">
                  {sharedOpacity === null ? 'Mixed' : sharedOpacity.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[sharedOpacity ?? 1]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(value) => onChange({ opacity: value[0] })}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onResetPosition}>
              Reset position
            </Button>
          </TabsContent>
        )}

        {visibleTabs.includes('audio') && (
          <TabsContent value="audio" className="space-y-3">
            <div className="rounded-lg border border-border bg-card/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm text-foreground">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Volume
                </div>
                <span className="text-xs text-muted-foreground">
                  {sharedVolume === null ? 'Mixed' : sharedVolume.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[sharedVolume ?? 1]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(value) => onChange({ volume: value[0] })}
              />
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onToggleMute}>
                Toggle mute
              </Button>
            </div>
          </TabsContent>
        )}

        {visibleTabs.includes('text') && (
          <TabsContent value="text" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Font size</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={drafts.fontSize}
                  placeholder="Mixed"
                  onChange={(event) => setDraft('fontSize', event.target.value)}
                  onBlur={() => commitTextFontSize(drafts.fontSize)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitTextFontSize(drafts.fontSize);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Color</FieldLabel>
                <Input
                  type="text"
                  value={drafts.color}
                  placeholder="Mixed"
                  onChange={(event) => setDraft('color', event.target.value)}
                  onBlur={() => commitTextColor(drafts.color)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitTextColor(drafts.color);
                    }
                  }}
                />
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
