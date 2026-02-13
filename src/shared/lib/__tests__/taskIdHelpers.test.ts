import { describe, it, expect } from 'vitest';
import { getSourceTaskId, hasOrchestratorDetails } from '../taskIdHelpers';

describe('getSourceTaskId', () => {
  const validUuid = '12345678-1234-1234-1234-123456789abc';

  it('returns null for null/undefined params', () => {
    expect(getSourceTaskId(null)).toBeNull();
    expect(getSourceTaskId(undefined)).toBeNull();
  });

  it('extracts source_task_id (preferred)', () => {
    expect(getSourceTaskId({ source_task_id: validUuid })).toBe(validUuid);
  });

  it('falls back to orchestrator_task_id', () => {
    expect(getSourceTaskId({ orchestrator_task_id: validUuid })).toBe(validUuid);
  });

  it('falls back to task_id', () => {
    expect(getSourceTaskId({ task_id: validUuid })).toBe(validUuid);
  });

  it('respects priority order: source_task_id > orchestrator_task_id > task_id', () => {
    const uuid1 = '11111111-1111-1111-1111-111111111111';
    const uuid2 = '22222222-2222-2222-2222-222222222222';
    expect(getSourceTaskId({
      source_task_id: uuid1,
      orchestrator_task_id: uuid2,
    })).toBe(uuid1);
  });

  it('rejects non-UUID strings', () => {
    expect(getSourceTaskId({ source_task_id: 'not-a-uuid' })).toBeNull();
    expect(getSourceTaskId({ source_task_id: '12345' })).toBeNull();
  });

  it('rejects non-string values', () => {
    expect(getSourceTaskId({ source_task_id: 123 })).toBeNull();
    expect(getSourceTaskId({ source_task_id: true })).toBeNull();
  });

  it('returns null when no task ID fields present', () => {
    expect(getSourceTaskId({ prompt: 'hello' })).toBeNull();
  });

  it('handles case-insensitive UUID validation', () => {
    const upperUuid = '12345678-1234-1234-1234-123456789ABC';
    expect(getSourceTaskId({ source_task_id: upperUuid })).toBe(upperUuid);
  });
});

describe('hasOrchestratorDetails', () => {
  it('returns false for null/undefined', () => {
    expect(hasOrchestratorDetails(null)).toBe(false);
    expect(hasOrchestratorDetails(undefined)).toBe(false);
  });

  it('returns true when orchestrator_details present', () => {
    expect(hasOrchestratorDetails({ orchestrator_details: { prompt: 'test' } })).toBe(true);
  });

  it('returns false when orchestrator_details absent', () => {
    expect(hasOrchestratorDetails({ prompt: 'test' })).toBe(false);
  });

  it('returns false for falsy orchestrator_details', () => {
    expect(hasOrchestratorDetails({ orchestrator_details: null })).toBe(false);
    expect(hasOrchestratorDetails({ orchestrator_details: undefined })).toBe(false);
    expect(hasOrchestratorDetails({ orchestrator_details: '' })).toBe(false);
  });
});
