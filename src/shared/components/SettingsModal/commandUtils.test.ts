import { describe, expect, it } from 'vitest';
import {
  UnsupportedPlatformError,
  buildWorkerLaunchLine,
  getInstallationCommand,
  getRunCommand,
} from './commandUtils';
import type { CommandConfig } from './types';

const linuxRepoPath = '/Users/tester/Reigh-Worker';
const windowsRepoPath = 'C:\\Users\\tester\\Reigh-Worker';

const baseConfig: CommandConfig = {
  computerType: 'linux',
  gpuType: 'nvidia-30-40',
  memoryProfile: '4',
  windowsShell: 'cmd',
  showDebugLogs: false,
  idleReleaseMinutes: '15',
  token: 'test-token',
  workerRepoPath: linuxRepoPath,
};

describe('buildWorkerLaunchLine', () => {
  it('includes --debug when showDebugLogs is true', () => {
    const line = buildWorkerLaunchLine({ ...baseConfig, showDebugLogs: true });
    expect(line).toContain('--debug');
    expect(line).toContain('python run_worker.py');
  });

  it('excludes --debug when showDebugLogs is false', () => {
    const line = buildWorkerLaunchLine({ ...baseConfig, showDebugLogs: false });
    expect(line).not.toContain('--debug');
  });

  it('always appends --idle-release-minutes including for "0"', () => {
    expect(buildWorkerLaunchLine({ ...baseConfig, idleReleaseMinutes: '0' })).toContain('--idle-release-minutes 0');
    expect(buildWorkerLaunchLine({ ...baseConfig, idleReleaseMinutes: '15' })).toContain('--idle-release-minutes 15');
    expect(buildWorkerLaunchLine({ ...baseConfig, idleReleaseMinutes: '30' })).toContain('--idle-release-minutes 30');
  });
});

describe('getInstallationCommand', () => {
  it('starts Linux install with a repo cd, includes the repo path, deadsnakes precheck, and cu124 sync', () => {
    const cmd = getInstallationCommand(baseConfig);

    expect(cmd.startsWith(`cd "${linuxRepoPath}"`)).toBe(true);
    expect(cmd).toContain(linuxRepoPath);
    expect(cmd).toContain('apt-cache show python3.10-venv');
    expect(cmd).toContain('git clone --depth 1 https://github.com/banodoco/Reigh-Worker.git .');
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('touch .uv-migrated');
    expect(cmd).toContain('run --python 3.10 python run_worker.py');
  });

  it('starts Linux install with a repo cd and switches to cu128 for nvidia-50', () => {
    const cmd = getInstallationCommand({ ...baseConfig, gpuType: 'nvidia-50' });

    expect(cmd.startsWith(`cd "${linuxRepoPath}"`)).toBe(true);
    expect(cmd).toContain(linuxRepoPath);
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('sync --locked --python 3.10 --extra cuda124');
  });

  it('starts Windows PowerShell install with Set-Location and includes the repo path', () => {
    const cmd = getInstallationCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'powershell',
      workerRepoPath: windowsRepoPath,
    });

    expect(cmd.startsWith(`Set-Location -LiteralPath "${windowsRepoPath}"`)).toBe(true);
    expect(cmd).toContain(windowsRepoPath);
    expect(cmd).toContain('$uvExe sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('& $uvExe run --python 3.10 python run_worker.py');
  });

  it('starts Windows cmd install with cd /d, includes the repo path, and uses explicit uv.exe', () => {
    const cmd = getInstallationCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'cmd',
      workerRepoPath: windowsRepoPath,
    });

    expect(cmd.startsWith(`cd /d "${windowsRepoPath}"`)).toBe(true);
    expect(cmd).toContain(windowsRepoPath);
    expect(cmd).toContain('cd /d');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" run --python 3.10 python run_worker.py');
  });
});

describe('getRunCommand', () => {
  it('starts Linux run with a repo cd, includes the repo path, sentinel preguard, git pull, and cu124 sync', () => {
    const cmd = getRunCommand(baseConfig);

    expect(cmd.startsWith(`cd "${linuxRepoPath}"`)).toBe(true);
    expect(cmd).toContain(linuxRepoPath);
    expect(cmd).toContain('if [ ! -f ".uv-migrated" ]');
    expect(cmd).toContain('git pull --ff-only');
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('touch .uv-migrated');
    expect(cmd).toContain('run --python 3.10 python run_worker.py');
    expect(cmd).not.toMatch(/python worker\.py\b/);
  });

  it('starts Linux run with a repo cd and switches to cu128 for nvidia-50', () => {
    const cmd = getRunCommand({ ...baseConfig, gpuType: 'nvidia-50' });

    expect(cmd.startsWith(`cd "${linuxRepoPath}"`)).toBe(true);
    expect(cmd).toContain(linuxRepoPath);
    expect(cmd).toContain('if [ ! -f ".uv-migrated" ]');
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('sync --locked --python 3.10 --extra cuda124');
  });

  it('starts Windows PowerShell install with Set-Location and switches to cu128 for nvidia-50', () => {
    const cmd = getInstallationCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'powershell',
      gpuType: 'nvidia-50',
      workerRepoPath: windowsRepoPath,
    });

    expect(cmd.startsWith(`Set-Location -LiteralPath "${windowsRepoPath}"`)).toBe(true);
    expect(cmd).toContain(windowsRepoPath);
    expect(cmd).toContain('$uvExe sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('$uvExe sync --locked --python 3.10 --extra cuda124');
  });

  it('starts Windows PowerShell run with Set-Location, includes the repo path, and switches to cu128 for nvidia-50', () => {
    const cmd = getRunCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'powershell',
      gpuType: 'nvidia-50',
      workerRepoPath: windowsRepoPath,
    });

    expect(cmd.startsWith(`Set-Location -LiteralPath "${windowsRepoPath}"`)).toBe(true);
    expect(cmd).toContain(windowsRepoPath);
    expect(cmd).toContain("if (-not (Test-Path -LiteralPath '.uv-migrated'))");
    expect(cmd).toContain('& $uvExe sync --locked --python 3.10 --extra cuda128');
    expect(cmd).toContain('& $uvExe run --python 3.10 python run_worker.py');
  });

  it('starts Windows cmd run with cd /d, includes the repo path, sentinel preguard, and explicit uv.exe', () => {
    const cmd = getRunCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'cmd',
      workerRepoPath: windowsRepoPath,
    });

    expect(cmd.startsWith(`cd /d "${windowsRepoPath}"`)).toBe(true);
    expect(cmd).toContain(windowsRepoPath);
    expect(cmd).toContain('cd /d');
    expect(cmd).toContain('if not exist ".uv-migrated"');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" run --python 3.10 python run_worker.py');
    expect(cmd).not.toMatch(/python worker\.py\b/);
  });

  it('starts Windows cmd run with cd /d and switches to cu128 for nvidia-50', () => {
    const cmd = getRunCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'cmd',
      gpuType: 'nvidia-50',
      workerRepoPath: windowsRepoPath,
    });

    expect(cmd.startsWith(`cd /d "${windowsRepoPath}"`)).toBe(true);
    expect(cmd).toContain(windowsRepoPath);
    expect(cmd).toContain('cd /d');
    expect(cmd).toContain('if not exist ".uv-migrated"');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda124');
  });

  it('throws UnsupportedPlatformError on macOS', () => {
    expect(() => getRunCommand({ ...baseConfig, computerType: 'mac' })).toThrow(UnsupportedPlatformError);
    expect(() => getInstallationCommand({ ...baseConfig, computerType: 'mac' })).toThrow(UnsupportedPlatformError);
  });
});
