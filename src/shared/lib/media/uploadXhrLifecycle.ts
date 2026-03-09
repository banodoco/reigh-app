interface UploadXhrLifecycle {
  stallCheckInterval: ReturnType<typeof setInterval> | null;
  overallTimeout: ReturnType<typeof setTimeout> | null;
  cleanup: () => void;
  markProgress: () => void;
  millisecondsSinceProgress: () => number;
}

export function createUploadXhrLifecycle(): UploadXhrLifecycle {
  let lastProgressTime = Date.now();

  const lifecycle: UploadXhrLifecycle = {
    stallCheckInterval: null,
    overallTimeout: null,
    cleanup: () => {
      if (lifecycle.stallCheckInterval) {
        clearInterval(lifecycle.stallCheckInterval);
      }
      if (lifecycle.overallTimeout) {
        clearTimeout(lifecycle.overallTimeout);
      }
    },
    markProgress: () => {
      lastProgressTime = Date.now();
    },
    millisecondsSinceProgress: () => Date.now() - lastProgressTime,
  };

  return lifecycle;
}

export function attachUploadProgressListener(
  xhr: XMLHttpRequest,
  onProgress: ((progress: number) => void) | undefined,
  markProgress: () => void,
): void {
  xhr.upload.addEventListener('progress', (event) => {
    markProgress();
    if (event.lengthComputable) {
      const percentComplete = Math.round((event.loaded / event.total) * 100);
      onProgress?.(percentComplete);
    }
  });
}
