import React from 'react';
import { Resource } from '@/shared/hooks/useResources';
import { ResourceBrowserModalBase } from '@/features/resources/components/ResourceBrowserModalBase';

interface StyleReferenceBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onImageSelect?: (files: File[]) => void;
  onResourceSelect?: (resource: Resource) => void;
}

export const StyleReferenceBrowserModal: React.FC<StyleReferenceBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  onImageSelect,
  onResourceSelect,
}) => {
  return (
    <ResourceBrowserModalBase
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      resourceType="style-reference"
      title={title}
      onImageSelect={onImageSelect}
      onResourceSelect={onResourceSelect}
    />
  );
};
