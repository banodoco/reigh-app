import { describe, it, expect } from 'vitest';
import { dataURLtoFile } from './fileConversion';

describe('dataURLtoFile', () => {
  it('converts a valid data URL to a File', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const file = dataURLtoFile(dataUrl, 'test.txt');
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe('test.txt');
    expect(file?.type).toBe('text/plain');
  });

  it('uses custom MIME type when provided', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const file = dataURLtoFile(dataUrl, 'test.bin', 'application/octet-stream');
    expect(file?.type).toBe('application/octet-stream');
  });

  it('returns null for invalid data URL', () => {
    expect(dataURLtoFile('not-a-data-url', 'test.txt')).toBeNull();
  });

  it('falls back to application/octet-stream when MIME not in URL', () => {
    const dataUrl = 'data:;base64,SGVsbG8=';
    const file = dataURLtoFile(dataUrl, 'test.bin');
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe('application/octet-stream');
  });
});
