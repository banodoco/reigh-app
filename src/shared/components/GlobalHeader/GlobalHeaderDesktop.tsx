import React from 'react';
import { ProjectSelectorPopover } from './ProjectSelectorPopover';
import { useGlobalHeaderProject } from './useGlobalHeaderProject';
import {
  GlobalHeaderBrand,
  GlobalHeaderProjectButtons,
  GlobalHeaderReferralButton,
  GlobalHeaderSettingsButton,
  type GlobalHeaderSharedActionsProps,
} from './GlobalHeaderShared';

interface GlobalHeaderDesktopProps extends GlobalHeaderSharedActionsProps {
  contentOffsetRight: number;
  contentOffsetLeft: number;
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
        <GlobalHeaderBrand
          density="desktop"
          darkMode={darkMode}
          isBrandFlash={isBrandFlash}
          triggerBrandFlash={triggerBrandFlash}
          onNavigateHome={() => navigate('/')}
        />

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

          <GlobalHeaderProjectButtons
            density="desktop"
            darkMode={darkMode}
            isLoadingProjects={isLoadingProjects}
            hasSelectedProject={Boolean(selectedProject)}
            onOpenProjectSettings={onOpenProjectSettings}
            onOpenCreateProject={onOpenCreateProject}
          />
        </div>
      </div>

      {/* Right side - Referral text and App Settings */}
      <div className="flex items-end gap-3 relative z-50">
        <GlobalHeaderReferralButton
          density="desktop"
          session={session}
          referralStats={referralStats}
          onOpenReferralModal={onOpenReferralModal}
        />
        <GlobalHeaderSettingsButton
          density="desktop"
          darkMode={darkMode}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
};
