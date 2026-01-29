#!/usr/bin/env python3
"""
Create smooth ease-out video v2 - minimizes re-encoding and join artifacts.

Approach:
1. Extract ALL frames from original video
2. For the slowdown portion (last 10%), send to FILM for interpolation
3. Build a single concat file with all frames and proper timing
4. Encode once at the end

This avoids join artifacts by never re-encoding the main portion separately.
"""
import os
import sys
import subprocess
import json
import fal_client
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Paths
PROJECT_DIR = Path('/Users/peteromalley/Documents/reigh')
INPUT_VIDEO = PROJECT_DIR / 'public' / 'hero-background-interpolated-seamless-faststart.mp4'
OUTPUT_DIR = PROJECT_DIR / 'public' / 'easeout_v2'
FINAL_OUTPUT = PROJECT_DIR / 'public' / 'hero-background-easeout-smooth-web.mp4'

# Video params
TOTAL_FRAMES = 2048
FPS = 30
SLOWDOWN_START = 0.90  # 90%
EXTRA_SLOW_START = 0.99  # 99%
MAX_SLOWDOWN = 4
EXTRA_SLOW_MAX = 8

# Interpolation segments within the slowdown region (relative to full video)
# (start_pct, end_pct, num_frames_to_add)
INTERP_SEGMENTS = [
    (0.90, 0.93, 0),   # No interpolation needed
    (0.93, 0.955, 1),  # 2x frames
    (0.955, 0.975, 2), # 3x frames  
    (0.975, 1.0, 3),   # 4x frames
]


def run_cmd(cmd, desc=""):
    print(f"  Running: {' '.join(cmd[:6])}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[:500]}")
        raise RuntimeError(f"Command failed: {desc}")
    return result


def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(f"    [FAL] {log['message']}")


