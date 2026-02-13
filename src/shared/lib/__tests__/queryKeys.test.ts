import { describe, it, expect } from 'vitest';
import { queryKeys } from '../queryKeys';

describe('queryKeys', () => {
  describe('shots', () => {
    it('all returns static array', () => {
      expect(queryKeys.shots.all).toEqual(['shots']);
    });

    it('list includes projectId and optional maxImages', () => {
      expect(queryKeys.shots.list('p1')).toEqual(['shots', 'p1', undefined]);
      expect(queryKeys.shots.list('p1', 50)).toEqual(['shots', 'p1', 50]);
    });

    it('detail returns shot-specific key', () => {
      expect(queryKeys.shots.detail('s1')).toEqual(['shot', 's1']);
    });

    it('positions returns project-scoped key', () => {
      expect(queryKeys.shots.positions('p1')).toEqual(['shot-positions', 'p1']);
    });

    it('regenData returns shot-scoped key', () => {
      expect(queryKeys.shots.regenData('s1')).toEqual(['shot-regen-data', 's1']);
    });

    it('batchSettings returns shot-scoped key', () => {
      expect(queryKeys.shots.batchSettings('s1')).toEqual(['shot-batch-settings', 's1']);
    });
  });

  describe('generations', () => {
    it('all returns static array', () => {
      expect(queryKeys.generations.all).toEqual(['generations']);
    });

    it('byShot returns shot-scoped key', () => {
      expect(queryKeys.generations.byShot('s1')).toEqual(['all-shot-generations', 's1']);
    });

    it('detail returns generation-specific key', () => {
      expect(queryKeys.generations.detail('g1')).toEqual(['generation', 'g1']);
    });

    it('variants returns generation-scoped key', () => {
      expect(queryKeys.generations.variants('g1')).toEqual(['generation-variants', 'g1']);
    });

    it('derived returns generation-scoped key', () => {
      expect(queryKeys.generations.derived('g1')).toEqual(['derived-items', 'g1']);
    });

    it('byProject returns project-scoped key', () => {
      expect(queryKeys.generations.byProject('p1')).toEqual(['project-generations', 'p1']);
    });

    it('lineageChain returns generation-scoped key', () => {
      expect(queryKeys.generations.lineageChain('g1')).toEqual(['lineage-chain', 'g1']);
    });

    it('lastVideo returns shot-scoped key', () => {
      expect(queryKeys.generations.lastVideo('s1')).toEqual(['last-video-generation', 's1']);
    });

    it('forTask returns task-scoped key', () => {
      expect(queryKeys.generations.forTask('t1')).toEqual(['image-generation-for-task', 't1']);
    });
  });

  describe('unified', () => {
    it('all returns static array', () => {
      expect(queryKeys.unified.all).toEqual(['unified-generations']);
    });

    it('projectPrefix returns project-scoped prefix', () => {
      expect(queryKeys.unified.projectPrefix('p1')).toEqual(['unified-generations', 'project', 'p1']);
    });

    it('byProject includes all filter params', () => {
      expect(queryKeys.unified.byProject('p1', 1, 25, 'video', true)).toEqual([
        'unified-generations', 'project', 'p1', 1, 25, 'video', true,
      ]);
    });

    it('byProject uses undefined for omitted params', () => {
      expect(queryKeys.unified.byProject('p1')).toEqual([
        'unified-generations', 'project', 'p1', undefined, undefined, undefined, undefined,
      ]);
    });
  });

  describe('tasks', () => {
    it('list returns project-scoped key', () => {
      expect(queryKeys.tasks.list('p1')).toEqual(['tasks', 'p1']);
    });

    it('detail returns task-specific key', () => {
      expect(queryKeys.tasks.detail('t1')).toEqual(['tasks', 't1']);
    });

    it('paginated returns project-scoped key', () => {
      expect(queryKeys.tasks.paginated('p1')).toEqual(['tasks', 'paginated', 'p1']);
    });

    it('statusCounts returns project-scoped key', () => {
      expect(queryKeys.tasks.statusCounts('p1')).toEqual(['task-status-counts', 'p1']);
    });

    it('result returns task-specific key', () => {
      expect(queryKeys.tasks.result('t1')).toEqual(['task-result', 't1']);
    });

    it('generationTaskId returns generation-scoped key', () => {
      expect(queryKeys.tasks.generationTaskId('g1')).toEqual(['tasks', 'taskId', 'g1']);
    });

    it('pendingGeneration returns shot-scoped key', () => {
      expect(queryKeys.tasks.pendingGeneration('s1')).toEqual(['pending-generation-tasks', 's1']);
    });
  });

  describe('settings', () => {
    it('tool returns tool-scoped key with optional project and shot', () => {
      expect(queryKeys.settings.tool('travel')).toEqual(['toolSettings', 'travel', undefined, undefined]);
      expect(queryKeys.settings.tool('travel', 'p1')).toEqual(['toolSettings', 'travel', 'p1', undefined]);
      expect(queryKeys.settings.tool('travel', 'p1', 's1')).toEqual(['toolSettings', 'travel', 'p1', 's1']);
    });

    it('byTool returns tool prefix', () => {
      expect(queryKeys.settings.byTool('travel')).toEqual(['toolSettings', 'travel']);
    });

    it('all returns static prefix', () => {
      expect(queryKeys.settings.all).toEqual(['toolSettings']);
    });

    it('user returns static array', () => {
      expect(queryKeys.settings.user).toEqual(['user-settings']);
    });
  });

  describe('credits', () => {
    it('balance returns static key', () => {
      expect(queryKeys.credits.balance).toEqual(['credits', 'balance']);
    });

    it('autoTopup returns static key', () => {
      expect(queryKeys.credits.autoTopup).toEqual(['autoTopup']);
    });
  });

  describe('segments', () => {
    it('children returns segment-scoped key', () => {
      expect(queryKeys.segments.children('seg1')).toEqual(['segment-child-generations', 'seg1']);
    });

    it('parents returns shot-scoped key with optional projectId', () => {
      expect(queryKeys.segments.parents('s1')).toEqual(['segment-parent-generations', 's1', undefined]);
      expect(queryKeys.segments.parents('s1', 'p1')).toEqual(['segment-parent-generations', 's1', 'p1']);
    });

    it('liveTimeline returns shot-scoped key', () => {
      expect(queryKeys.segments.liveTimeline('s1')).toEqual(['segment-live-timeline', 's1']);
    });
  });

  describe('key uniqueness', () => {
    it('different scopes produce different keys', () => {
      const shotKey = queryKeys.generations.byShot('abc');
      const projectKey = queryKeys.generations.byProject('abc');
      expect(shotKey).not.toEqual(projectKey);
    });
  });
});
