import React from 'react';
import { Github, MessageCircle } from 'lucide-react';

const GITHUB_REPO_PATH = 'peteromallet/reigh';
const DISCORD_INVITE_CODE = 'D5K2c6kfhy';

export const SocialIcons: React.FC = () => {
  return (
    <div className="flex justify-center pt-4 pb-14">
      <div className="flex flex-col items-center gap-y-3">
        {/* GitHub and Discord icons side by side */}
        <div className="flex items-center gap-x-3">
          <a
            href={`https://github.com/${GITHUB_REPO_PATH}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-card/50 backdrop-blur-sm rounded-full border border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:bg-card/70 group opacity-80 hover:opacity-100 shadow-md"
          >
            <Github className="w-4 h-4 text-wes-vintage-gold/80 group-hover:text-wes-vintage-gold transition-colors duration-300" />
          </a>
          <a
            href={`https://discord.gg/${DISCORD_INVITE_CODE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-card/50 backdrop-blur-sm rounded-full border border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:bg-card/70 group opacity-80 hover:opacity-100 shadow-md"
          >
            <MessageCircle className="w-4 h-4 text-wes-vintage-gold/80 group-hover:text-wes-vintage-gold transition-colors duration-300" />
          </a>
        </div>
      </div>
    </div>
  );
};
