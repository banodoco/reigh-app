import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel, UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import type { PresetMetadata } from '@/shared/components/MotionPresetSelector/types';

/** Info about a clip pair for visualization */
export interface ClipPairInfo {
    pairIndex: number;
    clipA: {
        name: string;
        frameCount: number;
        finalFrameUrl?: string; // last frame of clip A
    };
    clipB: {
        name: string;
        frameCount: number;
        posterUrl?: string; // first frame of clip B
    };
}

export interface JoinClipsSettingsFormProps {
    // Settings state
    gapFrames: number;
    setGapFrames: (val: number) => void;
    contextFrames: number;
    setContextFrames: (val: number) => void;
    replaceMode: boolean;
    setReplaceMode: (val: boolean) => void;
    keepBridgingImages?: boolean;
    setKeepBridgingImages?: (val: boolean) => void;

    prompt: string;
    setPrompt: (val: string) => void;
    negativePrompt: string;
    setNegativePrompt: (val: string) => void;

    useIndividualPrompts?: boolean;
    setUseIndividualPrompts?: (val: boolean) => void;

    /** Number of clips with videos - used to show/hide "Set individually" option */
    clipCount?: number;

    // Enhance prompt toggle
    enhancePrompt?: boolean;
    setEnhancePrompt?: (val: boolean) => void;

    // Resolution source toggle (only shown when showResolutionToggle is true)
    useInputVideoResolution?: boolean;
    setUseInputVideoResolution?: (val: boolean) => void;
    /** Whether to show the resolution source toggle (project vs first input video) */
    showResolutionToggle?: boolean;

    // FPS source toggle (only shown when showFpsToggle is true)
    useInputVideoFps?: boolean;
    setUseInputVideoFps?: (val: boolean) => void;
    /** Whether to show the FPS toggle (16fps vs input video fps) */
    showFpsToggle?: boolean;

    // Noised input video (vid2vid init strength)
    noisedInputVideo?: number;
    setNoisedInputVideo?: (val: number) => void;

    // LoRA props
    availableLoras: LoraModel[];
    projectId: string | null;
    loraPersistenceKey: string;
    /** Optional external loraManager. If provided, uses this instead of creating a new one. */
    loraManager?: UseLoraManagerReturn;

    // Actions
    onGenerate: () => void;
    isGenerating: boolean;
    generateSuccess: boolean;
    generateButtonText: string;
    isGenerateDisabled?: boolean;

    // Optional callback to restore default settings
    onRestoreDefaults?: () => void;

    // Optional overrides
    className?: string;

    // Header content to be placed above settings
    headerContent?: React.ReactNode;

    // Shortest clip frame count for constraining sliders (prevents invalid settings)
    shortestClipFrames?: number;

    // Clip pairs for visualization (optional - if provided, enables pair selector)
    clipPairs?: ClipPairInfo[];

    // Motion settings mode (Basic/Advanced tabs)
    motionMode?: 'basic' | 'advanced';
    onMotionModeChange?: (mode: 'basic' | 'advanced') => void;

    // Phase config for advanced mode
    phaseConfig?: PhaseConfig;
    onPhaseConfigChange?: (config: PhaseConfig) => void;

    // Random seed toggle (for PhaseConfigVertical)
    randomSeed?: boolean;
    onRandomSeedChange?: (val: boolean) => void;

    // Phase preset selection (for Basic mode preset chips)
    selectedPhasePresetId?: string | null;
    onPhasePresetSelect?: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
    onPhasePresetRemove?: () => void;

    // Featured preset IDs for quick-select chips (provided by parent, or uses default)
    featuredPresetIds?: string[];

    /** Whether to show the generate button (default: true). Set to false when embedding in another form. */
    showGenerateButton?: boolean;
}
