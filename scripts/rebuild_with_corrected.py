#!/usr/bin/env python3
"""
Rebuild the final video using color-corrected interpolated frames.
"""
import subprocess
from pathlib import Path
import sys

sys.stdout.reconfigure(line_buffering=True)

PROJECT_DIR = Path('/Users/peteromalley/Documents/reigh')
OUTPUT_DIR = PROJECT_DIR / 'public' / 'easeout_v2'
ORIG_FRAMES = OUTPUT_DIR / 'all_frames'
FINAL_OUTPUT = PROJECT_DIR / 'public' / 'hero-background-easeout-smooth-web.mp4'

TOTAL_FRAMES = 2048
FPS = 30
SLOWDOWN_START = 0.50  # Start at 50%
EXTRA_SLOW_START = 0.99
MAX_SLOWDOWN = 3  # 3x slowdown at end
EXTRA_SLOW_MAX = 3  # matches MAX_SLOWDOWN

# Segments with corrected frames - extended for 50% ease zone
INTERP_SEGMENTS = [
    (0.50, 0.90, 0, None),  # Original frames (extended ease-out)
    (0.90, 0.93, 0, None),  # Original frames
    (0.93, 0.955, 1, 'seg1_corrected'),   # 2x frames
    (0.955, 0.975, 2, 'seg2_corrected'),  # 3x frames
    (0.975, 1.0, 2, 'seg3_corrected'),    # 3x frames
]

def main():
    print("Rebuilding video with color-corrected frames...")
    
    all_entries = []  # (frame_path, duration)
    base_duration = 1 / FPS
    
    # First 90% - original frames at normal speed
    slowdown_start_frame = int(SLOWDOWN_START * (TOTAL_FRAMES - 1)) + 1
    
    print(f"Adding frames 1-{slowdown_start_frame-1} at normal speed...")
    for i in range(1, slowdown_start_frame):
        all_entries.append((ORIG_FRAMES / f'frame_{i:05d}.png', base_duration))
    
    # Slowdown portion
    print("Adding slowdown frames with corrected colors...")
    for start_pct, end_pct, num_interp, corrected_dir in INTERP_SEGMENTS:
        start_frame = int(start_pct * (TOTAL_FRAMES - 1)) + 1
        end_frame = int(end_pct * (TOTAL_FRAMES - 1)) + 1
        if end_pct == 1.0:
            end_frame = TOTAL_FRAMES
        
        if corrected_dir is None:
            # Use original frames
            frame_list = [ORIG_FRAMES / f'frame_{i:05d}.png' for i in range(start_frame, end_frame + 1)]
            multiplier = 1
        else:
            # Use corrected interpolated frames
            frame_list = sorted((OUTPUT_DIR / corrected_dir).glob('frame_*.png'))
            multiplier = num_interp + 1
        
        for i, frame_path in enumerate(frame_list):
            # Calculate position in original timeline
            orig_frame_in_seg = i / multiplier
            orig_frame_count = len(frame_list) / multiplier
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
            
            adjusted_duration = base_duration * duration_mult / multiplier
            all_entries.append((frame_path, adjusted_duration))
    
    print(f"Total frames: {len(all_entries)}")
    
    # Create concat file
    concat_file = OUTPUT_DIR / 'final_concat_corrected.txt'
    with open(concat_file, 'w') as f:
        for frame_path, duration in all_entries:
            f.write(f"file '{frame_path}'\n")
            f.write(f"duration {duration:.6f}\n")
        f.write(f"file '{all_entries[-1][0]}'\n")
    
    total_duration = sum(d for _, d in all_entries)
    print(f"Expected duration: {total_duration:.1f}s")
    
    # Encode
    print("Encoding final video...")
    subprocess.run([
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', str(concat_file),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30',
        str(FINAL_OUTPUT)
    ], capture_output=True)
    
    # Verify
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(FINAL_OUTPUT)
    ], capture_output=True, text=True)
    
    size_mb = FINAL_OUTPUT.stat().st_size / (1024 * 1024)
    print(f"\nDone!")
    print(f"Output: {FINAL_OUTPUT}")
    print(f"Duration: {float(result.stdout.strip()):.1f}s")
    print(f"Size: {size_mb:.1f}MB")

if __name__ == "__main__":
    main()
