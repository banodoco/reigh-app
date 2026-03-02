import { useState, useEffect, useMemo } from 'react';
import { calculateGalleryLayout } from '@/shared/components/MediaGallery/utils';

interface UseVideoLayoutConfigOptions {
  /** Project aspect ratio (e.g., "16:9", "9:16") */
  projectAspectRatio: string | undefined;
  /** Whether the device is mobile */
  isMobile: boolean;
}

interface UseVideoLayoutConfigResult {
  /** Number of columns in the video grid */
  columns: number;
  /** Number of items per page */
  itemsPerPage: number;
}

/**
 * Calculates video gallery layout configuration based on window size and aspect ratio.
 *
 * Uses fixed 3 columns for desktop (videos are larger than images) and 2 for mobile,
 * with 3 rows, giving 9 or 6 items per page respectively.
 */
export function useVideoLayoutConfig({
  projectAspectRatio,
  isMobile,
}: UseVideoLayoutConfigOptions): UseVideoLayoutConfigResult {
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const videoLayoutConfig = useMemo(() => {
    // Use the same layout calculation as MediaGallery for reference
    calculateGalleryLayout(projectAspectRatio, isMobile, windowWidth * 0.95, undefined, false);

    // For videos: use fixed 3 columns (videos are larger than images)
    // Mobile gets 2 columns
    const videoColumns = isMobile ? 2 : 3;

    // For videos: use 3 rows
    const videoRows = 3;

    const itemsPerPage = videoColumns * videoRows;

    return { columns: videoColumns, itemsPerPage };
  }, [projectAspectRatio, isMobile, windowWidth]);

  return videoLayoutConfig;
}
