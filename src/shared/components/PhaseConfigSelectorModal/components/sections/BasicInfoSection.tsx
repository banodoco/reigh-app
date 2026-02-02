import React from 'react';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';

interface BasicInfoSectionProps {
  name: string;
  description: string;
  createdByIsYou: boolean;
  createdByUsername: string;
  isPublic: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCreatedByIsYouChange: (value: boolean) => void;
  onCreatedByUsernameChange: (value: string) => void;
  onIsPublicChange: (value: boolean) => void;
}

export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  name,
  description,
  createdByIsYou,
  createdByUsername,
  isPublic,
  onNameChange,
  onDescriptionChange,
  onCreatedByIsYouChange,
  onCreatedByUsernameChange,
  onIsPublicChange,
}) => {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="preset-name">Name: *</Label>
        <Input
          id="preset-name"
          placeholder="My Custom Phase Config"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          maxLength={50}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="preset-description">Description: (optional)</Label>
        <Textarea
          id="preset-description"
          placeholder="Describe what this preset does and when to use it..."
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          rows={3}
          clearable
          onClear={() => onDescriptionChange('')}
          voiceInput
          voiceContext="This is a description for a video preset. Describe what this preset does and when to use it - the style, effect, or purpose."
          onVoiceResult={(result) => {
            onDescriptionChange(result.prompt || result.transcription);
          }}
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="created-by-you"
            checked={createdByIsYou}
            onCheckedChange={(checked) => onCreatedByIsYouChange(checked === true)}
          />
          <Label htmlFor="created-by-you" className="font-normal text-sm">This is my creation</Label>
        </div>
        {!createdByIsYou && (
          <Input
            placeholder="Creator's username"
            value={createdByUsername}
            onChange={e => onCreatedByUsernameChange(e.target.value)}
            maxLength={30}
            className="w-40"
          />
        )}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is-public"
            checked={isPublic}
            onCheckedChange={(checked) => onIsPublicChange(checked === true)}
          />
          <Label htmlFor="is-public" className="font-normal text-sm">Available to others</Label>
        </div>
      </div>
    </>
  );
};