def main():
    print("=" * 60)
    print("Creating smooth ease-out video (v2 - minimal re-encoding)")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(exist_ok=True)
    frames_dir = OUTPUT_DIR / 'all_frames'
    frames_dir.mkdir(exist_ok=True)
    
    # Step 1: Extract all frames from original
    print("\n[1/5] Extracting all frames from original video...")
    if not (frames_dir / 'frame_00001.png').exists():
        run_cmd([
            'ffmpeg', '-y', '-i', str(INPUT_VIDEO),
            str(frames_dir / 'frame_%05d.png')
        ], "extract frames")
    else:
        print("  Frames already extracted, skipping...")
    
    # Step 2: Create segment videos for interpolation
    print("\n[2/5] Creating segments for interpolation...")
    interpolated_frames = {}  # segment_idx -> list of frame paths
    
    for seg_idx, (start_pct, end_pct, num_frames) in enumerate(INTERP_SEGMENTS):
        start_frame = int(start_pct * (TOTAL_FRAMES - 1)) + 1
        end_frame = int(end_pct * (TOTAL_FRAMES - 1)) + 1
        if end_pct == 1.0:
            end_frame = TOTAL_FRAMES
        
        seg_frames_dir = OUTPUT_DIR / f'seg{seg_idx}_frames'
        seg_frames_dir.mkdir(exist_ok=True)
        
        print(f"\n  Segment {seg_idx}: frames {start_frame}-{end_frame}, interp={num_frames}")
        
        if num_frames == 0:
            # No interpolation - just reference original frames
            interpolated_frames[seg_idx] = [
                frames_dir / f'frame_{i:05d}.png' 
                for i in range(start_frame, end_frame + 1)
            ]
            print(f"    No interpolation needed, using {len(interpolated_frames[seg_idx])} original frames")
        else:
            # Check if already interpolated
            expected_count = (end_frame - start_frame + 1) * (num_frames + 1)
            existing = list(seg_frames_dir.glob('frame_*.png'))
            
            if len(existing) >= expected_count - 5:  # Allow small variance
                print(f"    Already interpolated, found {len(existing)} frames")
                interpolated_frames[seg_idx] = sorted(existing)
            else:
                # Create segment video from frames
                seg_video = OUTPUT_DIR / f'seg{seg_idx}_input.mp4'
                concat_file = OUTPUT_DIR / f'seg{seg_idx}_input.txt'
                
                with open(concat_file, 'w') as f:
                    for i in range(start_frame, end_frame + 1):
                        f.write(f"file '{frames_dir}/frame_{i:05d}.png'\n")
                        f.write(f"duration {1/FPS}\n")
                    f.write(f"file '{frames_dir}/frame_{end_frame:05d}.png'\n")
                
                run_cmd([
                    'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                    '-i', str(concat_file),
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '15',
                    '-pix_fmt', 'yuv420p',
                    str(seg_video)
                ], f"create segment {seg_idx} video")
                
                # Upload and interpolate
                print(f"    Uploading segment {seg_idx} to fal.ai...")
                video_url = fal_client.upload_file(str(seg_video))
                
                print(f"    Running FILM interpolation (num_frames={num_frames})...")
                result = fal_client.subscribe(
                    "fal-ai/film/video",
                    arguments={
                        "video_url": video_url,
                        "num_frames": num_frames,
                        "use_calculated_fps": True,
                        "video_quality": "maximum",
                    },
                    with_logs=True,
                    on_queue_update=on_queue_update,
                )
                
                if not (result and 'video' in result and 'url' in result['video']):
                    raise RuntimeError(f"Interpolation failed for segment {seg_idx}")
                
                # Download interpolated video
                interp_video = OUTPUT_DIR / f'seg{seg_idx}_interpolated.mp4'
                urllib.request.urlretrieve(result['video']['url'], str(interp_video))
                print(f"    Downloaded interpolated video")
                
                # Extract frames from interpolated video
                run_cmd([
                    'ffmpeg', '-y', '-i', str(interp_video),
                    str(seg_frames_dir / 'frame_%05d.png')
                ], f"extract interpolated frames {seg_idx}")
                
                interpolated_frames[seg_idx] = sorted(seg_frames_dir.glob('frame_*.png'))
                print(f"    Extracted {len(interpolated_frames[seg_idx])} interpolated frames")
    
    # Step 3: Build unified frame list with timing
    print("\n[3/5] Building unified frame list with timing...")
    
    all_entries = []  # (frame_path, duration)
    
    # First 90% - original frames at normal speed
    slowdown_start_frame = int(SLOWDOWN_START * (TOTAL_FRAMES - 1)) + 1
    base_duration = 1 / FPS
    
    print(f"  Adding frames 1-{slowdown_start_frame-1} at normal speed...")
    for i in range(1, slowdown_start_frame):
        all_entries.append((frames_dir / f'frame_{i:05d}.png', base_duration))
    
    # Slowdown portion - interpolated frames with eased timing
    print(f"  Adding slowdown frames with easing...")
    for seg_idx, (start_pct, end_pct, num_interp) in enumerate(INTERP_SEGMENTS):
        seg_frame_list = interpolated_frames[seg_idx]
        multiplier = num_interp + 1
        
        for i, frame_path in enumerate(seg_frame_list):
            # Calculate position in original timeline
            orig_frame_in_seg = i / multiplier
            orig_frame_count = len(seg_frame_list) / multiplier
            seg_progress = orig_frame_in_seg / orig_frame_count if orig_frame_count > 0 else 0
            
            # Global position
            t = start_pct + seg_progress * (end_pct - start_pct)
            
            # Calculate slowdown factor
            if t < SLOWDOWN_START:
                duration_mult = 1.0
            elif t < EXTRA_SLOW_START:
                local_t = (t - SLOWDOWN_START) / (EXTRA_SLOW_START - SLOWDOWN_START)
                ease = 1 - (1 - local_t) ** 2
                duration_mult = 1 + (MAX_SLOWDOWN - 1) * ease
            else:
                base_mult = MAX_SLOWDOWN
                local_t = (t - EXTRA_SLOW_START) / (1 - EXTRA_SLOW_START)
                ease = 1 - (1 - local_t) ** 2
                duration_mult = base_mult + (EXTRA_SLOW_MAX - base_mult) * ease
            
            # Adjust for interpolation (more frames = shorter individual duration)
            adjusted_duration = base_duration * duration_mult / multiplier
            all_entries.append((frame_path, adjusted_duration))
    
    print(f"  Total frames in output: {len(all_entries)}")
    
    # Step 4: Create concat file
    print("\n[4/5] Creating concat file...")
    concat_file = OUTPUT_DIR / 'final_concat.txt'
    
    with open(concat_file, 'w') as f:
        for frame_path, duration in all_entries:
            f.write(f"file '{frame_path}'\n")
            f.write(f"duration {duration:.6f}\n")
        # Last frame without duration
        f.write(f"file '{all_entries[-1][0]}'\n")
    
    # Calculate expected duration
    total_duration = sum(d for _, d in all_entries)
    print(f"  Expected duration: {total_duration:.1f}s")
    
    # Step 5: Encode final video
    print("\n[5/5] Encoding final video...")
    run_cmd([
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', str(concat_file),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30',
        str(FINAL_OUTPUT)
    ], "encode final video")
    
    # Verify
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(FINAL_OUTPUT)
    ], capture_output=True, text=True)
    
    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"Output: {FINAL_OUTPUT}")
    print(f"Duration: {float(result.stdout.strip()):.1f}s")
    
    # File size
    size_mb = FINAL_OUTPUT.stat().st_size / (1024 * 1024)
    print(f"Size: {size_mb:.1f}MB")


if __name__ == "__main__":
    main()
