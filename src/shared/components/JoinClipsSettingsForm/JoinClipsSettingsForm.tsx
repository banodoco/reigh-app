import React, { useEffect, useMemo, useState } from 'react';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Check, Film, Info, RotateCcw, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { LoraManager } from '@/shared/components/LoraManager';
import { cn } from '@/shared/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components';
import {
  DEFAULT_VACE_PHASE_CONFIG,
  BUILTIN_VACE_PRESET,
  BUILTIN_VACE_DEFAULT_ID,
  VACE_FEATURED_PRESET_IDS,
} from '@/shared/lib/vaceDefaults';
import type { JoinClipsSettingsFormProps } from './types';
import { quantizeTotalFrames, getQuantizedGap } from './utils';
import { Visualization } from './Visualization';

// =============================================================================
// EXPORTS FOR BACKWARDS COMPATIBILITY
// =============================================================================

// Shared defaults with Join Clips aliases
export const DEFAULT_JOIN_CLIPS_PHASE_CONFIG = DEFAULT_VACE_PHASE_CONFIG;
export const BUILTIN_JOIN_CLIPS_DEFAULT_ID = BUILTIN_VACE_DEFAULT_ID;
const BUILTIN_JOIN_CLIPS_PRESET = BUILTIN_VACE_PRESET;
const JOIN_CLIPS_FEATURED_PRESET_IDS = VACE_FEATURED_PRESET_IDS;

