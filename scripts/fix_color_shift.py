#!/usr/bin/env python3
"""
Fix color shift in interpolated segments by matching to original frames.
"""
import subprocess
from pathlib import Path
import sys

sys.stdout.reconfigure(line_buffering=True)

PROJECT_DIR = Path('/Users/peteromalley/Documents/reigh')
OUTPUT_DIR = PROJECT_DIR / 'public' / 'easeout_v2'
ORIG_FRAMES = OUTPUT_DIR / 'all_frames'

# Segments that were interpolated and need color correction
SEGMENTS = [
    # (seg_idx, start_frame, end_frame, num_interp)
    (1, 1904, 1955, 1),  # 2x frames
    (2, 1955, 1996, 2),  # 3x frames
    (3, 1996, 2048, 3),  # 4x frames
]

def get_mean_brightness(img_path):
    """Get mean brightness of an image using ImageMagick."""
    result = subprocess.run([
        'magick', str(img_path), '-format', '%[fx:mean]', 'info:'
    ], capture_output=True, text=True)
    return float(result.stdout.strip())

def adjust_brightness(src_path, dst_path, factor):
    """Adjust brightness of an image."""
    # factor > 1 = brighter, factor < 1 = darker
    percent = factor * 100
    subprocess.run([
        'magick', str(src_path), 
        '-modulate', f'{percent},100,100',  # brightness, saturation, hue
        str(dst_path)
    ], capture_output=True)

def main():
    print("Analyzing and fixing color shifts in interpolated segments...")
    
    for seg_idx, start_frame, end_frame, num_interp in SEGMENTS:
        seg_frames_dir = OUTPUT_DIR / f'seg{seg_idx}_frames'
        corrected_dir = OUTPUT_DIR / f'seg{seg_idx}_corrected'
        corrected_dir.mkdir(exist_ok=True)
        
        # Get brightness of original frame at segment start
        orig_frame = ORIG_FRAMES / f'frame_{start_frame:05d}.png'
        orig_brightness = get_mean_brightness(orig_frame)
        
        # Get brightness of first interpolated frame
        interp_frames = sorted(seg_frames_dir.glob('frame_*.png'))
        interp_brightness = get_mean_brightness(interp_frames[0])
        
        # Calculate correction factor
        correction = orig_brightness / interp_brightness if interp_brightness > 0 else 1.0
        
        print(f"\nSegment {seg_idx}:")
        print(f"  Original brightness: {orig_brightness:.4f}")
        print(f"  Interpolated brightness: {interp_brightness:.4f}")
        print(f"  Correction factor: {correction:.4f} ({(correction-1)*100:+.1f}%)")
        
        if abs(correction - 1.0) < 0.005:
            print(f"  Correction minimal, copying frames unchanged...")
            for f in interp_frames:
                dst = corrected_dir / f.name
                subprocess.run(['cp', str(f), str(dst)])
        else:
            print(f"  Applying correction to {len(interp_frames)} frames...")
            for i, f in enumerate(interp_frames):
                dst = corrected_dir / f.name
                adjust_brightness(f, dst, correction)
                if (i + 1) % 50 == 0:
                    print(f"    Processed {i + 1}/{len(interp_frames)} frames")
        
        # Verify correction
        corrected_frames = sorted(corrected_dir.glob('frame_*.png'))
        corrected_brightness = get_mean_brightness(corrected_frames[0])
        print(f"  Corrected brightness: {corrected_brightness:.4f}")
    
    print("\nDone! Now rebuilding video with corrected frames...")

if __name__ == "__main__":
    main()
