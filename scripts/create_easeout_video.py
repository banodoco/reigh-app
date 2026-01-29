#!/usr/bin/env python3
"""
Create a smooth ease-out video by:
1. Splitting the final 10% into segments based on slowdown factor
2. Interpolating each segment with appropriate num_frames (1-4)
3. Stitching interpolated segments together
4. Applying ease-out timing
5. Stitching back to the first 90% of the original video

Uses fal.ai FILM model for interpolation.
"""
import os
import sys
import subprocess
import json
import time
import fal_client
import urllib.request
from pathlib import Path

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
INPUT_VIDEO = PROJECT_DIR / 'public' / 'hero-background-interpolated-seamless-faststart.mp4'
OUTPUT_DIR = PROJECT_DIR / 'public' / 'easeout_parts'
FINAL_OUTPUT = PROJECT_DIR / 'public' / 'hero-background-easeout-smooth.mp4'

# Video params
TOTAL_FRAMES = 2048
FPS = 30
SLOWDOWN_START = 0.90  # Start slowing at 90%
MAX_SLOWDOWN = 4  # End at 4x slower (0.25x speed)

# Segment definitions: (start_percent, end_percent, num_frames_to_interpolate)
# num_frames: 0=none, 1=2x frames, 2=3x frames, 3=4x frames, 4=5x frames
SEGMENTS = [
    # First 90% - no slowdown, no interpolation needed
    (0.0, 0.90, 0),
    # 90-93%: speed ~0.85x, minimal slowdown - no interpolation
    (0.90, 0.93, 0),
    # 93-95.5%: speed ~0.55x - need 1 interpolated frame (2x)
    (0.93, 0.955, 1),
    # 95.5-97.5%: speed ~0.38x - need 2 interpolated frames (3x)
    (0.955, 0.975, 2),
    # 97.5-100%: speed ~0.28x - need 3 interpolated frames (4x)
    (0.975, 1.0, 3),
]


def run_ffmpeg(args, description=""):
    """Run ffmpeg command and handle errors."""
    cmd = ['ffmpeg', '-y'] + args
    print(f"  Running: {' '.join(cmd[:10])}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr}")
        raise RuntimeError(f"ffmpeg failed: {description}")
    return result


def get_frame_range(start_pct, end_pct):
    """Convert percentage range to frame numbers (1-indexed)."""
    start_frame = int(start_pct * (TOTAL_FRAMES - 1)) + 1
    end_frame = int(end_pct * (TOTAL_FRAMES - 1)) + 1
    if end_pct == 1.0:
        end_frame = TOTAL_FRAMES
    return start_frame, end_frame


def extract_segment(segment_idx, start_pct, end_pct):
    """Extract a segment of the video as a separate file."""
    start_frame, end_frame = get_frame_range(start_pct, end_pct)
    start_time = (start_frame - 1) / FPS
    duration = (end_frame - start_frame + 1) / FPS

    output_path = OUTPUT_DIR / f'segment_{segment_idx:02d}_raw.mp4'

    print(f"  Extracting segment {segment_idx}: frames {start_frame}-{end_frame} ({start_pct*100:.1f}%-{end_pct*100:.1f}%)")

    run_ffmpeg([
        '-i', str(INPUT_VIDEO),
        '-ss', str(start_time),
        '-t', str(duration),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-an',
        str(output_path)
    ], f"extract segment {segment_idx}")

    return output_path


def on_queue_update(update):
    """Handle fal.ai queue updates."""
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(f"    [FAL] {log['message']}")


def interpolate_segment(segment_idx, input_path, num_frames):
    """Interpolate a segment using fal.ai FILM model."""
    output_path = OUTPUT_DIR / f'segment_{segment_idx:02d}_interpolated.mp4'

    if num_frames == 0:
        # No interpolation needed, just copy
        print(f"  Segment {segment_idx}: No interpolation needed, copying...")
        subprocess.run(['cp', str(input_path), str(output_path)])
        return output_path

    print(f"  Segment {segment_idx}: Uploading to fal.ai...")
    video_url = fal_client.upload_file(str(input_path))
    print(f"    Uploaded: {video_url}")

    print(f"  Segment {segment_idx}: Running FILM interpolation (num_frames={num_frames})...")
    result = fal_client.subscribe(
        "fal-ai/film/video",
        arguments={
            "video_url": video_url,
            "num_frames": num_frames,
            "use_calculated_fps": True,
            "video_quality": "high",
        },
        with_logs=True,
        on_queue_update=on_queue_update,
    )

    if result and 'video' in result and 'url' in result['video']:
        output_url = result['video']['url']
        print(f"  Segment {segment_idx}: Downloading from {output_url[:50]}...")
        urllib.request.urlretrieve(output_url, str(output_path))
        print(f"    Saved to: {output_path.name}")
    else:
        print(f"  ERROR: No video URL in result: {result}")
        raise RuntimeError(f"Interpolation failed for segment {segment_idx}")

    return output_path


