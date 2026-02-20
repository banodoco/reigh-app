import { describe, expect, it } from 'vitest';
import { AppRoutes } from './routes';

describe('routes direct module coverage', () => {
  it('exports AppRoutes directly', () => {
    expect(AppRoutes).toBeDefined();
  });
});
