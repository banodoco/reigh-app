import type { RefObject } from "react";
import type { GenerationVariant } from "@/shared/hooks/useVariants";
import type { LightboxStateValue } from "@/shared/components/MediaLightbox/contexts/LightboxStateContext";
import type { WorkflowControlsBarProps } from "@/shared/components/MediaLightbox/components/WorkflowControlsBar";
import type { WorkflowControlsProps } from "@/shared/components/MediaLightbox/components/WorkflowControls";
import type { LightboxLayoutProps } from "@/shared/components/MediaLightbox/components/layouts/types";
import type { AdjacentSegmentsData } from "@/shared/components/MediaLightbox/types";
import type { ShotOption } from "@/domains/generation/types";

interface BuildVariantsModelInput {
  variants: GenerationVariant[];
  activeVariant: GenerationVariant | null;
  primaryVariant: GenerationVariant | null;
  isLoadingVariants: boolean;
  handleVariantSelect: (id: string) => void;
  handleMakePrimary: (id: string) => Promise<void>;
  handleDeleteVariant: (id: string) => Promise<void>;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  isMakingMainVariant: boolean;
  canMakeMainVariant: boolean;
  handleMakeMainVariant: () => Promise<void>;
  pendingTaskCount: number;
  unviewedVariantCount: number;
  onMarkAllViewed: () => void;
  variantsSectionRef: RefObject<HTMLDivElement>;
}

export function buildVariantsModel(input: BuildVariantsModelInput): LightboxStateValue["variants"] {
  return {
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    handleVariantSelect: input.handleVariantSelect,
    handleMakePrimary: input.handleMakePrimary,
    handleDeleteVariant: input.handleDeleteVariant,
    onLoadVariantSettings: input.onLoadVariantSettings,
    promoteSuccess: input.promoteSuccess,
    isPromoting: input.isPromoting,
    handlePromoteToGeneration: input.handlePromoteToGeneration,
    isMakingMainVariant: input.isMakingMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleMakeMainVariant: input.handleMakeMainVariant,
    pendingTaskCount: input.pendingTaskCount,
    unviewedVariantCount: input.unviewedVariantCount,
    onMarkAllViewed: input.onMarkAllViewed,
    variantsSectionRef: input.variantsSectionRef,
  };
}

export function buildWorkflowBarModel(input: WorkflowControlsBarProps): WorkflowControlsBarProps {
  return input;
}

export function buildWorkflowControlsModel(input: WorkflowControlsProps): WorkflowControlsProps {
  return input;
}

interface BuildLayoutModelInput {
  showPanel: boolean;
  shouldShowSidePanel: boolean;
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
  workflowBar: WorkflowControlsBarProps;
  workflowControls?: WorkflowControlsProps;
  bottomLeft: LightboxLayoutProps["buttonGroups"]["bottomLeft"];
  bottomRight: LightboxLayoutProps["buttonGroups"]["bottomRight"];
  topRight: LightboxLayoutProps["buttonGroups"]["topRight"];
  adjacentSegments?: AdjacentSegmentsData;
}

export function buildLayoutModel(input: BuildLayoutModelInput): LightboxLayoutProps {
  return {
    showPanel: input.showPanel,
    shouldShowSidePanel: input.shouldShowSidePanel,
    effectiveTasksPaneOpen: input.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: input.effectiveTasksPaneWidth,
    workflowBar: input.workflowBar,
    workflowControls: input.workflowControls,
    buttonGroups: {
      bottomLeft: input.bottomLeft,
      bottomRight: input.bottomRight,
      topRight: input.topRight,
    },
    adjacentSegments: input.adjacentSegments,
    segmentSlotMode: undefined,
  };
}

export function normalizeShotOptions(options: ShotOption[] | undefined): ShotOption[] {
  return options ?? [];
}

