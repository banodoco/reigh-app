
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';

interface ModeSelectorProps {
  mode: 'animate' | 'replace';
  onChange: (mode: 'animate' | 'replace') => void;
}

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>Mode:</Label>
      <div className="flex items-center gap-4">
        <div className="flex gap-x-2 flex-1">
          <Button variant={mode === 'animate' ? 'default' : 'outline'} onClick={() => onChange('animate')} className="flex-1">
            Animate
          </Button>
          <Button
            variant={mode === 'replace' ? 'default' : 'outline'}
            onClick={() => onChange('replace')}
            className="flex-1"
            disabled={mode !== 'replace'}
            title="Replace mode is not admitted by the current Astrid profile"
          >
            Replace (unavailable)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex-1">
          {mode === 'animate'
            ? 'Animate the character in input image with movements from the input video'
            : 'Replace mode is not admitted by the current Astrid profile'}
        </p>
      </div>
    </div>
  );
}
