export const fileToDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });

export const dataURLtoFile = (
  dataUrl: string,
  filename: string,
  fileType?: string
): File | null => {
  try {
    const [metadata, payload] = dataUrl.split(',');
    if (!metadata || !payload) {
      throw new Error('Invalid Data URL format');
    }

    const mimeMatch = metadata.match(/:(.*?);/);
    const mimeType =
      fileType ||
      (mimeMatch && mimeMatch[1]) ||
      'application/octet-stream';
    const decodedPayload = atob(payload);
    const bytes = new Uint8Array(decodedPayload.length);

    for (let i = 0; i < decodedPayload.length; i += 1) {
      bytes[i] = decodedPayload.charCodeAt(i);
    }

    return new File([bytes], filename, { type: mimeType });
  } catch {
    return null;
  }
};
