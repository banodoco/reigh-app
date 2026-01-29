#!/usr/bin/env python3
"""
Build Video B (loop video) with:
- Ease-IN at beginning (slow → normal, frames 1-205)
- Normal middle (frames 206-1842)
- Ease-OUT at end (normal → slow, frames 1843-2048)
"""
import subprocess
from pathlib import Path
import sys

sys.stdout.reconfigure(line_buffering=True)

PROJECT_DIR = Path('/Users/peteromalley/Documents/reigh')
OUTPUT_DIR = PROJECT_DIR / 'public' / 'easeout_v2'
ORIG_FRAMES = OUTPUT_DIR / 'all_frames'
FINAL_OUTPUT = PROJECT_DIR / 'public' / 'hero-background-loop.mp4'

TOTAL_FRAMES = 2048
FPS = 30

# Timing parameters (same as ease-out)
EASE_ZONE = 0.50  # 50% - smooth curve, no constant speed section
EXTRA_SLOW_ZONE = 0.01  # 1% at very start/end
MAX_SLOWDOWN = 3  # 3x slowdown at ends
EXTRA_SLOW_MAX = 3  # matches MAX_SLOWDOWN

# Beginning segments (ease-IN: slow at start, speeds up)
# Extended to 50% for the smooth curve
START_SEGMENTS = [
    # (start_pct, end_pct, num_interp, corrected_dir)
    (0.0, 0.025, 2, 'start3_corrected'),    # 3x frames (interpolated)
    (0.025, 0.045, 2, 'start2_corrected'),  # 3x frames (interpolated)
    (0.045, 0.07, 1, 'start1_corrected'),   # 2x frames (interpolated)
    (0.07, 0.10, 0, None),                   # Original frames
    (0.10, 0.50, 0, None),                   # Original frames (extended ease-in)
]

# End segments (ease-OUT: slows down at end)
# Extended to start at 50% for the smooth curve
END_SEGMENTS = [
    (0.50, 0.90, 0, None),                   # Original frames (extended ease-out)
    (0.90, 0.93, 0, None),                   # Original frames
    (0.93, 0.955, 1, 'seg1_corrected'),     # 2x frames (interpolated)
    (0.955, 0.975, 2, 'seg2_corrected'),    # 3x frames (interpolated)
    (0.975, 1.0, 2, 'seg3_corrected'),      # 3x frames (interpolated)
]


def get_ease_in_multiplier(t):
    """
    Ease-IN: slow at t=0, speeds up to normal by t=0.10
    Returns duration multiplier (>1 = slower)
    """
    if t >= EASE_ZONE:
        return 1.0
    
    # t goes from 0 to 0.10
    # We want multiplier to go from MAX to 1
    if t < EXTRA_SLOW_ZONE:
        # Extra slow at very beginning (0-1%)
        local_t = t / EXTRA_SLOW_ZONE  # 0 to 1
        ease = 1 - (1 - local_t) ** 2  # quadratic ease
        return EXTRA_SLOW_MAX - (EXTRA_SLOW_MAX - MAX_SLOWDOWN) * ease
    else:
        # Normal ease zone (1-10%)
        local_t = (t - EXTRA_SLOW_ZONE) / (EASE_ZONE - EXTRA_SLOW_ZONE)  # 0 to 1
        ease = 1 - (1 - local_t) ** 2
        return MAX_SLOWDOWN - (MAX_SLOWDOWN - 1) * ease


def get_ease_out_multiplier(t):
    """
    Ease-OUT: normal speed until t=0.90, slows down to very slow by t=1.0
    Returns duration multiplier (>1 = slower)
    """
    if t < 1 - EASE_ZONE:
        return 1.0
    
    if t < 1 - EXTRA_SLOW_ZONE:
        # Normal ease zone (90-99%)
        local_t = (t - (1 - EASE_ZONE)) / (EASE_ZONE - EXTRA_SLOW_ZONE)
        ease = 1 - (1 - local_t) ** 2
        return 1 + (MAX_SLOWDOWN - 1) * ease
    else:
        # Extra slow at very end (99-100%)
        local_t = (t - (1 - EXTRA_SLOW_ZONE)) / EXTRA_SLOW_ZONE
        ease = 1 - (1 - local_t) ** 2
        return MAX_SLOWDOWN + (EXTRA_SLOW_MAX - MAX_SLOWDOWN) * ease


