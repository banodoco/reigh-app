/**
 * Extracts a segment from a video using the browser's MediaRecorder API.
 *
 * The approach: creates an off-screen <video> + <canvas>, seeks to the start
 * time, records canvas frames via MediaRecorder until the end time is reached,
 * then resolves with the resulting Blob and its file extension.
 */

interface ExtractedSegment {
  blob: Blob;
  fileExtension: string;
}

export function extractVideoSegment(
  videoUrl: string,
  startTime: number,
  endTime: number,
  videoName: string,
): Promise<ExtractedSegment> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    let mediaRecorder: MediaRecorder;
    let chunks: BlobPart[] = [];
    let isRecording = false;

    video.onloadedmetadata = () => {
      // Set canvas size to match video
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      // Create stream from canvas
      const stream = canvas.captureStream(30); // 30 FPS

      // Try to use MP4 first, fall back to WebM if needed
      const { mimeType, fileExtension } = negotiateMimeType();

      mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve({ blob, fileExtension });
      };

      // Seek to start time
      video.currentTime = startTime;
    };

    video.onseeked = () => {
      if (!isRecording && Math.abs(video.currentTime - startTime) < 0.1) {
        // Start recording
        isRecording = true;
        chunks = [];
        mediaRecorder.start();

        const renderFrame = () => {
          if (video.currentTime >= endTime || video.ended || video.paused) {
            mediaRecorder.stop();
            return;
          }

          // Draw current frame to canvas
          if (ctx && !video.paused && !video.ended) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }

          // Continue to next frame
          requestAnimationFrame(renderFrame);
        };

        // Start rendering loop
        video.play().then(() => {
          renderFrame();
        }).catch(reject);

        // Stop recording when we reach end time
        const checkEndTime = () => {
          if (video.currentTime >= endTime) {
            video.pause();
            mediaRecorder.stop();
          } else {
            requestAnimationFrame(checkEndTime);
          }
        };
        checkEndTime();
      }
    };

    video.onerror = () => reject(new Error(`Failed to load video: ${videoName}`));
    video.onabort = () => reject(new Error(`Video loading aborted: ${videoName}`));

    // Set video source and load
    video.src = videoUrl;
    video.load();
  });
}

/** Negotiate the best supported recording MIME type for the browser. */
function negotiateMimeType(): { mimeType: string; fileExtension: string } {
  const candidates: Array<{ mimeType: string; fileExtension: string }> = [
    { mimeType: 'video/mp4', fileExtension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', fileExtension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', fileExtension: 'webm' },
    { mimeType: 'video/webm', fileExtension: 'webm' },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  // Fallback - let the browser pick
  return { mimeType: 'video/webm', fileExtension: 'webm' };
}
