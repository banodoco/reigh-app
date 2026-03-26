import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { Loader2, Play, Save, Sparkles, Pencil, Globe, Lock } from 'lucide-react';
import { Player } from '@remotion/player';
import { AbsoluteFill } from 'remotion';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { toast } from '@/shared/components/ui/toast';
import { invokeSupabaseEdgeFunction } from '@/integrations/supabase/functions/invokeSupabaseEdgeFunction';
import { tryCompileEffectAsync, type CompileResult } from '@/tools/video-editor/effects/compileEffect';
import type { EffectComponentProps } from '@/tools/video-editor/effects/entrances';
import {
  useCreateEffectResource,
  useUpdateEffectResource,
  type EffectCategory,
  type EffectResource,
} from '@/tools/video-editor/hooks/useEffectResources';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EffectCreatorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When editing an existing resource-based effect */
  editingEffect?: EffectResource | null;
  /** Called after a successful save with the resource id */
  onSaved?: (resourceId: string, category: EffectCategory) => void;
}

type CompileStatus = 'idle' | 'compiling' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Preview composition — colored rectangle wrapped by the effect component
// ---------------------------------------------------------------------------

const PREVIEW_FPS = 30;
const PREVIEW_DURATION_FRAMES = 90; // 3 seconds
const PREVIEW_SIZE = 320;

function PreviewRect() {
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
      }}
    >
      <div
        style={{
          width: '60%',
          height: '60%',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 1,
        }}
      >
        Effect Preview
      </div>
    </AbsoluteFill>
  );
}

