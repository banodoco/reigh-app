import type { AIInputMode } from "@/shared/contexts/AIInputModeContext"

// Types for SettingsModal components

export interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialTab?: string;
  creditsTab?: 'purchase' | 'history' | 'task-log';
}

export interface CommandConfig {
  computerType: string;
  gpuType: string;
  memoryProfile: string;
  windowsShell: string;
  showDebugLogs: boolean;
  token: string;
}

export interface GenerationSectionViewProps {
  isMobile: boolean;
  creditsTab?: 'purchase' | 'history' | 'task-log';
}

export interface GenerationSectionMethodProps {
  // Generation method state
  onComputerChecked: boolean;
  inCloudChecked: boolean;
  updateGenerationMethodsWithNotification: (patch: { onComputer?: boolean; inCloud?: boolean }) => void;
  isLoadingGenerationMethods: boolean;
}

export interface GenerationSectionTokenProps {
  // Token state
  hasValidToken: boolean;
  generatedToken: string | null;
  handleGenerateToken: () => void;
  isGenerating: boolean;
  getActiveToken: () => { token: string; created_at: string } | undefined;
}

export interface GenerationSectionConfigProps {
  // Config state
  computerType: string;
  setComputerType: (value: string) => void;
  gpuType: string;
  setGpuType: (value: string) => void;
  memoryProfile: string;
  setMemoryProfile: (value: string) => void;
  windowsShell: string;
  setWindowsShell: (value: string) => void;
  showDebugLogs: boolean;
  setShowDebugLogs: (value: boolean) => void;
}

export interface GenerationSectionTabProps {
  // Tab state
  activeInstallTab: string;
  setActiveInstallTab: (value: string) => void;
}

export interface GenerationSectionProps
  extends GenerationSectionViewProps,
    GenerationSectionMethodProps,
    GenerationSectionTokenProps,
    GenerationSectionConfigProps,
    GenerationSectionTabProps {}

export interface PreferencesSectionProps {
  isMobile: boolean;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  preserveUserText: boolean;
  setPreserveUserText: (value: boolean) => void;
  privacyDefaults: { resourcesPublic: boolean; generationsPublic: boolean };
  updatePrivacyDefaults: (patch: { resourcesPublic?: boolean; generationsPublic?: boolean }) => void;
  isLoadingPrivacyDefaults: boolean;
  aiInputMode: AIInputMode;
  setAIInputMode: (mode: AIInputMode) => void;
}

