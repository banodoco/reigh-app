import { describe, it, expect } from 'vitest';
import { SUPABASE_ERROR, isNotFoundError, isUniqueViolationError } from '../supabaseErrors';

describe('SUPABASE_ERROR constants', () => {
  it('has expected error codes', () => {
    expect(SUPABASE_ERROR.NOT_FOUND).toBe('PGRST116');
    expect(SUPABASE_ERROR.UNIQUE_VIOLATION).toBe('23505');
    expect(SUPABASE_ERROR.FUNCTION_NOT_FOUND).toBe('42883');
  });
});

describe('isNotFoundError', () => {
  it('returns true for PGRST116 errors', () => {
    expect(isNotFoundError({ code: 'PGRST116', message: 'Not found' })).toBe(true);
  });

  it('returns false for other error codes', () => {
    expect(isNotFoundError({ code: '23505', message: 'Duplicate' })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isNotFoundError('PGRST116')).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError(42)).toBe(false);
  });

  it('returns false for objects without code', () => {
    expect(isNotFoundError({ message: 'Not found' })).toBe(false);
  });
});

describe('isUniqueViolationError', () => {
  it('returns true for 23505 errors', () => {
    expect(isUniqueViolationError({ code: '23505', message: 'Duplicate key' })).toBe(true);
  });

  it('returns false for other error codes', () => {
    expect(isUniqueViolationError({ code: 'PGRST116' })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isUniqueViolationError(null)).toBe(false);
    expect(isUniqueViolationError('23505')).toBe(false);
  });
});
