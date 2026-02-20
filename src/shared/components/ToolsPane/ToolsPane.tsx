import React, { useState, useEffect, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useBottomOffset } from '@/shared/hooks/useBottomOffset';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useDarkMode } from '@/shared/hooks/useDarkMode';
import { useClickRipple } from '@/shared/hooks/useClickRipple';
import {
  Paintbrush,
  Video,
  Edit,
  Clapperboard,
  Link2,
  Users,
  LayoutGrid
} from 'lucide-react';
import { AppEnv, type AppEnvValue } from '@/types/env';
import { TOOL_IDS, TOOL_ROUTES } from '@/shared/lib/toolConstants';

const SHARED_TOOL_ENVS: AppEnvValue[] = [AppEnv.LOCAL, AppEnv.WEB];

// Tool definitions matching ToolSelectorPage
const processTools = [
  {
    id: TOOL_IDS.IMAGE_GENERATION,
    name: 'Generate Images',
    description: 'Create images using AI',
    path: TOOL_ROUTES.IMAGE_GENERATION,
    environments: SHARED_TOOL_ENVS,
    icon: Paintbrush,
    gradient: 'from-wes-vintage-gold via-wes-mustard to-wes-yellow',
    darkIconColor: '#a67d2a',
  },
  {
    id: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
    name: 'Travel Between Images',
    description: 'Transform images to video',
    path: TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES,
    environments: SHARED_TOOL_ENVS,
    icon: Video,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    darkIconColor: '#3d8a62',
  },
];

const assistantTools = [
  {
    id: TOOL_IDS.EDIT_IMAGES,
    name: 'Edit Images',
    description: 'Transform images',
    path: TOOL_ROUTES.EDIT_IMAGES,
    environments: SHARED_TOOL_ENVS,
    icon: Edit,
    gradient: 'from-wes-mustard via-wes-vintage-gold to-wes-coral',
    darkIconColor: '#a68018',
  },
  {
    id: TOOL_IDS.EDIT_VIDEO,
    name: 'Edit Videos',
    description: 'Regenerate portions',
    path: TOOL_ROUTES.EDIT_VIDEO,
    environments: SHARED_TOOL_ENVS,
    icon: Clapperboard,
    gradient: 'from-wes-dusty-blue via-wes-lavender to-wes-mint',
    darkIconColor: '#4a7099',
  },
  {
    id: TOOL_IDS.JOIN_CLIPS,
    name: 'Join Clips',
    description: 'Connect video clips',
    path: TOOL_ROUTES.JOIN_CLIPS,
    environments: SHARED_TOOL_ENVS,
    icon: Link2,
    gradient: 'from-wes-pink via-wes-salmon to-wes-coral',
    darkIconColor: '#e07070',
  },
  {
    id: TOOL_IDS.CHARACTER_ANIMATE,
    name: 'Characters',
    description: 'Bring to life',
    path: TOOL_ROUTES.CHARACTER_ANIMATE,
    environments: SHARED_TOOL_ENVS,
    icon: Users,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    darkIconColor: '#3d8a62',
  },
];

type ToolItem = (typeof processTools)[number] | (typeof assistantTools)[number];

interface ToolCardProps {
  item: ToolItem;
  isCurrentTool: boolean;
  isVisible: boolean;
  onNavigate: (path: string) => void;
}

