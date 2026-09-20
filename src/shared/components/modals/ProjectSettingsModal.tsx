import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/primitives/label";
import { useProjectCrudContext } from '@/shared/contexts/ProjectContext';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { Project } from '@/types/project';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react';
import { AspectRatioSelector } from '@/shared/components/GenerationControls/AspectRatioSelector';
import { recropAllReferences } from '@/shared/lib/media/recropReferences';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { ModalContainer } from '@/shared/components/ModalContainer';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { useHydratedReferences } from '@/shared/components/ImageGenerationForm/hooks/useHydratedReferences';
import type { ProjectImageSettings } from '@/shared/components/ImageGenerationForm/types';
import { useSpecificResources } from '@/shared/hooks/useSpecificResources';
import {
  useUpdateResource,
  type StyleReferenceMetadata,
} from '@/features/resources/hooks/useResources';
import { useUpdateGenerationLocation } from '@/domains/generation/hooks/useGenerationMutations';
import { resourceQueryKeys } from '@/shared/lib/queryKeys/resources';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project | null | undefined;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onOpenChange, project }) => {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const { settings: uploadSettings, update: updateUploadSettings, isLoading: isLoadingUploadSettings } = useToolSettings<{ cropToProjectSize?: boolean }>(SETTINGS_IDS.UPLOAD, { projectId: project?.id });
  const { settings: imageSettings, update: updateImageSettings } = useToolSettings<ProjectImageSettings>(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, { projectId: project?.id });
  const referencePointers = imageSettings?.references ?? [];
  const { hydratedReferences, isLoading: isLoadingHydratedReferences } = useHydratedReferences(referencePointers);
  const resourceIds = useMemo(
    () => [...new Set(referencePointers.map(reference => reference.resourceId).filter(Boolean))],
    [referencePointers],
  );
  const specificResources = useSpecificResources(resourceIds);
  const updateStyleReference = useUpdateResource();
  const updateGenerationLocation = useUpdateGenerationLocation();
  const resourceById = useMemo(
    () => new Map((specificResources.data ?? []).map(resource => [resource.id, resource])),
    [specificResources.data],
  );

  const [cropToProjectSize, setCropToProjectSize] = useState<boolean>(true);
  const { updateProject, isUpdatingProject, deleteProject, isDeletingProject } = useProjectCrudContext();
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

  useEffect(() => {
    if (project && isOpen) {
      setProjectName(project.name);
      setAspectRatio(project.aspectRatio || '16:9');
      if (!isLoadingUploadSettings) {
        setCropToProjectSize(uploadSettings?.cropToProjectSize ?? true);
      }
    }
  }, [project, isOpen, uploadSettings, isLoadingUploadSettings]);

  const handleCropToProjectSizeChange = (checked: boolean) => {
    setCropToProjectSize(checked);
    if (project?.id) {
      updateUploadSettings('project', { cropToProjectSize: checked });
    }
  };

  const handleSaveChanges = async () => {
    if (!project) {
      toast.error("No project selected to update.");
      return;
    }

    const updates: { name?: string; aspectRatio?: string } = {};
    let hasChanges = false;
    if (projectName.trim() && projectName.trim() !== project.name) {
      updates.name = projectName.trim();
      hasChanges = true;
    }
    if (aspectRatio && aspectRatio !== project.aspectRatio) {
      updates.aspectRatio = aspectRatio;
      hasChanges = true;
    }

    if (!hasChanges) {
      toast.info("No changes detected.");
      onOpenChange(false);
      return;
    }

    if (!updates.name && !updates.aspectRatio) {
      toast.error("Project name cannot be empty if it's the only change.");
      return;
    }

    const aspectRatioChanged = updates.aspectRatio && updates.aspectRatio !== project.aspectRatio;
    const hasReferencePointers = referencePointers.length > 0;
    const hasReferencesToRecrop = hydratedReferences.some(ref => ref.styleReferenceImageOriginal);

    if (aspectRatioChanged && hasReferencePointers && (isLoadingHydratedReferences || specificResources.isLoading)) {
      toast.error('Reference data is still loading. Please try again in a moment.');
      return;
    }
    if (aspectRatioChanged && hasReferencesToRecrop) setIsReprocessing(true);

    const success = await updateProject(project.id, updates);
    if (success) {
      if (aspectRatioChanged && hasReferencesToRecrop) {
        await performRecrop(updates.aspectRatio!);
      }
      onOpenChange(false);
    }

    setIsReprocessing(false);
  };

  const performRecrop = async (newAspectRatio: string) => {
    if (!project?.id) return;
    if (isLoadingHydratedReferences || specificResources.isLoading) {
      throw new Error('Reference data is still loading');
    }

    const referencesWithOriginals = hydratedReferences.filter(ref => ref.styleReferenceImageOriginal);
    if (referencesWithOriginals.length === 0) return;

    try {
      const recroppedReferences = await recropAllReferences(referencesWithOriginals, newAspectRatio);
      for (const recroppedReference of recroppedReferences) {
        const resource = resourceById.get(recroppedReference.resourceId);
        if (!resource) continue;

        const metadata = resource.metadata as StyleReferenceMetadata;
        const updatedMetadata: StyleReferenceMetadata = {
          ...metadata,
          generationId: resource.generation_id ?? metadata.generationId,
          styleReferenceImage: recroppedReference.styleReferenceImage,
          thumbnailUrl: recroppedReference.thumbnailUrl,
          updatedAt: recroppedReference.updatedAt,
        };

        await updateStyleReference.mutateAsync({
          id: resource.id,
          type: 'style-reference',
          metadata: updatedMetadata,
        });
        await queryClient.invalidateQueries({ queryKey: resourceQueryKeys.detail(resource.id) });

        if (resource.generation_id && resource.generation?.type === 'uploaded-reference') {
          await updateGenerationLocation.mutateAsync({
            id: resource.generation_id,
            projectId: project.id,
            location: recroppedReference.styleReferenceImage,
            thumbnailUrl: recroppedReference.thumbnailUrl,
          });
          await queryClient.invalidateQueries({ queryKey: generationQueryKeys.detail(resource.generation_id) });
        }
      }

      await queryClient.invalidateQueries({ queryKey: generationQueryKeys.byShotAll });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'ProjectSettingsModal', toastTitle: 'Failed to update some reference images. You may need to re-upload them.' });
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    const success = await deleteProject(project.id);
    if (success) onOpenChange(false);
  };

  if (!project) return null;

  return (
    <ModalContainer
      open={isOpen}
      onOpenChange={onOpenChange}
      size="medium"
      title="Project Settings"
      footer={(
        <>
          <Button variant="retro-secondary" size="retro-sm" onClick={() => onOpenChange(false)} disabled={isUpdatingProject || isReprocessing} className="mr-auto sm:mr-0">
            Cancel
          </Button>
          <Button
            variant="retro"
            size="retro-sm"
            type="submit"
            onClick={handleSaveChanges}
            disabled={isUpdatingProject || isReprocessing || !projectName.trim() || !aspectRatio}
            className={isReprocessing ? 'min-w-[280px]' : ''}
          >
            {isReprocessing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Updating for new dimensions...
              </>
            ) : isUpdatingProject ? (
              "Saving..."
            ) : (
              "Save Changes"
            )}
          </Button>
        </>
      )}
    >
      <div className="grid gap-4 py-3">
        <div className="space-y-1.5">
          <Label htmlFor="project-name-settings">Name:</Label>
          <Input
            id="project-name-settings"
            autoComplete="off"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full"
            disabled={isUpdatingProject}
            maxLength={30}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aspect-ratio-settings">Aspect Ratio:</Label>
          <AspectRatioSelector
            value={aspectRatio}
            onValueChange={setAspectRatio}
            disabled={isUpdatingProject}
            id="aspect-ratio-settings"
            showVisualizer
          />
        </div>
        <div className="flex items-center gap-x-2 pt-2">
          <Checkbox
            id="crop-to-project-size-settings"
            checked={cropToProjectSize}
            onCheckedChange={(checked) => handleCropToProjectSizeChange(checked === true)}
            disabled={isUpdatingProject}
          />
          <Label htmlFor="crop-to-project-size-settings" className="text-sm">
            Crop uploaded images to project size
          </Label>
        </div>
        <Collapsible open={isDangerZoneOpen} onOpenChange={setIsDangerZoneOpen}>
          <div className="mt-6 border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="h-auto w-full justify-between p-0 text-left hover:bg-transparent" type="button">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="font-light text-red-600">Delete Project</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-red-500 transition-transform ${isDangerZoneOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="delete-confirm-input" className="text-sm font-light text-red-900 dark:text-red-300">
                      Type "confirm" to make it clear you wish to delete the project and all associated data.
                    </Label>
                    <Input
                      id="delete-confirm-input"
                      placeholder='Type "confirm" to enable'
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      disabled={isDeletingProject}
                      className="mt-1 border-red-300 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:bg-red-950/20 dark:text-red-100 dark:placeholder:text-red-400/50"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteProject}
                    disabled={deleteConfirmText !== 'confirm' || isDeletingProject}
                    className="w-full"
                  >
                    {isDeletingProject ? 'Deleting...' : 'Delete Project Forever'}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
    </ModalContainer>
  );
};
