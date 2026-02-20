import React from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { safeAreaCalc } from '@/shared/lib/safeArea';

interface MobileBottomBarProps {
  isServerPagination: boolean;
  serverPage: number | undefined;
  page: number;
  totalPages: number;
  loadingButton: 'prev' | 'next' | null;
  onPageChange: (page: number, direction: 'prev' | 'next', scrollToTop: boolean) => void;
  hideTopFilters: boolean;
  showStarredOnly: boolean;
  onToggleStarred: () => void;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  isServerPagination,
  serverPage,
  page,
  totalPages,
  loadingButton,
  onPageChange,
  hideTopFilters,
  showStarredOnly,
  onToggleStarred,
}) => {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t px-4 py-3"
      style={{ paddingBottom: safeAreaCalc.paddingBottom('12px') }}
    >
      <div className="flex justify-between items-center">
        {/* Pagination controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newPage = isServerPagination
                ? Math.max(1, (serverPage ?? 1) - 1)
                : Math.max(0, page - 1);
              onPageChange(newPage, 'prev', false);
            }}
            disabled={loadingButton !== null || (isServerPagination ? serverPage === 1 : page === 0)}
            className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingButton === 'prev' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          <div className="flex items-center gap-1">
            <Select
              value={(isServerPagination ? serverPage : page + 1)?.toString()}
              onValueChange={(value) => {
                if (!value) return;
                const newPage = isServerPagination ? parseInt(value) : parseInt(value) - 1;
                const currentPage = isServerPagination ? serverPage ?? 1 : page;
                const direction = newPage > currentPage ? 'next' : 'prev';
                onPageChange(newPage, direction, false);
              }}
              disabled={loadingButton !== null}
            >
              <SelectTrigger variant="retro" size="sm" className="h-6 w-9 text-xs px-1 !justify-center [&>span]:!text-center" hideIcon>
                <SelectValue />
              </SelectTrigger>
              <SelectContent variant="retro" className="!min-w-0 w-11 text-xs">
                {Array.from({ length: totalPages }, (_, i) => (
                  <SelectItem variant="retro" key={i + 1} value={(i + 1).toString()} className="text-xs !px-0 !justify-center [&>span]:!text-center [&>span]:!w-full">
                    {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-1">
              of {totalPages}
            </span>
          </div>

          <button
            onClick={() => {
              const newPage = isServerPagination
                ? (serverPage ?? 1) + 1
                : Math.min(totalPages - 1, page + 1);
              onPageChange(newPage, 'next', false);
            }}
            disabled={loadingButton !== null || (isServerPagination ? (serverPage ?? 1) >= totalPages : page >= totalPages - 1)}
            className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingButton === 'next' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Star filter */}
        {!hideTopFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleStarred}
            aria-label={showStarredOnly ? "Show all items" : "Show only starred items"}
          >
            <Star className="h-5 w-5" fill={showStarredOnly ? 'currentColor' : 'none'} />
          </Button>
        )}
      </div>
    </div>
  );
};
