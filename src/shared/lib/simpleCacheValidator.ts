/**
 * Simple Cache Validator - Console Testing Tool
 *
 * Run this in browser console to test cache cleanup:
 * ```
 * // Test current cache state
 * validateImageCache()
 *
 * // Start real-time monitoring
 * startCacheWatch()
 * ```
 */

import { handleError } from '@/shared/lib/errorHandler';

// Make available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown).validateImageCache = () => {
    console.group('🗂️ Image Cache Validation');
    
    try {
      // Simple approach: look at what's actually in the browser
      const generationImages = document.querySelectorAll('img[src*="supabase.co/storage"]');
      const generationVideos = document.querySelectorAll('video[src*="supabase.co/storage"]');
      
      console.log('📊 Current Media State:', {
        visibleImages: generationImages.length,
        visibleVideos: generationVideos.length,
        totalVisibleMedia: generationImages.length + generationVideos.length,
        timestamp: new Date().toISOString()
      });
      
      // Look for pagination indicators
      const paginationText = document.querySelector('[class*="text-sm"][class*="muted-foreground"]')?.textContent;
      const pageMatch = paginationText?.match(/(\d+)-(\d+) of (\d+)/);
      
      if (pageMatch) {
        const [, start, end, total] = pageMatch;
        const currentPage = Math.ceil(parseInt(start) / 25); // Assuming 25 items per page
        console.log('📄 Current Page Info:', {
          currentPage,
          itemRange: `${start}-${end}`,
          totalItems: total,
          estimatedTotalPages: Math.ceil(parseInt(total) / 25)
        });
      } else {
        console.log('📄 Could not detect current page from UI');
      }
      
      // Check for browser cache information
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        navigator.storage.estimate().then(estimate => {
          console.log('💾 Browser Storage Info:', {
            usageInMB: Math.round((estimate.usage || 0) / 1024 / 1024),
            quotaInMB: Math.round((estimate.quota || 0) / 1024 / 1024),
            usagePercent: Math.round(((estimate.usage || 0) / (estimate.quota || 1)) * 100)
          });
        });
      }
      
      console.log('To see detailed cache logs:');
      console.log('   1. Navigate between pages (1 -> 2 -> 5 -> 3)');
      console.log('   2. Watch console for [CacheValidator] messages');
      console.log('   3. Look for "Current cache: pages [X, Y, Z]" logs');

    } catch (error) {
      handleError(error, { context: 'SimpleCacheValidator', showToast: false });
    }
    
    console.groupEnd();
  };
  
  (window as unknown).startCacheWatch = () => {
    let lastMediaCount = 0;
    
    const monitor = () => {
      try {
        const images = document.querySelectorAll('img[src*="supabase.co/storage"]');
        const videos = document.querySelectorAll('video[src*="supabase.co/storage"]');
        const currentMediaCount = images.length + videos.length;
        
        if (currentMediaCount !== lastMediaCount) {
          lastMediaCount = currentMediaCount;
        }
      } catch (e) {
        // Silent fail
      }
    };
    
    const intervalId = setInterval(monitor, 1000);
    console.log('🔍 Cache monitoring started (every 1s)');
    console.log('📱 Navigate between pages to see cache behavior');
    console.log('⏹️ Run stopCacheWatch() to stop monitoring');
    
    (window as unknown).stopCacheWatch = () => {
      clearInterval(intervalId);
      console.log('⏹️ Cache monitoring stopped');
    };
  };
  
  (window as unknown).showCacheStats = () => {
    const images = document.querySelectorAll('img[src*="supabase.co/storage"]');
    const videos = document.querySelectorAll('video[src*="supabase.co/storage"]');
    
    console.log('📊 Quick Cache Stats:', {
      visibleImages: images.length,
      visibleVideos: videos.length,
      totalVisibleMedia: images.length + videos.length,
      timestamp: new Date().toISOString()
    });
  };
  
  // Also add a helpful function to show what to look for
  (window as unknown).showCacheHelp = () => {
    console.group('🔍 Cache Validation Help');
    console.log('The cache cleanup happens automatically. To validate it:');
    console.log('');
    console.log('1️⃣ Navigate between pages (especially jumping far like 1→5→2)');
    console.log('2️⃣ Watch for these console messages:');
    console.log('   🗂️ [CacheValidator] Current cache: pages [4, 5, 6] around page 5');
    console.log('   🧹 [CacheValidator] Cleaned up distant pages: [1, 2]');
    console.log('');
    console.log('3️⃣ Expected behavior:');
    console.log('   • Conservative: max 3 pages cached (current ± 1)');
    console.log('   • Moderate: max 5 pages cached (current ± 2)');
    console.log('   • Aggressive: max 7 pages cached (current ± 3)');
    console.log('');
    console.log('4️⃣ Run validateImageCache() to check current state');
    console.groupEnd();
  };
}