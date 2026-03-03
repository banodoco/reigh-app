import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { PromptEntry } from './ImageGenerationForm';
import { type GenerationControlValues as PGC_GenerationControlValues } from './PromptGenerationControls';
import { type BulkEditParams as BEC_BulkEditParams, type BulkEditControlValues as BEC_BulkEditControlValues } from './PromptEditorModal/BulkEditControls';
import { useAIInteractionService } from '@/features/ai/hooks/useAIInteractionService';
import { type GeneratePromptsParams, AIModelType } from '@/types/ai';
import { toast } from "@/shared/components/ui/runtime/sonner";
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { useIsMobile } from "@/shared/hooks/mobile";
import { useExtraLargeModal } from "@/shared/hooks/useModal";
import { useScrollFade } from "@/shared/hooks/useScrollFade";
import { useTouchDragDetection } from "@/shared/hooks/useTouchDragDetection";
import { PromptEditorAIPanel } from './PromptEditorModal/components/PromptEditorAIPanel';
import { PromptEditorPromptList } from './PromptEditorModal/components/PromptEditorPromptList';
import { PromptEditorFooter } from './PromptEditorModal/components/PromptEditorFooter';

// Use aliased types for internal state if they were named the same
type GenerationControlValues = PGC_GenerationControlValues;
type BulkEditControlValues = BEC_BulkEditControlValues;

interface PersistedEditorControlsSettings {
  generationSettings: GenerationControlValues;
  bulkEditSettings: BulkEditControlValues;
  activeTab: EditorMode;
}

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompts: PromptEntry[];
  onSave: (updatedPrompts: PromptEntry[]) => void;
  generatePromptId: () => string;
  openWithAIExpanded?: boolean;
  onGenerateAndQueue?: (prompts: PromptEntry[]) => void;
}

type EditorMode = 'generate' | 'remix' | 'bulk-edit';

