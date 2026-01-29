#!/usr/bin/env python3
"""
Fix choppy segments by re-interpolating with 3x instead of 4x frames.
Affects: start3 (0-2.5%) and seg3 (97.5-100%)
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

# Segments to re-interpolate with num_interp=2 (3x frames) instead of 3 (4x)
SEGMENTS_TO_FIX = [
    # (start_frame, end_frame, old_name, new_name)
    (1, 52, 'start3', 'start3'),      # Beginning: 0-2.5%
    (1996, 2048, 'seg3', 'seg3'),     # End: 97.5-100%
]

NEW_NUM_INTERP = 2  # 3x frames instead of 4x


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
    print("Fixing choppy segments (4x → 3x interpolation)")
    print("=" * 60)

    for start_frame, end_frame, seg_name, _ in SEGMENTS_TO_FIX:
        print(f"\n{'='*60}")
        print(f"Segment {seg_name}: frames {start_frame}-{end_frame}, changing to interp={NEW_NUM_INTERP}")
        print("=" * 60)

        seg_frames_dir = OUTPUT_DIR / f'{seg_name}_frames_new'
        corrected_dir = OUTPUT_DIR / f'{seg_name}_corrected_new'
        seg_frames_dir.mkdir(exist_ok=True)
        corrected_dir.mkdir(exist_ok=True)

        # Create segment video from original frames
        print(f"  Creating segment video...")
        seg_video = OUTPUT_DIR / f'{seg_name}_input_new.mp4'
        concat_file = OUTPUT_DIR / f'{seg_name}_input_new.txt'

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

        print(f"  Running FILM interpolation (num_frames={NEW_NUM_INTERP})...")
        result = fal_client.subscribe(
            "fal-ai/film/video",
            arguments={
                "video_url": video_url,
                "num_frames": NEW_NUM_INTERP,
                "use_calculated_fps": True,
                "video_quality": "maximum",
            },
            with_logs=True,
            on_queue_update=on_queue_update,
        )

        if not (result and 'video' in result and 'url' in result['video']):
            raise RuntimeError(f"Interpolation failed for {seg_name}")

        # Download and extract frames
        interp_video = OUTPUT_DIR / f'{seg_name}_interpolated_new.mp4'
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
        print(f"  Total corrected frames: {len(corrected_frames)}")

        # Cleanup intermediate files
        seg_video.unlink(missing_ok=True)
        interp_video.unlink(missing_ok=True)
        concat_file.unlink(missing_ok=True)

    # Now replace old directories with new ones
    print("\n" + "=" * 60)
    print("Replacing old 4x directories with new 3x directories...")
    print("=" * 60)

    import shutil
    for _, _, seg_name, _ in SEGMENTS_TO_FIX:
        old_corrected = OUTPUT_DIR / f'{seg_name}_corrected'
        new_corrected = OUTPUT_DIR / f'{seg_name}_corrected_new'
        backup_corrected = OUTPUT_DIR / f'{seg_name}_corrected_4x_backup'

        if old_corrected.exists():
            print(f"  Backing up {old_corrected.name} → {backup_corrected.name}")
            if backup_corrected.exists():
                shutil.rmtree(backup_corrected)
            old_corrected.rename(backup_corrected)

        print(f"  Renaming {new_corrected.name} → {old_corrected.name}")
        new_corrected.rename(old_corrected)

        # Clean up frames dir
        frames_dir = OUTPUT_DIR / f'{seg_name}_frames_new'
        if frames_dir.exists():
            shutil.rmtree(frames_dir)

    print("\n" + "=" * 60)
    print("Done! Now update build scripts and rebuild videos.")
    print("=" * 60)


if __name__ == "__main__":
    main()
