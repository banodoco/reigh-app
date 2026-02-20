import React from 'react';

import type { UploadTarget } from '../characterAnimate.types';

export const MediaContainerSkeleton: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted animate-pulse">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
  </div>
);

export const UploadingMediaState: React.FC<{ type: UploadTarget }> = ({ type }) => (
  <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3"></div>
    <p className="text-sm font-medium text-foreground">
      Uploading {type === 'image' ? 'image' : 'video'}...
    </p>
  </div>
);
