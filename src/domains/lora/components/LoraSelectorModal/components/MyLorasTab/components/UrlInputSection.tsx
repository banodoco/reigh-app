import React from 'react';
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/primitives/label";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { FieldInfoTooltip } from './FieldInfoTooltip';

import { LoraFormState } from '../../../types';
import { validateHuggingFaceUrl } from '../../../utils/validation-utils';

interface UrlInputSectionProps {
  addForm: LoraFormState;
  handleFormChange: (field: string, value: string | boolean | number) => void;
  isMultiStageModel: boolean;
}

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({ addForm, handleFormChange, isMultiStageModel }) => {
  if (isMultiStageModel) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Label htmlFor="lora-high-noise-url">High Noise LoRA URL: *</Label>
              <FieldInfoTooltip>
                <p><strong>High Noise LoRA:</strong> Applied during early generation phases (high noise levels).</p>
                <p>This is typically the <code>high_noise_model.safetensors</code> file.</p>
              </FieldInfoTooltip>
            </div>
          </TooltipProvider>
          <Input
            id="lora-high-noise-url"
            placeholder="https://huggingface.co/.../high_noise_model.safetensors"
            value={addForm.high_noise_url}
            onChange={e => handleFormChange('high_noise_url', e.target.value)}
            className={!validateHuggingFaceUrl(addForm.high_noise_url).isValid && addForm.high_noise_url ? 'border-red-500' : ''}
          />
          {!validateHuggingFaceUrl(addForm.high_noise_url).isValid && addForm.high_noise_url && (
            <p className="text-xs text-red-600">
              {validateHuggingFaceUrl(addForm.high_noise_url).message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Label htmlFor="lora-low-noise-url">Low Noise LoRA URL: *</Label>
              <FieldInfoTooltip>
                <p><strong>Low Noise LoRA:</strong> Applied during the final generation phase (low noise level).</p>
                <p>This is typically the <code>low_noise_model.safetensors</code> file.</p>
              </FieldInfoTooltip>
            </div>
          </TooltipProvider>
          <Input
            id="lora-low-noise-url"
            placeholder="https://huggingface.co/.../low_noise_model.safetensors"
            value={addForm.low_noise_url}
            onChange={e => handleFormChange('low_noise_url', e.target.value)}
            className={!validateHuggingFaceUrl(addForm.low_noise_url).isValid && addForm.low_noise_url ? 'border-red-500' : ''}
          />
          {!validateHuggingFaceUrl(addForm.low_noise_url).isValid && addForm.low_noise_url && (
            <p className="text-xs text-red-600">
              {validateHuggingFaceUrl(addForm.low_noise_url).message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Label htmlFor="lora-url">HuggingFace Direct Download URL: *</Label>
          <FieldInfoTooltip>
            <p><strong>How to get the correct URL:</strong></p>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>Go to the HuggingFace model page</li>
              <li>Click on "Files" tab</li>
              <li>Find the .safetensors file you want</li>
              <li>Right-click the download button and copy link</li>
              <li>The URL should contain "/resolve/" and end with the filename</li>
            </ol>
          </FieldInfoTooltip>
        </div>
      </TooltipProvider>
      <Input
        id="lora-url"
        placeholder="https://huggingface.co/username/model/resolve/main/filename.safetensors"
        value={addForm.huggingface_url}
        onChange={e => handleFormChange('huggingface_url', e.target.value)}
        className={!validateHuggingFaceUrl(addForm.huggingface_url).isValid && addForm.huggingface_url ? 'border-red-500' : ''}
      />
      {!validateHuggingFaceUrl(addForm.huggingface_url).isValid && addForm.huggingface_url && (
        <p className="text-xs text-red-600">
          {validateHuggingFaceUrl(addForm.huggingface_url).message}
        </p>
      )}
    </div>
  );
};
