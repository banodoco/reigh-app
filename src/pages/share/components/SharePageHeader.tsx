import { Palette } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import type { CreatorProfile } from '../types';

interface SharePageHeaderProps {
  creator: CreatorProfile | null;
  onGoHome: () => void;
  onCreateOwn: () => void;
}

export function SharePageHeader(props: SharePageHeaderProps) {
  const { creator, onGoHome, onCreateOwn } = props;

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onGoHome}
            className="group flex items-center justify-center w-12 h-12 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-3px_3px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all duration-300"
            aria-label="Go to homepage"
          >
            <Palette className="h-6 w-6 text-white dark:text-[#a098a8] group-hover:rotate-12 transition-all duration-300 drop-shadow-lg dark:drop-shadow-none" />
          </button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {creator?.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator?.name || creator?.username || 'Creator'}
                  className="h-6 w-6 rounded-full border"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted border" />
              )}
              <span className="preserve-case">
                Shot shared by {creator?.name || creator?.username || 'a Reigh artist'}
              </span>
            </div>
            <Button
              variant="retro"
              size="retro-sm"
              onClick={onCreateOwn}
            >
              Create Your Own
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
