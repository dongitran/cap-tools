import { describe, expect, it, vi } from 'vitest';

const { mkdirMock } = vi.hoisted(() => ({ mkdirMock: vi.fn(async () => undefined) }));

vi.mock('node:fs/promises', () => ({ mkdir: mkdirMock }));

import { ensureCfHomeDir } from './cfHome';

function context(globalStoragePath: string): Parameters<typeof ensureCfHomeDir>[0] {
  return { globalStorageUri: { fsPath: globalStoragePath } } as Parameters<typeof ensureCfHomeDir>[0];
}

describe('ensureCfHomeDir', () => {
  it('defaults to the shared interactive CF_HOME', async () => {
    await expect(ensureCfHomeDir(context('/gs'))).resolves.toBe('/gs/cf-home');
    await expect(ensureCfHomeDir(context('/gs'), 'interactive')).resolves.toBe('/gs/cf-home');
  });

  it('gives the background sync its own directory', async () => {
    await expect(ensureCfHomeDir(context('/gs'), 'sync')).resolves.toBe('/gs/cf-home-sync');
  });

  it('keeps the sync directory distinct from the interactive one', async () => {
    // The targeted org/space lives in each directory's .cf/config.json, so
    // sharing one would let the sync's org walk retarget the user's commands.
    const interactive = await ensureCfHomeDir(context('/gs'));
    const sync = await ensureCfHomeDir(context('/gs'), 'sync');
    expect(sync).not.toBe(interactive);
  });

  it('creates the directory it returns', async () => {
    mkdirMock.mockClear();
    await ensureCfHomeDir(context('/gs'), 'sync');
    expect(mkdirMock).toHaveBeenCalledWith('/gs/cf-home-sync', { recursive: true });
  });
});
