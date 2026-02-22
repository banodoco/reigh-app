import { describe, it, expect } from 'vitest';
import { ModalContainer, ModalFooterButtons } from '../ModalContainer';

describe('ModalContainer', () => {
  it('exports expected members', () => {
    expect(ModalContainer).toBeDefined();
    expect(ModalFooterButtons).toBeDefined();
  });
});
