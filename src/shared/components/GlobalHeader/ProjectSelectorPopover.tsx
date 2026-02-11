import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/shared/components/ui/command';
import { Star, ChevronsUpDown, PlusCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Project } from '@/types/project';

interface ProjectSelectorPopoverProps {
  projects: Project[];
  selectedProject: Project | undefined;
  isLoadingProjects: boolean;
  onProjectChange: (projectId: string) => void;
  onCreateProject: (initialName?: string) => void;
  /** 'desktop' uses fixed width + larger text; 'mobile' uses full-width + smaller text */
  variant: 'desktop' | 'mobile';
}

export const ProjectSelectorPopover: React.FC<ProjectSelectorPopoverProps> = ({
  projects,
  selectedProject,
  isLoadingProjects,
  onProjectChange,
  onCreateProject,
  variant,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isDesktop = variant === 'desktop';

  const triggerClassName = cn(
    "flex items-center justify-between",
    "bg-background hover:bg-[#6a8a8a]/10 rounded-sm border-2 border-[#6a8a8a]/30 hover:border-[#6a8a8a]/45",
    "dark:border-[#6a7a7a] dark:hover:bg-transparent text-[#5a7a7a] dark:text-[#c8c4bb]",
    "font-heading font-light tracking-wide transition-all duration-200",
    "shadow-sm hover:shadow",
    "dark:shadow-[-2px_2px_0_0_hsl(var(--shadow-retro-deep)_/_0.4)] dark:hover:shadow-[-1px_1px_0_0_hsl(var(--shadow-retro-deep)_/_0.4)]",
    "dark:hover:translate-x-[-0.5px] dark:hover:translate-y-[0.5px]",
    "focus:outline-none focus:ring-2 focus:ring-[#6a8a8a]/30 focus:ring-offset-0",
    "disabled:cursor-not-allowed disabled:opacity-50",
    isDesktop ? "w-[280px] h-12 px-3 py-2" : "w-full h-10 px-2 py-2 text-sm"
  );

  const popoverContentClassName = cn(
    "p-0 z-[9999] rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] shadow-[-3px_3px_0_0_hsl(var(--shadow-retro)_/_0.15)] dark:shadow-[-3px_3px_0_0_hsl(var(--shadow-retro-deep)_/_0.4)]",
    isDesktop ? "w-[280px]" : "w-[calc(100vw-2rem)] max-w-[400px]"
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const hasMatch = projects.some(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (!hasMatch) {
        onCreateProject(searchQuery.trim());
        setIsOpen(false);
        setSearchQuery('');
        e.preventDefault();
      }
    }
  };

  const truncatedName = (name: string) =>
    name.length > 30 ? `${name.substring(0, 30)}...` : name;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setSearchQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={isOpen}
          disabled={isLoadingProjects || projects.length === 0}
          className={triggerClassName}
        >
          {selectedProject ? (
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-4 h-4 bg-[#6a8a8a] dark:bg-[#8a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                <Star className="h-2 w-2 text-white flex-shrink-0" fill="white" strokeWidth={0} />
              </div>
              <span className={cn("truncate preserve-case", !isDesktop && "text-sm")}>
                {truncatedName(selectedProject.name)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {isDesktop ? "Select a project" : "Select project"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={popoverContentClassName}
        align="start"
        onKeyDown={handleKeyDown}
      >
        <Command variant="retro" className="rounded-sm">
          <CommandInput
            placeholder="Search projects..."
            className="h-9"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">No projects found.</p>
                {searchQuery.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Press <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded border">Enter</kbd> to create "{searchQuery.trim()}"
                  </p>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {projects.map(project => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  variant="retro"
                  onSelect={() => {
                    onProjectChange(project.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-[#6a8a8a] dark:bg-[#8a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                      <Star className="h-2 w-2 text-white flex-shrink-0" />
                    </div>
                    <span className={cn("truncate preserve-case", !isDesktop && "text-sm")}>
                      {truncatedName(project.name)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {projects.length > 0 && <CommandSeparator className="border-t-2 border-[#6a8a8a]/30 dark:border-[#8a9a9a]/30" />}
            <CommandGroup>
              <CommandItem
                value="create-new-project"
                variant="retro"
                onSelect={() => {
                  onCreateProject(undefined);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-[#5a7a7a] dark:bg-[#7a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                    <PlusCircle className="h-2 w-2 text-white flex-shrink-0" />
                  </div>
                  <span className={cn(
                    isDesktop
                      ? "font-crimson font-light text-primary"
                      : "text-sm"
                  )}>
                    Create New Project
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
