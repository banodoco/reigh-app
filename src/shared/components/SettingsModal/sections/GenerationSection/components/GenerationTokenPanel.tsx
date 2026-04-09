import React, { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Terminal, ChevronDown, Info } from 'lucide-react';
import { Label } from '@/shared/components/ui/primitives/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { Input } from '@/shared/components/ui/input';
import { getInstallationCommand, getRunCommand, generateAIInstructions, safeCopy } from '../../../commandUtils';
import type { CommandConfig } from '../../../types';
import { CommandPreview } from './CommandPreview';
import { GenerationHelpPopover } from './GenerationHelpPopover';
import { useCommandVisibility } from '../hooks/useCommandVisibility';

const COMPUTER_LABELS: Record<string, string> = {
  linux: 'Linux',
  windows: 'Windows',
  mac: 'Mac',
};

const GPU_LABELS: Record<string, string> = {
  'nvidia-30-40': 'NVIDIA <=40 series',
  'nvidia-50': 'NVIDIA 50 series',
  'non-nvidia': 'Non-NVIDIA',
};

const MEMORY_LABELS: Record<string, string> = {
  '1': 'Max Performance',
  '2': 'High RAM',
  '3': 'Balanced',
  '4': 'Conservative',
  '5': 'Minimum',
};

const SHELL_LABELS: Record<string, string> = {
  cmd: 'Command Prompt',
  powershell: 'PowerShell',
};

const IDLE_RELEASE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Never' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '75', label: '75 min' },
  { value: '90', label: '90 min' },
];

const IDLE_RELEASE_LABELS: Record<string, string> = Object.fromEntries(
  IDLE_RELEASE_OPTIONS.map(({ value, label }) => [value, label]),
);

interface FieldLabelProps {
  text: string;
  colorClassName: string;
  tooltip: string;
}

const FieldLabel: React.FC<FieldLabelProps> = ({ text, colorClassName, tooltip }) => (
  <div className="flex items-center gap-1 mb-1">
    <Label className={`text-xs ${colorClassName}`}>{text}</Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`${colorClassName} opacity-60 hover:opacity-100 cursor-help transition-opacity`}>
          <Info className="h-3 w-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs leading-snug">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </div>
);

