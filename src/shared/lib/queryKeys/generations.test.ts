import { describe, it, expect } from 'vitest';
import { generationQueryKeys } from './generations';

describe('generationQueryKeys', () => {
  it('returns stable root and group keys', () => {
    expect(generationQueryKeys.all).toEqual(['generations']);
    expect(generationQueryKeys.byShotAll).toEqual(['all-shot-generations']);
    expect(generationQueryKeys.detailAll).toEqual(['generation']);
  });

  it('builds parameterized keys with the provided identifiers', () => {
    expect(generationQueryKeys.byShot('shot-1')).toEqual(['all-shot-generations', 'shot-1']);
    expect(generationQueryKeys.detail('gen-1')).toEqual(['generation', 'gen-1']);
    expect(generationQueryKeys.byProject('project-1')).toEqual(['project-generations', 'project-1']);
  });

  it('keeps task and lineage keys isolated by id', () => {
    expect(generationQueryKeys.lineageChain('gen-2')).toEqual(['lineage-chain', 'gen-2']);
    expect(generationQueryKeys.lastVideo('shot-2')).toEqual(['last-video-generation', 'shot-2']);
    expect(generationQueryKeys.forTask('task-1')).toEqual(['image-generation-for-task', 'task-1']);
    expect(generationQueryKeys.videoForTask('task-1')).toEqual(['video-generations-for-task', 'task-1']);
  });
});
