/**
 * ImageUpscaleForm Component (displayed as "Enhance")
 *
 * Form for image enhancement with configurable upscale factor and noise scale.
 * Follows the same pattern as inpainting: button shows loading, then success briefly.
 */

import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { ArrowUp, Loader2, Check } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';

export interface ImageUpscaleSettings {
  scaleFactor: number;
  noiseScale: number;
}

interface ImageUpscaleFormProps {
  onUpscale: (settings: ImageUpscaleSettings) => Promise<void>;
  isUpscaling: boolean;
  upscaleSuccess: boolean;
  variant?: 'desktop' | 'mobile';
}

export const ImageUpscaleForm: React.FC<ImageUpscaleFormProps> = ({
  onUpscale,
  isUpscaling,
  upscaleSuccess,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';

  // Settings state
  const [scaleFactor, setScaleFactor] = useState(2);
  const [noiseScale, setNoiseScale] = useState(0.1);

  // Noise scale options for dropdown (0 to 1 in 0.1 increments)
  const noiseScaleOptions = [
    { value: '0', label: '0' },
    { value: '0.1', label: '0.1' },
    { value: '0.2', label: '0.2' },
    { value: '0.3', label: '0.3' },
    { value: '0.4', label: '0.4' },
    { value: '0.5', label: '0.5' },
    { value: '0.6', label: '0.6' },
    { value: '0.7', label: '0.7' },
    { value: '0.8', label: '0.8' },
    { value: '0.9', label: '0.9' },
    { value: '1', label: '1' },
  ];

  const handleUpscale = () => {
    onUpscale({ scaleFactor, noiseScale });
  };

  return (
    <div className={cn("flex flex-col gap-4", isMobile ? "px-3 py-2" : "p-4")}>
      {/* Info section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowUp className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Enhance Resolution</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Increase image resolution using AI upscaling. Creates a new high-resolution variant.
        </p>
      </div>

      {/* Settings row: Upscale Factor Slider + Noise Dropdown */}
      <div className="flex gap-4 items-start">
        {/* Upscale Factor Slider */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Upscale Factor</Label>
            <span className="text-sm text-muted-foreground font-mono">
              {scaleFactor}x
            </span>
          </div>
          <Slider
            value={scaleFactor}
            onValueChange={(value) => setScaleFactor(Array.isArray(value) ? (value[0] ?? 1) : value)}
            min={1}
            max={4}
            step={0.5}
            className="w-full"
          />
        </div>

        {/* Noise Scale Dropdown */}
        <div className="w-28 space-y-2">
          <Label className="text-sm">Denoise</Label>
          <Select
            value={String(noiseScale)}
            onValueChange={(value) => {
              if (!value) return;
              setNoiseScale(parseFloat(value));
            }}
          >
            <SelectTrigger className="w-full h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {noiseScaleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Enhance Button */}
      <Button
        onClick={handleUpscale}
        disabled={isUpscaling || upscaleSuccess}
        className={cn(
          "w-full",
          upscaleSuccess && "bg-green-600 hover:bg-green-600"
        )}
        size={isMobile ? 'default' : 'lg'}
      >
        {isUpscaling ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating task...
          </>
        ) : upscaleSuccess ? (
          <>
            <Check className="mr-2 h-4 w-4" />
            Task Created
          </>
        ) : (
          <>
            <ArrowUp className="mr-2 h-4 w-4" />
            Enhance Image
          </>
        )}
      </Button>
    </div>
  );
};
