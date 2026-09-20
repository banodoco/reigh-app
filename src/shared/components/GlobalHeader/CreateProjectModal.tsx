import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/primitives/label";
import { useProjectCrudContext, useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { getRandomDummyName } from '@/shared/lib/seeding/dummyNames';
import { AspectRatioSelector } from '@/shared/components/GenerationControls/AspectRatioSelector';
import { ModalContainer, ModalFooterButtons } from '@/shared/components/ModalContainer';

interface CreateProjectModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialName?: string;
  onProjectCreated?: () => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onOpenChange, initialName, onProjectCreated }) => {
  const [projectName, setProjectName] = useState(initialName || '');
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const { selectedProjectId } = useProjectSelectionContext();
  const { addNewProject, isCreatingProject, projects } = useProjectCrudContext();
  const navigate = useNavigate();

  // Get current project to use its aspect ratio as default
  const currentProject = projects.find(p => p.id === selectedProjectId);

  // Update default aspect ratio when modal opens or current project changes
  useEffect(() => {
    if (isOpen && currentProject?.aspectRatio) {
      setAspectRatio(currentProject.aspectRatio);
    }
  }, [isOpen, currentProject?.aspectRatio]);

  // Set initial name when modal opens with one provided, or reset when closing
  useEffect(() => {
    if (isOpen) {
      setProjectName(initialName || '');
    }
  }, [isOpen, initialName]);

  const handleCreateProject = async () => {
    let finalProjectName = projectName.trim();
    // If the user didn't enter a name, pick a random dummy name that's not already used
    if (!finalProjectName) {
      const existingNamesLower = projects.map(p => p.name.toLowerCase());
      const maxTries = 10;
      let tries = 0;
      let candidateName = '';
      while (tries < maxTries) {
        candidateName = getRandomDummyName();
        if (!existingNamesLower.includes(candidateName.toLowerCase())) {
          break;
        }
        tries++;
      }

      if (existingNamesLower.includes(candidateName.toLowerCase())) {
        candidateName = `${candidateName} ${Math.floor(Math.random() * 1000)}`;
      }

      finalProjectName = candidateName;
    }

    if (!aspectRatio) {
      toast.error("Please select an aspect ratio.");
      return;
    }
    try {
      const newProject = await addNewProject({ name: finalProjectName, aspectRatio });
      if (newProject) {
        onProjectCreated?.();
        setProjectName('');
        setAspectRatio(currentProject?.aspectRatio || '16:9');
        onOpenChange(false);
        navigate('/tools');
      }
    } catch (error) {
      normalizeAndPresentError(error, { context: 'CreateProjectModal', toastTitle: 'An error occurred while creating the project' });
    }
  };

  return (
    <ModalContainer
      open={isOpen}
      onOpenChange={onOpenChange}
      size="medium"
      title="Create New Project"
      footer={(
        <ModalFooterButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={handleCreateProject}
          confirmText={isCreatingProject ? "Creating..." : "Create Project"}
          isLoading={isCreatingProject}
          confirmDisabled={!aspectRatio}
        />
      )}
    >
      <div className="grid gap-4 py-3">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">Name:</Label>
          <Input
            id="project-name"
            autoComplete="off"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full"
            disabled={isCreatingProject}
            maxLength={30}
            placeholder="Enter project name..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aspect-ratio">Aspect Ratio:</Label>
          <AspectRatioSelector
            value={aspectRatio}
            onValueChange={setAspectRatio}
            disabled={isCreatingProject}
            id="aspect-ratio"
            showVisualizer
          />
        </div>
      </div>
    </ModalContainer>
  );
};
