import { useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { useAgentChatBridge } from '@/shared/contexts/AgentChatContext.tsx';
import { timelineQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import { useTimelineEditorData } from '@/tools/video-editor/hooks/timelineStore.ts';
import type { ReighElementCatalogEntry } from '@/tools/video-editor/runtime/element-contract.ts';

type ElementFilter = 'all' | 'effect' | 'animation' | 'transition';

function publicationLabel(element: ReighElementCatalogEntry): string {
  return element.publication === 'draft' ? 'Draft / Preview only' : element.publication;
}

export function ElementsLibraryPanel({
  open,
  onOpenChange,
  onOpenCreationPrompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCreationPrompt: () => void;
}) {
  const { editorContext } = useAgentChatBridge();
  const { selectedClipIds } = useTimelineEditorData();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ElementFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedIds = useMemo(() => [...selectedClipIds], [selectedClipIds]);

  const filteredElements = useMemo(() => {
    const elements = editorContext?.elementContext?.catalog ?? [];
    const normalized = query.trim().toLowerCase();
    return elements.filter((element) => (
      (filter === 'all' || element.kind === filter)
      && (!normalized || `${element.id} ${element.label} ${element.description ?? ''}`.toLowerCase().includes(normalized))
    ));
  }, [editorContext?.elementContext?.catalog, filter, query]);

  const applyElement = async (element: ReighElementCatalogEntry) => {
    const adapter = editorContext?.elementOperationAdapter;
    const project = editorContext?.projectSlug;
    const timeline = editorContext?.timelineId;
    const expectedVersion = editorContext?.timelineSummary?.configVersion;
    if (!adapter || !project || !timeline || !expectedVersion) {
      setMessage('Elements are unavailable until the current timeline is loaded.');
      return;
    }
    if (element.publication !== 'published') {
      setMessage(`${element.label} is still a draft. Validate it before applying it to the timeline.`);
      return;
    }
    if (element.kind === 'transition' && selectedIds.length < 2) {
      setMessage('Select two adjacent clips to apply a transition.');
      return;
    }
    if (element.kind !== 'transition' && selectedIds.length < 1) {
      setMessage('Select a clip to apply this element.');
      return;
    }
    setBusyId(element.id);
    setMessage(null);
    try {
      const result = element.kind === 'transition'
        ? await adapter.execute({
            name: 'timeline.apply_transition',
            project,
            timeline,
            expected_version: expectedVersion,
            from_clip: selectedIds[0],
            to_clip: selectedIds[1],
            transition: { id: element.id, kind: element.kind, revision: element.revision },
          })
        : await adapter.execute({
            name: 'timeline.apply_element',
            project,
            timeline,
            expected_version: expectedVersion,
            clip_id: selectedIds[0],
            placement: element.kind === 'animation' ? 'clip' : 'overlay',
            element: { id: element.id, kind: element.kind, revision: element.revision },
          });
      await queryClient.invalidateQueries({ queryKey: timelineQueryKey(timeline) });
      setMessage(`${element.label} applied${result.config_version ? ` · timeline v${result.config_version}` : ''}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Elements</DialogTitle>
          <DialogDescription>
            One library for effects, animations, and transitions. Ask Astrid to create a new element when you need something new.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search elements" className="pl-8" />
            </div>
            <div className="flex shrink-0 gap-1" role="tablist" aria-label="Element type">
              {(['all', 'effect', 'animation', 'transition'] as const).map((value) => (
                <Button key={value} type="button" size="sm" variant={filter === value ? 'secondary' : 'ghost'} onClick={() => setFilter(value)}>
                  {value === 'all' ? 'All' : `${value[0].toUpperCase()}${value.slice(1)}s`}
                </Button>
              ))}
            </div>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {filteredElements.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No registered elements are available in this editor session.
              </div>
            ) : filteredElements.map((element) => (
              <div key={`${element.kind}:${element.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{element.label}</span>
                    <Badge variant="outline" className="text-[10px]">{element.kind}</Badge>
                    <Badge variant={element.publication === 'published' ? 'secondary' : 'outline'} className="text-[10px]">{publicationLabel(element)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{element.description ?? element.id}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{element.id} · {element.revision}</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={busyId !== null || element.publication !== 'published'} onClick={() => void applyElement(element)}>
                  {busyId === element.id ? 'Applying…' : 'Apply'}
                </Button>
              </div>
            ))}
          </div>
          {message && <div role="status" className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">{message}</div>}
          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" variant="secondary" onClick={() => { onOpenChange(false); onOpenCreationPrompt(); }}>
              Ask Astrid to create an element
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
