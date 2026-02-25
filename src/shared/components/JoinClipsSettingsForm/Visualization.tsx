import React, { useState } from 'react';
import { Film } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import type { ClipPairInfo } from './types';

export const Visualization: React.FC<{
    gapFrames: number;
    contextFrames: number;
    replaceMode: boolean;
    keepBridgingImages: boolean;
    infoContent?: React.ReactNode;
    clipPairs?: ClipPairInfo[];
}> = ({ gapFrames, contextFrames, replaceMode, keepBridgingImages, infoContent, clipPairs }) => {
    // Handle undefined keepBridgingImages (defensive fallback)
    const keepBridgingImagesValue = keepBridgingImages ?? false;

    // State for selected pair
    const [selectedPairIndex, setSelectedPairIndex] = useState(0);

    // Get selected pair info
    const selectedPair = clipPairs?.[selectedPairIndex];
    const hasPairs = clipPairs && clipPairs.length > 0;
    const hasMultiplePairs = clipPairs && clipPairs.length > 1;

    const totalFrames = contextFrames + gapFrames + contextFrames;
    const anchor1Idx = Math.floor(gapFrames / 3);
    const anchor2Idx = Math.floor(gapFrames * 2 / 3);

    // Calculate frames used/kept for current pair
    const gapPortion = Math.ceil(gapFrames / 2);
    const framesUsedFromClipA = replaceMode ? (contextFrames + gapPortion) : contextFrames;
    const framesUsedFromClipB = replaceMode ? (contextFrames + Math.floor(gapFrames / 2)) : contextFrames;
    const clipAKeptFrames = selectedPair ? Math.max(0, selectedPair.clipA.frameCount - framesUsedFromClipA) : null;
    const clipBKeptFrames = selectedPair ? Math.max(0, selectedPair.clipB.frameCount - framesUsedFromClipB) : null;

    // In REPLACE mode: Total generation = context + gap + context (all generated)
    // In INSERT mode: Gap is separate, context frames are from original clips
    const totalGenerationFlex = replaceMode
        ? (contextFrames + gapFrames + contextFrames)  // All generated together
        : gapFrames;  // Only gap is generated

    const contextFlex = contextFrames;  // Only used in INSERT mode

    // Clip A and Clip B portions should be half the size of the generated portion
    const clipAKeptFlex = totalGenerationFlex / 2;
    const clipBKeptFlex = totalGenerationFlex / 2;

    return (
        <div className="border rounded-lg p-4 bg-background/50 text-xs h-full flex flex-col">
            <h4 className="font-semibold flex items-center gap-2 mb-2">
                <Film className="w-3 h-3" />
                Transition Structure Preview
            </h4>

            {/* Pair selector with thumbnails */}
            {hasPairs && selectedPair && (
                <div className="flex items-center gap-3 mb-4">
                    {/* Pair selector buttons */}
                    {hasMultiplePairs && (
                        <div className="flex items-center gap-1">
                            {clipPairs.map((_pair, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedPairIndex(idx)}
                                    className={cn(
                                        "px-2 py-1 text-[10px] rounded transition-colors",
                                        selectedPairIndex === idx
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                    )}
                                >
                                    Pair {idx + 1}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Thumbnails */}
                    <div className="flex items-center gap-2">
                        <div className="w-12 h-8 rounded border overflow-hidden bg-muted">
                            {selectedPair.clipA.finalFrameUrl ? (
                                <img
                                    src={selectedPair.clipA.finalFrameUrl}
                                    alt={selectedPair.clipA.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Film className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                        <span className="text-muted-foreground text-[10px]">→</span>
                        <div className="w-12 h-8 rounded border overflow-hidden bg-muted">
                            {selectedPair.clipB.posterUrl ? (
                                <img
                                    src={selectedPair.clipB.posterUrl}
                                    alt={selectedPair.clipB.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Film className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {infoContent && (
                <div className="mb-4 bg-muted/50 rounded-lg px-3 py-2">
                    {infoContent}
                </div>
            )}

            <div className="flex-grow flex flex-col justify-center gap-6">
                {/* Mode Legend */}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500/50"></div>
                    <span>Clip A</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500/50"></div>
                    <span>Clip B</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-yellow-500/30 border border-yellow-500/50"></div>
                    <span>Generated</span>
                </div>
            </div>

            {/* Visual Bar - Full Clip View */}
            <div className="flex h-20 w-full rounded-md overflow-hidden border bg-background shadow-sm relative">
                {/* Clip A - Kept portion */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className="bg-blue-500/30 border-r border-blue-500/50 relative group flex flex-col items-center justify-center cursor-help"
                                style={{ flex: clipAKeptFlex }}
                            >
                                <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 opacity-70">
                                    Clip A
                                </span>
                                {clipAKeptFrames !== null && (
                                    <span className="text-[8px] font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                                        {clipAKeptFrames}
                                    </span>
                                )}
                                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-xs">
                                {clipAKeptFrames !== null
                                    ? `There are ${clipAKeptFrames} frames from Clip A that won't be included in the generation but will be re-attached afterwards.`
                                    : "This portion of Clip A is not used in generation - it will be stitched back together with the generated frames in the final output."
                                }
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {replaceMode ? (
                    /* REPLACE MODE: Single generation block that includes context */
                    <div
                        className="flex flex-col items-center justify-center relative border-r border-yellow-500/50 z-20 overflow-hidden"
                        style={{ flex: totalGenerationFlex }}
                    >
                        {/* Left context - from Clip A (solid blue, fixed) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="absolute left-0 top-0 bottom-0 bg-blue-500/30 cursor-help flex items-center justify-center"
                                        style={{
                                            width: `${(contextFrames / totalFrames) * 100}%`
                                        }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 z-10">
                                            {contextFrames}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">{contextFrames} context frames from Clip A are fed into generation to understand motion and maintain continuity. These will be blended between the original and the new.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Left half of gap - generated frames (blue-yellow mix with stripes) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="absolute top-0 bottom-0 bg-blue-500/10 cursor-help"
                                        style={{
                                            left: `${(contextFrames / totalFrames) * 100}%`,
                                            width: `${(gapFrames / 2 / totalFrames) * 100}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, hsl(var(--viz-yellow) / 0.2), hsl(var(--viz-yellow) / 0.2) 3px, hsl(var(--viz-blue) / 0.15) 3px, hsl(var(--viz-blue) / 0.15) 6px)'
                                        }}
                                    ></div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">{Math.ceil(gapFrames / 2)} frames from Clip A will be replaced with newly generated frames.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Right half of gap - generated frames (green-yellow mix with stripes) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="absolute top-0 bottom-0 bg-green-500/10 cursor-help"
                                        style={{
                                            right: `${(contextFrames / totalFrames) * 100}%`,
                                            width: `${(gapFrames / 2 / totalFrames) * 100}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, hsl(var(--viz-yellow) / 0.2), hsl(var(--viz-yellow) / 0.2) 3px, hsl(var(--viz-green) / 0.15) 3px, hsl(var(--viz-green) / 0.15) 6px)'
                                        }}
                                    ></div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">{Math.floor(gapFrames / 2)} frames from Clip B will be replaced with newly generated frames.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Right context - from Clip B (solid green, fixed) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="absolute right-0 top-0 bottom-0 bg-green-500/30 cursor-help flex items-center justify-center"
                                        style={{
                                            width: `${(contextFrames / totalFrames) * 100}%`
                                        }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 z-10">
                                            {contextFrames}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">{contextFrames} context frames from Clip B are fed into generation to understand motion and maintain continuity.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Divider lines to show context boundaries */}
                        <div
                            className="absolute top-0 bottom-0 w-px bg-blue-500/50 z-10"
                            style={{ left: `${(contextFrames / totalFrames) * 100}%` }}
                        ></div>
                        <div
                            className="absolute top-0 bottom-0 w-px bg-green-500/50 z-10"
                            style={{ right: `${(contextFrames / totalFrames) * 100}%` }}
                        ></div>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex flex-col items-center cursor-help z-10">
                                        <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-300">
                                            {gapFrames}
                                        </span>
                                        <span className="text-[8px] font-mono text-yellow-600 dark:text-yellow-400">
                                            replaced
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        {gapFrames} new frames will be generated to replace the seam between clips, creating a smooth transition.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {keepBridgingImagesValue && (
                            <>
                                {/* Anchor 1 - from Clip A side (blue) */}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 cursor-help"
                                                style={{ left: `${((contextFrames + anchor1Idx) / totalFrames) * 100}%` }}
                                            >
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 border-2 border-white shadow-md"></div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs text-xs">
                                                Anchor frame taken from the original Clip A video to stabilize the generation.
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                {/* Anchor 2 - from Clip B side (green) */}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 cursor-help"
                                                style={{ left: `${((contextFrames + anchor2Idx) / totalFrames) * 100}%` }}
                                            >
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border-2 border-white shadow-md"></div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs text-xs">
                                                Anchor frame taken from the original Clip B video to stabilize the generation.
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </>
                        )}
                    </div>
                ) : (
                    /* INSERT MODE: Context + Gap + Context as separate blocks */
                    <>
                        {/* Clip A - Context (last frames, preserved) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="bg-blue-500/40 border-r border-blue-500/60 relative group flex items-center justify-center cursor-help"
                                        style={{ flex: contextFlex }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 z-10">
                                            {contextFrames}
                                        </span>
                                        <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        {contextFrames} context frames from Clip A are blended with the generated frames to ensure smooth motion continuity.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Gap - Generated frames (inserted between clips) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="bg-yellow-500/30 flex flex-col items-center justify-center relative border-r border-yellow-500/50 z-20 cursor-help"
                                        style={{ flex: totalGenerationFlex }}
                                    >
                                        <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-300 z-10">
                                            {gapFrames}
                                        </span>
                                        <span className="text-[8px] font-mono text-yellow-600 dark:text-yellow-400 z-10">
                                            generated
                                        </span>

                            {keepBridgingImagesValue && (
                                <>
                                    {/* Anchor 1 - last frame of Clip A (blue) */}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 cursor-help"
                                                    style={{ left: `${(anchor1Idx / gapFrames) * 100}%` }}
                                                >
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 border-2 border-white shadow-md"></div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Anchor: Last frame of Clip A inserted here to stabilize the generation.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    {/* Anchor 2 - first frame of Clip B (green) */}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 cursor-help"
                                                    style={{ left: `${(anchor2Idx / gapFrames) * 100}%` }}
                                                >
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border-2 border-white shadow-md"></div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Anchor: First frame of Clip B inserted here to stabilize the generation.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </>
                            )}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        {gapFrames} new frames will be generated and inserted between the two clips to create a smooth transition.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Clip B - Context (first frames, preserved) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="bg-green-500/40 border-r border-green-500/60 relative group flex items-center justify-center cursor-help"
                                        style={{ flex: contextFlex }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 z-10">
                                            {contextFrames}
                                        </span>
                                        <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        {contextFrames} context frames from Clip B are blended with the generated frames to ensure smooth motion continuity.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </>
                )}

                {/* Clip B - Kept portion */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className="bg-green-500/30 relative group flex flex-col items-center justify-center cursor-help"
                                style={{ flex: clipBKeptFlex }}
                            >
                                <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 opacity-70">
                                    Clip B
                                </span>
                                {clipBKeptFrames !== null && (
                                    <span className="text-[8px] font-mono text-green-600 dark:text-green-400 mt-0.5">
                                        {clipBKeptFrames}
                                    </span>
                                )}
                                <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-xs">
                                {clipBKeptFrames !== null
                                    ? `There are ${clipBKeptFrames} frames from Clip B that won't be included in the generation but will be re-attached afterwards.`
                                    : "This portion of Clip B is not used in generation - it will be stitched back together with the generated frames in the final output."
                                }
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* Generation Window Bracket Indicator */}
            <div className="relative w-full h-8">
                {/* Calculate the position and width based on mode */}
                <div
                    className="absolute top-0 h-full flex flex-col items-center justify-start"
                    style={{
                        left: replaceMode ? `${(clipAKeptFlex / (clipAKeptFlex + totalGenerationFlex + clipBKeptFlex)) * 100}%` : `${(clipAKeptFlex / (clipAKeptFlex + contextFlex + totalGenerationFlex + contextFlex + clipBKeptFlex)) * 100}%`,
                        width: replaceMode ? `${(totalGenerationFlex / (clipAKeptFlex + totalGenerationFlex + clipBKeptFlex)) * 100}%` : `${((contextFlex + totalGenerationFlex + contextFlex) / (clipAKeptFlex + contextFlex + totalGenerationFlex + contextFlex + clipBKeptFlex)) * 100}%`
                    }}
                >
                    {/* Top bracket line */}
                    <div className="w-full h-px bg-foreground/30"></div>
                    {/* Left bracket */}
                    <div className="absolute left-0 top-0 w-px h-3 bg-foreground/30"></div>
                    {/* Right bracket */}
                    <div className="absolute right-0 top-0 w-px h-3 bg-foreground/30"></div>
                    {/* Label */}
                    <div className="mt-1 text-[9px] font-mono text-foreground/60 whitespace-nowrap">
                        Generation Window: {totalFrames} frames
                    </div>
                </div>
            </div>
            </div>

        </div>
    );
};
