import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Palette, Crown, Wrench, PlusCircle, Settings } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { Session } from '@supabase/supabase-js';
import { ProjectSelectorPopover } from './ProjectSelectorPopover';
import { darkIconColors, getDarkIconStyle, getReferralButtonText } from './types';
import type { ReferralStats } from './types';
import { useGlobalHeaderProject } from './useGlobalHeaderProject';

interface GlobalHeaderDesktopProps {
  contentOffsetRight: number;
  contentOffsetLeft: number;
  onOpenSettings?: () => void;
  session: Session | null;
  referralStats: ReferralStats | null;
  isBrandFlash: boolean;
  triggerBrandFlash: () => void;
  onOpenCreateProject: (initialName?: string) => void;
  onOpenProjectSettings: () => void;
  onOpenReferralModal: () => void;
}

export const GlobalHeaderDesktop: React.FC<GlobalHeaderDesktopProps> = ({
  contentOffsetRight,
  contentOffsetLeft,
  onOpenSettings,
  session,
  referralStats,
  isBrandFlash,
  triggerBrandFlash,
  onOpenCreateProject,
  onOpenProjectSettings,
  onOpenReferralModal,
}) => {
  const { navigate, darkMode, projects, selectedProject, isLoadingProjects, handleProjectChange } = useGlobalHeaderProject({ onOpenCreateProject });

  return (
    <div
      className="hidden md:flex container items-center justify-between transition-all duration-300 ease-smooth relative z-20 h-24"
      style={{
        paddingRight: `${contentOffsetRight}px`,
        paddingLeft: `${contentOffsetLeft}px`,
      }}
    >
      {/* Left side - Brand + Project Selector */}
      <div className="flex items-center gap-x-6 pl-2 relative z-30">
        {/* Brand */}
        <div
          role="link"
          tabIndex={0}
          aria-label="Go to homepage"
          onPointerDown={triggerBrandFlash}
          onPointerUp={() => navigate("/")}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate("/"); }}
          className="group flex items-center gap-x-4 relative p-2 -m-2 cursor-pointer z-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-wes-vintage-gold/50 rounded-2xl"
        >
          <div className="relative">
            <div
              className={cn(
                "flex items-center justify-center w-16 h-16 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue",
                "dark:bg-none dark:border-2 rounded-sm",
                "shadow-[-4px_4px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-4px_4px_0_0_hsl(var(--shadow-header-dark)_/_0.4)]",
                "group-hover:shadow-[-2px_2px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:group-hover:shadow-[-2px_2px_0_0_hsl(var(--shadow-header-hover)_/_0.4)]",
                "group-hover:translate-x-[1px] group-hover:translate-y-[1px] transition-all duration-300",
                "touch-border-gold",
                isBrandFlash && darkMode ? "!border-wes-vintage-gold" : null
              )}
              style={getDarkIconStyle(darkIconColors.palette, darkMode)}
            >
              <Palette
                className={cn(
                  "h-8 w-8 group-hover:rotate-12 transition-all duration-300",
                  "drop-shadow-lg dark:drop-shadow-none touch-hover-gold",
                  darkMode
                    ? "text-[#a098a8] animate-color-shift group-hover:animate-none"
                    : "text-white",
                  isBrandFlash
                    ? (darkMode ? "animate-none !text-wes-vintage-gold" : "!text-[#f0ebe3]")
                    : null
                )}
              />
            </div>
            <div className="absolute -inset-1 border border-wes-vintage-gold/20 rounded-2xl animate-rotate-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <div className="absolute -top-2 -right-2 pointer-events-none">
              <Crown className="w-4 h-4 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
            </div>
          </div>
        </div>

        {/* Project Management */}
        <div className="flex items-center gap-x-3 relative p-1 rounded-xl bg-transparent dark:bg-surface/20 z-40">
          {isLoadingProjects && projects.length === 0 ? (
            <div className="flex items-center gap-x-3">
              {/* Project Selector Skeleton */}
              <div className="w-[280px] h-12 bg-muted animate-pulse rounded-sm border-2 border-[#6a8a8a]/25 dark:border-[#6a7a7a]"></div>
            </div>
          ) : projects.length === 0 && !isLoadingProjects ? (
            <div className="w-[280px] text-center">
              <div className="wes-vintage-card p-3">
                <p className="font-cocogoose text-sm text-muted-foreground">No projects found</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center relative z-50">
              <ProjectSelectorPopover
                projects={projects}
                selectedProject={selectedProject}
                isLoadingProjects={isLoadingProjects}
                onProjectChange={handleProjectChange}
                onCreateProject={onOpenCreateProject}
                variant="desktop"
              />
            </div>
          )}

          {/* Project Settings Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenProjectSettings}
            className="h-12 w-12 gradient-icon-coral dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-3px_3px_0_0_hsl(var(--shadow-header-dark)_/_0.4)] hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-hover)_/_0.4)] hover:translate-x-[1px] hover:translate-y-[1px] group disabled:cursor-not-allowed transition-all duration-300"
            disabled={isLoadingProjects || !selectedProject}
            style={getDarkIconStyle(darkIconColors.coral, darkMode)}
          >
            <Wrench className="h-5 w-5 group-hover:animate-wrench-turn" style={{ color: darkMode ? darkIconColors.coral : 'white' }} />
          </Button>

          {/* Create Project Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenCreateProject(undefined)}
            className="h-12 w-12 wes-button-pulse gradient-icon-yellow dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-3px_3px_0_0_hsl(var(--shadow-header-dark)_/_0.4)] hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-hover)_/_0.4)] hover:translate-x-[1px] hover:translate-y-[1px] group transition-all duration-300"
            style={getDarkIconStyle(darkIconColors.yellow, darkMode)}
          >
            <PlusCircle className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" style={{ color: darkMode ? darkIconColors.yellow : 'white' }} />
          </Button>
        </div>
      </div>

      {/* Right side - Referral text and App Settings */}
      <div className="flex items-end gap-3 relative z-50">
        <button
          className="text-xs text-muted-foreground underline cursor-pointer font-thin mb-0.5 hover:text-foreground transition-colors duration-200 text-right touch-manipulation active:text-foreground/70 relative z-50"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenReferralModal();
          }}
          type="button"
        >
          {getReferralButtonText(session, referralStats)}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="h-12 w-12 no-sweep wes-button-spin-pulse gradient-icon-blue dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-3px_3px_0_0_hsl(var(--shadow-header-dark)_/_0.4)] hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-hover)_/_0.4)] hover:translate-x-[1px] hover:translate-y-[1px] group relative overflow-hidden transition-all duration-300"
          style={getDarkIconStyle(darkIconColors.blue, darkMode)}
        >
          {/* Animated background pattern */}
          <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain pointer-events-none"></div>

          {/* Main settings icon */}
          <Settings className="h-5 w-5 relative z-10 transition-transform duration-500 group-hover:[transform:rotate(360deg)] delay-100" style={{ color: darkMode ? darkIconColors.blue : 'white' }} />
        </Button>
      </div>
    </div>
  );
};
