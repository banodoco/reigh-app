/**
 * RepositionButtons - Reposition mode action buttons
 *
 * Shows "Save as Variant" and "Fill edges with AI" buttons
 * when the user has repositioned an image.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { CheckCircle, Loader2, Move, Save } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';

interface RepositionButtonsProps {
  isMobile: boolean;
  hasTransformChanges: boolean;
  // Save as variant
  handleSaveAsVariant: () => void;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  // Generate reposition
  handleGenerateReposition: () => void;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
}

export const RepositionButtons: React.FC<RepositionButtonsProps> = ({
  isMobile,
  hasTransformChanges,
  handleSaveAsVariant,
  isSavingAsVariant,
  saveAsVariantSuccess,
  handleGenerateReposition,
  isGeneratingReposition,
  repositionGenerateSuccess,
}) => {
  const buttonSize = isMobile ? 'sm' : 'default';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className={cn("flex gap-2", isMobile && "flex-row")}>
      {/* Save as Variant Button */}
      <Button
        variant="secondary"
        size={buttonSize as 'sm' | 'default'}
        onClick={(e) => {
          e.stopPropagation();
          handleSaveAsVariant();
        }}
        disabled={
          !hasTransformChanges ||
          isSavingAsVariant ||
          saveAsVariantSuccess ||
          isGeneratingReposition ||
          repositionGenerateSuccess
        }
        className={cn(
          "flex-1",
          isMobile && "h-9 text-xs",
          saveAsVariantSuccess && "bg-green-600 hover:bg-green-600 text-white"
        )}
      >
        {isSavingAsVariant ? (
          <>
            <Loader2 className={`${iconSize} mr-1 animate-spin`} />
            {isMobile ? '...' : 'Saving...'}
          </>
        ) : saveAsVariantSuccess ? (
          <>
            <CheckCircle className={`${iconSize} mr-1`} />
            {isMobile ? 'Done' : 'Saved!'}
          </>
        ) : (
          <>
            <Save className={`${iconSize} mr-1`} />
            Save
          </>
        )}
      </Button>

      {/* Fill Edges with AI Button */}
      <Button
        variant="default"
        size={buttonSize as 'sm' | 'default'}
        onClick={(e) => {
          e.stopPropagation();
          handleGenerateReposition();
        }}
        disabled={
          !hasTransformChanges ||
          isGeneratingReposition ||
          repositionGenerateSuccess ||
          isSavingAsVariant ||
          saveAsVariantSuccess
        }
        className={cn(
          "flex-1",
          isMobile && "h-9 text-xs",
          repositionGenerateSuccess && "bg-green-600 hover:bg-green-600"
        )}
      >
        {isGeneratingReposition ? (
          <>
            <Loader2 className={`${iconSize} mr-1 animate-spin`} />
            {isMobile ? '...' : 'Generating...'}
          </>
        ) : repositionGenerateSuccess ? (
          <>
            <CheckCircle className={`${iconSize} mr-1`} />
            {isMobile ? 'Done' : 'Success!'}
          </>
        ) : (
          <>
            <Move className={`${iconSize} mr-1`} />
            {isMobile ? 'Fill AI' : 'Fill edges with AI'}
          </>
        )}
      </Button>
    </div>
  );
};