export const JoinClipsSettingsForm: React.FC<JoinClipsSettingsFormProps> = ({
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    replaceMode,
    setReplaceMode,
    keepBridgingImages,
    setKeepBridgingImages,
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    useIndividualPrompts,
    setUseIndividualPrompts,
    clipCount = 2,
    enhancePrompt,
    setEnhancePrompt,
    useInputVideoResolution,
    setUseInputVideoResolution,
    showResolutionToggle = false,
    useInputVideoFps,
    setUseInputVideoFps,
    showFpsToggle = false,
    noisedInputVideo = 0,
    setNoisedInputVideo,
    availableLoras,
    projectId,
    loraPersistenceKey,
    loraManager,
    onGenerate,
    isGenerating,
    generateSuccess,
    generateButtonText,
    isGenerateDisabled = false,
    onRestoreDefaults,
    className,
    headerContent,
    shortestClipFrames,
    clipPairs,
    motionMode = 'basic',
    onMotionModeChange,
    phaseConfig,
    onPhaseConfigChange,
    randomSeed = true,
    onRandomSeedChange,
    selectedPhasePresetId,
    onPhasePresetSelect,
    onPhasePresetRemove,
    featuredPresetIds = JOIN_CLIPS_FEATURED_PRESET_IDS,
    showGenerateButton = true,
}) => {
    const keepBridgingImagesValue = keepBridgingImages ?? false;
    const enhancePromptValue = enhancePrompt;

    // Advanced section state
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Calculate dynamic max values for sliders based on combined constraint:
    //
    // REPLACE mode CONSTRAINT (to avoid double-blending artifacts):
    //   min_clip_frames ≥ gap_frame_count + 2 × context_frame_count
    //
    // Rearranged:
    //   max_gap = shortest_clip - 2 × context
    //   max_context = (shortest_clip - gap) / 2
    //
    // In INSERT mode, each clip only needs: context frames
    const { maxGapFrames, maxContextFrames, minClipFramesRequired } = useMemo(() => {
        // Standard limits (without clip constraints)
        const standardMaxTotal = 81; // 4N+1 format max
        const standardMaxContext = 30;

        // Calculate minimum frames required per clip based on current settings
        const minRequired = replaceMode
            ? gapFrames + 2 * contextFrames  // gap + 2*context
            : contextFrames;                  // just context for INSERT mode

        // Default case: no clip info available
        if (!shortestClipFrames || shortestClipFrames <= 0) {
            const defaultMaxGap = Math.max(1, standardMaxTotal - (contextFrames * 2));
            return {
                maxGapFrames: defaultMaxGap,
                maxContextFrames: standardMaxContext,
                minClipFramesRequired: minRequired,
            };
        }

        if (replaceMode) {
            // REPLACE mode: min_clip_frames ≥ gap + 2*context
            // max_gap = shortest_clip - 2*context
            const maxGapForClip = Math.max(1, shortestClipFrames - 2 * contextFrames);
            const maxGapForTotal = Math.max(1, standardMaxTotal - (contextFrames * 2));
            let finalMaxGap = Math.min(maxGapForClip, maxGapForTotal);
            // Quantize to valid 4N+1 value
            finalMaxGap = Math.max(1, Math.floor((finalMaxGap - 1) / 4) * 4 + 1);

            // max_context = (shortest_clip - gap) / 2
            const maxContextForClip = Math.floor((shortestClipFrames - gapFrames) / 2);
            const maxContextForTotal = Math.floor((standardMaxTotal - gapFrames) / 2);
            const finalMaxContext = Math.max(4, Math.min(maxContextForClip, maxContextForTotal, standardMaxContext));

            return {
                maxGapFrames: Math.max(1, finalMaxGap),
                maxContextFrames: finalMaxContext,
                minClipFramesRequired: minRequired,
            };
        } else {
            // INSERT mode: only need context frames from each clip
            const maxContextForClip = shortestClipFrames;
            const finalMaxContext = Math.max(4, Math.min(maxContextForClip, standardMaxContext));
            const maxGapForTotal = Math.max(1, standardMaxTotal - (contextFrames * 2));

            return {
                maxGapFrames: maxGapForTotal,
                maxContextFrames: finalMaxContext,
                minClipFramesRequired: minRequired,
            };
        }
    }, [shortestClipFrames, contextFrames, gapFrames, replaceMode]);

    // Auto-adjust values if they exceed calculated maximums
    useEffect(() => {
        if (gapFrames > maxGapFrames) {
            const quantizedGap = getQuantizedGap(maxGapFrames, contextFrames);
            setGapFrames(quantizedGap);
        }
    }, [maxGapFrames, gapFrames, contextFrames, setGapFrames]);

    useEffect(() => {
        if (contextFrames > maxContextFrames) {
            setContextFrames(maxContextFrames);
        }
    }, [maxContextFrames, contextFrames, setContextFrames]);

    // Auto-disable bridge anchors when gap frames is 8 or fewer
    useEffect(() => {
        if (gapFrames <= 8 && keepBridgingImagesValue) {
            setKeepBridgingImages?.(false);
        }
    }, [gapFrames, keepBridgingImagesValue, setKeepBridgingImages]);

    // Handle context frames change - just set context, don't adjust gap
    const handleContextFramesChange = (val: number) => {
        const newContextFrames = Math.max(4, val);
        setContextFrames(newContextFrames);
    };
    const sliderNumber = (value: number | readonly number[]): number => {
        if (typeof value === 'number') return value;
        return value[0] ?? 0;
    };

    // Calculate what the total will be quantized to (for display)
    const actualTotal = contextFrames * 2 + gapFrames;
    const quantizedTotal = quantizeTotalFrames(actualTotal);

    return (
        <div className={cn("space-y-8", className)}>
            {headerContent && (
                <div className="mb-6">
                    {headerContent}
                </div>
            )}

            {/* ==================== SETTINGS & MOTION (Side by Side) ==================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* SETTINGS (Prompts) */}
                <div className="space-y-4">
                    <SectionHeader title="Settings" theme="blue" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Global Prompt */}
                        <div className="gap-y-2 flex flex-col">
                            <div className="flex items-center justify-between h-5">
                                <Label htmlFor="join-prompt">Global Prompt:</Label>
                                {/* Only show "Set individually" when there are more than 2 clips */}
                                {setUseIndividualPrompts && clipCount > 2 && (
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="useIndividualPrompts" className="text-xs text-muted-foreground cursor-pointer">
                                            Set individually
                                        </Label>
                                        <Switch
                                            id="useIndividualPrompts"
                                            checked={useIndividualPrompts}
                                            onCheckedChange={setUseIndividualPrompts}
                                        />
                                    </div>
                                )}
                            </div>
                            <Textarea
                                id="join-prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={useIndividualPrompts
                                    ? "Appended to each individual transition prompt"
                                    : "Describe what you want for all transitions"
                                }
                                rows={5}
                                className="resize-none bg-background/50 flex-1 min-h-[120px]"
                                clearable
                                onClear={() => setPrompt('')}
                                voiceInput
                                voiceContext="This is a global prompt for video clip transitions. Describe the motion, style, or visual effect you want for joining video clips together. Focus on transition dynamics like camera movement, morphing effects, or smooth blending between scenes."
                                onVoiceResult={(result) => {
                                    setPrompt(result.prompt || result.transcription);
                                }}
                            />
                            {useIndividualPrompts && (
                                <p className="text-xs text-muted-foreground">
                                    💡 This will be inserted after each individual prompt
                                </p>
                            )}
                        </div>

                        {/* Negative Prompt */}
                        <div className="gap-y-2 flex flex-col">
                            <div className="flex items-center justify-between h-5">
                                <Label htmlFor="join-negative-prompt">Negative Prompt:</Label>
                            </div>
                            <Textarea
                                id="join-negative-prompt"
                                value={negativePrompt}
                                onChange={(e) => setNegativePrompt(e.target.value)}
                                placeholder="What to avoid in all transitions (optional)"
                                rows={5}
                                className="resize-none bg-background/50 flex-1 min-h-[120px]"
                                clearable
                                onClear={() => setNegativePrompt('')}
                                voiceInput
                                voiceContext="This is a negative prompt - things to AVOID in video transitions. List unwanted qualities like 'jerky, flickering, blurry, distorted, unnatural motion'. Keep it as a comma-separated list of terms to avoid."
                                onVoiceResult={(result) => {
                                    setNegativePrompt(result.prompt || result.transcription);
                                }}
                            />
                        </div>
                    </div>

                    {/* Enhance Prompt Toggle */}
                    <div className="flex items-center gap-x-2 p-3 bg-muted/30 rounded-lg border">
                        <Switch
                            id="join-enhance-prompt"
                            checked={enhancePromptValue}
                            onCheckedChange={(val) => {
                                if (setEnhancePrompt) {
                                    setEnhancePrompt(val);
                                }
                            }}
                        />
                        <div className="flex-1">
                            <Label htmlFor="join-enhance-prompt" className="font-medium cursor-pointer">
                                Enhance/Create Prompts
                            </Label>
                        </div>
                    </div>
                </div>

                {/* MOTION (Presets & LoRA) */}
                <div className="space-y-4">
                    <SectionHeader title="Motion" theme="orange" />
                    <MotionPresetSelector
                    builtinPreset={BUILTIN_JOIN_CLIPS_PRESET}
                    featuredPresetIds={featuredPresetIds}
                    generationTypeMode="vace"
                    selectedPhasePresetId={selectedPhasePresetId ?? null}
                    phaseConfig={phaseConfig}
                    motionMode={motionMode}
                    onPresetSelect={onPhasePresetSelect || (() => {})}
                    onPresetRemove={onPhasePresetRemove || (() => {})}
                    onModeChange={onMotionModeChange || (() => {})}
                    onPhaseConfigChange={onPhaseConfigChange || (() => {})}
                    availableLoras={availableLoras}
                    randomSeed={randomSeed}
                    onRandomSeedChange={onRandomSeedChange}
                    queryKeyPrefix="join-clips-presets"
                    renderBasicModeContent={() => (
                        <LoraManager
                            availableLoras={availableLoras}
                            projectId={projectId || undefined}
                            persistenceScope="project"
                            enableProjectPersistence={true}
                            persistenceKey={loraPersistenceKey}
                            externalLoraManager={loraManager}
                            title="Additional LoRA Models (Optional)"
                            addButtonText="Add or manage LoRAs"
                        />
                    )}
                />
                </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* ==================== STRUCTURE (Gap/Context/Visualization) ==================== */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <SectionHeader title="Structure" theme="green" />
                    {onRestoreDefaults && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRestoreDefaults}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Restore Defaults
                        </Button>
                    )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Controls Column */}
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                            {/* Gap Frames */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="join-gap-frames" className="text-sm font-medium">Gap Frames:</Label>
                                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{gapFrames}</span>
                                </div>
                                <Slider
                                    id="join-gap-frames"
                                    min={1}
                                    max={maxGapFrames}
                                    step={1}
                                    value={Math.min(Math.max(1, gapFrames), maxGapFrames)}
                                    onValueChange={(value) => {
                                        setGapFrames(Math.min(sliderNumber(value), maxGapFrames));
                                    }}
                                    className="py-2"
                                />
                            </div>

                            {/* Context Frames */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="join-context-frames" className="text-sm font-medium">Context Frames:</Label>
                                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{contextFrames}</span>
                                </div>
                                <Slider
                                    id="join-context-frames"
                                    min={4}
                                    max={maxContextFrames}
                                    step={1}
                                    value={Math.min(contextFrames, maxContextFrames)}
                                    onValueChange={(value) => handleContextFramesChange(Math.min(sliderNumber(value), maxContextFrames))}
                                    className="py-2"
                                />
                            </div>

                            {/* Replace Mode */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between h-5">
                                    <Label className="text-sm font-medium">Transition Mode:</Label>
                                </div>
                                <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                    <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !replaceMode ? "font-medium text-foreground" : "text-muted-foreground")}>Insert</span>
                                    <Switch
                                        id="join-replace-mode"
                                        checked={replaceMode}
                                        onCheckedChange={setReplaceMode}
                                    />
                                    <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", replaceMode ? "font-medium text-foreground" : "text-muted-foreground")}>Replace</span>
                                </div>
                            </div>

                            {/* Keep Bridge Images */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between h-5">
                                    <Label className={cn("text-sm font-medium", gapFrames <= 8 && "text-muted-foreground")}>Bridge Anchors:</Label>
                                </div>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className={cn(
                                                "flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50",
                                                gapFrames <= 8 && "opacity-50 cursor-not-allowed"
                                            )}>
                                                <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !keepBridgingImagesValue ? "font-medium text-foreground" : "text-muted-foreground")}>Off</span>
                                                <Switch
                                                    id="join-keep-bridge"
                                                    checked={gapFrames <= 8 ? false : keepBridgingImagesValue}
                                                    disabled={gapFrames <= 8}
                                                    onCheckedChange={(val) => {
                                                        setKeepBridgingImages?.(val);
                                                    }}
                                                />
                                                <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", keepBridgingImagesValue && gapFrames > 8 ? "font-medium text-foreground" : "text-muted-foreground")}>On</span>
                                            </div>
                                        </TooltipTrigger>
                                        {gapFrames <= 8 && (
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Bridge anchors require more than 8 gap frames to have enough space for anchor placement.
                                                </p>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </TooltipProvider>
                            </div>

                            {/* Advanced Settings (Resolution, FPS, Noised Input) */}
                            {(showResolutionToggle || showFpsToggle || setNoisedInputVideo) && (
                                <Collapsible
                                    open={isAdvancedOpen}
                                    onOpenChange={setIsAdvancedOpen}
                                    className="col-span-2"
                                >
                                    <CollapsibleTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn(
                                                "w-full justify-between px-3 py-2 h-auto border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
                                                isAdvancedOpen && "rounded-b-none"
                                            )}
                                        >
                                            <span className="text-xs font-medium">Advanced</span>
                                            <ChevronDown className={cn(
                                                "h-4 w-4 transition-transform duration-200",
                                                !isAdvancedOpen && "rotate-90"
                                            )} />
                                        </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="">
                                        <div className="border border-t-0 rounded-b-lg p-4 bg-muted/30">
                                            <div className="grid grid-cols-2 gap-x-6">
                                                {/* Resolution Source */}
                                                {showResolutionToggle && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between h-5">
                                                            <Label className="text-sm font-medium">Output Resolution:</Label>
                                                        </div>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                                                        <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !useInputVideoResolution ? "font-medium text-foreground" : "text-muted-foreground")}>Project</span>
                                                                        <Switch
                                                                            id="join-resolution-source"
                                                                            checked={useInputVideoResolution ?? false}
                                                                            onCheckedChange={(val) => {
                                                                                setUseInputVideoResolution?.(val);
                                                                            }}
                                                                        />
                                                                        <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", useInputVideoResolution ? "font-medium text-foreground" : "text-muted-foreground")}>Input</span>
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p className="max-w-xs text-xs">
                                                                        Choose whether to use the project's aspect ratio or match the first input video's resolution.
                                                                    </p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                )}

                                                {/* FPS Source */}
                                                {showFpsToggle && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between h-5">
                                                            <Label className="text-sm font-medium">Output FPS:</Label>
                                                        </div>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                                                        <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !useInputVideoFps ? "font-medium text-foreground" : "text-muted-foreground")}>Project</span>
                                                                        <Switch
                                                                            id="join-fps-source"
                                                                            checked={useInputVideoFps ?? false}
                                                                            onCheckedChange={(val) => {
                                                                                setUseInputVideoFps?.(val);
                                                                            }}
                                                                        />
                                                                        <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", useInputVideoFps ? "font-medium text-foreground" : "text-muted-foreground")}>Input</span>
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p className="max-w-xs text-xs">
                                                                        Choose whether to use the project's FPS (16 FPS) or keep the input video's original frame rate.
                                                                    </p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                )}

                                                {/* Noised Input Video */}
                                                {setNoisedInputVideo && (
                                                    <div className="space-y-3 col-span-2 mt-4">
                                                        <div className="flex items-center justify-between">
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Label className="text-sm font-medium flex items-center gap-1 cursor-help">
                                                                            Noised Input Video:
                                                                            <Info className="w-3 h-3 text-muted-foreground" />
                                                                        </Label>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p className="max-w-xs text-xs">
                                                                            Controls how much the original gap frames influence generation. Lower values preserve more of the original motion/structure; higher values allow more creative regeneration.
                                                                        </p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{noisedInputVideo.toFixed(2)}</span>
                                                        </div>
                                                        <Slider
                                                            id="join-noised-input"
                                                            min={0}
                                                            max={1}
                                                            step={0.05}
                                                            value={noisedInputVideo}
                                                            onValueChange={(value) => setNoisedInputVideo(sliderNumber(value))}
                                                            className="py-2"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            )}
                        </div>
                    </div>

                    {/* Visualization Column */}
                    <div className="h-full flex flex-col">
                        <Visualization
                            gapFrames={gapFrames}
                            contextFrames={contextFrames}
                            replaceMode={replaceMode}
                            keepBridgingImages={keepBridgingImagesValue}
                            clipPairs={clipPairs}
                            infoContent={
                                <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">Total generation:</span>{' '}
                                    <span className="font-mono font-medium">{actualTotal}</span> frames
                                    {quantizedTotal !== actualTotal && (
                                        <span className="text-muted-foreground/70"> → {quantizedTotal} (4N+1)</span>
                                    )}
                                    {shortestClipFrames && shortestClipFrames > 0 && (
                                        <>
                                            <span className="mx-2">•</span>
                                            {shortestClipFrames > 81 ? (
                                                <>
                                                    <span className="font-medium">Constrained by max generation:</span>{' '}
                                                    <span className="font-mono">81</span> frames
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-medium">Constrained by shortest clip:</span>{' '}
                                                    <span className="font-mono">{shortestClipFrames}</span> frames
                                                </>
                                            )}
                                            <span className="mx-2">•</span>
                                            <span className="font-medium">Min required:</span>{' '}
                                            <span className={cn(
                                                "font-mono",
                                                minClipFramesRequired > shortestClipFrames && "text-red-600 dark:text-red-400",
                                                minClipFramesRequired > shortestClipFrames * 0.9 && minClipFramesRequired <= shortestClipFrames && "text-yellow-600 dark:text-yellow-400"
                                            )}>
                                                {minClipFramesRequired}
                                            </span>
                                            {' '}frames per clip
                                            {replaceMode && (
                                                <span className="text-muted-foreground/70 ml-1">
                                                    ({gapFrames} gap + 2×{contextFrames} context)
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            }
                        />
                    </div>
                </div>
            </div>

            {showGenerateButton && (
                <>
                    <div className="h-px bg-border/50" />

                    {/* Generate Button */}
                    <div className="flex flex-col items-center gap-3 pt-4">
                        <Button
                            onClick={onGenerate}
                            disabled={isGenerateDisabled || isGenerating || generateSuccess}
                            className={cn("w-full max-w-md shadow-lg gap-2 h-12",
                                generateSuccess && "bg-green-500 hover:bg-green-600"
                            )}
                            size="lg"
                        >
                            {isGenerating ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : generateSuccess ? (
                                <Check className="w-5 h-5" />
                            ) : (
                                <Film className="w-5 h-5" />
                            )}
                            <span className="font-medium text-lg">
                                {generateSuccess ? 'Task Created' : generateButtonText}
                            </span>
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
};
