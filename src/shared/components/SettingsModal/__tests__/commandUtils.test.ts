import { describe, it, expect } from 'vitest';
import { safeCopy, getInstallationCommand, getRunCommand, generateAIInstructions } from '../commandUtils';

describe('commandUtils', () => {
  it('exports expected members', () => {
    expect(safeCopy).toBeDefined();
    expect(getInstallationCommand).toBeDefined();
    expect(getRunCommand).toBeDefined();
    expect(generateAIInstructions).toBeDefined();
  });
});
