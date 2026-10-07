/**
 * Hand-drawn pixel icons for the pixel-type install line, in the same square-pixel style as the mink. Each
 * is an 8×8 grid drawn at 2px per pixel, so it stays crisp at 1× and 2× screens.
 */

type PixelGrid = readonly string[];

const COPY: PixelGrid = [
  '...#####',
  '...#...#',
  '#####..#',
  '#...#..#',
  '#...####',
  '#...#...',
  '#####...',
  '........',
];

const CHECK: PixelGrid = [
  '........',
  '.......#',
  '......##',
  '#....##.',
  '##..##..',
  '.####...',
  '..##....',
  '........',
];

function PixelIcon({ grid }: { grid: PixelGrid }) {
  return (
    <svg className="astrid-pixel-icon" width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {grid.flatMap((row, y) => [...row].map((cell, x) => (cell === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}

export const PixelCopyIcon = () => <PixelIcon grid={COPY} />;
export const PixelCheckIcon = () => <PixelIcon grid={CHECK} />;
