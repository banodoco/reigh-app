export function validateHuggingFaceUrl(url: string): { isValid: boolean; message: string } {
  if (!url) return { isValid: false, message: 'URL is required' };

  if (url.startsWith('blob:')) {
    return {
      isValid: false,
      message: 'This is a blob URL (a temporary browser link). Use the direct /resolve/ download URL from HuggingFace instead.'
    };
  }

  // HuggingFace /blob/ URLs are view pages, not direct downloads — need /resolve/
  if (url.includes('huggingface.co') && url.includes('/blob/')) {
    return {
      isValid: false,
      message: 'This is a HuggingFace page link. Replace /blob/ with /resolve/ in the URL to get the direct download link.'
    };
  }

  // Check if it's a /resolve/ URL
  if (!url.includes('/resolve/')) {
    return {
      isValid: false,
      message: 'Must be a /resolve/ URL for direct download'
    };
  }

  // Check if it's a HuggingFace URL
  if (!url.includes('huggingface.co')) {
    return {
      isValid: false,
      message: 'Must be a HuggingFace URL'
    };
  }

  return { isValid: true, message: '' };
}

function extractFilenameFromUrl(url: string): string {
  try {
    // Extract filename from /resolve/ URL
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1];
    return filename || '';
  } catch {
    return '';
  }
}

export function generateUniqueLoraFilename(
  name: string,
  baseModel: string,
  huggingfaceUrl: string = '',
  existingFilenames: string[] = []
): string {
  // First try to get filename from HuggingFace URL
  let filename = extractFilenameFromUrl(huggingfaceUrl);

  // If filename is generic, too short, or missing, make it specific
  const genericNames = ['model.safetensors', 'lora.safetensors', 'pytorch_lora_weights.safetensors'];
  const isGeneric = genericNames.includes(filename.toLowerCase()) || filename.length < 8;

  if (!filename || isGeneric) {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const cleanBaseModel = baseModel.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const extension = filename.includes('.') ? filename.split('.').pop() : 'safetensors';
    filename = `${cleanName}_${cleanBaseModel}.${extension}`;
  }

  // Ensure filename is unique by adding suffix if needed
  let uniqueFilename = filename;
  let counter = 1;
  while (existingFilenames.includes(uniqueFilename)) {
    const baseName = filename.substring(0, filename.lastIndexOf('.'));
    const extension = filename.substring(filename.lastIndexOf('.'));
    uniqueFilename = `${baseName}_${counter}${extension}`;
    counter++;
  }

  return uniqueFilename;
}
