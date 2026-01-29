#!/usr/bin/env python3
"""
Create ease-in interpolated frames for the beginning of the video.
Mirrors the ease-out segments at the end.
"""
import subprocess
from pathlib import Path
import sys
import fal_client
import urllib.request

sys.stdout.reconfigure(line_buffering=True)

PROJECT_DIR = Path('/Users/peteromalley/Documents/reigh')
OUTPUT_DIR = PROJECT_DIR / 'public' / 'easeout_v2'
ORIG_FRAMES = OUTPUT_DIR / 'all_frames'

TOTAL_FRAMES = 2048
FPS = 30

# Beginning segments (mirroring the end)
# Slowest at the very start, speeding up to normal by 10%
START_SEGMENTS = [
    # (start_frame, end_frame, num_interp, segment_name)
    (1, 52, 3, 'start3'),      # 0-2.5%: heaviest interpolation (4x frames)
    (52, 93, 2, 'start2'),     # 2.5-4.5%: heavy interpolation (3x frames)
    (93, 144, 1, 'start1'),    # 4.5-7%: light interpolation (2x frames)
    (144, 205, 0, 'start0'),   # 7-10%: no interpolation
]


def run_cmd(cmd, desc=""):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[:500]}")
        raise RuntimeError(f"Command failed: {desc}")
    return result


def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(f"    [FAL] {log['message']}")


def get_mean_brightness(img_path):
    result = subprocess.run([
        'magick', str(img_path), '-format', '%[fx:mean]', 'info:'
    ], capture_output=True, text=True)
    return float(result.stdout.strip())


def adjust_brightness(src_path, dst_path, factor):
    percent = factor * 100
    subprocess.run([
        'magick', str(src_path),
        '-modulate', f'{percent},100,100',
        str(dst_path)
    ], capture_output=True)


def main():
    print("=" * 60)
    print("Creating ease-in interpolated frames for beginning")
    print("=" * 60)
    
    for start_frame, end_frame, num_interp, seg_name in START_SEGMENTS:
        print(f"\n{'='*60}")
        print(f"Segment {seg_name}: frames {start_frame}-{end_frame}, interp={num_interp}")
        print("=" * 60)
        
        seg_frames_dir = OUTPUT_DIR / f'{seg_name}_frames'
        corrected_dir = OUTPUT_DIR / f'{seg_name}_corrected'
        seg_frames_dir.mkdir(exist_ok=True)
        corrected_dir.mkdir(exist_ok=True)
        
        if num_interp == 0:
            # No interpolation - just reference original frames
            print(f"  No interpolation needed, will use original frames directly")
            # We don't need to copy, we'll reference them in the concat
            continue
        
        # Check if already done
        expected_count = (end_frame - start_frame) * (num_interp + 1)
        existing = list(corrected_dir.glob('frame_*.png'))
        if len(existing) >= expected_count - 5:
            print(f"  Already processed, found {len(existing)} corrected frames")
            continue
        
        # Create segment video from original frames
        print(f"  Creating segment video...")
        seg_video = OUTPUT_DIR / f'{seg_name}_input.mp4'
        concat_file = OUTPUT_DIR / f'{seg_name}_input.txt'
        
        with open(concat_file, 'w') as f:
            for i in range(start_frame, end_frame):
                f.write(f"file '{ORIG_FRAMES}/frame_{i:05d}.png'\n")
                f.write(f"duration {1/FPS}\n")
            f.write(f"file '{ORIG_FRAMES}/frame_{end_frame-1:05d}.png'\n")
        
        run_cmd([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', str(concat_file),
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '15',
            '-pix_fmt', 'yuv420p',
            str(seg_video)
        ], f"create {seg_name} video")
        
        # Upload and interpolate
        print(f"  Uploading to fal.ai...")
        video_url = fal_client.upload_file(str(seg_video))
        
        print(f"  Running FILM interpolation (num_frames={num_interp})...")
        result = fal_client.subscribe(
            "fal-ai/film/video",
            arguments={
                "video_url": video_url,
                "num_frames": num_interp,
                "use_calculated_fps": True,
                "video_quality": "maximum",
            },
            with_logs=True,
            on_queue_update=on_queue_update,
        )
        
        if not (result and 'video' in result and 'url' in result['video']):
            raise RuntimeError(f"Interpolation failed for {seg_name}")
        
        # Download and extract frames
        interp_video = OUTPUT_DIR / f'{seg_name}_interpolated.mp4'
        urllib.request.urlretrieve(result['video']['url'], str(interp_video))
        print(f"  Downloaded interpolated video")
        
        run_cmd([
            'ffmpeg', '-y', '-i', str(interp_video),
            str(seg_frames_dir / 'frame_%05d.png')
        ], f"extract {seg_name} frames")
        
        interp_frames = sorted(seg_frames_dir.glob('frame_*.png'))
        print(f"  Extracted {len(interp_frames)} interpolated frames")
        
        # Color correction
        orig_brightness = get_mean_brightness(ORIG_FRAMES / f'frame_{start_frame:05d}.png')
        interp_brightness = get_mean_brightness(interp_frames[0])
        correction = orig_brightness / interp_brightness if interp_brightness > 0 else 1.0
        
        print(f"  Color correction: {correction:.4f} ({(correction-1)*100:+.1f}%)")
        
        for i, f in enumerate(interp_frames):
            dst = corrected_dir / f.name
            adjust_brightness(f, dst, correction)
            if (i + 1) % 50 == 0:
                print(f"    Corrected {i + 1}/{len(interp_frames)} frames")
        
        # Verify
        corrected_frames = sorted(corrected_dir.glob('frame_*.png'))
        corrected_brightness = get_mean_brightness(corrected_frames[0])
        print(f"  Original: {orig_brightness:.4f}, Corrected: {corrected_brightness:.4f}")
        
        # Cleanup intermediate files
        seg_video.unlink(missing_ok=True)
        interp_video.unlink(missing_ok=True)
        concat_file.unlink(missing_ok=True)
    
    print("\n" + "=" * 60)
    print("Done creating ease-in frames!")
    print("=" * 60)


if __name__ == "__main__":
    main()
