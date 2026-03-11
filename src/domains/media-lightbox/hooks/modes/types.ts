import type { GenerationRow } from '@/domains/generation/types';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { useEditVideoSettings } from '@/shared/settings/hooks/useEditVideoSettings';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import type { LoraModel } from '@/domains/lora/types/lora';

export interface UseVideoEditingProps {
  media: GenerationRow | null;
  selectedProjectId: string | null;
  projectAspectRatio?: string;
  isVideo: boolean;
  videoDuration: number;
  videoUrl: string;
  onExitVideoEditMode?: () => void;
}

export interface UseVideoEditingReturn {
  // Mode state
  isVideoEditMode: boolean;
  setIsVideoEditMode: (value: boolean) => void;

  // Video ref for timeline control
  videoRef: React.RefObject<HTMLVideoElement>;

  // Portion selections
  selections: PortionSelection[];
  activeSelectionId: string | null;
  handleUpdateSelection: (id: string, start: number, end: number) => void;
  handleAddSelection: () => void;
  handleRemoveSelection: (id: string) => void;
  setActiveSelectionId: (id: string | null) => void;
  handleUpdateSelectionSettings: (id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>) => void;

  // Validation
  isValid: boolean;
  validationErrors: string[];
  /** Max context frames based on shortest keeper clip (prevents invalid inputs) */
  maxContextFrames: number;

  // Settings (from useEditVideoSettings)
  editSettings: ReturnType<typeof useEditVideoSettings>;

  // LoRA management
  loraManager: ReturnType<typeof useLoraManager>;
  availableLoras: LoraModel[];

  // Generation
  handleGenerate: () => void;
  isGenerating: boolean;
  generateSuccess: boolean;

  // Handlers for entering/exiting mode
  handleEnterVideoEditMode: () => void;
  handleExitVideoEditMode: () => void;
}
