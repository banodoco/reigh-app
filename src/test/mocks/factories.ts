import type { GenerationRow, Shot, GenerationMetadata } from '@/types/shots';
import type { Task, Project, Generation } from '@/types/database';

let counter = 0;
function nextId() {
  counter++;
  return `test-${counter.toString().padStart(4, '0')}`;
}

/** Reset the ID counter between tests if needed */
function _resetFactoryCounter() {
  counter = 0;
}

/**
 * Create a mock GenerationRow (the frontend-facing generation type with shot_generations fields).
 */
function createMockGenerationRow(overrides: Partial<GenerationRow> = {}): GenerationRow {
  const id = overrides.id ?? nextId();
  return {
    id,
    generation_id: overrides.generation_id ?? nextId(),
    location: `https://storage.example.com/gen/${id}.mp4`,
    type: 'video',
    contentType: 'video/mp4',
    createdAt: new Date().toISOString(),
    created_at: new Date().toISOString(),
    starred: false,
    isOptimistic: false,
    ...overrides,
  };
}

/**
 * Create a mock Generation (the database row type).
 */
function _createMockGeneration(overrides: Partial<Generation> = {}): Generation {
  const id = overrides.id ?? nextId();
  return {
    id,
    location: `https://storage.example.com/gen/${id}.mp4`,
    type: 'video',
    created_at: new Date().toISOString(),
    project_id: overrides.project_id ?? 'test-project-id',
    starred: false,
    ...overrides,
  };
}

/**
 * Create a mock Shot.
 */
function _createMockShot(overrides: Partial<Shot> = {}): Shot {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Shot ${id}`,
    images: [],
    position: 0,
    created_at: new Date().toISOString(),
    project_id: 'test-project-id',
    ...overrides,
  };
}

/**
 * Create a mock Task.
 */
function _createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? nextId(),
    taskType: 'video_generation',
    params: {},
    status: 'Queued',
    createdAt: new Date().toISOString(),
    projectId: 'test-project-id',
    ...overrides,
  };
}

/**
 * Create a mock Project.
 */
function _createMockProject(overrides: Partial<Project> = {}): Project {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Test Project ${id}`,
    user_id: 'test-user-id',
    aspect_ratio: '16:9',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock GenerationMetadata for timeline images.
 */
function createMockMetadata(overrides: Partial<GenerationMetadata> = {}): GenerationMetadata {
  return {
    frame_spacing: 30,
    is_keyframe: false,
    locked: false,
    ...overrides,
  };
}

/**
 * Create a mock GenerationRow positioned on the timeline.
 */
function _createMockTimelineGeneration(
  timelineFrame: number,
  overrides: Partial<GenerationRow> = {},
): GenerationRow {
  return createMockGenerationRow({
    timeline_frame: timelineFrame,
    metadata: createMockMetadata(overrides.metadata),
    ...overrides,
  });
}