def main():
    print("=" * 60)
    print("Building Video B (loop video with ease-in and ease-out)")
    print("=" * 60)
    
    all_entries = []  # (frame_path, duration)
    base_duration = 1 / FPS
    
    # === BEGINNING: Ease-IN (frames 1-205) ===
    print("\n[1/3] Adding ease-IN at beginning...")
    
    for start_pct, end_pct, num_interp, corrected_dir in START_SEGMENTS:
        start_frame = int(start_pct * (TOTAL_FRAMES - 1)) + 1
        end_frame = int(end_pct * (TOTAL_FRAMES - 1)) + 1
        
        if corrected_dir is None:
            # Use original frames
            frame_list = [ORIG_FRAMES / f'frame_{i:05d}.png' for i in range(start_frame, end_frame)]
            multiplier = 1
        else:
            frame_list = sorted((OUTPUT_DIR / corrected_dir).glob('frame_*.png'))
            multiplier = num_interp + 1
        
        print(f"  {corrected_dir or 'original'}: {len(frame_list)} frames, {start_pct*100:.1f}-{end_pct*100:.1f}%")
        
        for i, frame_path in enumerate(frame_list):
            # Calculate position in original timeline
            seg_progress = i / len(frame_list) if len(frame_list) > 0 else 0
            t = start_pct + seg_progress * (end_pct - start_pct)
            
            # Get ease-in multiplier
            duration_mult = get_ease_in_multiplier(t)
            adjusted_duration = base_duration * duration_mult / multiplier
            all_entries.append((frame_path, adjusted_duration))
    
    # === MIDDLE: Normal speed (frames 206-1842) ===
    print("\n[2/3] Adding normal middle section...")
    
    middle_start = int(EASE_ZONE * (TOTAL_FRAMES - 1)) + 1  # Frame 206
    middle_end = int((1 - EASE_ZONE) * (TOTAL_FRAMES - 1)) + 1  # Frame 1843
    
    print(f"  Frames {middle_start}-{middle_end-1}: normal speed")
    
    for i in range(middle_start, middle_end):
        all_entries.append((ORIG_FRAMES / f'frame_{i:05d}.png', base_duration))
    
    # === END: Ease-OUT (frames 1843-2048) ===
    print("\n[3/3] Adding ease-OUT at end...")
    
    for start_pct, end_pct, num_interp, corrected_dir in END_SEGMENTS:
        start_frame = int(start_pct * (TOTAL_FRAMES - 1)) + 1
        end_frame = int(end_pct * (TOTAL_FRAMES - 1)) + 1
        if end_pct == 1.0:
            end_frame = TOTAL_FRAMES
        
        if corrected_dir is None:
            frame_list = [ORIG_FRAMES / f'frame_{i:05d}.png' for i in range(start_frame, end_frame + 1)]
            multiplier = 1
        else:
            frame_list = sorted((OUTPUT_DIR / corrected_dir).glob('frame_*.png'))
            multiplier = num_interp + 1
        
        print(f"  {corrected_dir or 'original'}: {len(frame_list)} frames, {start_pct*100:.1f}-{end_pct*100:.1f}%")
        
        for i, frame_path in enumerate(frame_list):
            seg_progress = i / len(frame_list) if len(frame_list) > 0 else 0
            t = start_pct + seg_progress * (end_pct - start_pct)
            
            duration_mult = get_ease_out_multiplier(t)
            adjusted_duration = base_duration * duration_mult / multiplier
            all_entries.append((frame_path, adjusted_duration))
    
    print(f"\nTotal frames: {len(all_entries)}")
    
    # Calculate durations
    total_duration = sum(d for _, d in all_entries)
    ease_in_duration = sum(d for _, d in all_entries[:366])  # Approximate
    ease_out_duration = sum(d for _, d in all_entries[-441:])
    
    print(f"Expected duration: {total_duration:.1f}s")
    print(f"  Ease-in portion: ~{ease_in_duration:.1f}s")
    print(f"  Ease-out portion: ~{ease_out_duration:.1f}s")
    
    # Create concat file
    concat_file = OUTPUT_DIR / 'loop_concat.txt'
    with open(concat_file, 'w') as f:
        for frame_path, duration in all_entries:
            f.write(f"file '{frame_path}'\n")
            f.write(f"duration {duration:.6f}\n")
        f.write(f"file '{all_entries[-1][0]}'\n")
    
    # Encode
    print("\nEncoding Video B...")
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
    
    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"Output: {FINAL_OUTPUT}")
    print(f"Duration: {float(result.stdout.strip()):.1f}s")
    print(f"Size: {size_mb:.1f}MB")


if __name__ == "__main__":
    main()
