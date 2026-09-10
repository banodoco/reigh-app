import type { GenerationRow } from '@/domains/generation/types';
import type { StrokeOverlayHandle } from '../../components/StrokeOverlay';
import type { EditAdvancedSettings, QwenEditModel } from './types';

type TaskType = 'inpaint' | 'annotate';

interface CreateInpaintingTaskWorkflowParams {
  taskType: TaskType;
  media: GenerationRow;
  selectedProjectId: string;
  shotId?: string;
  toolTypeOverride?: string;
  loras?: Array<{ url: string; strength: number }>;
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  qwenEditModel?: QwenEditModel;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  actualGenerationId: string;
  strokeOverlay: StrokeOverlayHandle;
}

export async function createInpaintingTaskWorkflow({
  taskType,
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  loras,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
  inpaintPrompt,
  inpaintNumGenerations,
  actualGenerationId,
  strokeOverlay,
}: CreateInpaintingTaskWorkflowParams): Promise<string> {
  void taskType;
  void media;
  void selectedProjectId;
  void shotId;
  void toolTypeOverride;
  void loras;
  void activeVariantId;
  void activeVariantLocation;
  void createAsGeneration;
  void advancedSettings;
  void qwenEditModel;
  void inpaintPrompt;
  void inpaintNumGenerations;
  void actualGenerationId;
  void strokeOverlay;
  // The current public Astrid edit capability is source-only.  Keep masked
  // edits fail-closed until a verified mask CAS port and bounded executor
  // profile exist; in particular, do not start a local worker or upload a
  // mask to the legacy Supabase path before that admission decision.
  throw new Error(
    'Masked image edits are blocked until Astrid publishes a bounded mask-capable edit capability',
  );
}
