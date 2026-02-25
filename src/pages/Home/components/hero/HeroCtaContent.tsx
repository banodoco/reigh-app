import React from 'react';
import { Download, ExternalLink, MessageCircle, Plus } from 'lucide-react';

interface HeroCtaContentProps {
  icon: 'download' | 'plus' | 'external' | 'discord' | null;
  text: string;
}

export const HeroCtaContent: React.FC<HeroCtaContentProps> = ({ icon, text }) => {
  const renderIcon = () => {
    switch (icon) {
      case 'download':
        return <Download className="w-5 h-5" />;
      case 'plus':
        return <Plus className="w-5 h-5" />;
      case 'external':
        return <ExternalLink className="w-5 h-5" />;
      case 'discord':
        return <MessageCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="transition-all duration-150 opacity-100 scale-100">
        {renderIcon()}
      </div>
      <span className="transition-all duration-150 opacity-100 translate-y-0">
        {text}
      </span>
    </>
  );
};
