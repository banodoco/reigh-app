import React from "react";
import { LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { useIsMobile } from "@/shared/hooks/mobile";
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from "@/shared/hooks/useScrollFade";
import { useDarkMode } from "@/shared/hooks/core/useDarkMode";
import { useAIInputMode } from "@/shared/contexts/AIInputModeContext";
import { PreferencesSection } from "./sections/PreferencesSection";
import type { SettingsModalProps } from "./types";

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
  preserveUserText,
  setPreserveUserText,
}) => {
  const isMobile = useIsMobile();

  // Modal styling and scroll fade
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({
    isOpen: isOpen,
    debug: false,
    preloadFade: modal.isMobile
  });

  // Dark mode
  const { darkMode, setDarkMode } = useDarkMode();

  // AI input mode (voice vs text)
  const { mode: aiInputMode, setMode: setAIInputMode } = useAIInputMode();

  const handleSignOut = async () => {
    await supabase().auth.signOut();
    onOpenChange(false); // Close the modal after signing out
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={modal.className}
        style={(() => {
          const desktopMaxHeight = 'calc(100vh - 24px)';
          const maxHeight = modal.isMobile
            ? (modal.style.maxHeight as string | undefined) ?? '90vh'
            : desktopMaxHeight;
          return {
            ...modal.style,
            maxHeight,
          };
        })()}
      >

        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-1 pb-1' : 'px-2 pt-1 pb-1'} flex-shrink-0 relative`}>
            <div className={`flex ${isMobile ? 'flex-col items-center gap-3' : 'items-center gap-4'}`}>
              <DialogTitle className={`text-2xl ${isMobile ? 'mb-1' : 'md:mt-[11px]'}`}>
                App Settings
              </DialogTitle>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable content container */}
        <div
          ref={scrollRef}
          className={`${modal.scrollClass} ${modal.isMobile ? 'px-2' : 'px-2'} overflow-x-hidden [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] sm:pr-4`}
        >
          <PreferencesSection
            isMobile={isMobile}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            preserveUserText={preserveUserText}
            setPreserveUserText={setPreserveUserText}
            aiInputMode={aiInputMode}
            setAIInputMode={setAIInputMode}
          />

        </div>

        {/* Footer */}
        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-background via-background/95 to-transparent" />
            </div>
          )}

          <DialogFooter className={`${modal.isMobile ? 'px-2 pt-6 pb-3 flex-row justify-between' : 'px-2 pt-7 pb-3'} border-t relative z-20`}>
            <div className="flex gap-2 mr-auto">
              <Button variant="retro-secondary" size="retro-sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
            <Button variant="retro" size="retro-sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { SettingsModal };