const PromptEditorModal: React.FC<PromptEditorModalProps> = React.memo(({
  isOpen, onClose, prompts: initialPrompts, onSave,
  generatePromptId,
  openWithAIExpanded = false,
  onGenerateAndQueue,
}) => {

  // Initialize with initialPrompts immediately to prevent content snap on open
  const [internalPrompts, setInternalPrompts] = useState<PromptEntry[]>(() => 
    initialPrompts.map(p => ({ ...p }))
  );
  const internalPromptsRef = useRef<PromptEntry[]>([]);
  useEffect(() => { internalPromptsRef.current = internalPrompts; }, [internalPrompts]);
  
  const [activeTab, setActiveTab] = useState<EditorMode>('generate');
  
  const [activePromptIdForFullView, setActivePromptIdForFullView] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [isAIPromptSectionExpanded, setIsAIPromptSectionExpanded] = useState(false);
  // Track signatures for auto-save throttling
  const currentPromptsSignature = useMemo(() => JSON.stringify(internalPrompts), [internalPrompts]);
  const currentSignatureRef = useRef<string>(currentPromptsSignature);
  useEffect(() => { currentSignatureRef.current = currentPromptsSignature; }, [currentPromptsSignature]);
  const lastSavedSignatureRef = useRef<string>('');
  
  // Drag detection for collapsible trigger
  const { isDragging, handleTouchStart } = useTouchDragDetection();

  // Modal content ref for outside click detection
  const modalContentRef = useRef<HTMLDivElement>(null);
  
  // Modal styling
  const modal = useExtraLargeModal('promptEditor');
  
  // CRITICAL: Get project context BEFORE any effects that use it
  // This must be declared before the useEffect at line 213 to prevent TDZ error
  const { selectedProjectId } = useProjectSelectionContext();
  
  // Scroll state, ref, and fade effect
  const { showFade, scrollRef } = useScrollFade({
    isOpen: isOpen,
    debug: false,
    preloadFade: modal.isMobile
  });

  // Note: Project change resets are now handled by usePersistentToolState hook
  // which properly hydrates saved values per-project or uses defaults if none exist

  const [generationControlValues, setGenerationControlValues] = useState<GenerationControlValues>({
    overallPromptText: '',
    remixPromptText: 'More like this',
    rulesToRememberText: '',
    numberToGenerate: 16,
    includeExistingContext: true,
    addSummary: true,
    replaceCurrentPrompts: false,
    temperature: 0.8,
    showAdvanced: false,
  });
  const [bulkEditControlValues, setBulkEditControlValues] = useState<BulkEditControlValues>({
    editInstructions: '', modelType: 'smart' as AIModelType,
  });

  // -------------------------------------------------------------
  // Persistent settings wiring - saves AI generation settings per-project
  // -------------------------------------------------------------
  // Persist settings to the currently-selected project so they are shared across sessions
  // (selectedProjectId is now declared earlier to prevent TDZ errors)

  // Enable persistence for prompt editor AI settings - these are now properly scoped per-project
  const { markAsInteracted } = usePersistentToolState<PersistedEditorControlsSettings>(
    'prompt-editor-controls',
    { projectId: selectedProjectId ?? undefined },
    {
      generationSettings: [
        generationControlValues,
        setGenerationControlValues,
      ],
      bulkEditSettings: [
        bulkEditControlValues,
        setBulkEditControlValues,
      ],
      activeTab: [
        activeTab,
        setActiveTab,
      ],
    },
    { defaults: { generationSettings: {}, bulkEditSettings: {}, activeTab: 'generate' } }
  );

  // Effect to initialize modal state on open
  // Note: Using useLayoutEffect to sync prompts BEFORE browser paint to prevent visual snap
  // Prompts are also initialized via useState lazy initializer for first render
  useLayoutEffect(() => {
    if (isOpen) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      // Sync prompts from prop (handles case where modal was previously opened and closed)
      setInternalPrompts(initialPrompts.map(p => ({ ...p })));
      setActivePromptIdForFullView(null);
      setIsAIPromptSectionExpanded(openWithAIExpanded); // Use prop to control AI section initial state
      // Initialize last-saved signature to current to avoid immediate auto-save
      lastSavedSignatureRef.current = JSON.stringify(initialPrompts);
    }
  }, [isOpen, openWithAIExpanded, selectedProjectId, initialPrompts, scrollRef]); // Add selectedProjectId to dependencies to reset when project changes

  // Auto-save while open: every 3s if changes detected
  useEffect(() => {
    if (!isOpen) return;
    const intervalId = setInterval(() => {
      const hasChanges = lastSavedSignatureRef.current !== currentSignatureRef.current;
      if (hasChanges) {
        try {
          onSave(internalPromptsRef.current);
          lastSavedSignatureRef.current = currentSignatureRef.current;
        } catch (err) {
          normalizeAndPresentError(err, { context: 'PromptEditorModal', showToast: false });
        }
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isOpen, onSave]);

  const {
    generatePrompts: aiGeneratePrompts,
    editPromptWithAI: aiEditPrompt,
    generateSummary: aiGenerateSummary,
    isGenerating: isAIGenerating,
    isEditing: isAIEditing,
    isLoading: isAILoading,
  } = useAIInteractionService({
    generatePromptId,
  });

  const handleFinalSaveAndClose = useCallback(() => {
    onSave(internalPrompts);
    lastSavedSignatureRef.current = currentSignatureRef.current;
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
    onClose();
  }, [internalPrompts, onSave, onClose, scrollRef]);

  const handleInternalUpdatePrompt = useCallback((id: string, updates: Partial<Omit<PromptEntry, 'id'>>) => {
    setInternalPrompts(currentPrompts => {
      const newPrompts = currentPrompts.map(p => (p.id === id ? { ...p, ...updates } : p));
      return newPrompts;
    });
  }, []);

  // Stable callback for PromptInputRow onUpdate interface
  const handlePromptFieldUpdate = useCallback((id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => {
    const updatePayload: Partial<Omit<PromptEntry, 'id'>> = {};
    if (field === 'fullPrompt') updatePayload.fullPrompt = value;
    if (field === 'shortPrompt') updatePayload.shortPrompt = value;
    handleInternalUpdatePrompt(id, updatePayload);
  }, [handleInternalUpdatePrompt]);
  
  const handleInternalRemovePrompt = (id: string) => {
    setInternalPrompts(currentPrompts => {
      const newPrompts = currentPrompts.filter(p => p.id !== id);
      return newPrompts;
    });
  };

  const handleInternalAddBlankPrompt = () => {
    const newPromptEntry: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts(currentPrompts => {
      const newPrompts = [...currentPrompts, newPromptEntry];
      return newPrompts;
    });
    
    // Scroll to bottom after adding the prompt
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 100); // Small delay to ensure the new prompt has been rendered
  };

  const handleRemoveAllPrompts = () => {
    const emptyPrompt: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts([emptyPrompt]);    
  };

  const handleGenerateAndAddPrompts = async (params: GeneratePromptsParams) => {
    // API key is no longer mandatory for generating prompts (server-side edge function handles it)
    
    // Store whether summaries were requested initially to decide if we need to auto-generate them later
    const summariesInitiallyRequested = params.addSummaryForNewPrompts;
    
    const rawResults = await aiGeneratePrompts(params);
    
    const newEntries: PromptEntry[] = rawResults.map(item => ({
      id: item.id,
      fullPrompt: item.text,
      shortPrompt: item.shortText, // This will be populated if summariesInitiallyRequested was true
    }));
    
    // Check if all existing prompts are empty
    const allExistingPromptsAreEmpty = internalPrompts.every(
      (p) => !p.fullPrompt.trim() && !(p.shortPrompt ?? '').trim(),
    );
    
    // Auto-replace if user explicitly chose replace, OR if all existing prompts are empty
    const shouldReplace = params.replaceCurrentPrompts || allExistingPromptsAreEmpty;

    setInternalPrompts(currentPrompts => {
      const updatedPrompts = shouldReplace ? newEntries : [...currentPrompts, ...newEntries];
      return updatedPrompts;
    });

    // If summaries were NOT initially requested (i.e., user wants fast gen, summary later)
    // AND the AI interaction service is set to add summaries, AND we actually have new prompts:
    // Iterate through the newly added prompts and generate summaries for those that don't have one.
    if (!summariesInitiallyRequested && params.addSummaryForNewPrompts && newEntries.length > 0) {
      for (const entry of newEntries) {
        if (!entry.shortPrompt && entry.fullPrompt) { // Only generate if no shortPrompt and fullPrompt exists
          try {
            const summary = await aiGenerateSummary(entry.fullPrompt);
            if (summary) {
              setInternalPrompts(currentPrompts => {
                const updatedPrompts = currentPrompts.map(p => 
                  p.id === entry.id ? { ...p, shortPrompt: summary } : p
                );
                // Note: Auto-save will be triggered by the setInternalPrompts that included the full new entries.
                // We don't need to call it again here for just summary updates to avoid thrashing.
                // The final save or next auto-save cycle will pick this up.
                return updatedPrompts;
              });
            }
          } catch (error) {
            normalizeAndPresentError(error, { context: 'PromptEditorModal', showToast: false });
          }
        }
      }
      // After all potential summary updates, trigger one final auto-save if there were new prompts that needed summaries.
      // This ensures the parent gets the summarized versions.
      setInternalPrompts(currentPrompts => {
        return currentPrompts;
      });
    }
  };
  
  const handleGenerateAndQueue = async (params: GeneratePromptsParams) => {
    await handleGenerateAndAddPrompts(params);
    
    // Wait a moment for state to update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get the updated prompts from the ref (which has the latest state)
    const updatedPrompts = internalPromptsRef.current;
    
    if (onGenerateAndQueue) {
      onGenerateAndQueue(updatedPrompts);
    }
  };
  
  const handleBulkEditPrompts = async (params: BEC_BulkEditParams) => {
    if (internalPrompts.length === 0) { toast.info("No prompts to edit."); return; }
    
    const promptsToUpdate = internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt }));
    const editRequests = promptsToUpdate.map(p => ({
      originalPromptText: p.text,
      editInstructions: params.editInstructions,
      modelType: params.modelType,
    }));

    // We will update prompts one by one to show progress and handle partial failures
    const originalPromptIds = promptsToUpdate.map(p => p.id);

    for (let i = 0; i < editRequests.length; i++) {
      const request = editRequests[i];
      const promptIdToUpdate = originalPromptIds[i];
      try {
        const result = await aiEditPrompt(request);
        
        if (result.success && result.newText) {
          setInternalPrompts(currentPrompts => {
            const updatedPrompts = currentPrompts.map(p => 
              p.id === promptIdToUpdate ? { ...p, fullPrompt: result.newText!, shortPrompt: result.newShortText || '' } : p
            );
            return updatedPrompts;
          });
        }
      } catch (error) {
        normalizeAndPresentError(error, { context: 'PromptEditorModal', toastTitle: `Error editing prompt ${promptIdToUpdate.substring(0,8)}...` });
        // Continue to the next prompt
      }
    }
    
  };

  // Keep hook order stable - don't return early

  const handleGenerationValuesChange = useCallback((values: GenerationControlValues) => {
    setGenerationControlValues(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders
      if (JSON.stringify(prev) === JSON.stringify(values)) {
        return prev;
      }
      markAsInteracted();
      return values;
    });
  }, [markAsInteracted]);

  const handleBulkEditValuesChange = useCallback((values: BulkEditControlValues) => {
    setBulkEditControlValues(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders (same as Generate view)
      if (JSON.stringify(prev) === JSON.stringify(values)) {
        return prev; // Same reference — skip re-render
      }
      markAsInteracted();
      return values;
    });
  }, [markAsInteracted]); // Same dependencies as Generate view

  // Handle inside interactions to collapse active field without closing modal
  const handleInsideInteraction = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!activePromptIdForFullView) return;
    const target = event.target as Element;
    // If click/touch is inside modal but outside the active prompt field, collapse it
    if (modalContentRef.current && modalContentRef.current.contains(target)) {
      const clickedActiveField = target.closest(`[data-prompt-id="${activePromptIdForFullView}"]`);
      if (!clickedActiveField) {
        setActivePromptIdForFullView(null);
      }
    }
  }, [activePromptIdForFullView]);

  const handleToggleAIPromptSection = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    // Only trigger if it wasn't a drag
    if (!isDragging.current) {
      setIsAIPromptSectionExpanded(prev => !prev);
    }
  }, [isDragging]);

  const handleActiveTabChange = useCallback((mode: EditorMode) => {
    markAsInteracted();
    setActiveTab(mode);
  }, [markAsInteracted]);

  const handleModalClose = useCallback((open: boolean) => {
    if (!open) {
      handleFinalSaveAndClose();
    }
  }, [handleFinalSaveAndClose]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleModalClose}
    >
      <DialogContent
        className={`${modal.className} gap-2`}
        style={modal.style}
        ref={modalContentRef}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-2 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
            <DialogTitle>Prompt Editor</DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          onClickCapture={handleInsideInteraction}
          onTouchStartCapture={handleInsideInteraction}
          className={`${modal.scrollClass} ${modal.isMobile ? 'pt-2' : 'pt-6'}`}
        >
          <PromptEditorAIPanel
            isMobile={modal.isMobile}
            expanded={isAIPromptSectionExpanded}
            onExpandedChange={setIsAIPromptSectionExpanded}
            onToggle={handleToggleAIPromptSection}
            onTouchStart={handleTouchStart}
            activeTab={activeTab}
            onActiveTabChange={handleActiveTabChange}
            prompts={internalPrompts}
            generation={{
              onGenerate: handleGenerateAndAddPrompts,
              onGenerateAndQueue: onGenerateAndQueue ? handleGenerateAndQueue : undefined,
              isGenerating: isAIGenerating,
              values: generationControlValues,
              onValuesChange: handleGenerationValuesChange,
            }}
            bulkEdit={{
              onBulkEdit: handleBulkEditPrompts,
              isEditing: isAIEditing,
              values: bulkEditControlValues,
              onValuesChange: handleBulkEditValuesChange,
            }}
          />

          <PromptEditorPromptList
            prompts={internalPrompts}
            isMobile={isMobile}
            isLoading={isAILoading}
            activePromptIdForFullView={activePromptIdForFullView}
            onActivePromptChange={setActivePromptIdForFullView}
            onUpdatePromptField={handlePromptFieldUpdate}
            onRemovePrompt={handleInternalRemovePrompt}
          />
        </div>

        <PromptEditorFooter
          showFade={showFade}
          footerClass={modal.footerClass}
          isMobile={modal.isMobile}
          prompts={internalPrompts}
          onAddBlankPrompt={handleInternalAddBlankPrompt}
          onRemoveAllPrompts={handleRemoveAllPrompts}
          onClose={handleFinalSaveAndClose}
        />
      </DialogContent>
    </Dialog>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo to prevent unnecessary re-renders
  const propsEqual = (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.prompts.length === nextProps.prompts.length &&
    JSON.stringify(prevProps.prompts) === JSON.stringify(nextProps.prompts)
  );
  
  return propsEqual;
});

export default PromptEditorModal; 
