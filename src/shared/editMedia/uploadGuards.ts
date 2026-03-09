import { resolveAuthenticatedMediaUserId } from '@/shared/lib/media/videoThumbnailGenerator';

interface ProjectAndUser {
  projectId: string;
  userId: string;
}

export async function requireProjectAndUserId(
  projectId: string | null | undefined
): Promise<ProjectAndUser> {
  if (!projectId) {
    throw new Error('No project selected');
  }

  return {
    projectId,
    userId: await resolveAuthenticatedMediaUserId(),
  };
}
