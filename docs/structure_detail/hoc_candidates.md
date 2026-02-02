# Higher-Order Component Candidates

Audit of patterns, components, and functions across the codebase that could be elevated to app-level or section-level higher-order components.

---

## Implemented Components

The following utilities have been implemented and are ready for use:

### `createSafeContext<T>(name)`
**Location**: `src/shared/lib/createSafeContext.ts`

Factory for creating typed React contexts with strict and safe access hooks.

```tsx
import { createSafeContext } from '@/shared/lib/createSafeContext';

interface MyState { count: number; increment: () => void; }

const { Provider, useContext, useContextSafe, useHasProvider } = createSafeContext<MyState>('MyContext');

// useContext() - throws if outside provider (use in components that require the context)
// useContextSafe() - returns undefined if outside (use in optional/boundary components)
// useHasProvider() - returns boolean (use for conditional behavior)
```

### `ModalContainer`
**Location**: `src/shared/components/ModalContainer.tsx`

Unified modal component handling responsive sizing, header/footer/scroll structure.

```tsx
import { ModalContainer, ModalFooterButtons } from '@/shared/components/ModalContainer';

<ModalContainer
  open={isOpen}
  onOpenChange={setIsOpen}
  size="medium" // 'small' | 'medium' | 'large' | 'extra-large'
  title="Create New Item"
  description="Optional description text"
  footer={
    <ModalFooterButtons
      onCancel={() => setIsOpen(false)}
      onConfirm={handleSubmit}
      confirmText="Create"
      isLoading={isSubmitting}
      destructive={false}
    />
  }
>
  {/* Your content - automatically scrollable */}
  <Input ... />
</ModalContainer>
```

**Migrated modals**: CreateProjectModal, CreateShotModal, LineageGifModal

### `DataContainer<T>`
**Location**: `src/shared/components/DataContainer.tsx`

Container handling loading/error/empty/data states consistently.

```tsx
import { DataContainer, SkeletonLines, SkeletonGrid } from '@/shared/components/DataContainer';

const { data, isLoading, error, refetch } = useQuery(...);

<DataContainer
  loading={isLoading}
  error={error}
  data={data}
  onRetry={refetch}
  skeleton={<SkeletonGrid count={6} columns={3} />}
  emptyComponent={<p>No items yet. Create one!</p>}
>
  {(items) => (
    <ul>
      {items.map(item => <li key={item.id}>{item.name}</li>)}
    </ul>
  )}
</DataContainer>
```

### `useConfirmDialog` + `ConfirmDialog`
**Location**: `src/shared/components/ConfirmDialog.tsx`

Promise-based confirmation dialog - cleaner than useState + AlertDialog.

```tsx
import { useConfirmDialog, confirmPresets } from '@/shared/components/ConfirmDialog';

function MyComponent() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const handleDelete = async () => {
    const confirmed = await confirm(confirmPresets.delete('this item'));
    // Or custom:
    // const confirmed = await confirm({
    //   title: 'Delete Item?',
    //   description: 'This cannot be undone.',
    //   confirmText: 'Delete',
    //   destructive: true,
    // });

    if (confirmed) {
      await deleteItem();
    }
  };

  return (
    <>
      <Button onClick={handleDelete}>Delete</Button>
      <ConfirmDialogComponent />
    </>
  );
}
```

**Presets available**: `confirmPresets.delete(itemName)`, `confirmPresets.discard(itemName)`, `confirmPresets.unsavedChanges()`

---

## 1. Settings Persistence Patterns

### 1.1 `usePersistentToolState` - Scope-Based State Sync
**Location**: `src/shared/hooks/usePersistentToolState.ts`

**Current Pattern**: Maps local useState to DB settings with debounced saves.

**HOC Candidate**: `withPersistentSettings(toolId, scope)`
```tsx
// Instead of manually wiring state in every form:
const { ready } = usePersistentToolState('image-generation', ctx, {
  generationMode: [generationMode, setGenerationMode],
  imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
});

// Could become:
const ImageGenerationForm = withPersistentSettings('image-generation', 'project')(
  BaseImageGenerationForm
);
// Form receives settings as props, saves automatically
```

**Used In**: ImageGenerationForm, ShotEditor, SegmentSettingsModal

---

### 1.2 `useAutoSaveSettings` - Entity-Scoped Settings
**Location**: `src/shared/hooks/useAutoSaveSettings.ts`

