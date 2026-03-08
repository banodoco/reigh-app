import { Button } from '@/shared/components/ui/button';
import { SelectorModalFooterFrame } from '@/shared/components/modal/SelectorModalFooterFrame';

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
  const summary = showMyLorasOnly && showAddedLorasOnly
    ? `${filteredLoraCount} added`
    : showMyLorasOnly
      ? `${filteredLoraCount} yours`
      : showAddedLorasOnly
        ? `${filteredLoraCount} added`
        : `${filteredLoraCount} total`;

  return (
    <SelectorModalFooterFrame
      footerClass={footerClass}
      isMobile={isMobile}
      showFade={showFade}
      summary={summary}
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={onPageChange}
      onClose={onClose}
      controls={
        <>
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
        </>
      }
    />
  );
}
