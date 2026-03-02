import React from 'react';
import { Resource } from '@/shared/hooks/useResources';
import { ResourceBrowserModalBase } from '@/features/resources/components/ResourceBrowserModalBase';

interface StructureVideoBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onResourceSelect?: (resource: Resource) => void;
}

export const StructureVideoBrowserModal: React.FC<StructureVideoBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  onResourceSelect,
}) => {
  return (
    <ResourceBrowserModalBase
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      resourceType="structure-video"
      title={title}
      onResourceSelect={onResourceSelect}
    />
  );
};