**Current Pattern**: Full-featured auto-save with status machine, dirty tracking.

**HOC Candidate**: `withAutoSave<T>(options)`
- Wraps any component that needs settings tied to an entity
- Provides `settings`, `updateField`, `updateFields`, `status`
- Handles flush on unmount/navigation

**Used In**: Segment modals, Shot settings, Video trim editor

---

### 1.3 Settings Provider Pattern
**Current**: Multiple tools use `VideoTravelSettingsProvider` pattern

**HOC Candidate**: `createSettingsProvider(toolId, schema)`
```tsx
// Factory to generate typed settings providers
const { Provider, useSettings, useSetting } = createSettingsProvider(
  'video-travel',
  videoTravelSchema
);
```

**Benefits**: Type-safe settings access, consistent persistence, schema validation

---

## 2. Modal & Dialog Patterns

### 2.1 `useModal` - Responsive Modal Sizing
**Location**: `src/shared/hooks/useModal.ts`

**Status**: ✅ **IMPLEMENTED** as `ModalContainer` - see Implemented Components section above.

~~**HOC Candidate**: `withModalStyling(size)`~~

---

### 2.2 Modal Container Pattern

**Status**: ✅ **IMPLEMENTED** as `ModalContainer` - see Implemented Components section above.

Migrated: CreateProjectModal, CreateShotModal, LineageGifModal

---

### 2.3 Confirmation Dialog Pattern

**Status**: ✅ **IMPLEMENTED** as `useConfirmDialog` + `ConfirmDialog` - see Implemented Components section above.

---

## 3. Form & Input Patterns

### 3.1 `useSubmitButtonState` - Submit Button State Machine
**Location**: `src/shared/hooks/useSubmitButtonState.ts`

**Current Pattern**: Manages idle → submitting → success → idle.

**HOC Candidate**: `withSubmitState()` or `SubmitButton` component
```tsx
// HOC version:
<SubmitButton
  onSubmit={handleSubmit}
  submittingText="Generating..."
  successText="Generated!"
>
  Generate
</SubmitButton>
```

---

### 3.2 Form Field with Persistence
**Repeats In**: Prompt fields, settings inputs

**HOC Candidate**: `PersistentInput`, `PersistentTextarea`
```tsx
// Current pattern:
<Textarea
  value={prompt}
  onChange={(e) => {
    setPrompt(e.target.value);
    markAsInteracted();
  }}
/>

// HOC version:
<PersistentTextarea
  settingKey="prompt"
  toolId="image-generation"
  shotId={shotId}
/>
```

---

### 3.3 Server-Side Form Validation
**Location**: `src/shared/hooks/useServerForm.ts`

**Current Pattern**: Form with server validation, error display.

**HOC Candidate**: `withServerValidation(schema)`
- Wraps form components
- Handles validation errors display
- Manages submission state

---

## 4. Data Fetching Patterns

### 4.1 Paginated List Pattern
**Repeats In**: `useListShots`, `useTasks`, `useGenerations`

**HOC Candidate**: `usePaginatedQuery(options)` or `withPagination()`
```tsx
// Current pattern (repeated 5+ times):
const [page, setPage] = useState(0);
const { data, isLoading } = useQuery({
  queryKey: [...key, page, pageSize],
  queryFn: () => fetchPage(page, pageSize),
  keepPreviousData: true,
});

// HOC version:
const { PaginatedList, pagination } = usePaginatedList({
  queryKey: queryKeys.shots.list(projectId),
  fetchFn: fetchShots,
  pageSize: 20,
});
```

---

### 4.2 Optimistic Updates Pattern
**Repeats In**: Star toggle, reorder, delete

**HOC Candidate**: `withOptimisticUpdate(queryKey, updateFn)`
```tsx
// Current pattern:
queryClient.setQueryData(key, (old) => /* optimistic update */);
try {
  await mutation();
} catch {
  queryClient.setQueryData(key, old); // rollback
}

// HOC version:
const { mutate } = useOptimisticMutation({
  queryKey: queryKeys.generations.byShot(shotId),
  optimisticUpdate: (old, newStar) => old.map(g =>
    g.id === id ? { ...g, starred: newStar } : g
  ),
  mutationFn: updateStar,
});
```

---

### 4.3 Entity CRUD Pattern
**Repeats In**: Projects, shots, generations, resources

