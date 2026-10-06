import { createPublicAstridSkyRasterCache, preparePublicAstridSkyMoon, renderPublicAstridSky, type PublicAstridSkyRenderInput } from './publicAstridSkyRender';

export const PUBLIC_ASTRID_SKY_LAYERS = ['sky', 'stars', 'far', 'near'] as const;
export type PublicAstridSkyLayer = typeof PUBLIC_ASTRID_SKY_LAYERS[number];
export type PublicAstridSkyCanvases = Record<PublicAstridSkyLayer, HTMLCanvasElement | null>;
type FrameInput = Omit<PublicAstridSkyRenderInput, 'layer'>;

/** Dependencies follow the painter: ambient strength/occlusion also depends on the disc's footprint. */
export function publicAstridSkyLayerKey(input: FrameInput, layer: PublicAstridSkyLayer): string {
  const { state } = input;
  const footprint = [input.columns, input.rows, state.body, state.progress, state.altitude, input.path, input.size, input.lift, state.body === 'moon' ? input.moonScale : 1];
  const common = [...footprint, state.night, input.reveal ?? 1, input.intensity > 0];
  if (layer === 'sky') return [...common, input.intensity, state.body === 'moon' ? input.phase : 0].join('|');
  const ambient = [...common, state.clouds, state.hours];
  return (layer === 'stars' ? [...ambient, state.stars, input.tick ?? 0] : ambient).join('|');
}

/** Four current images and one raster cache. No DOM references survive a frame or page registration. */
export function createPublicAstridSkyRenderer() {
  const cache = createPublicAstridSkyRasterCache();
  const images = new Map<PublicAstridSkyLayer, ImageData>();
  const previous = new Map<PublicAstridSkyLayer, { key: string; quiet: Uint8Array | undefined }>();
  return {
    prepareMoon: (rows: number, phase: number, size: number, moonScale: number) => preparePublicAstridSkyMoon(rows, phase, size, moonScale, cache),
    invalidate: () => previous.clear(),
    dispose: () => {
      previous.clear();
      images.clear();
      cache.moon = null;
      cache.stars = null;
      cache.mask = null;
      cache.featureQuiet.fill(0);
      cache.featureSize.fill(0);
    },
    paint: (input: FrameInput, canvases: PublicAstridSkyCanvases) => {
      // Read contexts/dimensions first, compute all dirty images, then publish canvas writes together.
      const targets = PUBLIC_ASTRID_SKY_LAYERS.flatMap((layer) => {
        const canvas = canvases[layer];
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return [];
        return [{ layer, canvas, context, resizeWidth: canvas.width !== input.columns, resizeHeight: canvas.height !== input.rows }];
      });
      let allocations = 0;
      const dirty = targets.filter(({ layer, context, resizeWidth, resizeHeight }) => {
        const key = publicAstridSkyLayerKey(input, layer);
        const quiet = layer === 'sky' && input.state.body !== 'moon' ? undefined : input.quiet;
        const last = previous.get(layer);
        let image = images.get(layer);
        const sameSize = image?.width === input.columns && image?.height === input.rows;
        if (sameSize && !resizeWidth && !resizeHeight && last?.key === key && last.quiet === quiet) return false;
        if (!sameSize) {
          image = context.createImageData(input.columns, input.rows);
          images.set(layer, image);
          allocations += 1;
        }
        renderPublicAstridSky({ ...input, layer }, image!.data, cache);
        previous.set(layer, { key, quiet });
        return true;
      });
      let resizes = 0;
      for (const { layer, canvas, context, resizeWidth, resizeHeight } of dirty) {
        if (resizeWidth) { canvas.width = input.columns; resizes += 1; }
        if (resizeHeight) { canvas.height = input.rows; resizes += 1; }
        context.putImageData(images.get(layer)!, 0, 0);
      }
      return { layers: dirty.map(({ layer }) => layer), allocations, resizes };
    },
  };
}

export type PublicAstridSkyRenderer = ReturnType<typeof createPublicAstridSkyRenderer>;