function useCopyFeedback() {
  const [copiedInstallCommand, setCopiedInstallCommand] = useState(false);
  const [copiedRunCommand, setCopiedRunCommand] = useState(false);
  const [copiedAIInstructions, setCopiedAIInstructions] = useState(false);

  const triggerCopyFeedback = useCallback((setCopied: Dispatch<SetStateAction<boolean>>) => {
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, []);

  return {
    copiedInstallCommand,
    copiedRunCommand,
    copiedAIInstructions,
    markInstallCopied: () => triggerCopyFeedback(setCopiedInstallCommand),
    markRunCopied: () => triggerCopyFeedback(setCopiedRunCommand),
    markAICopied: () => triggerCopyFeedback(setCopiedAIInstructions),
  };
}

interface GenerationTokenPanelConfig {
  computerType: string;
  gpuType: string;
  memoryProfile: string;
  windowsShell: string;
  showDebugLogs: boolean;
  idleReleaseMinutes: string;
  workerRepoPath: string;
}

interface GenerationTokenPanelState {
  generatedToken: string | null;
  activeInstallTab: string;
}

interface GenerationTokenPanelActions {
  getActiveToken: () => { token: string; created_at: string } | undefined;
  setComputerType: (value: string) => void;
  setGpuType: (value: string) => void;
  setMemoryProfile: (value: string) => void;
  setWindowsShell: (value: string) => void;
  setShowDebugLogs: (value: boolean) => void;
  setIdleReleaseMinutes: (value: string) => void;
  setWorkerRepoPath: (value: string) => void;
  setActiveInstallTab: (value: string) => void;
  updateGenerationMethodsWithNotification: (patch: { onComputer?: boolean; inCloud?: boolean }) => void;
}

interface GenerationTokenPanelProps {
  isMobile: boolean;
  config: GenerationTokenPanelConfig;
  state: GenerationTokenPanelState;
  actions: GenerationTokenPanelActions;
}

export const GenerationTokenPanel: React.FC<GenerationTokenPanelProps> = ({
  isMobile,
  config,
  state,
  actions,
}) => {
  const {
    computerType,
    gpuType,
    memoryProfile,
    windowsShell,
    showDebugLogs,
    idleReleaseMinutes,
    workerRepoPath,
  } = config;
  const {
    generatedToken,
    activeInstallTab,
  } = state;
  const {
    getActiveToken,
    setComputerType,
    setGpuType,
    setMemoryProfile,
    setWindowsShell,
    setShowDebugLogs,
    setIdleReleaseMinutes,
    setWorkerRepoPath,
    setActiveInstallTab,
    updateGenerationMethodsWithNotification,
  } = actions;
  const {
    copiedInstallCommand,
    copiedRunCommand,
    copiedAIInstructions,
    markInstallCopied,
    markRunCopied,
    markAICopied,
  } = useCopyFeedback();
  const {
    showFullInstallCommand,
    setShowFullInstallCommand,
    showFullRunCommand,
    setShowFullRunCommand,
    showPrerequisites,
    setShowPrerequisites,
    installCommandRef,
    runCommandRef,
    revealInstallCommand,
    revealRunCommand,
  } = useCommandVisibility();

  const getCommandConfig = useCallback((): CommandConfig => ({
    computerType,
    gpuType,
    memoryProfile,
    windowsShell,
    showDebugLogs,
    idleReleaseMinutes,
    workerRepoPath,
    token: generatedToken || getActiveToken()?.token || 'your-api-token',
  }), [computerType, gpuType, memoryProfile, windowsShell, showDebugLogs, idleReleaseMinutes, workerRepoPath, generatedToken, getActiveToken]);

  const handleCopyInstallCommand = useCallback(async () => {
    const ok = await safeCopy(getInstallationCommand(getCommandConfig()));
    if (ok) {
      markInstallCopied();
    }
  }, [getCommandConfig, markInstallCopied]);

  const handleCopyRunCommand = useCallback(async () => {
    const ok = await safeCopy(getRunCommand(getCommandConfig()));
    if (ok) {
      markRunCopied();
    }
  }, [getCommandConfig, markRunCopied]);

  const handleCopyAIInstructions = useCallback(async () => {
    const ok = await safeCopy(generateAIInstructions(getCommandConfig(), activeInstallTab));
    if (ok) {
      markAICopied();
    }
  }, [getCommandConfig, activeInstallTab, markAICopied]);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <TooltipProvider>
        <div className={`grid ${isMobile ? 'grid-cols-2' : computerType === 'windows' ? 'grid-cols-6' : 'grid-cols-5'} gap-2`}>
          <div>
            <FieldLabel
              text="Machine:"
              colorClassName="text-blue-600 dark:text-blue-400"
              tooltip="Your operating system. Determines which install commands and shell-specific paths to use."
            />
            <Select
              value={computerType}
              onValueChange={(value) => {
                if (value) {
                  setComputerType(value);
                }
              }}
            >
              <SelectTrigger variant="retro" size="sm" colorScheme="blue" className="w-full h-9">
                <SelectValue>{(v: string | null) => COMPUTER_LABELS[v ?? ""] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent variant="retro">
                <SelectItem variant="retro" value="linux" label="Linux">Linux</SelectItem>
                <SelectItem variant="retro" value="windows" label="Windows">Windows</SelectItem>
                <SelectItem variant="retro" value="mac" label="Mac">Mac</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel
              text="GPU:"
              colorClassName="text-violet-600 dark:text-violet-400"
              tooltip="Your graphics card type. Picks the right CUDA build of PyTorch (50-series uses cu128, ≤40-series uses cu124). Non-NVIDIA GPUs aren't supported for local generation."
            />
            <Select
              value={gpuType}
              onValueChange={(value) => {
                if (value) {
                  setGpuType(value);
                }
              }}
              disabled={computerType === "mac"}
            >
              <SelectTrigger variant="retro" size="sm" colorScheme="violet" className="w-full h-9">
                <SelectValue>{(v: string | null) => GPU_LABELS[v ?? ""] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent variant="retro">
                <SelectItem variant="retro" value="nvidia-30-40" label="NVIDIA ≤40 series">{"NVIDIA ≤40 series"}</SelectItem>
                <SelectItem variant="retro" value="nvidia-50" label="NVIDIA 50 series">NVIDIA 50 series</SelectItem>
                <SelectItem variant="retro" value="non-nvidia" label="Non-NVIDIA">Non-NVIDIA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel
              text="Memory:"
              colorClassName="text-emerald-600 dark:text-emerald-400"
              tooltip="How aggressively to use RAM and VRAM. Higher = faster but needs a beefier machine; lower = works on smaller setups but slower. Hover each option for the recommended specs."
            />
            <Select
              value={memoryProfile}
              onValueChange={(value) => {
                if (value) {
                  setMemoryProfile(value);
                }
              }}
            >
              <SelectTrigger variant="retro" size="sm" colorScheme="emerald" className="w-full h-9">
                <SelectValue>{(v: string | null) => MEMORY_LABELS[v ?? ""] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent variant="retro">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectItem variant="retro" value="1" label="Max Performance" className="cursor-pointer">Max Performance</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                      <p className="text-sm">64GB+ RAM, 24GB VRAM. Fastest.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectItem variant="retro" value="2" label="High RAM" className="cursor-pointer">High RAM</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                      <p className="text-sm">64GB+ RAM, 12GB VRAM. Long videos.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectItem variant="retro" value="3" label="Balanced" className="cursor-pointer">Balanced</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                      <p className="text-sm">32GB RAM, 24GB VRAM. Recommended for 3090/4090.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectItem variant="retro" value="4" label="Conservative" className="cursor-pointer">Conservative</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                      <p className="text-sm">32GB RAM, 12GB VRAM. Works everywhere.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectItem variant="retro" value="5" label="Minimum" className="cursor-pointer">Minimum</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                      <p className="text-sm">24GB RAM, 10GB VRAM. Slowest.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </SelectContent>
            </Select>
          </div>

          {computerType === "windows" && (
            <div>
              <FieldLabel
                text="Shell:"
                colorClassName="text-rose-600 dark:text-rose-400"
                tooltip="Which Windows shell you launch from. Picks the correct virtual-environment activation script (PowerShell vs. Command Prompt)."
              />
              <Select
                value={windowsShell}
                onValueChange={(value) => {
                  if (value) {
                    setWindowsShell(value);
                  }
                }}
              >
                <SelectTrigger variant="retro" size="sm" colorScheme="rose" className="w-full h-9">
                  <SelectValue>{(v: string | null) => SHELL_LABELS[v ?? ""] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent variant="retro">
                  <SelectItem variant="retro" value="cmd" label="Command Prompt">Command Prompt</SelectItem>
                  <SelectItem variant="retro" value="powershell" label="PowerShell">PowerShell</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <FieldLabel
              text="Debug:"
              colorClassName="text-amber-600 dark:text-amber-400"
              tooltip="Show verbose logs from the worker. Turn on when something isn't working — copy the output for troubleshooting."
            />
            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className={`w-full h-9 px-3 text-sm rounded-md border transition-colors flex items-center justify-between ${
                showDebugLogs
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                  : 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Logs
              </span>
              <span className={`text-xs ${showDebugLogs ? 'text-blue-600' : 'text-gray-400'}`}>
                {showDebugLogs ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          <div>
            <FieldLabel
              text="Free GPU:"
              colorClassName="text-cyan-600 dark:text-cyan-400"
              tooltip="When the worker has been idle for this long, it shuts down and frees all GPU memory until a new task arrives — so you can run games or other apps in the meantime. Pick Never to keep models loaded permanently."
            />
            <Select
              value={idleReleaseMinutes}
              onValueChange={(value) => {
                if (value) {
                  setIdleReleaseMinutes(value);
                }
              }}
            >
              <SelectTrigger variant="retro" size="sm" colorScheme="cyan" className="w-full h-9">
                <SelectValue>{(v: string | null) => IDLE_RELEASE_LABELS[v ?? ""] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent variant="retro">
                {IDLE_RELEASE_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} variant="retro" value={value} label={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        </TooltipProvider>

        <div className="space-y-1.5">
          <FieldLabel
            text="Worker repo location:"
            colorClassName="text-slate-600 dark:text-slate-400"
            tooltip="The absolute path where your worker repo lives. Every generated command changes into this folder before running git or uv."
          />
          <Input
            aria-label="Worker repo location"
            value={workerRepoPath}
            onChange={(event) => setWorkerRepoPath(event.target.value)}
            className="h-9"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <p className="text-xs text-muted-foreground">
            Install and run commands will always <code>cd</code> into this repo before launching the worker.
          </p>
        </div>

        {computerType === "windows" && windowsShell === "powershell" && (
          <div className="p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg">
            <p className="text-xs text-rose-700 dark:text-rose-400">
              If activation fails, run once: <code className="text-[10px]">Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser</code>
            </p>
          </div>
        )}

        {computerType === "mac" && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              Mac isn't supported yet.{" "}
              <button
                className="text-blue-600 hover:text-blue-700 underline"
                onClick={() => updateGenerationMethodsWithNotification({ onComputer: false, inCloud: true })}
              >
                Process in the cloud
              </button>
            </p>
          </div>
        )}

        {(computerType === "windows" || computerType === "linux") && gpuType === "non-nvidia" && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              Non-NVIDIA GPUs aren't supported.{" "}
              <button
                className="text-blue-600 hover:text-blue-700 underline"
                onClick={() => updateGenerationMethodsWithNotification({ onComputer: false, inCloud: true })}
              >
                Process in the cloud
              </button>
            </p>
          </div>
        )}

        {computerType !== "mac" && gpuType !== "non-nvidia" && (
          <Tabs value={activeInstallTab} onValueChange={setActiveInstallTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-3 h-9 p-1">
              <TabsTrigger
                value="need-install"
                className="data-[active]:bg-card data-[active]:dark:bg-gray-700 data-[active]:shadow-sm data-[active]:text-foreground text-sm py-0 h-full leading-none"
              >
                Install
              </TabsTrigger>
              <TabsTrigger
                value="already-installed"
                className="data-[active]:bg-card data-[active]:dark:bg-gray-700 data-[active]:shadow-sm data-[active]:text-foreground text-sm py-0 h-full leading-none"
              >
                Run
              </TabsTrigger>
            </TabsList>

            <TabsContent value="need-install" className="space-y-4">
              <div className="space-y-4">
                {computerType === "windows" && (
                  <div className="border border-gray-200 rounded-lg">
                    <button
                      onClick={() => setShowPrerequisites(!showPrerequisites)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className="text-sm text-gray-700">
                        Prerequisites (install manually if not already installed):
                      </span>
                      <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showPrerequisites ? 'rotate-180' : ''}`} />
                    </button>
                    {showPrerequisites && (
                      <ul className="list-disc pl-8 pr-4 pb-3 text-sm space-y-1.5 text-gray-600">
                        <li>
                          NVIDIA GPU with CUDA 6.0+ (8GB+ VRAM required)
                        </li>
                        <li>
                          Latest NVIDIA drivers from{" "}
                          <a href="https://nvidia.com/drivers" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                            nvidia.com/drivers
                          </a>
                        </li>
                        <li>
                          Python 3.10+ from{" "}
                          <a href="https://python.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                            python.org
                          </a>
                        </li>
                        <li>
                          Git from{" "}
                          <a href="https://git-scm.com/download/win" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                            git-scm.com/download/win
                          </a>
                        </li>
                        <li>
                          FFmpeg from{" "}
                          <a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                            ffmpeg.org/download.html
                          </a>
                          {" "}(add to PATH)
                        </li>
                      </ul>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Run this command to bootstrap or resync the local worker in your configured repo:
                  </p>
                </div>

                <CommandPreview
                  command={getInstallationCommand(getCommandConfig())}
                  copied={copiedInstallCommand}
                  showFull={showFullInstallCommand}
                  onCopy={handleCopyInstallCommand}
                  onReveal={revealInstallCommand}
                  onHide={() => setShowFullInstallCommand(false)}
                  commandRef={installCommandRef}
                />

                <div className="flex justify-center mt-1">
                  <GenerationHelpPopover
                    isMobile={isMobile}
                    copiedAIInstructions={copiedAIInstructions}
                    onCopyAIInstructions={handleCopyAIInstructions}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="already-installed" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start your local worker from the configured repo location:
                  </p>
                </div>

                <CommandPreview
                  command={getRunCommand(getCommandConfig())}
                  copied={copiedRunCommand}
                  showFull={showFullRunCommand}
                  onCopy={handleCopyRunCommand}
                  onReveal={revealRunCommand}
                  onHide={() => setShowFullRunCommand(false)}
                  commandRef={runCommandRef}
                />

                <div className="flex justify-center mt-1">
                  <GenerationHelpPopover
                    isMobile={false}
                    copiedAIInstructions={copiedAIInstructions}
                    onCopyAIInstructions={handleCopyAIInstructions}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};
