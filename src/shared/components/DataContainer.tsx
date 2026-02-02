import React, { ReactNode, ReactElement } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface DataContainerProps<T> {
  /** Loading state - when true, shows skeleton */
  loading?: boolean;
  /** Error object - when present, shows error state */
  error?: Error | null;
  /** The data to render - passed to children render prop */
  data: T | undefined | null;
  /** Render function that receives the data when available */
  children: (data: T) => ReactNode;
  /** Custom skeleton component to show during loading */
  skeleton?: ReactNode;
  /** Custom error component. Receives error and optional retry function */
  errorComponent?: ReactNode | ((error: Error, retry?: () => void) => ReactNode);
  /** Custom empty state component */
  emptyComponent?: ReactNode;
  /** Function to retry the data fetch (shown in default error state) */
  onRetry?: () => void;
  /** Override isEmpty check - by default checks for null, undefined, empty array */
  isEmpty?: (data: T) => boolean;
  /** Class name for the container wrapper */
  className?: string;
  /** Minimum height for the container (useful for consistent skeleton sizing) */
  minHeight?: string | number;
}

// ============================================================================
// Default Components
// ============================================================================

function DefaultSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-4 bg-muted rounded w-1/2" />
      <div className="h-4 bg-muted rounded w-2/3" />
    </div>
  );
}

interface DefaultErrorProps {
  error: Error;
  onRetry?: () => void;
}

function DefaultError({ error, onRetry }: DefaultErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Something went wrong</p>
        <p className="text-xs text-muted-foreground max-w-[300px]">
          {error.message || 'An unexpected error occurred'}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

function DefaultEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-sm text-muted-foreground">No data available</p>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Default isEmpty check.
 * Returns true for null, undefined, empty arrays, and empty objects.
 */
function defaultIsEmpty<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  // Don't treat empty objects as empty by default - that's often valid state
  return false;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Container that handles loading, error, empty, and data states consistently.
 *
 * @example
 * ```tsx
 * // Basic usage with React Query
 * const { data, isLoading, error, refetch } = useQuery(...);
 *
 * <DataContainer
 *   loading={isLoading}
 *   error={error}
 *   data={data}
 *   onRetry={refetch}
 * >
 *   {(items) => (
 *     <ul>
 *       {items.map(item => <li key={item.id}>{item.name}</li>)}
 *     </ul>
 *   )}
 * </DataContainer>
 * ```
 *
 * @example
 * ```tsx
 * // With custom components
 * <DataContainer
 *   loading={isLoading}
 *   error={error}
 *   data={users}
 *   skeleton={<UserListSkeleton />}
 *   emptyComponent={<p>No users found. Create one!</p>}
 *   errorComponent={(err) => <CustomError message={err.message} />}
 * >
 *   {(users) => <UserList users={users} />}
 * </DataContainer>
 * ```
 */
export function DataContainer<T>({
  loading = false,
  error,
  data,
  children,
  skeleton,
  errorComponent,
  emptyComponent,
  onRetry,
  isEmpty = defaultIsEmpty,
  className,
  minHeight,
}: DataContainerProps<T>): ReactElement | null {
  const style = minHeight ? { minHeight } : undefined;

  // Loading state
  if (loading) {
    return (
      <div className={cn('data-container-loading', className)} style={style}>
        {skeleton ?? <DefaultSkeleton />}
      </div>
    );
  }

  // Error state
  if (error) {
    const errorContent =
      typeof errorComponent === 'function'
        ? errorComponent(error, onRetry)
        : errorComponent ?? <DefaultError error={error} onRetry={onRetry} />;

    return (
      <div className={cn('data-container-error', className)} style={style}>
        {errorContent}
      </div>
    );
  }

  // Empty state (data is null/undefined/empty)
  if (data === null || data === undefined || isEmpty(data)) {
    return (
      <div className={cn('data-container-empty', className)} style={style}>
        {emptyComponent ?? <DefaultEmpty />}
      </div>
    );
  }

  // Data state - render children with data
  return <>{children(data)}</>;
}

// ============================================================================
// Skeleton Helpers
// ============================================================================

interface SkeletonLinesProps {
  /** Number of skeleton lines to render */
  lines?: number;
  /** Class name for each line */
  lineClassName?: string;
  /** Class name for the container */
  className?: string;
}

/**
 * Simple skeleton with animated lines.
 */
export function SkeletonLines({
  lines = 3,
  lineClassName,
  className,
}: SkeletonLinesProps) {
  // Varying widths for visual interest
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-full', 'w-5/6'];

  return (
    <div className={cn('animate-pulse space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn('h-4 bg-muted rounded', widths[i % widths.length], lineClassName)}
        />
      ))}
    </div>
  );
}

interface SkeletonGridProps {
  /** Number of skeleton items */
  count?: number;
  /** Number of columns */
  columns?: number;
  /** Class name for each item */
  itemClassName?: string;
  /** Class name for the grid container */
  className?: string;
}

/**
 * Grid of skeleton cards/items.
 */
export function SkeletonGrid({
  count = 6,
  columns = 3,
  itemClassName,
  className,
}: SkeletonGridProps) {
  return (
    <div
      className={cn('animate-pulse grid gap-4', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn('aspect-video bg-muted rounded', itemClassName)}
        />
      ))}
    </div>
  );
}
