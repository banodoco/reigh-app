import { useEffect } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';

/**
 * Debug hook to monitor ProjectContext state changes on mobile.
 * Enable by setting DEBUG_PROJECT_CONTEXT=true in localStorage.
 */
export const useProjectContextDebug = (enabled: boolean = import.meta.env.DEV) => {
  const { projects, selectedProjectId, isLoadingProjects } = useProject();

  useEffect(() => {
    // Never run project debug instrumentation outside an explicitly enabled local dev runtime.
    if (!enabled || !import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    const isDebugEnabled = localStorage.getItem('DEBUG_PROJECT_CONTEXT') === 'true';
    if (!isDebugEnabled) {
      return;
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const debugInfo = {
      timestamp: new Date().toISOString(),
      isMobile,
      projectsCount: projects.length,
      selectedProjectId: selectedProjectId || 'null',
      isLoadingProjects,
      userAgent: navigator.userAgent,
    };

    // Also log to a global debug array for inspection.
    if (!window.__projectDebugLog) {
      window.__projectDebugLog = [];
    }
    window.__projectDebugLog.push(debugInfo);

    // Keep only last 50 entries.
    if (window.__projectDebugLog.length > 50) {
      window.__projectDebugLog = window.__projectDebugLog.slice(-50);
    }
  }, [enabled, projects, selectedProjectId, isLoadingProjects]);
};
