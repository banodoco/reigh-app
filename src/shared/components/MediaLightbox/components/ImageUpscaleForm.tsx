/**
 * ImageUpscaleForm Component
 *
 * Simple form for image upscaling with a button to trigger the upscale task.
 * Shows when image hasn't been upscaled yet, or shows "already upscaled" state.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { ArrowUp, Loader2, Check, Clock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface ImageUpscaleFormProps {
  onUpscale: () => Promise<void>;
  isUpscaling: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  variant?: 'desktop' | 'mobile';
}

export const ImageUpscaleForm: React.FC<ImageUpscaleFormProps> = ({
  onUpscale,
  isUpscaling,
  isPendingUpscale,
  hasUpscaledVersion,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';

  // Already upscaled
  if (hasUpscaledVersion) {
    return (
      <div className={cn("flex flex-col gap-4", isMobile ? "px-3 py-2" : "p-4")}>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-400">Already Upscaled</p>
            <p className="text-sm text-muted-foreground">
              This image has been upscaled to higher resolution.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pending upscale
  if (isPendingUpscale) {
    return (
      <div className={cn("flex flex-col gap-4", isMobile ? "px-3 py-2" : "p-4")}>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 animate-pulse" />
          <div>
            <p className="font-medium text-amber-400">Upscale in Progress</p>
            <p className="text-sm text-muted-foreground">
              Your image is being upscaled. This may take a moment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", isMobile ? "px-3 py-2" : "p-4")}>
      {/* Info section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowUp className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Upscale Resolution</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Increase image resolution using AI upscaling (2x). Creates a new high-resolution variant.
        </p>
      </div>

      {/* Upscale Button */}
      <Button
        onClick={onUpscale}
        disabled={isUpscaling}
        className="w-full"
        size={isMobile ? 'default' : 'lg'}
      >
        {isUpscaling ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating task...
          </>
        ) : (
          <>
            <ArrowUp className="mr-2 h-4 w-4" />
            Upscale Image
          </>
        )}
      </Button>
    </div>
  );
};
