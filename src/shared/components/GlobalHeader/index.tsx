import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { ProjectSettingsModal } from '@/shared/components/ProjectSettingsModal';
import { ReferralModal } from '@/shared/components/ReferralModal';
import { useGlobalHeaderController } from './GlobalHeaderController';

import { GlobalHeaderDesktop } from './GlobalHeaderDesktop';
import { GlobalHeaderMobile } from './GlobalHeaderMobile';
import type { GlobalHeaderProps } from './types';

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ contentOffsetRight = 0, contentOffsetLeft = 0, onOpenSettings }) => {
  const {
    session,
    referralStats,
    isBrandFlash,
    triggerBrandFlash,
    shouldHaveStickyHeader,
    selectedProject,
    isCreateProjectModalOpen,
    handleCreateProjectModalOpenChange,
    createProjectInitialName,
    isProjectSettingsModalOpen,
    setIsProjectSettingsModalOpen,
    isReferralModalOpen,
    setIsReferralModalOpen,
    handleOpenCreateProject,
    handleOpenProjectSettings,
    handleOpenReferralModal,
  } = useGlobalHeaderController();

  return (
    <>
      <header
        className={cn(
          "wes-header z-50 w-full md:p-0",
          shouldHaveStickyHeader ? "sticky top-0" : "relative"
        )}
      >
        {/* Enhanced background patterns */}
        <div className="wes-deco-pattern absolute inset-0 opacity-20 pointer-events-none"></div>
        <div className="absolute inset-0 wes-diamond-pattern opacity-10 pointer-events-none"></div>

        {/* Vintage film grain overlay */}
        <div className="absolute inset-0 bg-film-grain opacity-10 animate-film-grain pointer-events-none"></div>

        {/* Ornate top border with animated elements - desktop only */}
        <div className="hidden md:block absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-wes-vintage-gold via-wes-coral via-wes-mint via-wes-yellow to-wes-vintage-gold animate-vintage-glow pointer-events-none"></div>

        {/* Decorative corner elements */}
        <div className="absolute top-2 left-4 text-wes-vintage-gold text-xs animate-sway pointer-events-none">{'\u274B'}</div>
        <div className="absolute top-2 right-4 text-wes-coral text-xs animate-sway pointer-events-none" style={{ animationDelay: '1s' }}>{'\u25C6'}</div>

        {/* Desktop Layout (md and up) */}
        <GlobalHeaderDesktop
          contentOffsetRight={contentOffsetRight}
          contentOffsetLeft={contentOffsetLeft}
          onOpenSettings={onOpenSettings}
          session={session}
          referralStats={referralStats}
          isBrandFlash={isBrandFlash}
          triggerBrandFlash={triggerBrandFlash}
          onOpenCreateProject={handleOpenCreateProject}
          onOpenProjectSettings={handleOpenProjectSettings}
          onOpenReferralModal={handleOpenReferralModal}
        />

        {/* Mobile Layout (below md) */}
        <GlobalHeaderMobile
          contentOffsetLeft={contentOffsetLeft}
          contentOffsetRight={contentOffsetRight}
          onOpenSettings={onOpenSettings}
          session={session}
          referralStats={referralStats}
          isBrandFlash={isBrandFlash}
          triggerBrandFlash={triggerBrandFlash}
          onOpenCreateProject={handleOpenCreateProject}
          onOpenProjectSettings={handleOpenProjectSettings}
          onOpenReferralModal={handleOpenReferralModal}
        />

        {/* Enhanced decorative bottom border - desktop only */}
        <div className="hidden md:block absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent pointer-events-none"></div>
        <div className="hidden md:block absolute bottom-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-wes-coral/30 to-transparent pointer-events-none"></div>

        {/* Floating decorative elements */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 pointer-events-none">
          <div className="flex items-center gap-x-4">
            <div className="w-1 h-1 bg-wes-vintage-gold rounded-full animate-vintage-pulse"></div>
            <div className="text-wes-vintage-gold text-xs animate-sway">{'\u25C6'}</div>
            <div className="w-1 h-1 bg-wes-coral rounded-full animate-vintage-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
        </div>
      </header>

      <CreateProjectModal
        isOpen={isCreateProjectModalOpen}
        onOpenChange={handleCreateProjectModalOpenChange}
        initialName={createProjectInitialName}
      />
      {selectedProject && (
        <ProjectSettingsModal
          isOpen={isProjectSettingsModalOpen}
          onOpenChange={setIsProjectSettingsModalOpen}
          project={selectedProject}
        />
      )}
      <ReferralModal
        isOpen={isReferralModalOpen}
        onOpenChange={setIsReferralModalOpen}
      />
    </>
  );
};
