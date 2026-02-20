import { describe, expect, it } from 'vitest';
import App from './App';

describe('App direct module coverage', () => {
  it('exports App component directly', () => {
    expect(App).toBeDefined();
  });
});
