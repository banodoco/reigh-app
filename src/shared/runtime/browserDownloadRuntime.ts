interface TriggerBrowserDownloadOptions {
  target?: '_self' | '_blank';
}

export function triggerBrowserDownload(
  url: string,
  filename: string,
  options: TriggerBrowserDownloadOptions = {},
): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  if (options.target) {
    link.target = options.target;
  }

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadBlobAsFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerBrowserDownload(objectUrl, filename);
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
}
