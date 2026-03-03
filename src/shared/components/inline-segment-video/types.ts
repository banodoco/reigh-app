import type React from 'react';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { GenerationRow } from '@/domains/generation/types';

export interface LayoutProps {
  layout: 'absolute' | 'flow';
  compact: boolean;
  isMobile: boolean;
  roundedClass: string;
  flowContainerClasses: string;
  adjustedPositionStyle: React.CSSProperties | undefined;
}

export interface InlineSegmentVideoCoreProps {
  slot: SegmentSlot;
  pairIndex: number;
  onClick: () => void;
  projectAspectRatio?: string;
}

export interface InlineSegmentVideoLayoutProps {
  isMobile?: boolean;
  leftPercent?: number;
  widthPercent?: number;
  layout?: 'absolute' | 'flow';
  compact?: boolean;
}

export interface InlineSegmentVideoActionProps {
  onOpenPairSettings?: (pairIndex: number) => void;
  onDelete?: (generationId: string) => void;
  readOnly?: boolean;
}

export interface InlineSegmentVideoStatusProps {
  isDeleting?: boolean;
  isPending?: boolean;
  hasSourceChanged?: boolean;
}

export interface InlineSegmentVideoScrubbingProps {
  isScrubbingActive?: boolean;
  onScrubbingStart?: (rect: DOMRect) => void;
  scrubbingContainerRef?: React.RefObject<HTMLDivElement>;
  scrubbingContainerProps?: {
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  scrubbingProgress?: number;
}

export interface InlineSegmentVideoProps
  extends InlineSegmentVideoCoreProps,
    InlineSegmentVideoLayoutProps,
    InlineSegmentVideoActionProps,
    InlineSegmentVideoStatusProps,
    InlineSegmentVideoScrubbingProps {}

export interface SegmentPlaceholderProps {
  layoutProps: LayoutProps;
  isPending: boolean;
  readOnly: boolean;
  pairIndex: number;
  onOpenPairSettings?: (pairIndex: number) => void;
}

export interface SegmentProcessingProps {
  layoutProps: LayoutProps;
  isPending: boolean;
  pairIndex: number;
  onOpenPairSettings?: (pairIndex: number) => void;
}

interface ScrubbingProps {
  isActive: boolean;
  onStart?: (rect: DOMRect) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  containerProps?: {
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  progress?: number;
}

export interface BadgeProps {
  data: { derivedCount?: number; unviewedVariantCount?: number; hasUnviewedVariants?: boolean } | null;
  showNew: boolean;
  isNewWithNoVariants: boolean;
  unviewedCount: number;
  onMarkAllViewed: () => void;
}

export interface SegmentPreviewProps {
  layoutProps: LayoutProps;
  child: GenerationRow;
  pairIndex: number;
  onClick: () => void;
  projectAspectRatio?: string;
  onDelete?: (generationId: string) => void;
  isDeleting: boolean;
  isPending: boolean;
  hasSourceChanged: boolean;
  scrubbing: ScrubbingProps;
  badge: BadgeProps;
}
