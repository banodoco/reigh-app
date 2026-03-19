import { ModelFilterCategory } from '../types';

function normalizeLoraType(loraType: unknown): string | undefined {
  return typeof loraType === 'string' ? loraType.trim() : undefined;
}

// Map a specific lora_type to its broad filter category
export function getFilterCategory(loraType: unknown): ModelFilterCategory {
  const normalized = normalizeLoraType(loraType);
  if (!normalized) return 'all';
  const lower = normalized.toLowerCase();
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('wan')) return 'wan';
  if (lower.includes('ltx')) return 'ltx';
  if (lower.includes('z-image') || lower === 'z-image') return 'z-image';
  return 'all';
}

export function getDefaultSubFilter(loraType: unknown): string {
  const normalized = normalizeLoraType(loraType);
  if (!normalized) return 'all';
  // If the passed lora_type matches a sub-filter option, default to it.
  const qwenOptions = getSubFilterOptions('qwen').map(opt => opt.value);
  const wanOptions = getSubFilterOptions('wan').map(opt => opt.value);
  const ltxOptions = getSubFilterOptions('ltx').map(opt => opt.value);
  const zImageOptions = getSubFilterOptions('z-image').map(opt => opt.value);
  if (qwenOptions.includes(normalized)) return normalized;
  if (wanOptions.includes(normalized)) return normalized;
  if (ltxOptions.includes(normalized)) return normalized;
  if (zImageOptions.includes(normalized)) return normalized;
  return 'all';
}

// Check if a lora matches a filter category
function matchesFilterCategory(loraType: unknown, filter: ModelFilterCategory): boolean {
  if (filter === 'all') return true;
  const normalized = normalizeLoraType(loraType);
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  switch (filter) {
    case 'qwen': return lower.includes('qwen');
    case 'wan': return lower.includes('wan');
    case 'ltx': return lower.includes('ltx');
    case 'z-image': return lower.includes('z-image') || lower === 'z-image';
    default: return true;
  }
}

// Get sub-filter options for a category
export function getSubFilterOptions(category: ModelFilterCategory): { value: string; label: string }[] {
  switch (category) {
    case 'qwen':
      return [
        { value: 'all', label: 'All' },
        { value: 'Qwen Image', label: 'Qwen Image' },
        { value: 'Qwen Image 2512', label: 'Qwen Image 2512' },
        { value: 'Qwen Edit', label: 'Qwen Edit' },
      ];
    case 'wan':
      return [
        { value: 'all', label: 'All' },
        { value: 'Wan 2.1 T2V 14B', label: 'Wan 2.1 T2V 14B' },
        { value: 'Wan 2.1 I2V 14B', label: 'Wan 2.1 I2V 14B' },
        { value: 'Wan 2.1 1.3B', label: 'Wan 2.1 1.3B' },
        { value: 'Wan 2.2 T2V', label: 'Wan 2.2 T2V' },
        { value: 'Wan 2.2 I2V', label: 'Wan 2.2 I2V' },
        { value: 'Wan 2.1 14b', label: 'Wan 2.1 (Legacy)' },
      ];
    case 'ltx':
      return [
        { value: 'all', label: 'All' },
        { value: 'LTX 2.3', label: 'LTX 2.3' },
      ];
    case 'z-image':
      return [
        { value: 'all', label: 'All' },
        { value: 'Z-Image', label: 'Z-Image' },
      ];
    default:
      return [];
  }
}

// Check if a lora matches both category and sub-filter
export function matchesFilters(loraType: unknown, category: ModelFilterCategory, subFilter: string): boolean {
  // First check category
  if (!matchesFilterCategory(loraType, category)) return false;
  // Then check sub-filter (if not 'all')
  if (subFilter === 'all') return true;
  return normalizeLoraType(loraType) === subFilter;
}
