-- Add variant_type column to task_types
-- This moves the task_type -> variant_type mapping from code to data

-- Add the column (nullable - not all task types create variants)
ALTER TABLE task_types ADD COLUMN variant_type text;

-- Populate variant_type for task types that create variants
-- Based on the mapping in complete_task/constants.ts getEditVariantType()

-- Edit/processing tasks
UPDATE task_types SET variant_type = 'inpaint' WHERE name = 'image_inpaint';
UPDATE task_types SET variant_type = 'annotated_edit' WHERE name = 'annotated_image_edit';
UPDATE task_types SET variant_type = 'magic_edit' WHERE name = 'magic_edit';
UPDATE task_types SET variant_type = 'magic_edit' WHERE name = 'qwen_image_edit';
UPDATE task_types SET variant_type = 'magic_edit' WHERE name = 'image_edit';

-- Upscale tasks
UPDATE task_types SET variant_type = 'upscaled' WHERE name = 'image-upscale';
UPDATE task_types SET variant_type = 'upscaled' WHERE name = 'video_enhance';

-- Orchestrator segment tasks (these create variants on parent/child generations)
UPDATE task_types SET variant_type = 'travel_segment' WHERE name = 'travel_segment';
UPDATE task_types SET variant_type = 'travel_stitch' WHERE name = 'travel_stitch';
UPDATE task_types SET variant_type = 'join_clips_segment' WHERE name = 'join_clips_segment';
UPDATE task_types SET variant_type = 'join_final_stitch' WHERE name = 'join_final_stitch';
UPDATE task_types SET variant_type = 'individual_segment' WHERE name = 'individual_travel_segment';

-- Z Image Turbo I2I (image-to-image editing)
UPDATE task_types SET variant_type = 'edit' WHERE name = 'z_image_turbo_i2i';

-- Generation tasks (single_image, wan_2_2_i2v, etc.) don't create variants - they create generations
-- So variant_type stays NULL for those

-- Add comment
COMMENT ON COLUMN task_types.variant_type IS 'Variant type label when this task creates a variant (NULL for generation tasks)';
