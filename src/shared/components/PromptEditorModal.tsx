import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { PromptEntry, PromptInputRow } from './ImageGenerationForm';
import { Wand2Icon, Edit, PackagePlus, Trash2, ChevronDown, ChevronLeft, Sparkles, Shuffle } from 'lucide-react';
import { PromptGenerationControls, GenerationControlValues as PGC_GenerationControlValues } from './PromptGenerationControls';
import { BulkEditControls, BulkEditParams as BEC_BulkEditParams, BulkEditControlValues as BEC_BulkEditControlValues } from './PromptEditorModal/BulkEditControls';
import { useAIInteractionService } from '@/features/ai/hooks/useAIInteractionService';
import { GeneratePromptsParams, AIModelType } from '@/types/ai';
import { toast } from "@/shared/components/ui/runtime/sonner";
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { useIsMobile } from "@/shared/hooks/mobile";
import { useExtraLargeModal } from "@/shared/hooks/useModal";
import { useScrollFade } from "@/shared/hooks/useScrollFade";
import { useTouchDragDetection } from "@/shared/hooks/useTouchDragDetection";

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
          <Collapsible 
            open={isAIPromptSectionExpanded} 
            onOpenChange={setIsAIPromptSectionExpanded}
            className={`${modal.isMobile ? 'px-2' : 'px-6'}`}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={`${isAIPromptSectionExpanded ? 'w-full justify-between p-4 hover:bg-accent/50 border border-accent-foreground/10 rounded-lg' : 'w-full justify-between p-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-red-500/20 border border-pink-400/40 hover:from-purple-500/30 hover:to-red-500/30'} transition-colors duration-300`}
                onTouchStart={handleTouchStart}
                onClick={handleToggleAIPromptSection}
              >
                <div className="flex items-center gap-2">
                  <Wand2Icon className="h-4 w-4" />
                  <span className="font-light flex items-center gap-1">
                    AI Prompt Tools
                    {!isAIPromptSectionExpanded && <Sparkles className="h-3 w-3 text-pink-400 animate-pulse" />}
                  </span>
       
                </div>
                {isAIPromptSectionExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-accent/30 border border-accent-foreground/10 rounded-lg p-4">
                <Tabs value={activeTab} onValueChange={(value) => { markAsInteracted(); setActiveTab(value as EditorMode); }}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger 
                      value="generate" 
                      className="w-full hover:bg-accent/50 data-[active]:hover:bg-background"
                      title="Generate new prompts"
                    >
                      <Wand2Icon className="mr-2 h-4 w-4" />Generate
                    </TabsTrigger>
                    <TabsTrigger 
                      value="remix" 
                      className="w-full hover:bg-accent/50 data-[active]:hover:bg-background"
                      title="Remix existing prompts"
                    >
                      <Shuffle className="mr-2 h-4 w-4" />Remix
                    </TabsTrigger>
                    <TabsTrigger 
                      value="bulk-edit" 
                      className="w-full hover:bg-accent/50 data-[active]:hover:bg-background"
                      title="Edit existing prompts"
                    >
                      <Edit className="mr-2 h-4 w-4" />Edit
                    </TabsTrigger>
                  </TabsList>
                    <TabsContent value="generate">
                      {activeTab === 'generate' && (
                        <PromptGenerationControls 
                          onGenerate={handleGenerateAndAddPrompts} 
                          onGenerateAndQueue={onGenerateAndQueue ? handleGenerateAndQueue : undefined}
                          isGenerating={isAIGenerating}
                          initialValues={generationControlValues}
                          onValuesChange={handleGenerationValuesChange}
                          hasApiKey={true}
                          existingPromptsForContext={internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt, hidden: false}))}
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="remix">
                      {activeTab === 'remix' && (
                        <PromptGenerationControls 
                          onGenerate={handleGenerateAndAddPrompts} 
                          onGenerateAndQueue={onGenerateAndQueue ? handleGenerateAndQueue : undefined}
                          isGenerating={isAIGenerating}
                          initialValues={generationControlValues}
                          onValuesChange={handleGenerationValuesChange}
                          hasApiKey={true}
                          existingPromptsForContext={internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt, hidden: false}))}
                          remixMode={true}
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="bulk-edit">
                      {activeTab === 'bulk-edit' && (
                        <BulkEditControls 
                          onBulkEdit={handleBulkEditPrompts} 
                          isEditing={isAIEditing}
                          initialValues={bulkEditControlValues}
                          onValuesChange={handleBulkEditValuesChange}
                          hasApiKey={true}
                          numberOfPromptsToEdit={internalPrompts.length}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
          <div>
            <div className={`${modal.isMobile ? 'px-2 py-4 pb-1' : 'p-6 pb-2'}`}>
              {internalPrompts.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No prompts yet. Add one manually or use AI generation.
                </div>
              )}
              {internalPrompts.map((prompt, index) => (
                  <div 
                    key={prompt.id} 
                    className="mb-4"
                    data-prompt-field
                    data-prompt-id={prompt.id}
                  >
                    <PromptInputRow
                      promptEntry={prompt}
                      index={index}
                      totalPrompts={internalPrompts.length}
                      onUpdate={handlePromptFieldUpdate}
                      onRemove={() => handleInternalRemovePrompt(prompt.id)}
                      canRemove={internalPrompts.length > 1}
                      isGenerating={isAILoading}
                      onSetActiveForFullView={setActivePromptIdForFullView}
                      isActiveForFullView={activePromptIdForFullView === prompt.id}
                      autoEnterEditWhenActive={isMobile}
                    />
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <DialogFooter className={`${modal.isMobile ? 'p-4 pt-4 pb-1 flex-row justify-between' : 'p-6 pt-6 pb-2'} border-t relative z-20`}>
            <div className={`flex gap-2 ${modal.isMobile ? '' : 'mr-auto'}`}>
              <Button variant="retro-secondary" size="retro-sm" onClick={handleInternalAddBlankPrompt}>
                <PackagePlus className={`h-4 w-4 ${modal.isMobile ? '' : 'mr-2'}`} />
                <span className={modal.isMobile ? 'hidden' : ''}>Blank Prompt</span>
                {modal.isMobile && <span className="sr-only">Blank Prompt</span>}
              </Button>
              {internalPrompts.length > 0 && (
                <Button 
                  variant="destructive" 
                  size="retro-sm"
                  onClick={handleRemoveAllPrompts}
                  disabled={internalPrompts.length === 1 && !internalPrompts[0].fullPrompt.trim() && !internalPrompts[0].shortPrompt?.trim()}
                >
                  <Trash2 className={`h-4 w-4 ${modal.isMobile ? '' : 'mr-2'}`} />
                  <span className={modal.isMobile ? 'hidden' : ''}>Delete Prompts</span>
                  {modal.isMobile && <span className="sr-only">Delete Prompts</span>}
                </Button>
              )}
            </div>
            <Button variant="retro" size="retro-sm" onClick={handleFinalSaveAndClose}>Close</Button>
          </DialogFooter>
        </div>
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
