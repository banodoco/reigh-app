import { describe, it, expect } from 'vitest';
import {
  generateUniqueFilename,
  generateThumbnailFilename,
  getFileExtension,
  storagePaths,
  MEDIA_BUCKET,
} from '../storagePaths';

describe('generateUniqueFilename', () => {
  it('generates a filename with the given extension', () => {
    const filename = generateUniqueFilename('png');
    expect(filename).toMatch(/^\d+-[a-z0-9]+\.png$/);
  });

  it('generates unique filenames on each call', () => {
    const a = generateUniqueFilename('jpg');
    const b = generateUniqueFilename('jpg');
    expect(a).not.toBe(b);
  });
});

describe('generateThumbnailFilename', () => {
  it('generates a thumbnail filename', () => {
    const filename = generateThumbnailFilename();
    expect(filename).toMatch(/^thumb_\d+_[a-z0-9]+\.jpg$/);
  });
});

describe('getFileExtension', () => {
  it('extracts extension from filename', () => {
    expect(getFileExtension('photo.png')).toBe('png');
    expect(getFileExtension('video.mp4')).toBe('mp4');
  });

  it('handles multiple dots', () => {
    expect(getFileExtension('my.photo.jpg')).toBe('jpg');
  });

  it('falls back to MIME type when no extension', () => {
    expect(getFileExtension('noext', 'image/png')).toBe('png');
    expect(getFileExtension('noext', 'image/jpeg')).toBe('jpg'); // jpeg → jpg
    expect(getFileExtension('noext', 'video/mp4')).toBe('mp4');
  });

  it('falls back to default when no extension or MIME', () => {
    expect(getFileExtension('noext')).toBe('bin');
  });

  it('uses custom default extension', () => {
    expect(getFileExtension('noext', undefined, 'dat')).toBe('dat');
  });
});

describe('storagePaths', () => {
  it('builds upload path', () => {
    expect(storagePaths.upload('user-1', 'image.png')).toBe('user-1/uploads/image.png');
  });

  it('builds thumbnail path', () => {
    expect(storagePaths.thumbnail('user-1', 'thumb.jpg')).toBe('user-1/thumbnails/thumb.jpg');
  });

  it('builds task output path', () => {
    expect(storagePaths.taskOutput('user-1', 'task-1', 'output.mp4'))
      .toBe('user-1/tasks/task-1/output.mp4');
  });

  it('builds task thumbnail path', () => {
    expect(storagePaths.taskThumbnail('user-1', 'task-1', 'thumb.jpg'))
      .toBe('user-1/tasks/task-1/thumbnails/thumb.jpg');
  });
});

describe('MEDIA_BUCKET', () => {
  it('has correct bucket name', () => {
    expect(MEDIA_BUCKET).toBe('image_uploads');
  });
});
