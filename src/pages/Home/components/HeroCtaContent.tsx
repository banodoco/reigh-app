import React, { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Plus } from 'lucide-react';

interface HeroCtaContentProps {
  icon: 'download' | 'plus' | 'external' | 'discord' | null;
  text: string;
}

export const HeroCtaContent: React.FC<HeroCtaContentProps> = ({ icon, text }) => {
  const [displayedIcon, setDisplayedIcon] = useState(icon);
  const [displayedText, setDisplayedText] = useState(text);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevIconRef = useRef(icon);
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (icon !== prevIconRef.current || text !== prevTextRef.current) {
      setIsTransitioning(true);

      const updateTimer = setTimeout(() => {
        setDisplayedIcon(icon);
        setDisplayedText(text);
      }, 150);

      const fadeInTimer = setTimeout(() => {
        setIsTransitioning(false);
      }, 180);

      prevIconRef.current = icon;
      prevTextRef.current = text;

      return () => {
        clearTimeout(updateTimer);
        clearTimeout(fadeInTimer);
      };
    }
  }, [icon, text]);

  return (
    <>
      <div
        className={`transition-all duration-150 ${
          isTransitioning ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
        }`}
      >
        {displayedIcon === 'download' && <Download className="w-5 h-5" />}
        {displayedIcon === 'plus' && <Plus className="w-5 h-5" />}
        {displayedIcon === 'external' && <ExternalLink className="w-5 h-5" />}
      </div>
      <span
        className={`transition-all duration-150 ${
          isTransitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
        }`}
      >
        {displayedText}
      </span>
    </>
  );
};
