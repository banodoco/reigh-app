import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function parseTypeExports(source: string): string[] {
  const matches = source.matchAll(/export type\s*\{([^}]+)\}\s*from/gm);
  const names: string[] = [];

  for (const match of matches) {
    const group = match[1] ?? '';
    for (const rawPart of group.split(',')) {
      const trimmed = rawPart.trim();
      if (!trimmed) continue;
      const [name] = trimmed.split(/\s+as\s+/i);
      names.push(name.trim());
    }
  }

  return names;
}

describe('generationAndShots contract', () => {
  it('exposes only approved type exports from canonical barrel', () => {
    const contractPath = path.join(process.cwd(), 'src/types/generationAndShots.ts');
    const source = fs.readFileSync(contractPath, 'utf8');
    const exportsFound = parseTypeExports(source).sort();

    expect(exportsFound).toEqual([
      'GenerationMetadata',
      'GenerationParams',
      'GenerationRow',
      'PairLoraConfig',
      'PairMotionSettings',
      'Shot',
      'ShotOption',
    ]);
    expect(source).not.toMatch(/\bexport\s+(const|let|var|function|class|default)\b/);
  });
});
