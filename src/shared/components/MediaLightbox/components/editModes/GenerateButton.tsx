/**
 * GenerateButton - Edit mode generate button
 *
 * Handles text, inpaint, and annotate mode generation.
 * Shows appropriate icon, label, and disabled state per mode.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { CheckCircle, Loader2, Paintbrush, Pencil, Sparkles } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { BrushStroke } from '../../hooks/inpainting/types';

interface GenerateButtonProps {
  isMobile: boolean;
  editMode: string;
  // Callbacks
  handleUnifiedGenerate: () => void;
  handleGenerateAnnotatedEdit: () => void;
  // Form state
  brushStrokes: BrushStroke[];
  inpaintPrompt: string;
  // Generation status
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
}

export const GenerateButton: React.FC<GenerateButtonProps> = ({
  isMobile,
  editMode,
  handleUnifiedGenerate,
  handleGenerateAnnotatedEdit,
  brushStrokes,
  inpaintPrompt,
  isGeneratingInpaint,
  inpaintGenerateSuccess,
  isCreatingMagicEditTasks,
  magicEditTasksCreated,
}) => {
  const buttonSize = isMobile ? 'sm' : 'default';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <Button
      variant="default"
      size={buttonSize as 'sm' | 'default'}
      onClick={
        editMode === 'annotate'
          ? handleGenerateAnnotatedEdit
          : handleUnifiedGenerate
      }
      disabled={
        (editMode === 'annotate' && (brushStrokes.length === 0 || !inpaintPrompt.trim())) ||
        (editMode !== 'annotate' && !inpaintPrompt.trim()) ||
        (editMode === 'inpaint' && brushStrokes.length === 0) ||
        isGeneratingInpaint ||
        inpaintGenerateSuccess ||
        isCreatingMagicEditTasks ||
        magicEditTasksCreated
      }
      className={cn(
        "w-full",
        isMobile && "h-9 text-xs",
        (inpaintGenerateSuccess || magicEditTasksCreated) && "bg-green-600 hover:bg-green-600"
      )}
    >
      {(isGeneratingInpaint || isCreatingMagicEditTasks) ? (
        <>
          <Loader2 className={`${iconSize} mr-1.5 animate-spin`} />
          {isMobile ? 'Creating...' : 'Generating...'}
        </>
      ) : (inpaintGenerateSuccess || magicEditTasksCreated) ? (
        <>
          <CheckCircle className={`${iconSize} mr-1.5`} />
          {isMobile ? 'Submitted' : (editMode === 'inpaint' ? 'Success!' : 'Submitted, results will appear below')}
        </>
      ) : editMode === 'inpaint' ? (
        <>
          <Paintbrush className={`${iconSize} mr-1.5`} />
          {isMobile ? 'Generate' : 'Generate inpainted image'}
        </>
      ) : editMode === 'annotate' ? (
        <>
          <Pencil className={`${iconSize} mr-1.5`} />
          {isMobile ? 'Generate' : 'Generate based on annotations'}
        </>
      ) : (
        <>
          <Sparkles className={`${iconSize} mr-1.5`} />
          {isMobile ? 'Generate' : 'Generate text edit'}
        </>
      )}
    </Button>
  );
};
