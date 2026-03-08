import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface LoraSelectorFooterProps {
  footerClass: string;
  isMobile: boolean;
  showFade: boolean;
  showAddedLorasOnly: boolean;
  setShowAddedLorasOnly: (value: boolean) => void;
  showMyLorasOnly: boolean;
  setShowMyLorasOnly: (value: boolean) => void;
  filteredLoraCount: number;
  currentPage: number;
  totalPages: number;
  onPageChange: ((page: number) => void) | null;
  onClose: () => void;
}

export function LoraSelectorFooter({
  footerClass,
  isMobile,
  showFade,
  showAddedLorasOnly,
  setShowAddedLorasOnly,
  showMyLorasOnly,
  setShowMyLorasOnly,
  filteredLoraCount,
  currentPage,
  totalPages,
  onPageChange,
  onClose,
}: LoraSelectorFooterProps) {
  return (
    <div className={`${footerClass} relative`}>
      {showFade && (
        <div
          className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{ transform: 'translateY(-64px)' }}
        >
          <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
        </div>
      )}

      <div className={`${isMobile ? 'p-4 pt-4 pb-1' : 'p-6 pt-6 pb-2'} border-t relative z-20`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
            <Button
              variant={showAddedLorasOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAddedLorasOnly(!showAddedLorasOnly)}
              className="flex items-center gap-2"
            >
              <span
                className={`h-4 w-4 rounded-sm border flex items-center justify-center ${
                  showAddedLorasOnly ? 'bg-primary border-primary' : 'border-input'
                }`}
              >
                {showAddedLorasOnly && (
                  <span className="text-xs text-primary-foreground">✓</span>
                )}
              </span>
              <span className="hidden sm:inline">Show selected LoRAs</span>
              <span className="sm:hidden">Selected</span>
            </Button>

            <Button
              variant={showMyLorasOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowMyLorasOnly(!showMyLorasOnly)}
              className="flex items-center gap-2"
            >
              <span
                className={`h-4 w-4 rounded-sm border flex items-center justify-center ${
                  showMyLorasOnly ? 'bg-primary border-primary' : 'border-input'
                }`}
              >
                {showMyLorasOnly && (
                  <span className="text-xs text-primary-foreground">✓</span>
                )}
              </span>
              <span className="hidden sm:inline">Show my LoRAs</span>
              <span className="sm:hidden">My LoRAs</span>
            </Button>

            <span className="text-sm text-muted-foreground text-center flex-1 sm:flex-none">
              {showMyLorasOnly && showAddedLorasOnly ? (
                <>{filteredLoraCount} added</>
              ) : showMyLorasOnly ? (
                <>{filteredLoraCount} yours</>
              ) : showAddedLorasOnly ? (
                <>{filteredLoraCount} added</>
              ) : (
                <>{filteredLoraCount} total</>
              )}
            </span>

            {totalPages > 1 && onPageChange && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage === 0}
                  className="h-8 w-8 p-0"
                >
                  ←
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {currentPage + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="h-8 w-8 p-0"
                >
                  →
                </Button>
              </div>
            )}

            <Button
              variant="retro"
              size="retro-sm"
              onClick={onClose}
              className={`flex items-center gap-1.5 ${isMobile ? 'w-full mt-2' : 'ml-auto'}`}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
