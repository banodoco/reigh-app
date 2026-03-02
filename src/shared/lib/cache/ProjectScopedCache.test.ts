import { describe, it, expect } from 'vitest';
import { ProjectScopedCache } from './ProjectScopedCache';

describe('ProjectScopedCache', () => {
  it('stores and retrieves project and item values', () => {
    const cache = new ProjectScopedCache<number>();
    const projectMap = new Map<string, number>([
      ['item-1', 10],
      ['item-2', 20],
    ]);

    cache.setProject('project-1', projectMap);

    expect(cache.size()).toBe(1);
    expect(cache.getProject('project-1')).toBe(projectMap);
    expect(cache.getItem('project-1', 'item-1')).toBe(10);
    expect(cache.getItem('project-1', 'missing')).toBeNull();
    expect(cache.getProject('missing')).toBeNull();
  });

  it('deletes projects and clears cache', () => {
    const cache = new ProjectScopedCache<string>();
    cache.setProject('p1', new Map([['a', '1']]));
    cache.setProject('p2', new Map([['b', '2']]));

    cache.deleteProject('p1');
    expect(cache.size()).toBe(1);
    expect(cache.getProject('p1')).toBeNull();

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.getProject('p2')).toBeNull();
  });
});
