-- Add video_enhance task type for video interpolation and upscaling
-- Uses fal.ai APIs: FILM for interpolation, FlashVSR for upscaling

INSERT INTO task_types (
  name,
  run_type,
  category,
  tool_type,
  content_type,
  display_name,
  description,
  billing_type,
  unit_cost,
  base_cost_per_second,
  cost_factors,
  is_active,
  is_visible,
  supports_progress
) VALUES (
  'video_enhance',
  'api',                                             -- External API calls to fal.ai
  'processing',                                      -- Processing category
  'media-lightbox',                                  -- Tool type for filtering (accessed via lightbox)
  'video',                                           -- Produces video output
  'Video Enhance',
  'Enhance video quality through frame interpolation (FILM) and/or upscaling (FlashVSR)',
  'per_unit',                                        -- Custom pricing calculated in calculate-task-cost
  0.01,                                              -- Base unit cost (actual cost is computed dynamically)
  0.0013,                                            -- Fallback cost per second
  '{}'::jsonb,                                       -- No additional cost factors (custom calculation)
  true,
  true,                                              -- Visible in TasksPane
  false                                              -- No progress tracking for API calls
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  run_type = EXCLUDED.run_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  cost_factors = EXCLUDED.cost_factors,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  supports_progress = EXCLUDED.supports_progress,
  updated_at = now();
