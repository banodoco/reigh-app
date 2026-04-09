import { describe, expect, it } from 'vitest';
import {
  UnsupportedPlatformError,
  buildWorkerLaunchLine,
  getInstallationCommand,
  getRunCommand,
} from './commandUtils';
import type { CommandConfig } from './types';

const baseConfig: CommandConfig = {
  computerType: 'linux',
  gpuType: 'nvidia-30-40',
  memoryProfile: '4',
  windowsShell: 'cmd',
  showDebugLogs: false,
  idleReleaseMinutes: '15',
  token: 'test-token',
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
  it('Linux install: clones if missing, cds into Reigh-Worker, installs uv, syncs cuda124', () => {
    const cmd = getInstallationCommand(baseConfig);

    expect(cmd).toContain('git clone --depth 1 https://github.com/banodoco/Reigh-Worker.git');
    expect(cmd).toContain('cd Reigh-Worker &&');
    expect(cmd).toContain('apt-cache show python3.10-venv');
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('touch .uv-migrated');
    expect(cmd).toContain('run --python 3.10 python run_worker.py');
  });

  it('Linux install: switches to cu128 for nvidia-50', () => {
    const cmd = getInstallationCommand({ ...baseConfig, gpuType: 'nvidia-50' });

    expect(cmd).toContain('cd Reigh-Worker &&');
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('sync --locked --python 3.10 --extra cuda124');
  });

  it('Windows PowerShell install: Set-Location into Reigh-Worker, uv sync cuda124', () => {
    const cmd = getInstallationCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'powershell',
    });

    expect(cmd).toContain("Set-Location -LiteralPath 'Reigh-Worker'");
    expect(cmd).toContain('$uvExe sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('& $uvExe run --python 3.10 python run_worker.py');
  });

  it('Windows cmd install: cd /d into Reigh-Worker, uses explicit uv.exe path', () => {
    const cmd = getInstallationCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'cmd',
    });

    expect(cmd).toContain('cd /d Reigh-Worker &&');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" run --python 3.10 python run_worker.py');
  });
});

describe('getRunCommand', () => {
  it('Linux run: cds into Reigh-Worker, sentinel preguard, git pull, cu124 sync', () => {
    const cmd = getRunCommand(baseConfig);

    expect(cmd).toMatch(/^cd Reigh-Worker &&/);
    expect(cmd).toContain('if [ ! -f ".uv-migrated" ]');
    expect(cmd).toContain('git pull --ff-only');
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('touch .uv-migrated');
    expect(cmd).toContain('run --python 3.10 python run_worker.py');
    expect(cmd).not.toMatch(/python worker\.py\b/);
  });

  it('Linux run: switches to cu128 for nvidia-50', () => {
    const cmd = getRunCommand({ ...baseConfig, gpuType: 'nvidia-50' });

    expect(cmd).toMatch(/^cd Reigh-Worker &&/);
    expect(cmd).toContain('sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('sync --locked --python 3.10 --extra cuda124');
  });

  it('Windows PowerShell install: Set-Location and cu128 for nvidia-50', () => {
    const cmd = getInstallationCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'powershell',
      gpuType: 'nvidia-50',
    });

    expect(cmd).toContain("Set-Location -LiteralPath 'Reigh-Worker'");
    expect(cmd).toContain('$uvExe sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('$uvExe sync --locked --python 3.10 --extra cuda124');
  });

  it('Windows PowerShell run: Set-Location, sentinel, cu128 for nvidia-50', () => {
    const cmd = getRunCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'powershell',
      gpuType: 'nvidia-50',
    });

    expect(cmd).toContain("Set-Location -LiteralPath 'Reigh-Worker'");
    expect(cmd).toContain("if (-not (Test-Path -LiteralPath '.uv-migrated'))");
    expect(cmd).toContain('& $uvExe sync --locked --python 3.10 --extra cuda128');
    expect(cmd).toContain('& $uvExe run --python 3.10 python run_worker.py');
  });

  it('Windows cmd run: single-line cd /d, git pull, sync, run with explicit uv.exe', () => {
    const cmd = getRunCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'cmd',
    });

    expect(cmd).toMatch(/^cd \/d Reigh-Worker && /);
    expect(cmd).toContain('git pull --ff-only');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda124');
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" run --python 3.10 python run_worker.py');
    expect(cmd).not.toContain('\n');
    expect(cmd).not.toMatch(/python worker\.py\b/);
  });

  it('Windows cmd run: cd /d and cu128 for nvidia-50', () => {
    const cmd = getRunCommand({
      ...baseConfig,
      computerType: 'windows',
      windowsShell: 'cmd',
      gpuType: 'nvidia-50',
    });

    expect(cmd).toMatch(/^cd \/d Reigh-Worker &&/);
    expect(cmd).toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda128');
    expect(cmd).not.toContain('"%USERPROFILE%\\.local\\bin\\uv.exe" sync --locked --python 3.10 --extra cuda124');
  });

  it('throws UnsupportedPlatformError on macOS', () => {
    expect(() => getRunCommand({ ...baseConfig, computerType: 'mac' })).toThrow(UnsupportedPlatformError);
    expect(() => getInstallationCommand({ ...baseConfig, computerType: 'mac' })).toThrow(UnsupportedPlatformError);
  });
});
