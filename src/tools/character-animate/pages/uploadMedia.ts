import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { getFileExtension, MEDIA_BUCKET, storagePaths } from '@/shared/lib/storagePaths';
import { extractVideoPosterFrame } from '@/shared/lib/media/videoPosterExtractor';

export async function uploadVideoWithPoster(file: File): Promise<{ videoUrl: string; posterUrl: string }> {
  const posterBlob = await extractVideoPosterFrame(file);

  const { data: { session } } = await supabase().auth.getSession();
  if (!session?.user?.id) {
    throw new Error('User not authenticated');
  }
  const userId = session.user.id;

  const fileExt = getFileExtension(file.name, file.type, 'mp4');
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const fileName = storagePaths.upload(userId, `${timestamp}-${randomId}.${fileExt}`);
  const posterFileName = storagePaths.thumbnail(userId, `${timestamp}-${randomId}-poster.jpg`);

  const { error: videoError } = await supabase().storage
    .from(MEDIA_BUCKET)
    .upload(fileName, file, { cacheControl: '3600', upsert: false });
  if (videoError) throw videoError;

  const { error: posterError } = await supabase().storage
    .from(MEDIA_BUCKET)
    .upload(posterFileName, posterBlob, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/jpeg',
    });
  if (posterError) throw posterError;

  const { data: { publicUrl: videoUrl } } = supabase().storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(fileName);
  const { data: { publicUrl: posterUrl } } = supabase().storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(posterFileName);

  return { videoUrl, posterUrl };
}
