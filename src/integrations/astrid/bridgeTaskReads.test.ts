import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.hoisted(() => vi.fn());

vi.mock('./client.ts', () => ({
  AstridLocalClient: class {
    tasks = { list: listMock };
  },
}));

import { listBridgeTasks } from './bridgeTaskReads';

describe('bridge task pagination', () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it('fails closed on a repeated offset instead of looping', async () => {
    listMock
      .mockResolvedValueOnce({ tasks: [], next_offset: 200 })
      .mockResolvedValueOnce({ tasks: [], next_offset: 200 });

    await expect(listBridgeTasks('demo-project')).rejects.toThrow('repeated an offset');
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('requires each page offset to advance', async () => {
    listMock.mockResolvedValue({ tasks: [], next_offset: -1 });

    await expect(listBridgeTasks('demo-project')).rejects.toThrow('non-advancing offset');
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});
