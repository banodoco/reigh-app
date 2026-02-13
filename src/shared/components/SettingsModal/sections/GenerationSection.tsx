import React, { useState, useRef } from "react";
import { Key, Copy, Terminal, HelpCircle, ChevronDown } from "lucide-react";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import CreditsManagement from "../../CreditsManagement";
import { getInstallationCommand, getRunCommand, generateAIInstructions, safeCopy } from "../commandUtils";
import type { GenerationSectionProps, CommandConfig } from "../types";

const COMPUTER_LABELS: Record<string, string> = {
  linux: "Linux",
  windows: "Windows",
  mac: "Mac",
};

const GPU_LABELS: Record<string, string> = {
  "nvidia-30-40": "NVIDIA ≤40 series",
  "nvidia-50": "NVIDIA 50 series",
  "non-nvidia": "Non-NVIDIA",
};

const MEMORY_LABELS: Record<string, string> = {
  "1": "Max Performance",
  "2": "High RAM",
  "3": "Balanced",
  "4": "Conservative",
  "5": "Minimum",
};

const SHELL_LABELS: Record<string, string> = {
  cmd: "Command Prompt",
  powershell: "PowerShell",
};

const GenerationSection: React.FC<GenerationSectionProps> = ({
  isMobile,
  onComputerChecked,
  inCloudChecked,
  updateGenerationMethodsWithNotification,
  isLoadingGenerationMethods,
  hasValidToken,
  generatedToken,
  handleGenerateToken,
  isGenerating,
  getActiveToken,
  computerType,
  setComputerType,
  gpuType,
  setGpuType,
  memoryProfile,
  setMemoryProfile,
  windowsShell,
  setWindowsShell,
  showDebugLogs,
  setShowDebugLogs,
  activeInstallTab,
  setActiveInstallTab,
  creditsTab = "purchase",
}) => {
  // Copy command feedback states
  const [copiedInstallCommand, setCopiedInstallCommand] = useState(false);
  const [copiedRunCommand, setCopiedRunCommand] = useState(false);
  const [copiedAIInstructions, setCopiedAIInstructions] = useState(false);

  // Show / hide full command previews
  const [showFullInstallCommand, setShowFullInstallCommand] = useState(false);
  const [showFullRunCommand, setShowFullRunCommand] = useState(false);
  const [showPrerequisites, setShowPrerequisites] = useState(false);

  // Refs for scrolling to commands
  const installCommandRef = useRef<HTMLDivElement>(null);
  const runCommandRef = useRef<HTMLDivElement>(null);

  // Build command config
  const getCommandConfig = (): CommandConfig => ({
    computerType,
    gpuType,
    memoryProfile,
    windowsShell,
    showDebugLogs,
    token: generatedToken || getActiveToken()?.token || 'your-api-token',
  });

  // Functions to reveal commands and scroll to them
  const handleRevealInstallCommand = () => {
    setShowFullInstallCommand(true);
    setTimeout(() => {
      installCommandRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  };

  const handleRevealRunCommand = () => {
    setShowFullRunCommand(true);
    setTimeout(() => {
      runCommandRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  };

  const handleCopyInstallCommand = async () => {
    const ok = await safeCopy(getInstallationCommand(getCommandConfig()));
    if (ok) {
      setCopiedInstallCommand(true);
      setTimeout(() => setCopiedInstallCommand(false), 3000);
    }
  };

  const handleCopyRunCommand = async () => {
    const ok = await safeCopy(getRunCommand(getCommandConfig()));
    if (ok) {
      setCopiedRunCommand(true);
      setTimeout(() => setCopiedRunCommand(false), 3000);
    }
  };

  const handleCopyAIInstructions = async () => {
    const ok = await safeCopy(generateAIInstructions(getCommandConfig(), activeInstallTab));
    if (ok) {
      setCopiedAIInstructions(true);
      setTimeout(() => setCopiedAIInstructions(false), 3000);
    }
  };

  return (
    <>
      {/* Generation Method Selection */}
      <div className={`${isMobile ? 'mb-3' : 'mb-5'}`}>
        {/* Mobile header */}
        {isMobile && (
          <div className="mb-2">
            <p className="text-sm text-muted-foreground mb-4">How would you like to generate?</p>
          </div>
        )}

        <div className={`${isMobile ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-6'} items-start`}>
          {/* Left column: options */}
          <div className="space-y-2 sm:space-y-4">
            {!isMobile && (
              <p className="text-sm text-muted-foreground mb-4">How would you like to generate?</p>
            )}

            {isLoadingGenerationMethods ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-64 rounded-full" />
              </div>
            ) : (
              <div className="flex items-center justify-start">
                <SegmentedControl
                  value={inCloudChecked && !onComputerChecked ? 'cloud' : onComputerChecked && !inCloudChecked ? 'local' : ''}
                  onValueChange={(value) => {
                    if (value === 'cloud') {
                      updateGenerationMethodsWithNotification({ inCloud: true, onComputer: false });
                    } else if (value === 'local') {
                      updateGenerationMethodsWithNotification({ onComputer: true, inCloud: false });
                    }
                  }}
                  variant="pill"
                >
                  <SegmentedControlItem value="cloud" colorScheme="blue">
                    In the cloud
                  </SegmentedControlItem>
                  <SegmentedControlItem value="local" colorScheme="emerald">
                    On my computer
                  </SegmentedControlItem>
                </SegmentedControl>
              </div>
            )}
          </div>

          {/* Right column: GIF */}
          <div className="flex justify-start items-start">
            {!isLoadingGenerationMethods && !onComputerChecked && !inCloudChecked && (
              <img
                src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads/files/ds.gif"
                alt="Choose generation method"
                className="w-[120px] h-[120px] object-contain transform scale-x-[-1]"
              />
            )}
          </div>
        </div>
      </div>

      <div className={`space-y-6 sm:space-y-8 ${isMobile ? 'pb-2' : 'pb-2'}`}>
        {/* Loading state for generation sections */}
        {isLoadingGenerationMethods && (
          <div className="space-y-6">
            {/* Credits section skeleton */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            {/* Settings section skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
        )}

        {/* Credits Management Section */}
        {!isLoadingGenerationMethods && inCloudChecked && (
          <div className="space-y-3 sm:space-y-4">
            <CreditsManagement initialTab={creditsTab} mode="add-credits" />
          </div>
        )}

        {/* Local Generation Section */}
        {!isLoadingGenerationMethods && onComputerChecked && (
          <div className="space-y-3 sm:space-y-4">
            {!hasValidToken ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="h-5 w-5 text-blue-600" />
                    <h4 className="font-light text-blue-900">To generate locally, you need an API key.</h4>
                  </div>
                  <Button
                    onClick={handleGenerateToken}
                    disabled={isGenerating}
                    className="w-full"
                  >
                    {isGenerating ? "Generating..." : "Generate Key & Show Instructions"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Installation section */}
                <div className="space-y-4">
                  {/* System Configuration Row */}
                  <div className={`grid ${isMobile ? 'grid-cols-2' : computerType === 'windows' ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
                    {/* Computer Type */}
                    <div>
                      <Label className="text-xs text-blue-600 dark:text-blue-400 mb-1 block">Computer:</Label>
                      <Select value={computerType} onValueChange={setComputerType}>
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

                    {/* GPU Type */}
                    <div>
                      <Label className="text-xs text-violet-600 dark:text-violet-400 mb-1 block">GPU:</Label>
                      <Select value={gpuType} onValueChange={setGpuType} disabled={computerType === "mac"}>
                        <SelectTrigger variant="retro" size="sm" colorScheme="violet" className="w-full h-9">
                          <SelectValue>{(v: string | null) => GPU_LABELS[v ?? ""] ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent variant="retro">
                          <SelectItem variant="retro" value="nvidia-30-40" label="NVIDIA ≤40 series">NVIDIA ≤40 series</SelectItem>
                          <SelectItem variant="retro" value="nvidia-50" label="NVIDIA 50 series">NVIDIA 50 series</SelectItem>
                          <SelectItem variant="retro" value="non-nvidia" label="Non-NVIDIA">Non-NVIDIA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Memory Profile */}
                    <div>
                      <Label className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 block">Memory:</Label>
                      <Select value={memoryProfile} onValueChange={setMemoryProfile}>
                        <SelectTrigger variant="retro" size="sm" colorScheme="emerald" className="w-full h-9">
                          <SelectValue>{(v: string | null) => MEMORY_LABELS[v ?? ""] ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent variant="retro">
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <SelectItem variant="retro" value="1" label="Max Performance" className="cursor-pointer">Max Performance</SelectItem>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                <p className="text-sm">64GB+ RAM, 24GB VRAM. Fastest.</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <SelectItem variant="retro" value="2" label="High RAM" className="cursor-pointer">High RAM</SelectItem>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                <p className="text-sm">64GB+ RAM, 12GB VRAM. Long videos.</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <SelectItem variant="retro" value="3" label="Balanced" className="cursor-pointer">Balanced</SelectItem>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                <p className="text-sm">32GB RAM, 24GB VRAM. Recommended for 3090/4090.</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <SelectItem variant="retro" value="4" label="Conservative" className="cursor-pointer">Conservative</SelectItem>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                <p className="text-sm">32GB RAM, 12GB VRAM. Works everywhere.</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={0}>
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

                    {/* Windows Shell Type (only shown for Windows) */}
                    {computerType === "windows" && (
                      <div>
                        <Label className="text-xs text-rose-600 dark:text-rose-400 mb-1 block">Shell:</Label>
                        <Select value={windowsShell} onValueChange={setWindowsShell}>
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

                    {/* Debug Logs Toggle */}
                    <div>
                      <Label className="text-xs text-amber-600 dark:text-amber-400 mb-1 block">Debug:</Label>
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
                  </div>

                  {/* PowerShell Execution Policy Notice */}
                  {computerType === "windows" && windowsShell === "powershell" && (
                    <div className="p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg">
                      <p className="text-xs text-rose-700 dark:text-rose-400">
                        If activation fails, run once: <code className="text-[10px]">Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser</code>
                      </p>
                    </div>
                  )}

                  {/* Mac Notice */}
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

                  {/* Non-NVIDIA GPU Notice */}
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
                          {/* Windows Prerequisites */}
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
                              Run this command to install and start the local worker:
                            </p>
                          </div>

                          <div className="relative" ref={installCommandRef}>
                            <div
                              className={`bg-gray-900 text-green-400 p-3 pb-12 rounded-lg font-mono text-xs sm:text-sm overflow-hidden ${
                                showFullInstallCommand ? 'overflow-x-auto' : ''
                              }`}
                              style={{
                                height: showFullInstallCommand ? 'auto' : '100px'
                              }}
                            >
                              <pre className="whitespace-pre-wrap break-all text-xs sm:text-sm leading-relaxed">
                                {getInstallationCommand(getCommandConfig())}
                              </pre>
                            </div>

                            {/* Gradient fade behind buttons */}
                            {!showFullInstallCommand && (
                              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent pointer-events-none rounded-b-lg" />
                            )}

                            {/* Fixed buttons at bottom of command block - centered */}
                            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-center gap-2 z-10">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopyInstallCommand}
                                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white border-blue-500"
                              >
                                {copiedInstallCommand ? "Copied!" : (
                                  <>
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={showFullInstallCommand ? () => setShowFullInstallCommand(false) : handleRevealInstallCommand}
                                className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                              >
                                {showFullInstallCommand ? 'Hide' : 'Reveal'}
                              </Button>
                            </div>
                          </div>

                          <div className="flex justify-center mt-1">
                            {isMobile ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="link" className="text-xs text-blue-600 hover:text-blue-800 p-1 h-auto touch-manipulation">
                                    <HelpCircle className="h-3 w-3 mr-1" />
                                    Need help?
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="max-w-sm">
                                  <div className="py-3 space-y-3">
                                    <p className="font-light">Troubleshooting steps:</p>
                                    <ol className="text-sm space-y-2 list-decimal list-inside">
                                      <li>Try running each line of the commands one-at-a-time</li>
                                      <li>Feed the command-line log into ChatGPT or your LLM of choice</li>
                                      <li>Drop into the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">help channel</a> of the Reigh discord</li>
                                    </ol>
                                    <div className="flex justify-center pt-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopyAIInstructions}
                                        className="text-xs min-h-[40px] touch-manipulation"
                                      >
                                        {copiedAIInstructions ? (
                                          "Copied!"
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3 mr-1" />
                                            Copy instructions to get help from AI
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="link" className="text-xs text-blue-600 hover:text-blue-800 p-1 h-auto touch-manipulation">
                                    <HelpCircle className="h-3 w-3 mr-1" />
                                    Need help?
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="max-w-sm">
                                  <div className="py-2 space-y-2">
                                    <p className="font-light text-sm">Troubleshooting steps:</p>
                                    <ol className="text-xs space-y-1 list-decimal list-inside">
                                      <li>Try running each line one-at-a-time</li>
                                      <li>Feed errors into ChatGPT or your LLM</li>
                                      <li>Join the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Reigh discord</a></li>
                                    </ol>
                                    <div className="flex justify-center pt-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopyAIInstructions}
                                        className="text-xs"
                                      >
                                        {copiedAIInstructions ? "Copied!" : (
                                          <>
                                            <Copy className="h-3 w-3 mr-1" />
                                            Copy prompt for AI help
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="already-installed" className="space-y-4">
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm text-muted-foreground mb-4">
                              Start your local worker (auto-detects folder):
                            </p>
                          </div>

                          <div className="relative" ref={runCommandRef}>
                            <div
                              className={`bg-gray-900 text-green-400 p-3 pb-12 rounded-lg font-mono text-xs sm:text-sm overflow-hidden ${
                                showFullRunCommand ? 'overflow-x-auto' : ''
                              }`}
                              style={{
                                height: showFullRunCommand ? 'auto' : '100px'
                              }}
                            >
                              <pre className="whitespace-pre-wrap break-all text-xs sm:text-sm leading-relaxed">
                                {getRunCommand(getCommandConfig())}
                              </pre>
                            </div>

                            {/* Gradient fade behind buttons */}
                            {!showFullRunCommand && (
                              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent pointer-events-none rounded-b-lg" />
                            )}

                            {/* Fixed buttons at bottom of command block - centered */}
                            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-center gap-2 z-10">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopyRunCommand}
                                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white border-blue-500"
                              >
                                {copiedRunCommand ? "Copied!" : (
                                  <>
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={showFullRunCommand ? () => setShowFullRunCommand(false) : handleRevealRunCommand}
                                className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                              >
                                {showFullRunCommand ? 'Hide' : 'Reveal'}
                              </Button>
                            </div>
                          </div>

                          <div className="flex justify-center mt-1">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="link" className="text-xs text-blue-600 hover:text-blue-800 p-1 h-auto touch-manipulation">
                                  <HelpCircle className="h-3 w-3 mr-1" />
                                  Need help?
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="max-w-sm">
                                <div className="py-2 space-y-2">
                                  <p className="font-light text-sm">Troubleshooting steps:</p>
                                  <ol className="text-xs space-y-1 list-decimal list-inside">
                                    <li>Try running each line one-at-a-time</li>
                                    <li>Feed errors into ChatGPT or your LLM</li>
                                    <li>Join the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Reigh discord</a></li>
                                  </ol>
                                  <div className="flex justify-center pt-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={handleCopyAIInstructions}
                                      className="text-xs"
                                    >
                                      {copiedAIInstructions ? "Copied!" : (
                                        <>
                                          <Copy className="h-3 w-3 mr-1" />
                                          Copy prompt for AI help
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default GenerationSection;
