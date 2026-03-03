import { TOOL_ROUTES } from '@/shared/lib/toolRoutes';

interface PhilosophyClosingSectionProps {
  navigate: (path: string) => void;
}

export function PhilosophyClosingSection({ navigate }: PhilosophyClosingSectionProps) {
  return (
    <>
      <div className="space-y-3">
        <p className="text-sm leading-7">
          We believe that there's a world of creativity that's waiting to be discovered in the AI-driven journey between images and <span className="text-wes-vintage-gold"><span className="font-theme-heading">Reigh</span> is a tool just for exploring this artform.</span>
        </p>
        <p className="text-sm leading-7">
          And everything is open source - meaning <span className="text-wes-vintage-gold">you can run it for free on your computer</span>!
        </p>
      </div>

      <div className="w-16 h-px bg-foreground/20 my-2" />

      <div className="flex items-center gap-x-2">
        <button
          onClick={() => navigate(TOOL_ROUTES.TOOLS_HOME)}
          className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
        >
          Try the tool
        </button>
        <span className="text-muted-foreground/50">|</span>
        <a
          href="https://discord.gg/D5K2c6kfhy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
        >
          Join the community
        </a>
      </div>
    </>
  );
}
