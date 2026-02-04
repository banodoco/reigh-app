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

export interface GenerationSectionProps {
  isMobile: boolean;
  // Generation method state
  onComputerChecked: boolean;
  inCloudChecked: boolean;
  updateGenerationMethodsWithNotification: (patch: { onComputer?: boolean; inCloud?: boolean }) => void;
  isLoadingGenerationMethods: boolean;
  // Token state
  hasValidToken: boolean;
  generatedToken: string | null;
  handleGenerateToken: () => void;
  isGenerating: boolean;
  getActiveToken: () => { token: string; created_at: string } | undefined;
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
  // Tab state
  activeInstallTab: string;
  setActiveInstallTab: (value: string) => void;
  // Props
  creditsTab?: 'purchase' | 'history' | 'task-log';
}

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

interface TransactionsSectionProps {
  // Currently no props needed - thin wrapper around CreditsManagement
}
