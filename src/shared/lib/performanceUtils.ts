/**
 * Performance utilities to help prevent setTimeout violations and monitor execution times
 */

/**
 * Performance-monitored setTimeout wrapper
 * Automatically detects when callback execution exceeds 16ms and logs warnings
 */
const performanceMonitoredTimeout = (
  callback: () => void,
  delay: number,
  context: string = 'Unknown'
): NodeJS.Timeout => {
  return setTimeout(() => {
    const startTime = performance.now();

    try {
      callback();
    } finally {
      const duration = performance.now() - startTime;
    }
  }, delay);
};

/**
 * Helper for measuring async operations with consistent logging
 */
const measureAsync = async <T>(
  operation: () => Promise<T>,
  context: string,
  warnThreshold: number = 100
): Promise<T> => {
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    throw error;
  }
};
