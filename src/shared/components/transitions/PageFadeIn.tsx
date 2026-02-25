import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';

export const PageFadeIn: React.FC<React.PropsWithChildren<{className?: string}>> = ({ children, className }) => (
  <div className={cn('animate-in fade-in duration-300 ease-out', className)}>
    {children}
  </div>
); 