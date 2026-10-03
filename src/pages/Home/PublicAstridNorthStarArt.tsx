import type { CSSProperties } from 'react';
import './PublicAstridNorthStarArt.css';

interface ArtLayer {
  /** Names the layer for its animation in the CSS. */
  part: string;
  src: string;
  /** Position and width on the sprite's art-pixel grid. */
  x: number;
  y: number;
  w: number;
  /** Drawn behind the mink rather than in front, as for a block held in its paws. */
  behind?: boolean;
}

export interface NorthStarArt {
  base: string;
  w: number;
  h: number;
  layers: readonly ArtLayer[];
}

/** The four North Star minks, each acting out a goal; the moving details are separate sprites. */
export const NORTH_STAR_ART = {
  art: {
    base: '/astrid-north-star-art.png',
    w: 82,
    h: 82,
    layers: [
      { part: 'rays', src: '/astrid-north-star-art-rays.png', x: 6, y: 14, w: 23 },
      { part: 'brush', src: '/astrid-north-star-art-brush.png', x: 26, y: 15, w: 10 },
    ],
  },
  knowledge: {
    base: '/astrid-north-star-knowledge.png',
    w: 67,
    h: 84,
    layers: [
      { part: 'spark-0', src: '/astrid-north-star-knowledge-spark0.png', x: 4, y: 12, w: 7 },
      { part: 'spark-1', src: '/astrid-north-star-knowledge-spark1.png', x: 9, y: 18, w: 7 },
      { part: 'spark-2', src: '/astrid-north-star-knowledge-spark2.png', x: 14, y: 24, w: 5 },
    ],
  },
  adapt: {
    base: '/astrid-north-star-adapt.png',
    w: 59,
    h: 76,
    layers: [
      { part: 'block', src: '/astrid-north-star-adapt-block.png', x: 5, y: 28, w: 12, behind: true },
      { part: 'thought-0', src: '/astrid-north-star-adapt-thought0.png', x: 37, y: 5, w: 3 },
      { part: 'thought-1', src: '/astrid-north-star-adapt-thought1.png', x: 41, y: 0, w: 4 },
      { part: 'thought-2', src: '/astrid-north-star-adapt-thought2.png', x: 46, y: -7, w: 6 },
      { part: 'paws', src: '/astrid-north-star-adapt-paws.png', x: 16, y: 27, w: 7 },
      { part: 'snap', src: '/astrid-north-star-adapt-snap.png', x: 0, y: 37, w: 5 },
    ],
  },
  community: {
    base: '/astrid-north-star-community.png',
    w: 82,
    h: 84,
    layers: [
      { part: 'star', src: '/astrid-north-star-community-star.png', x: 29, y: 0, w: 9 },
      { part: 'twinkle-0', src: '/astrid-north-star-knowledge-spark2.png', x: 21, y: 6, w: 5 },
      { part: 'twinkle-1', src: '/astrid-north-star-knowledge-spark1.png', x: 41, y: -4, w: 7 },
    ],
  },
} as const satisfies Record<string, NorthStarArt>;

/** A North Star mink, its details coming alive while its host (a data-ns-host element) is hovered or tapped. */
export function NorthStarMink({ art }: { art: NorthStarArt }) {
  return (
    <div className="astrid-vision-principle-art" aria-hidden="true" style={{ '--art-w': art.w, '--art-h': art.h } as CSSProperties}>
      <img className="astrid-vision-art-base" src={art.base} alt="" />
      {art.layers.map((layer) => (
        <img
          key={layer.part}
          className="astrid-vision-art-layer"
          data-part={layer.part}
          data-behind={layer.behind || undefined}
          src={layer.src}
          alt=""
          style={{ '--x': layer.x, '--y': layer.y, '--w': layer.w } as CSSProperties}
        />
      ))}
    </div>
  );
}
