import { cn } from '@/shared/components/ui/contracts/cn';
import { getThumbPath } from '../../motion/VideoWithPoster';
import { MotionComparison } from '../../motion/MotionComparison';

interface MotionReferenceSectionProps {
  loadedImages: Set<string>;
  handleImageLoad: (src: string) => void;
  handleImageRef: (img: HTMLImageElement | null, src: string) => void;
}

export function MotionReferenceSection({
  loadedImages,
  handleImageLoad,
  handleImageRef,
}: MotionReferenceSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-7">
        You can use <span className="text-wes-vintage-gold">reference videos to steer the motion</span> - here's an example of how images and video references combine:
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: 16 }).map((_, idx) => {
            const imgNum = String(idx + 1).padStart(3, '0');
            const imgSrc = `/introduction-images/${imgNum}.${idx === 13 ? 'png' : 'jpg'}`;
            return (
              <div key={idx} className="aspect-square bg-muted/30 rounded border border-muted/50 overflow-hidden relative">
                <img
                  src={getThumbPath(imgSrc)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <img
                  ref={(imgEl) => handleImageRef(imgEl, imgSrc)}
                  src={imgSrc}
                  alt={`Input ${idx + 1}`}
                  className={cn(
                    'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                    !loadedImages.has(imgSrc) && 'opacity-0',
                  )}
                  onLoad={() => handleImageLoad(imgSrc)}
                />
              </div>
            );
          })}
        </div>

        <div className="w-full">
          <MotionComparison />
        </div>
      </div>
    </div>
  );
}