**HOC Candidate**: `createEntityHooks(entityName, config)`
```tsx
// Factory for entity-specific hooks
const { useList, useCreate, useUpdate, useDelete } = createEntityHooks('shots', {
  table: 'shots',
  queryKey: (projectId) => queryKeys.shots.list(projectId),
  transformRow: mapDbShotToShot,
});
```

---

## 5. Context Patterns

### 5.1 Safe Context Pattern

**Status**: ✅ **IMPLEMENTED** as `createSafeContext` - see Implemented Components section above.

---

### 5.2 Domain-Specific Context Hooks
**Repeats In**: LightboxStateContext, ShotSettingsContext

**Current Pattern**: Main context + convenience hooks for domains
```tsx
// Current pattern:
useLightboxCore()      // navigation, close
useLightboxMedia()     // current generation, variants
useLightboxVariants()  // variant selection
useLightboxNavigation() // next/prev

// All pull from same context, just different slices
```

**HOC Candidate**: `createDomainContext(schema)`
```tsx
const { Provider, useDomain } = createDomainContext({
  core: ['navigation', 'close', 'open'],
  media: ['generation', 'variants', 'currentVariant'],
  edit: ['mode', 'settings', 'canSave'],
});

// Auto-generates:
// useLightboxCore(), useLightboxMedia(), useLightboxEdit()
```

---

## 6. Layout Patterns

### 6.1 Responsive Layout Switcher
**Repeats In**: MediaLightbox, ShotEditor, Timeline

**Current Pattern**: Check device, render different component
```tsx
const { layoutMode } = useLightboxLayoutProps();
if (layoutMode === 'mobile') return <MobileStackedLayout />;
if (layoutMode === 'side-panel') return <DesktopSidePanelLayout />;
return <CenteredLayout />;
```

**HOC Candidate**: `ResponsiveLayout` or `withResponsiveLayout()`
```tsx
<ResponsiveLayout
  mobile={MobileStackedLayout}
  tablet={CenteredLayout}
  desktop={DesktopSidePanelLayout}
  {...sharedProps}
/>
```

---

### 6.2 Sliding Pane Pattern
**Location**: `src/shared/hooks/useSlidingPane.ts`

**HOC Candidate**: Already well-abstracted, but could become:
```tsx
<SlidingPane
  open={isOpen}
  side="right"
  size="large"
  lockOnDesktop
>
  <PaneContent />
</SlidingPane>
```

---

## 7. Media & Loading Patterns

### 7.1 Progressive Image Loading
**Location**: `src/shared/hooks/useProgressiveImage.ts`

**HOC Candidate**: `ProgressiveImage` component
```tsx
// Current pattern:
const { src, isLoading, blur } = useProgressiveImage(url);
<img src={src} style={{ filter: blur ? 'blur(20px)' : 'none' }} />

// HOC version:
<ProgressiveImage src={url} placeholder={<Skeleton />} />
```

---

### 7.2 Video Scrubbing Pattern
**Location**: `src/shared/hooks/useVideoScrubbing.ts`

**HOC Candidate**: `ScrubVideo` or `withVideoScrubbing()`
```tsx
<ScrubVideo
  src={videoUrl}
  posterTime={0.5}
  onScrub={handleFrame}
>
  {({ currentFrame, scrubbing }) => (
    <video ref={ref} />
  )}
</ScrubVideo>
```

---

### 7.3 Image Preloading Pattern
**Repeats In**: Gallery, lightbox navigation, timeline

**HOC Candidate**: `usePreloadQueue(urls)` or `ImagePreloader`
```tsx
// Preload adjacent images for smooth navigation
<ImagePreloader
  current={currentIndex}
  urls={allUrls}
  preloadCount={3}
/>
```

---

## 8. Component Composition Patterns

### 8.1 Section + Context Pattern
**Repeats In**: ShotEditor, ImageGenerationForm, MediaLightbox

**Current Pattern**: Large component split into sections pulling from context
```tsx
<ShotSettingsProvider value={contextValue}>
  <HeaderSection />
  <TimelineSection />
  <GenerationSection />
  <ModalsSection />
</ShotSettingsProvider>
```

**HOC Candidate**: `createSectionedComponent(sections, contextFactory)`
```tsx
const ShotEditor = createSectionedComponent({
  sections: [HeaderSection, TimelineSection, GenerationSection, ModalsSection],
  useContext: useShotSettingsContext,
  contextFactory: (props) => buildShotSettingsContext(props),
});
```

---

