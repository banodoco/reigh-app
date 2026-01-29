import { HydratedReferenceImage, ReferenceMode } from "../../types";
import { Resource } from "@/shared/hooks/useResources";
import { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";

// Shared disabled state
export interface DisabledState {
  isGenerating: boolean;
  isUploadingStyleReference: boolean;
}

// Reference grid props
export interface ReferenceGridProps extends DisabledState {
  references: HydratedReferenceImage[];
  selectedReferenceId: string | null;
  onSelectReference: (id: string) => void;
  onAddReference: (files: File[]) => void;
  onDeleteReference: (id: string) => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
  onOpenDatasetBrowser: () => void;
  isLoadingReferenceData?: boolean;
  referenceCount?: number;
}

// Reference preview props
export interface ReferencePreviewProps {
  imageUrl: string | null;
  isLoadingReferenceData: boolean;
}

// Reference mode controls props
export interface ReferenceModeControlsProps extends DisabledState {
  referenceMode: ReferenceMode;
  onReferenceModeChange: (mode: ReferenceMode) => void;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisSceneStrength: number;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onInThisSceneStrengthChange: (value: number) => void;
  // Subject description
  subjectDescription: string;
  onSubjectDescriptionChange: (value: string) => void;
  onSubjectDescriptionFocus?: () => void;
  onSubjectDescriptionBlur?: () => void;
  // Style boost terms
  styleBoostTerms: string;
  onStyleBoostTermsChange: (value: string) => void;
  // Whether a reference is selected (controls disabled state)
  hasSelectedReference: boolean;
}

// LoRA grid props
export interface LoraGridProps extends DisabledState {
  selectedLoras: ActiveLora[];
  onOpenLoraModal: () => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
}

// Full reference section props
export interface ReferenceSectionProps extends DisabledState {
  // Reference data
  references: HydratedReferenceImage[];
  selectedReferenceId: string | null;
  styleReferenceImage: string | null;
  referenceCount: number;
  isLoadingReferenceData: boolean;
  // Reference actions
  onSelectReference: (id: string) => void;
  onDeleteReference: (id: string) => void;
  onAddReference: (files: File[]) => void;
  onResourceSelect: (resource: Resource) => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
  // Mode and strengths
  referenceMode: ReferenceMode;
  onReferenceModeChange: (mode: ReferenceMode) => void;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisSceneStrength: number;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onInThisSceneStrengthChange: (value: number) => void;
  // Subject description
  subjectDescription: string;
  onSubjectDescriptionChange: (value: string) => void;
  onSubjectDescriptionFocus?: () => void;
  onSubjectDescriptionBlur?: () => void;
  // Style boost terms
  styleBoostTerms: string;
  onStyleBoostTermsChange: (value: string) => void;
  // LoRAs
  selectedLoras: ActiveLora[];
  onOpenLoraModal: () => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
}
