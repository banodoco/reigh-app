import React from 'react';
import { Resource } from '@/shared/hooks/useResources';
import { StyleReferenceBrowserModal } from '@/features/resources/components/StyleReferenceBrowserModal';
import { StructureVideoBrowserModal } from '@/features/resources/components/StructureVideoBrowserModal';

interface DatasetBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType?: 'style-reference' | 'structure-video';
  title?: string;
  onImageSelect?: (files: File[]) => void;
  onResourceSelect?: (resource: Resource) => void;
}

export const DatasetBrowserModal: React.FC<DatasetBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  resourceType = 'style-reference',
  title,
  onImageSelect,
  onResourceSelect,
}) => {
  if (resourceType === 'structure-video') {
    return (
      <StructureVideoBrowserModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        title={title}
        onResourceSelect={onResourceSelect}
      />
    );
  }

  return (
    <StyleReferenceBrowserModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      onImageSelect={onImageSelect}
      onResourceSelect={onResourceSelect}
    />
  );
};