const ToolCard = memo(({ item, isCurrentTool, isVisible, onNavigate }: ToolCardProps) => {
  const { triggerRipple, rippleStyles, isRippleActive } = useClickRipple();
  const { darkMode } = useDarkMode();
  const [isWiggling, setIsWiggling] = useState(false);
  const wiggleTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (wiggleTimeoutRef.current) {
        clearTimeout(wiggleTimeoutRef.current);
      }
    };
  }, []);

  const isDisabled = !item.path;

  const handleClick = (e: React.PointerEvent) => {
    if (isDisabled) {
      e.preventDefault();
      setIsWiggling(true);
      wiggleTimeoutRef.current = setTimeout(() => setIsWiggling(false), 600);
      return;
    }
    
    if (item.path) {
      triggerRipple(e);
      onNavigate(item.path);
    }
  };

  if (!isVisible && !isDisabled) return null;

  return (
    <div
      className={cn(
        "relative group cursor-pointer rounded-lg transition-all duration-200",
        "hover:shadow-md",
        isCurrentTool && "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-900",
        isDisabled && "opacity-40 cursor-not-allowed",
        isWiggling && "animate-subtle-wiggle"
      )}
      onPointerUp={handleClick}
    >
      <div 
        className={cn(
          "p-3 rounded-lg bg-zinc-800/80 border border-zinc-700 click-ripple",
          isRippleActive && "ripple-active",
          !isDisabled && "hover:bg-zinc-700/80 hover:border-zinc-600"
        )}
        style={rippleStyles}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div 
            className={cn(
              "w-10 h-10 rounded-md flex items-center justify-center bg-gradient-to-br shadow-sm",
              item.gradient,
              "dark:bg-none dark:border"
            )}
            style={darkMode ? { borderColor: item.darkIconColor, backgroundColor: `${item.darkIconColor}0d` } : undefined}
          >
            <item.icon 
              className="w-5 h-5 drop-shadow-lg dark:drop-shadow-none transition-colors duration-300" 
              style={{ color: darkMode ? item.darkIconColor : 'white' }} 
            />
          </div>
          
          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-zinc-100 truncate">
              {item.name}
            </h3>
            <p className="text-xs text-zinc-400 truncate">
              {item.description}
            </p>
          </div>
          
          {/* Current indicator */}
          {isCurrentTool && (
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
});

ToolCard.displayName = 'ToolCard';

interface ToolsPaneDrawerProps {
  paneProps: Record<string, unknown>;
  transformClass: string;
  shotsPaneWidth: number;
  isPointerEventsEnabled: boolean;
  currentToolId: string | null;
  isToolVisible: (tool: { environments: AppEnvValue[] } | null | undefined, toolId?: string) => boolean;
  handleNavigate: (path: string) => void;
}

const ToolsPaneDrawer = ({
  paneProps,
  transformClass,
  shotsPaneWidth,
  isPointerEventsEnabled,
  currentToolId,
  isToolVisible,
  handleNavigate,
}: ToolsPaneDrawerProps) => {
  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: `${shotsPaneWidth}px`,
        zIndex: 60,
      }}
    >
      <div
        {...paneProps}
        className={cn(
          'pointer-events-auto absolute top-0 left-0 h-full w-full border-2 border-r shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col bg-zinc-900/95 border-zinc-700',
          transformClass
        )}
      >
        <div
          className={cn(
            'flex flex-col h-full',
            isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none'
          )}
        >
          <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-zinc-400 ml-2" />
              <h2 className="text-xl font-light text-zinc-200">Tools</h2>
            </div>
          </div>

          <div className="flex flex-col gap-2 p-3 flex-grow overflow-y-auto scrollbar-hide">
            <div className="mb-2">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
                Main Tools
              </h3>
              <div className="flex flex-col gap-2">
                {processTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    item={tool}
                    isCurrentTool={currentToolId === tool.id}
                    isVisible={isToolVisible(tool, tool.id)}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
                Assistant Tools
              </h3>
              <div className="flex flex-col gap-2">
                {assistantTools.filter((tool) => isToolVisible(tool, tool.id)).map((tool) => (
                  <ToolCard
                    key={tool.id}
                    item={tool}
                    isCurrentTool={currentToolId === tool.id}
                    isVisible={isToolVisible(tool, tool.id)}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolsPaneComponent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isShotsPaneLocked,
    setIsShotsPaneLocked,
    shotsPaneWidth,
  } = usePanes();

  // Get current environment
  let env = import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB;
  if (env === 'production' || env === 'prod') env = AppEnv.WEB;
  const currentEnv = env as AppEnvValue;

  // Get generation method preferences for character-animate visibility
  const { value: generationMethods, isLoading: isLoadingGenerationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudGenerationEnabled = generationMethods.inCloud;

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, showBackdrop, closePane } = useSlidingPane({
    side: 'left',
    isLocked: isShotsPaneLocked,
    onToggleLock: () => setIsShotsPaneLocked(!isShotsPaneLocked),
  });

  // Delay pointer events until animation completes
  const [isPointerEventsEnabled, setIsPointerEventsEnabled] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        setIsPointerEventsEnabled(true);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setIsPointerEventsEnabled(false);
    }
  }, [isOpen]);

  // Determine current tool from path
  const getCurrentTool = () => {
    const path = location.pathname;
    for (const tool of [...processTools, ...assistantTools]) {
      if (tool.path && path.startsWith(tool.path)) {
        return tool;
      }
    }
    return null;
  };
  const currentTool = getCurrentTool();
  const currentToolId = currentTool?.id || null;

  // Tool visibility check
  const isToolVisible = (tool: { environments: AppEnvValue[] } | null | undefined, toolId?: string) => {
    if (!tool) return false;
    
    // Character Animate: check cloud mode
    if (toolId === TOOL_IDS.CHARACTER_ANIMATE) {
      const envCheck = tool.environments.includes(currentEnv) || currentEnv === AppEnv.DEV;
      return envCheck && (isLoadingGenerationMethods || isCloudGenerationEnabled);
    }
    
    // For DEV mode, always show
    if (currentEnv === AppEnv.DEV) return true;
    
    return tool.environments.includes(currentEnv);
  };

  const handleNavigate = (path: string) => {
    setIsShotsPaneLocked(false); // Close the pane when navigating
    navigate(path);
  };

  return (
    <>
      {/* Backdrop overlay to capture taps outside the pane on mobile */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-[59] touch-none"
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          aria-hidden="true"
        />
      )}
      <PaneControlTab
        side="left"
        isLocked={isLocked}
        isOpen={!!isOpen}
        toggleLock={toggleLock}
        openPane={openPane}
        paneDimension={shotsPaneWidth}
        bottomOffset={useBottomOffset()}
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
        paneIcon="tools"
        paneTooltip="See all tools"
        thirdButton={currentTool ? {
          onClick: openPane,
          ariaLabel: `Current tool: ${currentTool.name}`,
          content: <currentTool.icon className="h-4 w-4" />,
          tooltip: `Current tool: ${currentTool.name}`
        } : undefined}
        dataTour="tools-pane-tab"
      />
      <ToolsPaneDrawer
        paneProps={paneProps as Record<string, unknown>}
        transformClass={transformClass}
        shotsPaneWidth={shotsPaneWidth}
        isPointerEventsEnabled={isPointerEventsEnabled}
        currentToolId={currentToolId}
        isToolVisible={isToolVisible}
        handleNavigate={handleNavigate}
      />
    </>
  );
};

export const ToolsPane = React.memo(ToolsPaneComponent);