def calculate_easing_duration(start_pct, end_pct, num_interpolated_frames):
    """
    Calculate frame durations for easing within a segment.
    Returns list of (frame_index, duration) for the concat file.
    """
    # How many frames in this segment after interpolation
    start_frame, end_frame = get_frame_range(start_pct, end_pct)
    original_frame_count = end_frame - start_frame + 1

    # Interpolation multiplies frame count
    multiplier = num_interpolated_frames + 1  # 0->1x, 1->2x, 2->3x, 3->4x
    interpolated_frame_count = original_frame_count * multiplier

    base_duration = 1 / FPS
    durations = []

    for i in range(interpolated_frame_count):
        # Map this frame back to original timeline position
        original_pos = i / multiplier
        # Calculate the normalized position within the ENTIRE video
        t = start_pct + (original_pos / (TOTAL_FRAMES - 1))

        if t < SLOWDOWN_START:
            duration_mult = 1.0
        else:
            # Ease out in final 10%
            local_t = (t - SLOWDOWN_START) / (1 - SLOWDOWN_START)
            ease = 1 - (1 - local_t) ** 2
            duration_mult = 1 + (MAX_SLOWDOWN - 1) * ease

        # Adjust for interpolation (we have more frames, so each plays shorter)
        # to maintain the same visual timing
        adjusted_duration = base_duration * duration_mult / multiplier
        durations.append(adjusted_duration)

    return durations, interpolated_frame_count


def apply_easing_to_segment(segment_idx, input_path, start_pct, end_pct, num_interpolated_frames):
    """
    Apply ease-out timing to an interpolated segment.
    Extract frames, create concat file with durations, reassemble.
    """
    output_path = OUTPUT_DIR / f'segment_{segment_idx:02d}_eased.mp4'
    frames_dir = OUTPUT_DIR / f'segment_{segment_idx:02d}_frames'
    frames_dir.mkdir(exist_ok=True)

    print(f"  Segment {segment_idx}: Extracting frames for timing adjustment...")
    run_ffmpeg([
        '-i', str(input_path),
        str(frames_dir / 'frame_%05d.png')
    ], "extract frames")

    # Calculate durations
    durations, frame_count = calculate_easing_duration(start_pct, end_pct, num_interpolated_frames)

    # Create concat file
    concat_file = OUTPUT_DIR / f'segment_{segment_idx:02d}_concat.txt'
    with open(concat_file, 'w') as f:
        for i in range(1, frame_count + 1):
            f.write(f"file '{frames_dir}/frame_{i:05d}.png'\n")
            f.write(f"duration {durations[i-1]:.6f}\n")
        # Last frame again without duration
        f.write(f"file '{frames_dir}/frame_{frame_count:05d}.png'\n")

    print(f"  Segment {segment_idx}: Reassembling with eased timing...")
    run_ffmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', str(concat_file),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-r', str(FPS),
        str(output_path)
    ], "reassemble with timing")

    return output_path


def concatenate_segments(segment_paths):
    """Concatenate all processed segments into final video."""
    concat_file = OUTPUT_DIR / 'final_concat.txt'
    with open(concat_file, 'w') as f:
        for path in segment_paths:
            f.write(f"file '{path}'\n")

    print("\nConcatenating all segments...")
    run_ffmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', str(concat_file),
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        str(FINAL_OUTPUT)
    ], "final concatenation")

    return FINAL_OUTPUT


def main():
    print("=" * 60)
    print("Creating smooth ease-out video")
    print("=" * 60)
    print(f"Input: {INPUT_VIDEO}")
    print(f"Output: {FINAL_OUTPUT}")
    print(f"Intermediate files: {OUTPUT_DIR}")
    print()

    # Check input
    if not INPUT_VIDEO.exists():
        print(f"ERROR: Input video not found: {INPUT_VIDEO}")
        sys.exit(1)

    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Process each segment
    processed_segments = []

    for idx, (start_pct, end_pct, num_frames) in enumerate(SEGMENTS):
        print(f"\n{'='*60}")
        print(f"Processing segment {idx}: {start_pct*100:.1f}% - {end_pct*100:.1f}% (interpolate: {num_frames})")
        print("=" * 60)

        # Step 1: Extract segment
        raw_path = extract_segment(idx, start_pct, end_pct)

        # Step 2: Interpolate if needed
        interpolated_path = interpolate_segment(idx, raw_path, num_frames)

        # Step 3: Apply easing timing
        # For segment 0 (first 90%), no easing needed
        if start_pct < SLOWDOWN_START and end_pct <= SLOWDOWN_START:
            print(f"  Segment {idx}: No easing needed (before slowdown region)")
            eased_path = interpolated_path
        else:
            eased_path = apply_easing_to_segment(idx, interpolated_path, start_pct, end_pct, num_frames)

        processed_segments.append(eased_path)

        # Save progress
        progress_file = OUTPUT_DIR / 'progress.json'
        with open(progress_file, 'w') as f:
            json.dump({
                'completed_segments': idx + 1,
                'total_segments': len(SEGMENTS),
                'processed_paths': [str(p) for p in processed_segments]
            }, f, indent=2)

        print(f"  Segment {idx} complete!")

    # Step 4: Concatenate all segments
    final_path = concatenate_segments(processed_segments)

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"Final video: {final_path}")

    # Get duration
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(final_path)
    ], capture_output=True, text=True)
    print(f"Duration: {float(result.stdout.strip()):.1f}s")


if __name__ == "__main__":
    main()
