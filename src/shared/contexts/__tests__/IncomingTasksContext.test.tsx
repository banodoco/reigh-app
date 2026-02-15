/**
 * IncomingTasksContext Tests
 *
 * Tests for incoming task tracking context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { IncomingTasksProvider, useIncomingTasks } from '../IncomingTasksContext';

// Test consumer component
function IncomingTasksConsumer() {
  const {
    incomingTasks,
    addIncomingTask,
    hasIncomingTasks,
  } = useIncomingTasks();

  return (
    <div>
      <span data-testid="taskCount">{incomingTasks.length}</span>
      <span data-testid="hasIncoming">{String(hasIncomingTasks)}</span>
      <span data-testid="tasks">{JSON.stringify(incomingTasks.map(t => t.label))}</span>
      <button
        data-testid="addTask"
        onClick={() =>
          addIncomingTask({
            taskType: 'image_generation',
            label: 'Test prompt',
            expectedCount: 1,
          })
        }
      >
        Add
      </button>
      <button
        data-testid="addSecondTask"
        onClick={() =>
          addIncomingTask({
            taskType: 'travel_video',
            label: 'Travel video',
            expectedCount: 2,
            baselineCount: 5,
          })
        }
      >
        Add Second
      </button>
    </div>
  );
}

describe('IncomingTasksContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useIncomingTasks hook', () => {
    it('throws when used outside IncomingTasksProvider', () => {
      function BadConsumer() {
        useIncomingTasks();
        return null;
      }

      expect(() => {
        render(<BadConsumer />);
      }).toThrow('useIncomingTasks must be used within an IncomingTasksProvider');
    });
  });

  describe('IncomingTasksProvider', () => {
    it('renders children', () => {
      render(
        <IncomingTasksProvider>
          <div data-testid="child">Hello</div>
        </IncomingTasksProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('starts with no incoming tasks', () => {
      render(
        <IncomingTasksProvider>
          <IncomingTasksConsumer />
        </IncomingTasksProvider>
      );

      expect(screen.getByTestId('taskCount')).toHaveTextContent('0');
      expect(screen.getByTestId('hasIncoming')).toHaveTextContent('false');
    });

    it('can add incoming tasks', () => {
      render(
        <IncomingTasksProvider>
          <IncomingTasksConsumer />
        </IncomingTasksProvider>
      );

      act(() => {
        screen.getByTestId('addTask').click();
      });

      expect(screen.getByTestId('taskCount')).toHaveTextContent('1');
      expect(screen.getByTestId('hasIncoming')).toHaveTextContent('true');
      expect(screen.getByTestId('tasks')).toHaveTextContent('Test prompt');
    });

    it('prepends new tasks (most recent first)', () => {
      render(
        <IncomingTasksProvider>
          <IncomingTasksConsumer />
        </IncomingTasksProvider>
      );

      act(() => {
        screen.getByTestId('addTask').click();
      });
      act(() => {
        screen.getByTestId('addSecondTask').click();
      });

      expect(screen.getByTestId('taskCount')).toHaveTextContent('2');
      // Second task should be first in the array
      expect(screen.getByTestId('tasks')).toHaveTextContent('["Travel video","Test prompt"]');
    });

    it('can remove incoming tasks', () => {
      let taskId: string | null = null;

      function RemoveConsumer() {
        const { incomingTasks, addIncomingTask, removeIncomingTask } = useIncomingTasks();
        return (
          <div>
            <span data-testid="taskCount">{incomingTasks.length}</span>
            <button
              data-testid="add"
              onClick={() => {
                taskId = addIncomingTask({
                  taskType: 'test',
                  label: 'Test',
                });
              }}
            >
              Add
            </button>
            <button
              data-testid="remove"
              onClick={() => {
                if (taskId) removeIncomingTask(taskId);
              }}
            >
              Remove
            </button>
          </div>
        );
      }

      render(
        <IncomingTasksProvider>
          <RemoveConsumer />
        </IncomingTasksProvider>
      );

      act(() => {
        screen.getByTestId('add').click();
      });
      expect(screen.getByTestId('taskCount')).toHaveTextContent('1');

      act(() => {
        screen.getByTestId('remove').click();
      });
      expect(screen.getByTestId('taskCount')).toHaveTextContent('0');
    });

    it('completeIncomingTask removes the task and updates baselines', () => {
      let firstTaskId: string | null = null;

      function CompleteConsumer() {
        const { incomingTasks, addIncomingTask, completeIncomingTask } = useIncomingTasks();
        return (
          <div>
            <span data-testid="taskCount">{incomingTasks.length}</span>
            <span data-testid="baselines">
              {JSON.stringify(incomingTasks.map(t => t.baselineCount))}
            </span>
            <button
              data-testid="addFirst"
              onClick={() => {
                firstTaskId = addIncomingTask({
                  taskType: 'test',
                  label: 'First',
                  baselineCount: 5,
                });
              }}
            >
              Add First
            </button>
            <button
              data-testid="addSecond"
              onClick={() => {
                addIncomingTask({
                  taskType: 'test',
                  label: 'Second',
                  baselineCount: 5,
                });
              }}
            >
              Add Second
            </button>
            <button
              data-testid="complete"
              onClick={() => {
                if (firstTaskId) completeIncomingTask(firstTaskId, 10);
              }}
            >
              Complete
            </button>
          </div>
        );
      }

      render(
        <IncomingTasksProvider>
          <CompleteConsumer />
        </IncomingTasksProvider>
      );

      act(() => {
        screen.getByTestId('addFirst').click();
      });
      act(() => {
        screen.getByTestId('addSecond').click();
      });
      expect(screen.getByTestId('taskCount')).toHaveTextContent('2');

      act(() => {
        screen.getByTestId('complete').click();
      });

      // First task removed, second task baseline updated
      expect(screen.getByTestId('taskCount')).toHaveTextContent('1');
      expect(screen.getByTestId('baselines')).toHaveTextContent('[10]');
    });

    it('addIncomingTask returns a unique ID', () => {
      const ids: string[] = [];

      function IdConsumer() {
        const { addIncomingTask } = useIncomingTasks();
        return (
          <button
            data-testid="add"
            onClick={() => {
              ids.push(
                addIncomingTask({ taskType: 'test', label: 'Task' })
              );
            }}
          >
            Add
          </button>
        );
      }

      render(
        <IncomingTasksProvider>
          <IdConsumer />
        </IncomingTasksProvider>
      );

      act(() => {
        screen.getByTestId('add').click();
      });
      act(() => {
        screen.getByTestId('add').click();
      });

      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[0]).toMatch(/^incoming-/);
    });
  });
});