function makePreviewComposition(EffectComponent: FC<EffectComponentProps> | null) {
  return function EffectPreviewComposition() {
    if (!EffectComponent) {
      return <PreviewRect />;
    }
    return (
      <EffectComponent durationInFrames={PREVIEW_DURATION_FRAMES} effectFrames={20} intensity={0.5}>
        <PreviewRect />
      </EffectComponent>
    );
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EffectCreatorPanel({
  open,
  onOpenChange,
  editingEffect,
  onSaved,
}: EffectCreatorPanelProps) {
  const isEditing = Boolean(editingEffect);

  // Form state
  const [name, setName] = useState(editingEffect?.name ?? '');
  const [category, setCategory] = useState<EffectCategory>(editingEffect?.category ?? 'entrance');
  const [prompt, setPrompt] = useState(editingEffect?.description ?? '');
  const [code, setCode] = useState(editingEffect?.code ?? '');
  const [isPublic, setIsPublic] = useState(editingEffect?.is_public ?? true);

  // Generation / compile state
  const [isGenerating, setIsGenerating] = useState(false);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>(editingEffect?.code ? 'success' : 'idle');
  const [compileError, setCompileError] = useState<string | null>(null);
  const [previewComponent, setPreviewComponent] = useState<FC<EffectComponentProps> | null>(null);
  const [showCode, setShowCode] = useState(false);

  // Mutations
  const createEffect = useCreateEffectResource();
  const updateEffect = useUpdateEffectResource();
  const isSaving = createEffect.isPending || updateEffect.isPending;

  // Track abort for generation requests
  const abortRef = useRef<AbortController | null>(null);

  // Reset state when dialog opens with a new/different effect
  const resetForm = useCallback((effect?: EffectResource | null) => {
    setName(effect?.name ?? '');
    setCategory(effect?.category ?? 'entrance');
    setPrompt(effect?.description ?? '');
    setCode(effect?.code ?? '');
    setIsPublic(effect?.is_public ?? true);
    setCompileStatus(effect?.code ? 'success' : 'idle');
    setCompileError(null);
    setPreviewComponent(null);
    setShowCode(false);
    setIsGenerating(false);
  }, []);

  // When the dialog opens or the editingEffect changes, reset
  const prevEditingIdRef = useRef<string | undefined>(undefined);
  if (open && editingEffect?.id !== prevEditingIdRef.current) {
    prevEditingIdRef.current = editingEffect?.id;
    resetForm(editingEffect);
    // If editing and there is code, compile it for preview
    if (editingEffect?.code) {
      void tryCompileEffectAsync(editingEffect.code).then((result) => {
        if (result.ok) {
          setPreviewComponent(() => result.component);
          setCompileStatus('success');
        } else {
          setCompileError(result.error);
          setCompileStatus('error');
        }
      });
    }
  }
  if (!open && prevEditingIdRef.current !== undefined) {
    prevEditingIdRef.current = undefined;
  }

  // Compile code and update preview
  const compileCode = useCallback(async (codeToCompile: string) => {
    setCompileStatus('compiling');
    setCompileError(null);
    const result: CompileResult = await tryCompileEffectAsync(codeToCompile);
    if (result.ok) {
      setPreviewComponent(() => result.component);
      setCompileStatus('success');
      setCompileError(null);
    } else {
      setPreviewComponent(null);
      setCompileStatus('error');
      setCompileError(result.error);
    }
    return result;
  }, []);

  // Generate effect via edge function
  const handleGenerate = useCallback(async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give your effect a name before generating.', variant: 'destructive' });
      return;
    }
    if (!prompt.trim()) {
      toast({ title: 'Prompt required', description: 'Describe the effect you want to create.', variant: 'destructive' });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setCompileStatus('idle');
    setCompileError(null);

    try {
      const response = await invokeSupabaseEdgeFunction<{ code: string; model: string }>(
        'ai-generate-effect',
        {
          body: {
            prompt: prompt.trim(),
            name: name.trim(),
            category,
            existingCode: code || undefined,
          },
          timeoutMs: 45_000,
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted) return;

      setCode(response.code);
      setPrompt('');

      // Auto-compile
      await compileCode(response.code);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Generation failed';
      toast({ title: 'Effect generation failed', description: message, variant: 'destructive' });
      setCompileStatus('error');
      setCompileError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [name, prompt, category, code, compileCode]);

  // Save effect as a resource
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give your effect a name.', variant: 'destructive' });
      return;
    }
    if (!code.trim()) {
      toast({ title: 'No code', description: 'Generate or write the effect code first.', variant: 'destructive' });
      return;
    }
    if (compileStatus !== 'success') {
      // Try compiling first
      const result = await compileCode(code);
      if (!result.ok) {
        toast({ title: 'Compile error', description: 'Fix the compile error before saving.', variant: 'destructive' });
        return;
      }
    }

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const metadata = {
      name: name.trim(),
      slug,
      code,
      category,
      description: prompt.trim(),
      created_by: { is_you: true },
      is_public: isPublic,
    };

    try {
      if (isEditing && editingEffect) {
        await updateEffect.mutateAsync({ id: editingEffect.id, metadata });
        onSaved?.(editingEffect.id, category);
      } else {
        const resource = await createEffect.mutateAsync({ metadata });
        onSaved?.(resource.id, category);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    }
  }, [name, code, category, prompt, isPublic, compileStatus, compileCode, isEditing, editingEffect, createEffect, updateEffect, onSaved, onOpenChange]);

  // Preview composition memoized on the component ref
  const PreviewComposition = useMemo(() => makePreviewComposition(previewComponent), [previewComponent]);

  const hasGeneratedCode = Boolean(code.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {hasGeneratedCode
              ? (name.trim() || 'Custom Effect')
              : isEditing ? 'Edit Custom Effect' : 'Create Custom Effect'}
          </DialogTitle>
          <DialogDescription>
            {hasGeneratedCode
              ? 'How would you like to edit this animation?'
              : isEditing
                ? 'Describe how you want to change this effect.'
                : 'Describe the effect you want, and AI will generate it for you.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + Category — shown before first generation */}
          {!hasGeneratedCode && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={name}
                  placeholder="My effect"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select value={category} onValueChange={(v) => setCategory(v as EffectCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrance">Entrance</SelectItem>
                    <SelectItem value="exit">Exit</SelectItem>
                    <SelectItem value="continuous">Continuous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Preview — shown above prompt when code exists */}
          {hasGeneratedCode && (compileStatus === 'success' || previewComponent) && (
            <div className="overflow-hidden rounded-lg border border-border bg-black">
              <Player
                component={PreviewComposition}
                compositionWidth={PREVIEW_SIZE}
                compositionHeight={PREVIEW_SIZE}
                durationInFrames={PREVIEW_DURATION_FRAMES}
                fps={PREVIEW_FPS}
                style={{ width: '100%', aspectRatio: '1' }}
                loop
                autoPlay
                controls
              />
            </div>
          )}

          {/* Compile error */}
          {compileStatus === 'error' && compileError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Compile error: {compileError}
            </div>
          )}

          {/* Prompt / edit instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {hasGeneratedCode ? 'Edit instructions' : 'Describe your effect'}
            </label>
            <Textarea
              value={prompt}
              placeholder={hasGeneratedCode
                ? "e.g. 'Make it slower and add a slight rotation'"
                : "e.g. 'A glowing neon border that pulses in and out'"
              }
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              voiceInput
              onVoiceResult={(result) => setPrompt(result.transcription)}
              voiceContext={hasGeneratedCode
                ? "The user is describing changes they want to make to an existing visual animation effect in a video editor. Transcribe their edit instructions accurately."
                : "The user is describing a visual animation effect for a video editor. They are specifying how a clip should animate (entrance, exit, or continuous effect). Transcribe their description accurately."
              }
              voiceTask="transcribe_only"
            />
          </div>

          {/* Generate / update button */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || !name.trim()}
              className="gap-1.5"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {hasGeneratedCode ? 'Updating...' : 'Generating...'}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {hasGeneratedCode ? 'Update effect' : 'Generate'}
                </>
              )}
            </Button>
            {hasGeneratedCode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground"
                onClick={() => setShowCode((v) => !v)}
              >
                <Pencil className="h-3 w-3" />
                {showCode ? 'Hide code' : 'View code'}
              </Button>
            )}
          </div>

          {/* Code editor — hidden by default */}
          {showCode && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Effect Code</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void compileCode(code)}
                  disabled={compileStatus === 'compiling'}
                >
                  {compileStatus === 'compiling' ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Recompile
                </Button>
              </div>
              <Textarea
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCompileStatus('idle');
                }}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Preview — shown below prompt for first-time generation */}
          {!hasGeneratedCode && (compileStatus === 'success' || previewComponent) && (
            <div className="overflow-hidden rounded-lg border border-border bg-black">
              <Player
                component={PreviewComposition}
                compositionWidth={PREVIEW_SIZE}
                compositionHeight={PREVIEW_SIZE}
                durationInFrames={PREVIEW_DURATION_FRAMES}
                fps={PREVIEW_FPS}
                style={{ width: '100%', aspectRatio: '1' }}
                loop
                autoPlay
                controls
              />
            </div>
          )}

          {/* Public/private toggle + Save */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {isPublic ? 'Public' : 'Private'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !name.trim() || !code.trim()}
                className="gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isEditing ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
