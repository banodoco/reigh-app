import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Palette, Crown, Star, Wrench, PlusCircle, Settings } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Session } from '@supabase/supabase-js';
import { ProjectSelectorPopover } from './ProjectSelectorPopover';
import { darkIconColors, getDarkIconStyle, getReferralButtonText } from './types';
import type { ReferralStats } from './types';
import { useGlobalHeaderProject } from './useGlobalHeaderProject';

interface GlobalHeaderMobileProps {
  contentOffsetLeft: number;
  contentOffsetRight: number;
  onOpenSettings?: () => void;
  session: Session | null;
  referralStats: ReferralStats | null;
  isBrandFlash: boolean;
  triggerBrandFlash: () => void;
  onOpenCreateProject: (initialName?: string) => void;
  onOpenProjectSettings: () => void;
  onOpenReferralModal: () => void;
}

export const GlobalHeaderMobile: React.FC<GlobalHeaderMobileProps> = ({
  contentOffsetLeft,
  contentOffsetRight,
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
      className="md:hidden w-full pt-1"
      style={(() => {
        const symmetricOffset = Math.max(contentOffsetLeft || 0, contentOffsetRight || 0);
        // Reduce mobile padding to 60% of the calculated offset for tighter spacing
        const mobilePadding = Math.floor(symmetricOffset * 0.6);
        return symmetricOffset
          ? { paddingLeft: `${mobilePadding}px`, paddingRight: `${mobilePadding}px` }
          : undefined;
      })()}
    >
      {/* Top row - Brand + Project Buttons + App Settings */}
      <div className="flex items-center justify-between h-16 w-full px-4">
        {/* Left side - Brand + Project Buttons */}
        <div className="flex items-center space-x-3">
          {/* Brand */}
          <div
            role="link"
            tabIndex={0}
            aria-label="Go to homepage"
            onPointerDown={triggerBrandFlash}
            onPointerUp={() => navigate("/")}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate("/"); }}
            className="group relative cursor-pointer z-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-wes-vintage-gold/50 rounded-xl"
          >
            <div className="relative flex items-center space-x-2">
              <div className="relative">
                <div
                  className={cn(
                    "flex items-center justify-center w-12 h-12 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue",
                    "dark:bg-none dark:border-2 rounded-sm",
                    "shadow-[-3px_3px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-3px_3px_0_0_hsl(var(--shadow-header-dark)_/_0.4)]",
                    "group-hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:group-hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-dark)_/_0.4)]",
                    "group-hover:translate-x-[1px] group-hover:translate-y-[1px] transition-all duration-300",
                    "touch-border-gold",
                    isBrandFlash && darkMode ? "!border-wes-vintage-gold" : null
                  )}
                  style={getDarkIconStyle(darkIconColors.palette, darkMode)}
                >
                  <Palette
                    className={cn(
                      "h-6 w-6 group-hover:rotate-12 transition-all duration-300",
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
                <div className="absolute -top-1 -right-1 pointer-events-none">
                  <Crown className="w-2.5 h-2.5 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
                </div>
              </div>

              <div className="relative">
                <span className="font-heading text-xl font-theme-heading tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                  Reigh
                </span>
                <div className="absolute -top-1 -right-1 pointer-events-none">
                  <Star className="w-2 h-2 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                </div>
              </div>
            </div>
          </div>

          {/* Project Buttons */}
          {/* Project Settings Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenProjectSettings}
            className="h-10 w-10 gradient-icon-coral dark:bg-none dark:border-2 rounded-sm shadow-[-2px_2px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-2px_2px_0_0_hsl(var(--shadow-header-dark)_/_0.4)] hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-hover)_/_0.4)] hover:translate-x-[0.5px] hover:translate-y-[0.5px] group disabled:cursor-not-allowed transition-all duration-300"
            disabled={isLoadingProjects || !selectedProject}
            style={getDarkIconStyle(darkIconColors.coral, darkMode)}
          >
            <Wrench className="h-4 w-4 group-hover:animate-wrench-turn" style={{ color: darkMode ? darkIconColors.coral : 'white' }} />
          </Button>

          {/* Create Project Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenCreateProject(undefined)}
            className="h-10 w-10 wes-button-pulse gradient-icon-yellow dark:bg-none dark:border-2 rounded-sm shadow-[-2px_2px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-2px_2px_0_0_hsl(var(--shadow-header-dark)_/_0.4)] hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-hover)_/_0.4)] hover:translate-x-[0.5px] hover:translate-y-[0.5px] group transition-all duration-300"
            style={getDarkIconStyle(darkIconColors.yellow, darkMode)}
          >
            <PlusCircle className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" style={{ color: darkMode ? darkIconColors.yellow : 'white' }} />
          </Button>
        </div>

        {/* Right side - Referral text and App Settings */}
        <div className="flex items-center gap-2 relative z-50">
          <button
            className="text-[10px] text-muted-foreground underline cursor-pointer font-thin hover:text-foreground transition-colors duration-200 text-right touch-manipulation active:text-foreground/70 min-h-[44px] px-2 py-2 relative z-50 max-w-[64px] leading-tight"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenReferralModal();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            type="button"
          >
            {getReferralButtonText(session, referralStats)}
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="h-10 w-10 no-sweep wes-button-spin-pulse gradient-icon-blue dark:bg-none dark:border-2 rounded-sm shadow-[-2px_2px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:shadow-[-2px_2px_0_0_hsl(var(--shadow-header-dark)_/_0.4)] hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header)_/_0.15)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-header-hover)_/_0.4)] hover:translate-x-[0.5px] hover:translate-y-[0.5px] group relative overflow-hidden transition-all duration-300"
            style={getDarkIconStyle(darkIconColors.blue, darkMode)}
          >
            <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain pointer-events-none"></div>
            <Settings className="h-4 w-4 relative z-10 transition-transform duration-500 group-hover:[transform:rotate(360deg)] delay-100" style={{ color: darkMode ? darkIconColors.blue : 'white' }} />
          </Button>
        </div>
      </div>

      {/* Bottom row - Project Selector */}
      <div className="flex items-center h-16 w-full px-4 pt-1 pb-4">
        <div className="flex-1 relative z-40">
          {isLoadingProjects && projects.length === 0 ? (
            <div className="w-full h-10 bg-muted animate-pulse rounded-sm border-2 border-[#6a8a8a]/25 dark:border-[#6a7a7a]"></div>
          ) : projects.length === 0 && !isLoadingProjects ? (
            <div className="text-center">
              <div className="wes-vintage-card p-2">
                <p className="font-cocogoose text-xs text-muted-foreground">No projects</p>
              </div>
            </div>
          ) : (
            <ProjectSelectorPopover
              projects={projects}
              selectedProject={selectedProject}
              isLoadingProjects={isLoadingProjects}
              onProjectChange={handleProjectChange}
              onCreateProject={onOpenCreateProject}
              variant="mobile"
            />
          )}
        </div>
      </div>
    </div>
  );
};
