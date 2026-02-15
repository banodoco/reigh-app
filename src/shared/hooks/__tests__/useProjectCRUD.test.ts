import { describe, it, expect } from 'vitest';
import { determineProjectIdToSelect } from '../useProjectCRUD';

// Test the pure function separately since the hook has heavy side effects
describe('determineProjectIdToSelect', () => {
  const mockProjects = [
    { id: 'p1', name: 'Project 1', user_id: 'u1' },
    { id: 'p2', name: 'Project 2', user_id: 'u1' },
    { id: 'p3', name: 'Project 3', user_id: 'u1' },
  ];

  it('returns null for empty projects list', () => {
    expect(determineProjectIdToSelect([], null, null)).toBeNull();
  });

  it('returns preferredId when it exists in projects', () => {
    expect(determineProjectIdToSelect(mockProjects, 'p2', null)).toBe('p2');
  });

  it('returns lastOpenedId when preferredId is not in projects', () => {
    expect(determineProjectIdToSelect(mockProjects, 'nonexistent', 'p3')).toBe('p3');
  });

  it('returns first project when neither preferred nor lastOpened match', () => {
    expect(determineProjectIdToSelect(mockProjects, 'nonexistent', 'also-nonexistent')).toBe('p1');
  });

  it('returns first project when preferredId is null', () => {
    expect(determineProjectIdToSelect(mockProjects, null, null)).toBe('p1');
  });

  it('returns lastOpenedId when preferredId is null but lastOpened exists', () => {
    expect(determineProjectIdToSelect(mockProjects, null, 'p2')).toBe('p2');
  });

  it('ignores lastOpenedId that is not in projects', () => {
    expect(determineProjectIdToSelect(mockProjects, null, 'nonexistent')).toBe('p1');
  });

  it('prefers preferredId over lastOpenedId', () => {
    expect(determineProjectIdToSelect(mockProjects, 'p1', 'p3')).toBe('p1');
  });
});
