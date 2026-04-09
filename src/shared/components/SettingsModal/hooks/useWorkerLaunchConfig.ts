import { usePersistentState } from "@/shared/hooks/usePersistentState";

function detectOS(): string {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
}

/**
 * The persistent settings that drive the local-worker launch command.
 * Bundled into a single hook so consumers don't have to pass 12 props.
 */
export interface WorkerLaunchConfigValues {
  computerType: string;
  gpuType: string;
  memoryProfile: string;
  windowsShell: string;
  showDebugLogs: boolean;
  idleReleaseMinutes: string;
}

export interface WorkerLaunchConfigSetters {
  setComputerType: (value: string) => void;
  setGpuType: (value: string) => void;
  setMemoryProfile: (value: string) => void;
  setWindowsShell: (value: string) => void;
  setShowDebugLogs: (value: boolean) => void;
  setIdleReleaseMinutes: (value: string) => void;
}

export interface WorkerLaunchConfig {
  config: WorkerLaunchConfigValues;
  setters: WorkerLaunchConfigSetters;
}

/**
 * Owns the persistent settings that feed the local-worker install/run
 * command builder. Replaces the individual usePersistentState calls in
 * SettingsModal.tsx and the drilled props that used to be passed through to
 * GenerationSection.
 */
export function useWorkerLaunchConfig(): WorkerLaunchConfig {
  const [computerType, setComputerType] = usePersistentState<string>("computer-type", detectOS());
  const [gpuType, setGpuType] = usePersistentState<string>("gpu-type", "nvidia-30-40");
  const [memoryProfile, setMemoryProfile] = usePersistentState<string>("memory-profile", "4");
  const [windowsShell, setWindowsShell] = usePersistentState<string>("windows-shell", "powershell");
  const [showDebugLogs, setShowDebugLogs] = usePersistentState<boolean>("show-debug-logs", false);
  // "0" disables idle release; default 15 matches the worker default.
  const [idleReleaseMinutes, setIdleReleaseMinutes] = usePersistentState<string>("idle-release-minutes", "15");

  return {
    config: {
      computerType,
      gpuType,
      memoryProfile,
      windowsShell,
      showDebugLogs,
      idleReleaseMinutes,
    },
    setters: {
      setComputerType,
      setGpuType,
      setMemoryProfile,
      setWindowsShell,
      setShowDebugLogs,
      setIdleReleaseMinutes,
    },
  };
}
