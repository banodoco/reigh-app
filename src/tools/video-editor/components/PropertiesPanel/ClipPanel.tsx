import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Volume2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { continuousEffectTypes, entranceEffectTypes, exitEffectTypes } from '@/tools/video-editor/effects';
import { EffectCreatorPanel } from '@/tools/video-editor/components/EffectCreatorPanel';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import { useEffectResources, type EffectCategory, type EffectResource } from '@/tools/video-editor/hooks/useEffectResources';
import type { ClipTab } from '@/tools/video-editor/hooks/useTimelineData';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types';

interface ClipPanelProps {
  clip: ResolvedTimelineClip | null;
  track: TrackDefinition | null;
  hasPredecessor: boolean;
  onChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  onResetPosition: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onToggleMute: () => void;
  compositionWidth: number;
  compositionHeight: number;
  activeTab: ClipTab;
  setActiveTab: (tab: ClipTab) => void;
}

export const NO_EFFECT = '__none__';
export const TAB_COLUMNS_CLASS = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
} as const;

export function getVisibleClipTabs(
  clip: ResolvedTimelineClip | null,
  track: TrackDefinition | null,
): ClipTab[] {
  if (clip?.clipType === 'text') {
    return ['effects', 'timing', 'position', 'text'];
  }

  if (track?.kind === 'audio') {
    return ['effects', 'timing', 'audio'];
  }

  return ['effects', 'timing', 'position', 'audio'];
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}

/** Find a resource-based effect by its `custom:{id}` type string */
function findEffectResourceByType(
  type: string | undefined,
  effects: EffectResource[],
): EffectResource | undefined {
  if (!type?.startsWith('custom:')) return undefined;
  const id = type.slice(7);
  return effects.find((e) => e.id === id);
}

export function ClipPanel({
  clip,
  track,
  hasPredecessor,
  onChange,
  onResetPosition,
  onClose,
  onDelete,
  onToggleMute,
  compositionWidth,
  compositionHeight,
  activeTab,
  setActiveTab,
}: ClipPanelProps) {
  const { userId } = useVideoEditorRuntime();
  const effectResources = useEffectResources(userId);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editingEffect, setEditingEffect] = useState<EffectResource | null>(null);
  const visibleTabs = useMemo(() => getVisibleClipTabs(clip, track), [clip, track]);

  if (!clip) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Select a clip to edit timing, position, audio, text, or effects.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card/70 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {clip.text?.content || clip.asset || clip.id}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {clip.clipType ?? 'media'} · {track?.label ?? clip.track}
          </div>
        </div>
        <div className="flex gap-2">
          {onDelete && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            ×
          </Button>
        </div>
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
                  value={clip.entrance?.type ?? NO_EFFECT}
                  onValueChange={(value) => onChange({ entrance: value === NO_EFFECT ? undefined : { type: value, duration: clip.entrance?.duration ?? 0.4 } })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
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
                {findEffectResourceByType(clip.entrance?.type, effectResources.effects) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => {
                      setEditingEffect(findEffectResourceByType(clip.entrance?.type, effectResources.effects) ?? null);
                      setCreatorOpen(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <FieldLabel>Exit</FieldLabel>
                <Select
                  value={clip.exit?.type ?? NO_EFFECT}
                  onValueChange={(value) => onChange({ exit: value === NO_EFFECT ? undefined : { type: value, duration: clip.exit?.duration ?? 0.4 } })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
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
                {findEffectResourceByType(clip.exit?.type, effectResources.effects) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => {
                      setEditingEffect(findEffectResourceByType(clip.exit?.type, effectResources.effects) ?? null);
                      setCreatorOpen(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Continuous</FieldLabel>
                <Select
                  value={clip.continuous?.type ?? NO_EFFECT}
                  onValueChange={(value) => onChange({ continuous: value === NO_EFFECT ? undefined : { type: value, intensity: clip.continuous?.intensity ?? 0.5 } })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
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
                {findEffectResourceByType(clip.continuous?.type, effectResources.effects) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => {
                      setEditingEffect(findEffectResourceByType(clip.continuous?.type, effectResources.effects) ?? null);
                      setCreatorOpen(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={() => {
                setEditingEffect(null);
                setCreatorOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Effect
            </Button>
            <EffectCreatorPanel
              open={creatorOpen}
              onOpenChange={setCreatorOpen}
              editingEffect={editingEffect}
              onSaved={(resourceId, savedCategory) => {
                const effectType = `custom:${resourceId}`;
                if (savedCategory === 'entrance') {
                  onChange({ entrance: { type: effectType, duration: clip.entrance?.duration ?? 0.4 } });
                } else if (savedCategory === 'exit') {
                  onChange({ exit: { type: effectType, duration: clip.exit?.duration ?? 0.4 } });
                } else {
                  onChange({ continuous: { type: effectType, intensity: clip.continuous?.intensity ?? 0.5 } });
                }
              }}
            />
          </TabsContent>
        )}

        {visibleTabs.includes('timing') && (
          <TabsContent value="timing" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Start (seconds)</FieldLabel>
                <Input type="number" value={clip.at} onChange={(event) => onChange({ at: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Speed</FieldLabel>
                <Input type="number" value={clip.speed ?? 1} step="0.1" onChange={(event) => onChange({ speed: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Source In</FieldLabel>
                <Input type="number" value={clip.from ?? 0} step="0.1" onChange={(event) => onChange({ from: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Source Out</FieldLabel>
                <Input type="number" value={clip.to ?? clip.assetEntry?.duration ?? 5} step="0.1" onChange={(event) => onChange({ to: Number(event.target.value) })} />
              </div>
            </div>
          </TabsContent>
        )}

        {visibleTabs.includes('position') && (
          <TabsContent value="position" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>X</FieldLabel>
                <Input type="number" value={clip.x ?? 0} onChange={(event) => onChange({ x: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Y</FieldLabel>
                <Input type="number" value={clip.y ?? 0} onChange={(event) => onChange({ y: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Width</FieldLabel>
                <Input type="number" max={compositionWidth} value={clip.width ?? compositionWidth} onChange={(event) => onChange({ width: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Height</FieldLabel>
                <Input type="number" max={compositionHeight} value={clip.height ?? compositionHeight} onChange={(event) => onChange({ height: Number(event.target.value) })} />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel>Opacity</FieldLabel>
              <Slider
                value={[clip.opacity ?? 1]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(value) => onChange({ opacity: value })}
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
              <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
                <Volume2 className="h-4 w-4" />
                Volume
              </div>
              <Slider
                value={[clip.volume ?? 1]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(value) => onChange({ volume: value })}
              />
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onToggleMute}>
                Toggle mute
              </Button>
            </div>
          </TabsContent>
        )}

        {visibleTabs.includes('text') && (
          <TabsContent value="text" className="space-y-3">
            {clip.clipType === 'text' ? (
              <>
                <Textarea
                  value={clip.text?.content ?? ''}
                  onChange={(event) => onChange({ text: { ...(clip.text ?? { content: '' }), content: event.target.value } })}
                  rows={5}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel>Font size</FieldLabel>
                    <Input
                      type="number"
                      value={clip.text?.fontSize ?? 64}
                      onChange={(event) => onChange({ text: { ...(clip.text ?? { content: '' }), fontSize: Number(event.target.value) } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Color</FieldLabel>
                    <Input
                      type="color"
                      value={clip.text?.color ?? '#ffffff'}
                      onChange={(event) => onChange({ text: { ...(clip.text ?? { content: '' }), color: event.target.value } })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                The selected clip is not a text clip.
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
