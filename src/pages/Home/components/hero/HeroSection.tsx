import React, { useState, useEffect } from 'react';
import { Github, MessageCircle, Plus } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { usePlatformInstall } from '@/shared/hooks/usePlatformInstall';
import { useIsMobile } from '@/shared/hooks/mobile';
import { InstallInstructionsModal } from '../install/InstallInstructionsModal';
import { GoldSpotlight } from './GoldSpotlight';
import { HeroCtaContent } from './HeroCtaContent';
import { useHeroAnimation } from '../../hooks/useHeroAnimation';
import type { Session } from '@supabase/supabase-js';

// External links
const GITHUB_REPO_URL = 'https://github.com/banodoco/Reigh';
const DISCORD_INVITE_URL = 'https://discord.gg/D5K2c6kfhy';
const BANODOCO_URL = 'http://banodoco.ai/';

// Retro theme color tokens (inline for hydration safety - see comment on retroButtonInlineStyles)
const RETRO_THEME = {
  bg: 'hsl(var(--hero-retro-bg))',
  border: 'hsl(var(--hero-retro-border))',
  text: 'hsl(var(--hero-retro-text))',
  light: 'hsl(var(--hero-retro-light))',
} as const;

interface ExampleStyle {
  prompt: string;
  image1: string;
  image2: string;
  video: string;
}

interface HeroSectionProps {
  barTransitionCompleted: boolean;
  session: Session | null;
  handleDiscordSignIn: () => void;
  navigate: (path: string) => void;
  assetsLoaded: boolean;
  handleOpenToolActivate: () => void;
  handleEmergingActivate: () => void;
  currentExample: ExampleStyle;
  isPaneOpen?: boolean;
}

// Force dark mode styles for retro button to prevent white flash during hydration/theme switch
// Using inline styles for colors to guarantee they're present during re-renders, Tailwind classes for layout/behavior
const retroButtonBaseStyles = "hero-cta inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-14 px-8 sm:px-12 py-4 text-base sm:text-xl max-w-[90vw] sm:max-w-none font-heading rounded-sm border-2 tracking-wide shadow-[-3px_3px_0_0_hsl(var(--shadow-retro-deep)_/_0.4)] hover:shadow-[-1.5px_1.5px_0_0_hsl(var(--shadow-retro-deep)_/_0.4)] hover:translate-x-[-0.75px] hover:translate-y-[0.75px] active:shadow-none active:translate-x-[-1.5px] active:translate-y-[1.5px]";
const retroButtonInlineStyles = {
  backgroundColor: RETRO_THEME.bg,
  borderColor: RETRO_THEME.border,
  color: RETRO_THEME.text,
} as const;

