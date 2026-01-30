# Video Enhance Tool Implementation Plan

## Overview

Add a new "Enhance" tool to the Media Lightbox for videos. This creates a new task type that handles video interpolation (using Google FILM) and/or upscaling (using FlashVSR). The tool should only be available when running in Cloud mode.

## Status: COMPLETE ✅

All frontend implementation is complete. Backend worker execution code needs to be created separately.

---

## API Analysis

### Google FILM (Interpolation) - `fal-ai/film/video`

| Parameter | Type | Default | Description | **Include in UI?** |
|-----------|------|---------|-------------|-------------------|
| `video_url` | string | Required | Input video URL | Auto (from current video) |
| `num_frames` | integer (1-4) | 1 | Frames to add between each pair of input frames | **Yes** - slider |
| `use_scene_detection` | boolean | false | Split into scenes before interpolation | No (advanced) |
| `use_calculated_fps` | boolean | true | Auto-calculate FPS to maintain speed | Yes (hardcoded true) |
| `fps` | integer (1-60) | 8 | Output FPS (only if use_calculated_fps=false) | No (auto-calculated) |
| `loop` | boolean | false | Loop back to create seamless video | No (edge case) |
| `video_quality` | enum | "high" | low/medium/high/maximum | No (default high) |

### FlashVSR (Upscaling) - `fal-ai/flashvsr/upscale/video`

| Parameter | Type | Default | Description | **Include in UI?** |
|-----------|------|---------|-------------|-------------------|
| `video_url` | string | Required | Input video URL | Auto (from current video) |
| `upscale_factor` | number (1-4) | 2 | Scaling multiplier | **Yes** - slider (1.5-4x) |
| `acceleration` | enum | "regular" | regular (quality) / high / full (fastest) | No (use regular) |
| `quality` | integer (0-100) | 70 | Tile blending quality | No (default) |
| `color_fix` | boolean | true | Enable color correction | **Yes** - checkbox |
| `output_format` | enum | "X264 (.mp4)" | X264/VP9/PRORES4444/GIF | No (default X264) |
| `output_quality` | enum | "high" | low/medium/high/maximum | **Yes** - dropdown |

---

## Implementation Summary

### UI Features
- Toggle switches for Interpolation and Upscale modes
- Toggling a switch reveals settings for that mode
- Submit disabled if neither mode is enabled
- Only shows when `isCloudMode === true`
- Icon: Sparkles (✨)

### Interpolation Settings
- **Frames to add**: Slider 1-4 (shows frame rate multiplier feedback)

### Upscale Settings
- **Upscale factor**: Slider 1.5-4x
- **Color correction**: Toggle (default on)
- **Output quality**: Select (low/medium/high/maximum)

---

## Files Created/Modified

### New Files ✅
| File | Purpose |
|------|---------|
| `supabase/migrations/20260129204537_add_video_enhance_task_type.sql` | Database task type |
| `src/shared/lib/tasks/videoEnhance.ts` | Task helper with interfaces & createVideoEnhanceTask() |
| `src/shared/components/MediaLightbox/components/VideoEnhanceForm.tsx` | UI form component |
| `src/shared/components/MediaLightbox/hooks/useVideoEnhance.ts` | State management hook |

### Modified Files ✅
| File | Changes |
|------|---------|
| `src/shared/lib/taskConfig.ts` | Added `video_enhance` to fallback config |
| `src/shared/components/MediaLightbox/hooks/useVideoEditModeHandlers.ts` | Added 'enhance' to VideoEditSubMode, added handler |
| `src/shared/components/MediaLightbox/hooks/useLightboxLayoutProps.ts` | Added enhance props to input interface and controlsPanelProps |
| `src/shared/components/MediaLightbox/components/VideoEditPanel.tsx` | Added Enhance mode button + VideoEnhanceForm rendering |
| `src/shared/components/MediaLightbox/components/ControlsPanel.tsx` | Thread through enhance props |
| `src/shared/components/MediaLightbox/MediaLightbox.tsx` | Integrated useVideoEnhance hook, pass props |

---

## Task Params Structure

```typescript
interface VideoEnhanceTaskParams {
  project_id: string;
  video_url: string;
  enable_interpolation: boolean;
  enable_upscale: boolean;

  // FILM params (when enable_interpolation is true)
  interpolation?: {
    num_frames: number; // 1-4
    use_calculated_fps: boolean; // always true
  };

  // FlashVSR params (when enable_upscale is true)
  upscale?: {
    upscale_factor: number; // 1.5-4
    color_fix: boolean;
    output_quality: 'low' | 'medium' | 'high' | 'maximum';
  };

  shot_id?: string;
  parent_generation_id?: string;
}
```

---

## Next Steps (Backend)

1. **Deploy the migration**:
   ```bash
   npx supabase db push --linked
   ```

2. **Create worker handler** for `video_enhance` task type that:
   - Reads params from task
   - Calls FILM API if `enable_interpolation` is true
   - Calls FlashVSR API if `enable_upscale` is true (with interpolated video if both enabled)
   - Uploads result to storage
   - Calls `complete-task` edge function with result

3. **Test the flow** end-to-end
