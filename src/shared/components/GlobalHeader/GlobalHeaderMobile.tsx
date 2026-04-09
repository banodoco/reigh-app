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

interface GlobalHeaderMobileProps extends GlobalHeaderSharedActionsProps {
  contentOffsetLeft: number;
  contentOffsetRight: number;
  onNavigateHome: () => void;
}

export const GlobalHeaderMobile: React.FC<GlobalHeaderMobileProps> = ({
  contentOffsetLeft,
  contentOffsetRight,
  onOpenSettings,
  session,
  referralStats,
  isBrandFlash,
  triggerBrandFlash,
  onNavigateHome,
  onOpenCreateProject,
  onOpenProjectSettings,
  onOpenReferralModal,
}) => {
  const { darkMode, projects, selectedProject, isLoadingProjects, handleProjectChange } = useGlobalHeaderProject({ onOpenCreateProject });

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
        <div className="flex items-center gap-x-3">
          {/* Brand */}
          <GlobalHeaderBrand
            density="mobile"
            darkMode={darkMode}
            isBrandFlash={isBrandFlash}
            triggerBrandFlash={triggerBrandFlash}
            onNavigateHome={onNavigateHome}
          />

          {/* Project Buttons */}
          <GlobalHeaderProjectButtons
            density="mobile"
            darkMode={darkMode}
            isLoadingProjects={isLoadingProjects}
            hasSelectedProject={Boolean(selectedProject)}
            onOpenProjectSettings={onOpenProjectSettings}
            onOpenCreateProject={onOpenCreateProject}
          />
        </div>

        {/* Right side - Referral text and App Settings */}
        <div className="flex items-center gap-2 relative z-50">
          <GlobalHeaderReferralButton
            density="mobile"
            session={session}
            referralStats={referralStats}
            onOpenReferralModal={onOpenReferralModal}
          />
          <GlobalHeaderSettingsButton
            density="mobile"
            darkMode={darkMode}
            onOpenSettings={onOpenSettings}
          />
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