export const HeroSection: React.FC<HeroSectionProps> = ({
  session,
  handleDiscordSignIn,
  navigate,
  assetsLoaded,
  handleOpenToolActivate,
  handleEmergingActivate,
  isPaneOpen = false,
}) => {
  const { phase, banodocoState, barWidth, getFadeStyle, getPopStyle } = useHeroAnimation({ assetsLoaded });
  const [openTipOpen, setOpenTipOpen] = useState(false);
  const [emergingTipOpen, setEmergingTipOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Platform-aware PWA install detection
  const platformInstall = usePlatformInstall();
  const isMobile = useIsMobile();

  // Hide hero content on mobile when pane is open
  const hideHeroContent = isMobile && isPaneOpen;

  // Close install modal if we're in standalone mode (PWA)
  // This handles the case where Chrome transfers page state when clicking "Open in app"
  useEffect(() => {
    if (platformInstall.isStandalone && showInstallModal) {
      setShowInstallModal(false);
    }
  }, [platformInstall.isStandalone, showInstallModal]);

  const isRevealing = phase === 'content-revealing' || phase === 'complete';

  return (
    <div className="container mx-auto px-4 relative flex items-center justify-center min-h-[100svh] md:min-h-[100dvh] py-4 md:py-16">
      <div className="text-center w-full -translate-y-6">
        <div
          className={`max-w-4xl mx-auto transition-opacity duration-300 ${hideHeroContent ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          aria-hidden={hideHeroContent}
        >

          {/* Title (grid-template-rows animates height from 0 to auto) */}
          <div
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: isRevealing ? '1fr' : '0fr' }}
          >
            <div className={phase === 'complete' ? "overflow-visible" : "overflow-hidden"}>
              <div style={getFadeStyle(0.5, 20)}>
                <GoldSpotlight />
              </div>
            </div>
          </div>

          {/* Loading bar */}
          <div
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 translate-y-[calc(-50%+1.5rem)] w-32 h-1.5 z-10 pointer-events-none transition-opacity duration-500 ${
              isRevealing ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="absolute inset-0 bg-amber-900/30 rounded-full"></div>
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.4)]"
              style={{
                width: barWidth,
                transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)'
              }}
            ></div>
          </div>

          {/* Subtitle + Buttons */}
          <div
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: isRevealing ? '1fr' : '0fr' }}
          >
            <div className={phase === 'complete' ? "overflow-visible" : "overflow-hidden"}>
              <div className="mt-4 flex justify-center" style={getFadeStyle(4.5, -60, false)}>
                <p className="subtitle-container font-theme text-2xl md:text-3xl font-theme-body text-[#ecede3]/90 leading-snug tracking-wide mb-8 md:mb-10">
                  <TooltipProvider>
                    <Tooltip open={openTipOpen} onOpenChange={setOpenTipOpen}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={() => {
                            handleOpenToolActivate();
                            // Small delay to let close animation play
                            setTimeout(() => setOpenTipOpen(false), 50);
                          }}
                          className="subtitle-link-left cursor-pointer transition-all duration-200"
                        >
                          <svg
                            className="arrow-wrap-left absolute -left-5 -bottom-[1px] w-5 h-5 pointer-events-none"
                            viewBox="0 0 20 20"
                            fill="none"
                          >
                            <g className="arrow-group-left" opacity="0.5">
                              <path
                                className="arrow-curve-left arrow-draw-curve-left"
                                d="M20 17.25 Q12 17.25 12 11 Q12 6 1 6"
                                stroke={RETRO_THEME.light}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeDasharray="3 3"
                                fill="none"
                              />
                              <path
                                className="arrow-head-left"
                                d="M4 3 L1 6 L4 9"
                                stroke={RETRO_THEME.light}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray="3 3"
                                fill="none"
                              />
                            </g>
                          </svg>
                          <span className="subtitle-link-text">an open source tool</span> for
                        </span>
                      </TooltipTrigger>
                    </Tooltip>
                  </TooltipProvider>
                  <br />
                  <TooltipProvider>
                    <Tooltip open={emergingTipOpen} onOpenChange={setEmergingTipOpen}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={() => {
                            handleEmergingActivate();
                            setTimeout(() => setEmergingTipOpen(false), 50);
                          }}
                          className="subtitle-link-right cursor-pointer transition-all duration-200"
                        >
                          <span className="subtitle-link-text">traveling between images</span>
                          <svg
                            className="arrow-wrap-right absolute -right-5 -bottom-[1px] w-5 h-5 pointer-events-none"
                            viewBox="0 0 20 20"
                            fill="none"
                          >
                            <g className="arrow-group-right" opacity="0.5">
                              <path
                                className="arrow-curve-right arrow-draw-curve-right"
                                d="M0 17.25 Q8 17.25 8 11 Q8 6 19 6"
                                stroke={RETRO_THEME.light}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeDasharray="3 3"
                                fill="none"
                              />
                              <path
                                className="arrow-head-right"
                                d="M16 3 L19 6 L16 9"
                                stroke={RETRO_THEME.light}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray="3 3"
                                fill="none"
                              />
                            </g>
                          </svg>
                        </span>
                      </TooltipTrigger>
                    </Tooltip>
                  </TooltipProvider>
                </p>
              </div>

            <div style={getFadeStyle(2.5, -140, false)} className="pt-2 pb-4 md:pb-6 overflow-visible flex justify-center">
              {session ? (
                <div className="flex flex-col items-center gap-2 md:gap-3">
                  <button
                    className={retroButtonBaseStyles}
                    style={retroButtonInlineStyles}
                    onClick={async () => {
                      if (platformInstall.showInstallCTA) {
                        if (platformInstall.canInstall) {
                          const installed = await platformInstall.triggerInstall();
                          if (!installed) {
                            setShowInstallModal(true);
                          }
                        } else {
                          setShowInstallModal(true);
                        }
                      } else {
                        navigate('/tools');
                      }
                    }}
                  >
                    <HeroCtaContent
                      icon={platformInstall.showInstallCTA ? platformInstall.ctaIcon : null}
                      text={platformInstall.showInstallCTA ? platformInstall.ctaText : 'go to tools'}
                    />
                  </button>
                  <div
                    className={`transition-all duration-300 ${
                      platformInstall.showInstallCTA
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-2 pointer-events-none h-0'
                    }`}
                  >
                    <button
                      onClick={() => navigate('/tools')}
                      className="text-xs text-[#ecede3]/50 hover:text-[#ecede3] transition-colors"
                    >
                      or continue in browser
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 md:gap-3">
                  <button
                    className={retroButtonBaseStyles}
                    style={retroButtonInlineStyles}
                    onClick={async () => {
                      if (platformInstall.showInstallCTA) {
                        if (platformInstall.canInstall) {
                          const installed = await platformInstall.triggerInstall();
                          if (!installed) {
                            setShowInstallModal(true);
                          }
                        } else {
                          setShowInstallModal(true);
                        }
                      } else {
                        handleDiscordSignIn();
                      }
                    }}
                  >
                    <HeroCtaContent
                      icon={platformInstall.showInstallCTA ? platformInstall.ctaIcon : null}
                      text={platformInstall.showInstallCTA ? platformInstall.ctaText : 'sign in with Discord'}
                    />
                  </button>
                  <div
                    className={`transition-all duration-300 ${
                      platformInstall.showInstallCTA
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-2 pointer-events-none h-0'
                    }`}
                  >
                    <button
                      onClick={handleDiscordSignIn}
                      className="text-xs text-[#ecede3]/50 hover:text-[#ecede3] transition-colors"
                    >
                      or sign in here instead
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>

          {/* Social Icons & Banodoco */}
          <div
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: isRevealing ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="mt-2 flex justify-center">
                <div className="flex flex-col items-center gap-y-1">
                  <div className="flex items-center gap-x-3">
                    <div style={getPopStyle(0.8, false)}>
                      <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 bg-transparent rounded-full border border-[#ecede3]/30 hover:border-[#ecede3]/60 transition-all duration-300 hover:bg-[#ecede3]/10 group"
                      >
                        <Github className="w-4 h-4 text-[#ecede3]/70 group-hover:text-[#ecede3] transition-colors duration-300" strokeWidth={1.5} />
                      </a>
                    </div>
                    <div style={getPopStyle(0.95, false)}>
                      <a
                        href={DISCORD_INVITE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 bg-transparent rounded-full border border-[#ecede3]/30 hover:border-[#ecede3]/60 transition-all duration-300 hover:bg-[#ecede3]/10 group"
                      >
                        <MessageCircle className="w-4 h-4 text-[#ecede3]/70 group-hover:text-[#ecede3] transition-colors duration-300" strokeWidth={1.5} />
                      </a>
                    </div>
                  </div>

                  <div style={getPopStyle(1.1, false)}>
                    <div className="p-1 opacity-0">
                      <Plus className="w-2 h-2 text-transparent" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-4">
                  <a
                    href={BANODOCO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block opacity-60 hover:opacity-100 transition-opacity duration-300"
                  >
                  <img
                    src="/banodoco-gold.png"
                    alt="Banodoco"
                    className={`w-[40px] h-[40px] object-contain image-rendering-pixelated
                      ${banodocoState === 'hidden' ? 'opacity-0' : ''}
                      ${banodocoState === 'animating' ? 'animate-burst-and-flash' : ''}
                      ${banodocoState === 'visible' ? 'opacity-100' : ''}
                    `}
                    style={{ imageRendering: 'auto' }}
                  />
                  </a>
              </div>
            </div>
          </div>

        </div>

        <InstallInstructionsModal
          open={showInstallModal}
          onOpenChange={setShowInstallModal}
          installMethod={platformInstall.installMethod}
          platform={platformInstall.platform}
          browser={platformInstall.browser}
          deviceType={platformInstall.deviceType}
          instructions={platformInstall.installInstructions}
          isAppInstalled={platformInstall.isAppInstalled}
          isSignedIn={!!session}
          onFallbackToDiscord={session ? () => navigate('/tools') : handleDiscordSignIn}
        />
      </div>
    </div>
  );
};
