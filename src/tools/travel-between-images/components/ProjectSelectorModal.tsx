import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { Loader2, Plus } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { useMediumModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { useAsyncOperation } from '@/shared/hooks/async/useAsyncOperation';

interface Project {
  id: string;
  name: string;
  created_at: string;
}

interface ProjectSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (projectId: string) => void;
  title?: string;
  description?: string;
}

/**
 * ProjectSelectorModal - Simple modal for selecting a project
 * 
 * Used for copying shared generations to a user's account
 * Allows selecting existing project or creating a new one
 */
export const ProjectSelectorModal: React.FC<ProjectSelectorModalProps> = ({
  open,
  onOpenChange,
  onSelect,
  title = "Select Project",
  description = "Choose which project to add this generation to"
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Async operations with automatic loading state
  const loadOperation = useAsyncOperation<Project[]>();
  const createOperation = useAsyncOperation<Project>();
  
  // Modal styling
  const modal = useMediumModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen: open });

  const loadProjects = useCallback(async () => {
    const result = await loadOperation.execute(async () => {
      const { data, error } = await supabase().from('projects')
        .select('id, name, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }, { context: 'ProjectSelectorModal', showToast: false });

    if (result) {
      setProjects(result);
      if (result.length > 0 && !selectedProjectId) {
        setSelectedProjectId(result[0].id);
      }
    }
  }, [loadOperation, selectedProjectId]);

  useEffect(() => {
    if (open) {
      loadProjects();
    }
  }, [open, loadProjects]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;

    const result = await createOperation.execute(async () => {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) throw new Error('Must be signed in to create a project');

      const { data, error } = await supabase().from('projects')
        .insert({ name: newProjectName.trim(), user_id: user.id })
        .select('id, name, created_at')
        .single();

      if (error || !data) throw error || new Error('Failed to create project');
      return data;
    }, { context: 'ProjectSelectorModal', showToast: false });

    if (result) {
      setProjects(prev => [result, ...prev]);
      setSelectedProjectId(result.id);
      setShowNewProjectInput(false);
      setNewProjectName('');
    }
  }, [createOperation, newProjectName]);

  const handleConfirm = () => {
    if (selectedProjectId) {
      onSelect(selectedProjectId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {loadOperation.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : projects.length === 0 && !showNewProjectInput ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                You don't have any projects yet
              </p>
              <Button onClick={() => setShowNewProjectInput(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Project
              </Button>
            </div>
          ) : (
            <>
              {projects.length > 0 && !showNewProjectInput && (
                <div className="space-y-3">
                  <Label>Select a project:</Label>
                  <RadioGroup
                    value={selectedProjectId || ''}
                    onValueChange={setSelectedProjectId}
                    className="space-y-2"
                  >
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center gap-x-2 rounded-md border p-3 hover:bg-accent cursor-pointer"
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <RadioGroupItem value={project.id} id={project.id} />
                        <Label
                          htmlFor={project.id}
                          className="flex-1 cursor-pointer preserve-case"
                        >
                          {project.name}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </RadioGroup>
                  
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowNewProjectInput(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Project
                  </Button>
                </div>
              )}

              {showNewProjectInput && (
                <div className="space-y-3">
                  <Label htmlFor="project-name">New Project Name:</Label>
                  <div className="flex gap-2">
                    <Input
                      id="project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Enter project name"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateProject();
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim() || createOperation.isLoading}
                    >
                      {createOperation.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Create'
                      )}
                    </Button>
                  </div>
                  {projects.length > 0 && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setShowNewProjectInput(false);
                        setNewProjectName('');
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className={`${modal.footerClass} relative`}>
          {/* Scroll fade effect */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <DialogFooter className="border-t relative z-20">
            <Button variant="retro-secondary" size="retro-sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="retro"
              size="retro-sm"
              onClick={handleConfirm}
              disabled={!selectedProjectId || loadOperation.isLoading}
            >
              Confirm
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
