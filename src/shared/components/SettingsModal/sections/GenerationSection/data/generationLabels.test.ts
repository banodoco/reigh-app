import { describe, expect, it } from 'vitest';
import {
  COMPUTER_LABELS,
  GPU_LABELS,
  MEMORY_LABELS,
  SHELL_LABELS,
} from './generationLabels';

describe('generationLabels', () => {
  it('defines computer and gpu label maps with expected canonical entries', () => {
    expect(COMPUTER_LABELS).toEqual({
      linux: 'Linux',
      windows: 'Windows',
      mac: 'Mac',
    });

    expect(GPU_LABELS).toEqual({
      'nvidia-30-40': 'NVIDIA <=40 series',
      'nvidia-50': 'NVIDIA 50 series',
      'non-nvidia': 'Non-NVIDIA',
    });
  });

  it('defines memory and shell display labels', () => {
    expect(MEMORY_LABELS).toEqual({
      '1': 'Max Performance',
      '2': 'High RAM',
      '3': 'Balanced',
      '4': 'Conservative',
      '5': 'Minimum',
    });

    expect(SHELL_LABELS).toEqual({
      cmd: 'Command Prompt',
      powershell: 'PowerShell',
    });
  });
});
