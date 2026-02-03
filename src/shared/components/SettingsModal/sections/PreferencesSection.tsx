import React from "react";
import { Sun, Moon, Mic, Wand2 } from "lucide-react";
import { PrivacyToggle } from "@/shared/components/ui/privacy-toggle";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { PreferencesSectionProps } from "../types";

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  isMobile,
  darkMode,
  setDarkMode,
  preserveUserText,
  setPreserveUserText,
  privacyDefaults,
  updatePrivacyDefaults,
  isLoadingPrivacyDefaults,
  aiInputMode,
  setAIInputMode,
}) => {
  return (
    <div className="space-y-6">
      {/* Appearance Subsection */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Appearance</h3>
        <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted/30 rounded-lg space-y-2`}>
          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
            <span className="font-medium">Theme:</span>
            <div className="flex items-center gap-0">
              <button
                onClick={() => setDarkMode(false)}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-l-full transition-all ${
                  !darkMode
                    ? 'bg-amber-400 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Sun className={`${isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} inline mr-1`} />
                Light
              </button>
              <button
                onClick={() => setDarkMode(true)}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-r-full transition-all ${
                  darkMode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Moon className={`${isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} inline mr-1`} />
                Dark
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Switch between light and dark color schemes
          </p>
        </div>

        {/* User Text Case Toggle */}
        <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted/30 rounded-lg space-y-2 mt-3`}>
          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
            <span className="font-medium">User Text:</span>
            <div className="flex items-center gap-0">
              <button
                onClick={() => setPreserveUserText(false)}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-l-full transition-all ${
                  !preserveUserText
                    ? 'bg-teal-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                lowercase
              </button>
              <button
                onClick={() => setPreserveUserText(true)}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-r-full transition-all title-case ${
                  preserveUserText
                    ? 'bg-teal-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Original Case
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            How project names, shot names, and prompts are displayed
          </p>
        </div>

        {/* AI Input Mode Toggle */}
        <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted/30 rounded-lg space-y-2 mt-3`}>
          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
            <span className="font-medium">AI Input:</span>
            <div className="flex items-center gap-0">
              <button
                onClick={() => setAIInputMode("voice")}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-l-full transition-all ${
                  aiInputMode === "voice"
                    ? 'bg-red-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Mic className={`${isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} inline mr-1`} />
                Voice
              </button>
              <button
                onClick={() => setAIInputMode("text")}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-r-full transition-all ${
                  aiInputMode === "text"
                    ? 'bg-purple-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Wand2 className={`${isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} inline mr-1`} />
                Text
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use voice or typed instructions to create prompts
          </p>
        </div>
      </div>

      {/* Privacy Subsection */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Privacy</h3>
        {isLoadingPrivacyDefaults ? (
          <div className="space-y-4">
            {/* Resources Toggle skeleton */}
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-8 w-40 rounded-full" />
              </div>
              <Skeleton className="h-4 w-64" />
            </div>
            {/* Generations Toggle skeleton */}
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-8 w-40 rounded-full" />
              </div>
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resources Toggle */}
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                <span className="font-medium">Resources:</span>
                <PrivacyToggle
                  isPublic={privacyDefaults.resourcesPublic}
                  onValueChange={(isPublic) => updatePrivacyDefaults({ resourcesPublic: isPublic })}
                  size={isMobile ? "sm" : "default"}
                  className={isMobile ? "w-full" : "w-auto"}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                LoRAs, presets, and reference images you create
              </p>
            </div>

            {/* Generations Toggle */}
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                <span className="font-medium">Generations:</span>
                <PrivacyToggle
                  isPublic={privacyDefaults.generationsPublic}
                  onValueChange={(isPublic) => updatePrivacyDefaults({ generationsPublic: isPublic })}
                  size={isMobile ? "sm" : "default"}
                  className={isMobile ? "w-full" : "w-auto"}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Images and videos you generate
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreferencesSection;
