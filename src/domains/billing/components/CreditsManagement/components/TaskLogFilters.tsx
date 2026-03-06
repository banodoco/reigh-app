import { Filter } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';
import type { TaskLogFilters as TaskLogFiltersType } from '../types';

interface AvailableFilters {
  statuses: string[];
  taskTypes: string[];
  projects: Array<{ id: string; name: string }>;
}

interface TaskLogFiltersProps {
  filters: TaskLogFiltersType;
  availableFilters: AvailableFilters | undefined;
  filterCount: number;
  onUpdateFilter: <K extends keyof TaskLogFiltersType>(filterType: K, value: TaskLogFiltersType[K]) => void;
  onToggleArrayFilter: (filterType: 'status' | 'taskTypes' | 'projectIds', value: string) => void;
  onClearFilters: () => void;
}

export function TaskLogFilters({
  filters,
  availableFilters,
  filterCount,
  onUpdateFilter,
  onToggleArrayFilter,
  onClearFilters,
}: TaskLogFiltersProps) {
  return (
    <div className="p-4 bg-muted rounded-lg border border-border space-y-3 sm:space-y-0 mt-1 mb-6">
      <div className="flex items-center gap-2 sm:hidden">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-light text-foreground">Filter by:</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-light text-foreground">Filter by:</span>
        </div>

        {/* Cost Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Cost
              {filters.costFilter !== 'all' && (
                <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  1
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 mx-2" align="start">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="font-light text-sm">Filter by Cost</h4>
                {filters.costFilter !== 'all' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUpdateFilter('costFilter', 'all')}
                    className="h-6 px-2 text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-x-2">
                  <input
                    type="radio"
                    id="cost-all"
                    name="cost-filter"
                    checked={filters.costFilter === 'all'}
                    onChange={() => onUpdateFilter('costFilter', 'all')}
                    className="w-4 h-4"
                  />
                  <label htmlFor="cost-all" className="text-sm cursor-pointer font-light">
                    All Costs
                  </label>
                </div>
                <div className="flex items-center gap-x-2">
                  <input
                    type="radio"
                    id="cost-free"
                    name="cost-filter"
                    checked={filters.costFilter === 'free'}
                    onChange={() => onUpdateFilter('costFilter', 'free')}
                    className="w-4 h-4"
                  />
                  <label htmlFor="cost-free" className="text-sm cursor-pointer">
                    Free Tasks
                  </label>
                </div>
                <div className="flex items-center gap-x-2">
                  <input
                    type="radio"
                    id="cost-paid"
                    name="cost-filter"
                    checked={filters.costFilter === 'paid'}
                    onChange={() => onUpdateFilter('costFilter', 'paid')}
                    className="w-4 h-4"
                  />
                  <label htmlFor="cost-paid" className="text-sm cursor-pointer">
                    Paid Tasks
                  </label>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Status Filter */}
        {availableFilters?.statuses && availableFilters.statuses.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                Status
                {filters.status.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                    {filters.status.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 mx-2" align="start">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-light text-sm">Filter by Status</h4>
                  {filters.status.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUpdateFilter('status', [])}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-x-2 pb-1 border-b">
                  <Checkbox
                    id="status-all"
                    checked={filters.status.length === 0}
                    onCheckedChange={() => onUpdateFilter('status', [])}
                  />
                  <label htmlFor="status-all" className="text-sm cursor-pointer font-light">
                    All Statuses ({availableFilters.statuses.length})
                  </label>
                </div>
                {availableFilters.statuses.map((status) => (
                  <div key={status} className="flex items-center gap-x-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={filters.status.includes(status)}
                      onCheckedChange={() => onToggleArrayFilter('status', status)}
                    />
                    <label htmlFor={`status-${status}`} className="text-sm cursor-pointer">
                      {status}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Task Type Filter */}
        {availableFilters?.taskTypes && availableFilters.taskTypes.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                Task Type
                {filters.taskTypes.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                    {filters.taskTypes.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 mx-2" align="start">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-light text-sm">Filter by Task Type</h4>
                  {filters.taskTypes.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUpdateFilter('taskTypes', [])}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-x-2 pb-1 border-b">
                  <Checkbox
                    id="taskType-all"
                    checked={filters.taskTypes.length === 0}
                    onCheckedChange={() => onUpdateFilter('taskTypes', [])}
                  />
                  <label htmlFor="taskType-all" className="text-sm cursor-pointer font-light">
                    All Types ({availableFilters.taskTypes.length})
                  </label>
                </div>
                {availableFilters.taskTypes.map((taskType) => (
                  <div key={taskType} className="flex items-center gap-x-2">
                    <Checkbox
                      id={`taskType-${taskType}`}
                      checked={filters.taskTypes.includes(taskType)}
                      onCheckedChange={() => onToggleArrayFilter('taskTypes', taskType)}
                    />
                    <label htmlFor={`taskType-${taskType}`} className="text-sm cursor-pointer">
                      {getTaskDisplayName(taskType)}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Project Filter */}
        {availableFilters?.projects && availableFilters.projects.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                Project
                {filters.projectIds.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                    {filters.projectIds.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 mx-2" align="start">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-light text-sm">Filter by Project</h4>
                  {filters.projectIds.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUpdateFilter('projectIds', [])}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-x-2 pb-1 border-b">
                  <Checkbox
                    id="project-all"
                    checked={filters.projectIds.length === 0}
                    onCheckedChange={() => onUpdateFilter('projectIds', [])}
                  />
                  <label htmlFor="project-all" className="text-sm cursor-pointer font-light">
                    All Projects ({availableFilters.projects.length})
                  </label>
                </div>
                {availableFilters.projects.map((project) => (
                  <div key={project.id} className="flex items-center gap-x-2">
                    <Checkbox
                      id={`project-${project.id}`}
                      checked={filters.projectIds.includes(project.id)}
                      onCheckedChange={() => onToggleArrayFilter('projectIds', project.id)}
                    />
                    <label htmlFor={`project-${project.id}`} className="text-sm cursor-pointer truncate preserve-case">
                      {project.name}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Clear Filters */}
        {filterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8 text-gray-500">
            Clear ({filterCount})
          </Button>
        )}
      </div>
    </div>
  );
}
