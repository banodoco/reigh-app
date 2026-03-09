import type { ChangeEventHandler, ComponentType, ReactNode } from 'react';
import { Upload } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';

interface EditMediaSelectionLayoutProps {
  isMobile: boolean;
  isDraggingOver: boolean;
  isUploading: boolean;
  dropIcon: ComponentType<{ className?: string }>;
  dropLabel: string;
  uploadLabel: string;
  uploadingLabel: string;
  mobileHint: string;
  desktopHint: string;
  accept: string;
  onFileUpload: ChangeEventHandler<HTMLInputElement>;
  rightPanel: ReactNode;
}

export function EditMediaSelectionLayout({
  isMobile,
  isDraggingOver,
  isUploading,
  dropIcon: DropIcon,
  dropLabel,
  uploadLabel,
  uploadingLabel,
  mobileHint,
  desktopHint,
  accept,
  onFileUpload,
  rightPanel,
}: EditMediaSelectionLayoutProps) {
  return (
    <div className="w-full px-4 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row rounded-2xl overflow-hidden" style={{ height: isMobile ? '60vh' : '65vh' }}>
          <div className="relative flex items-center justify-center bg-black w-full h-[30%] md:w-[60%] md:h-full md:flex-1">
            {isDraggingOver && (
              <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-primary bg-primary/10">
                  <DropIcon className="w-16 h-16 text-primary animate-bounce" />
                  <p className="text-xl font-medium text-primary">{dropLabel}</p>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 p-8">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-lg font-medium text-white">{uploadingLabel}</p>
                </div>
              </div>
            )}

            {!isUploading && !isDraggingOver && (
              <div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 p-6 md:p-8 flex flex-col items-center justify-center gap-y-4 md:gap-y-6 max-w-md mx-4">
                <div className="text-center space-y-1 md:space-y-2">
                  <p className="text-muted-foreground text-xs md:hidden">{mobileHint}</p>
                  <p className="text-muted-foreground text-base hidden md:block">{desktopHint}</p>
                </div>

                <div className="relative w-full max-w-xs">
                  <input
                    type="file"
                    accept={accept}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={onFileUpload}
                    disabled={isUploading}
                  />
                  <Button variant="outline" size="lg" className="w-full gap-2" disabled={isUploading}>
                    <Upload className="w-4 h-4" />
                    {uploadLabel}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div
            className={cn(
              'bg-background border-t md:border-t-0 md:border-l border-border overflow-hidden relative z-[60] flex flex-col w-full h-[70%] md:w-[40%] md:h-full'
            )}
          >
            {rightPanel}
          </div>
        </div>
      </div>
    </div>
  );
}