### 8.2 Modal Composition Pattern
**Repeats In**: All complex modals

**Current Pattern**: Lazy-loaded modals with state management
```tsx
const LoraSelectorModal = lazy(() => import('./LoraSelectorModal'));

{showLoraModal && (
  <Suspense fallback={null}>
    <LoraSelectorModal {...props} />
  </Suspense>
)}
```

**HOC Candidate**: `LazyModal`
```tsx
<LazyModal
  component={() => import('./LoraSelectorModal')}
  open={showLoraModal}
  onOpenChange={setShowLoraModal}
  props={modalProps}
/>
```

---

## 9. Error & State Patterns

### 9.1 Error Boundary with Context
**Current Pattern**: Manual try-catch + handleError()

**HOC Candidate**: `withErrorBoundary(FallbackComponent)`
```tsx
const SafeMediaGallery = withErrorBoundary(MediaGallery, {
  fallback: <GalleryErrorState />,
  onError: (error) => handleError(error, { context: 'MediaGallery' }),
});
```

---

### 9.2 Loading State Pattern

**Status**: ✅ **IMPLEMENTED** as `DataContainer` - see Implemented Components section above.

Also includes `SkeletonLines` and `SkeletonGrid` helpers for common skeleton patterns.

---

## 10. Specialized HOC Candidates

### 10.1 Keyboard Navigation
**Repeats In**: Lightbox, timeline, gallery

**HOC Candidate**: `withKeyboardNav(keyMap)`
```tsx
const NavigableLightbox = withKeyboardNav({
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  Escape: 'close',
})(Lightbox);
```

---

### 10.2 Touch/Swipe Handling
**Location**: `src/shared/components/MediaLightbox/hooks/useSwipeNavigation.ts`

**HOC Candidate**: `withSwipeNavigation()`
```tsx
const SwipeableLightbox = withSwipeNavigation({
  onSwipeLeft: handleNext,
  onSwipeRight: handlePrev,
  threshold: 50,
})(Lightbox);
```

---

### 10.3 Drag and Drop
**Repeats In**: Timeline, gallery reorder, file upload

**HOC Candidate**: `DraggableContainer`, `DropZone`
```tsx
<DraggableContainer
  items={images}
  onReorder={handleReorder}
  renderItem={(item, dragProps) => <ImageCard {...item} {...dragProps} />}
/>
```

---

## Priority Recommendations

### High Priority (Most Impact)
1. ~~**ModalContainer**~~ ✅ DONE - Used in 20+ places, significant code reduction
2. ~~**DataContainer**~~ ✅ DONE - Every component has this pattern
3. ~~**createSafeContext**~~ ✅ DONE - Prevents runtime errors, type safety
4. **PaginatedList** - 5+ implementations with subtle bugs (REMAINING)

### Medium Priority
5. **LazyModal** - Consistent lazy loading pattern
6. ~~**useConfirmDialog**~~ ✅ DONE - Cleaner confirmation UX
7. **ProgressiveImage** - Simplifies image loading
8. **ResponsiveLayout** - Device-aware rendering

### Lower Priority (Nice to Have)
9. **createSettingsProvider** - Already works, just more boilerplate
10. **withKeyboardNav** - Already extracted as hooks
11. **createEntityHooks** - React Query handles this well
12. **withErrorBoundary** - Error boundaries are tricky with hooks

---

## Implementation Notes

1. **Don't over-abstract**: Many patterns work fine as hooks. HOCs add indirection.
2. **Start with components, not HOCs**: `ModalContainer` > `withModal()`
3. **Preserve existing hook APIs**: HOCs should wrap hooks, not replace them
4. **Type safety first**: All HOCs should preserve TypeScript inference
5. **Test boundaries**: HOCs at module boundaries, not within feature folders

---

## Files to Review for Patterns

| Pattern Area | Key Files |
|--------------|-----------|
| Settings | `useAutoSaveSettings.ts`, `usePersistentToolState.ts` |
| Modals | `useModal.ts`, `SettingsModal.tsx`, `LoraSelectorModal` |
| Data | `useGenerations.ts`, `useTasks.ts`, `useShots.ts` |
| Context | `LightboxStateContext.tsx`, `ShotSettingsContext.tsx` |
| Layout | `MobileStackedLayout.tsx`, `DesktopSidePanelLayout.tsx` |
| Loading | `useProgressiveImage.ts`, `useBatchImageLoading.ts` |
