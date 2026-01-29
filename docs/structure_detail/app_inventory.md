# App Inventory

Complete inventory of pages, tools, and major UI sections with their component dependencies.

---

## Pages

### HomePage
`src/pages/Home/HomePage.tsx` - Landing page with hero, examples, and tool showcase

#### Components Used
- **HeroSection, CreativePartnerPane, PhilosophyPane, ExamplesPane** - Content sections
- **ConstellationCanvas** - Animated star background
- **Layout** - Full-screen video bg with fixed overlay panes; enforces dark mode

---

### ToolSelectorPage
`src/pages/ToolSelectorPage.tsx` - Grid of all available tools

#### Components Used
- **ToolCard** - Memoized card with overflow detection
- **PageFadeIn, FadeInSection** - Entry animations
- **Pattern** - Environment-based tool filtering, responsive grid via `useContentResponsive`

---

### ShotsPage
`src/pages/ShotsPage.tsx` - Dedicated shot management page

#### Components Used
- **ShotListDisplay** - Shot list with selection
- **ShotImageManager** - Image management for selected shot
- **Pattern** - React Query mutations for add/delete/reorder; uses `CurrentShotContext`

---

### ArtPage
`src/pages/ArtPage.tsx` - Community art gallery

#### Components Used
- **PageFadeIn, FadeInSection** - Entry animations
- **Layout** - Static gallery with hardcoded samples, 3-column responsive grid

---

### SharePage
`src/pages/SharePage.tsx` - Public sharing interface

#### Components Used
- **SharedGenerationView** - Displays shared content
- **Card** - shadcn card for layout
- **Pattern** - RPC calls for share data + view counting; dynamic meta tags for social

---

### PaymentSuccessPage
`src/pages/PaymentSuccessPage.tsx` - Stripe success callback

#### Components Used
- **Card** - Centered card with gradient bg
- **Pattern** - Search params parsing, React Query polling for credit updates, auto-redirect

---

### PaymentCancelPage
`src/pages/PaymentCancelPage.tsx` - Stripe cancel callback

#### Components Used
- **Card** - Centered card with gradient bg
- **Pattern** - Simple 3-option navigation state

---

### NotFoundPage
`src/pages/NotFoundPage.tsx` - 404 error page

#### Components Used
- **Card** - Centered with floating decorative elements
- **Pattern** - Route error handling, back navigation

---

## Tools

### Travel Between Images
`src/tools/travel-between-images/pages/VideoTravelToolPage.tsx` - Create video sequences by interpolating between images

#### Components Used
- **ShotEditor** - Complex editor with timeline and pair configs
- **Hooks** - `useShotSettings`, `useVideoTravelSettingsHandlers`, `useVideoTravelData`
- **Settings** - Per-shot via `useAutoSaveSettings`; inheritance via `useShotCreation`
- **Tasks** - Manual dispatch via handlers

---

### Image Generation
`src/tools/image-generation/pages/ImageGenerationToolPage.tsx` - Generate images with prompts, LoRAs, model selection

#### Components Used
- **ImageGenerationForm** - Collapsible form with prompts, LoRAs
- **Hooks** - `useAutoSaveSettings`, `useToolSettings`, `useLoraManager`
- **Settings** - Auto-saving to tool_settings; form state in sessionStorage
- **Tasks** - `createBatchImageGenerationTasks()` in handleNewGenerate

---

### Character Animate
`src/tools/character-animate/pages/CharacterAnimatePage.tsx` - Apply motion from reference videos to static images

#### Components Used
- **Mode selector + dropzone** - Image/video upload inputs
- **Hooks** - `useToolSettings` (project scope)
- **Settings** - Per-project; inputs persist to inputImageUrl/inputVideoUrl
- **Tasks** - `createCharacterAnimateTask()` in mutation

---

### Join Clips
`src/tools/join-clips/pages/JoinClipsPage.tsx` - Join video clips with AI transitions

#### Components Used
- **SortableClip grid + JoinClipsSettingsForm** - Clip arrangement and settings
- **Hooks** - `useJoinClipsSettings`, `useLoraManager`
- **Settings** - Per-project; clips/prompts in structured arrays
- **Tasks** - `createJoinClipsTask()` in mutation

---

### Edit Video
`src/tools/edit-video/pages/EditVideoPage.tsx` - Regenerate video portions with AI

#### Components Used
- **InlineEditVideoView** - Core editing component
- **Video selection gallery** - Media picker
- **Hooks** - `useGenerations`, `useDeleteVariant`, `useToolSettings`
- **Settings** - Project-level storing lastEditedMediaId/Segments
- **Tasks** - Delegated to InlineEditVideoView

---

### Edit Images
`src/tools/edit-images/pages/EditImagesPage.tsx` - Transform and enhance images with prompts/inpainting

#### Components Used
- **InlineEditView** - Core editing component
- **Image selection gallery** - Media picker
- **Hooks** - `useGenerations`, `useDeleteVariant`, `useToolSettings`, `useGetTask`
- **Settings** - Project-level storing lastEditedMediaId
- **Tasks** - Delegated to InlineEditView

---

### Training Data Helper
`src/tools/training-data-helper/pages/TrainingDataHelperPage.tsx` - Organize training data

#### Components Used
- **MultiVideoUploader + VideoSegmentEditor** - Upload and segment management
- **Hooks** - `useTrainingData` (manages entire flow: uploads, segments, batches)
- **Settings** - All state via hook
- **Tasks** - `uploadVideosWithSplitModes()` from hook

---

## Layout & Panes

### App
`src/app/App.tsx` - Root component with provider hierarchy

#### Components Used
**Provider order (outer→inner):** QueryClientProvider → TaskTypeConfigInitializer → ProjectProvider → SimpleRealtimeProvider → ShotsProvider → GenerationTaskProvider → IncomingTasksProvider → PanesProvider → LastAffectedShotProvider → CurrentShotProvider → ToolPageHeaderProvider → AppInternalContent

---

### Layout
`src/app/Layout.tsx` - Main page layout with auth, panes, header

#### Components Used
- **ScrollToTop** - Route change handler
- **GlobalHeader + GlobalProcessingWarning** - Top bar
- **TasksPane + ToolsPane + GenerationsPane** - Sidebars/bottom panel
- **SettingsModal + WelcomeBonusModal + ProductTour** - Overlays
- **Pattern** - Split-view wrapper on mobile when generations locked

---

### GlobalHeader
`src/shared/components/GlobalHeader.tsx` - Top navigation bar

#### Components Used
- **Brand logo** - Palette icon, navigates home
- **Project selector popover** - Search + create project
- **Buttons** - Project settings, create project, referral stats, app settings
- **Layout** - Desktop: single row; Mobile: 2 rows (brand+buttons, project selector)

---

### TasksPane
`src/shared/components/TasksPane/TasksPane.tsx` - Right sidebar for task status

#### Components Used
- **Header** - Cancel All button
- **Status filter** - Processing/Succeeded/Failed tabs
- **Task type + project scope selectors** - Filtering
- **Pagination + TaskList** - Scrollable task display
- **MediaLightbox** - Task detail viewer (portal)

---

### ToolsPane
`src/shared/components/ToolsPane/ToolsPane.tsx` - Left sidebar for tool navigation

#### Components Used
- **Header** - LayoutGrid icon + "Tools" title
- **Two sections** - Main Tools (Generate/Travel), Assistant Tools (Edit/Join/Animate)
- **ToolCard list** - Icons, names, descriptions

---

### GenerationsPane
`src/shared/components/GenerationsPane/GenerationsPane.tsx` - Generated images/videos display

#### Components Used
- **Header** - Pagination controls, page selector, media type filter
- **Filters** - Shot filter, search, star filter, exclude positioned checkbox
- **ImageGallery + SkeletonGallery** - Grid display
- **ImageGenerationModal** - Generation config (CTA)

---

## Major Feature Components

### MediaLightbox
`src/shared/components/MediaLightbox/MediaLightbox.tsx` - Full-featured image/video viewer with editing

#### Components Used
- **Modes** - View mode, edit mode (images only)
- **Edit panel** - Transforms, text overlays, inpainting
- **View display** - Metadata, task details, navigation
- **Pattern** - Renders edit panel OR view-only display based on mode

---

### ShotImageManager
`src/shared/components/ShotImageManager/ShotImageManagerContainer.tsx` - Manage images within shots

#### Components Used
- **ShotImageManagerDesktop** - Drag/drop, frame positioning
- **ShotImageManagerMobileWrapper** - Touch gestures, simplified selection
- **Unified hooks** - Selection, lightbox, batch ops, segment videos

---

### ImageGallery
`src/shared/components/ImageGallery/index.tsx` - Gallery with pagination

#### Components Used
- **Client/server pagination** - Lazy-loading variants, progressive images
- **Filters** - Media type, starred, shot, tool type
- **Pattern** - Handles shot switching and lightbox navigation

---

### ImageGalleryItem
`src/shared/components/ImageGalleryItem.tsx` - Individual gallery item with actions

#### Components Used
- **Actions** - Delete, info, star, add to shot (with/without position), download, share, edit
- **States** - Optimistic positioning, loading, drag feedback, mobile popover

---

### CreditsManagement
`src/shared/components/CreditsManagement.tsx` - Credits purchasing and history

#### Components Used
- **"Add Credits" tab** - Slider, auto-topup checkbox with threshold
- **"Transactions" tab** - Credit ledger
- **"Task Log" tab** - Filterable by cost/status/type/project, CSV export

---

### SegmentSettingsForm
`src/shared/components/SegmentSettingsForm.tsx` - Video segment configuration

#### Components Used
- **Prompt** - With AI enhancement
- **Negative prompt, motion mode** - Basic/advanced
- **Frame count, LoRAs** - Generation params
- **Structure video** - Upload/replace in timeline mode
- **Pattern** - Per-field override/defaults with shot-level inheritance

---

### BatchDropZone
`src/shared/components/BatchDropZone.tsx` - Drag-and-drop batch import

#### Components Used
- **Pattern** - Calculates grid drop positions by measuring item bounds/gaps at drop-time
- **UI** - Optimistic skeleton + insertion line indicator during drag

---

### HoverScrubVideo
`src/shared/components/HoverScrubVideo.tsx` - Video preview with mouse scrubbing

#### Components Used
- **Pattern** - Mouse position tracking (desktop-only), pauses on stop, plays on delay
- **Mobile** - Extensive autoplay prevention, on-demand video loading

---

### StyledVideoPlayer
`src/shared/components/StyledVideoPlayer.tsx` - Custom video player

#### Components Used
- **Custom overlay controls** - Play, progress, mute, fullscreen, time display
- **Trim preview** - Via playbackStart/End props
- **States** - Loading spinner, error handling

---

### ActiveLoRAsDisplay
`src/shared/components/ActiveLoRAsDisplay.tsx` - Display active LoRA adapters

#### Components Used
- **2-column grid** - LoRA cards with preview (image/video via HoverScrubVideo)
- **Controls** - Strength slider, trigger words with copy, remove action

---

### ProductTour
`src/shared/components/ProductTour/` - Interactive onboarding tour

#### Components Used
- **react-joyride wrapper** - Custom tooltip styling
- **Step effects** - Modal toggles, pane locks, navigation delays
- **Pattern** - Spotlight-click event listeners

---

### ConstellationCanvas
`src/shared/components/ConstellationCanvas.tsx` - Animated background

#### Components Used
- **Canvas animation** - Parallax-drifting stars, twinkling via sine wave
- **Mouse tracking** - Smoothed for depth effect
- **Extras** - Shooting stars (~1/min), Claude star in orange-coral

---

## Modals

### SettingsModal
`src/shared/components/SettingsModal.tsx` - User settings, API keys, billing

#### Components Used
- **Tabs** - Generation/Transactions/Preferences
- **Sections** - API keys, local worker setup, dark mode, privacy defaults
- **Pattern** - Tab navigation + scroll fade for large content

---

### CreateProjectModal
`src/shared/components/CreateProjectModal.tsx` - New project creation

#### Components Used
- **Form** - Project name input + AspectRatioSelector
- **Hook** - `useMediumModal`
- **Pattern** - Navigates to tools on success

---

### CreateShotModal
`src/shared/components/CreateShotModal.tsx` - New shot creation

#### Components Used
- **Form** - Shot name, file upload, aspect ratio
- **Image cropping** - For uploaded images
- **Checkbox** - Option to update project aspect ratio

---

### ProjectSettingsModal
`src/shared/components/ProjectSettingsModal.tsx` - Edit project settings

#### Components Used
- **Form** - Project name, aspect ratio
- **Reference recropping** - On aspect ratio change
- **Danger zone** - Collapsible project deletion section

---

### ProjectSelectorModal
`src/shared/components/ProjectSelectorModal.tsx` - Project selection

#### Components Used
- **Radio group** - Existing projects
- **Dual-mode UI** - View existing OR create new
- **Pattern** - Loads user's projects on open

---

### PromptEditorModal
`src/shared/components/PromptEditorModal.tsx` - Rich prompt editor with AI assistance

#### Components Used
- **AI tabs** - Generate/Remix/Bulk Edit
- **Manual editing** - Auto-save every 3s
- **UI** - Collapsible AI section, scroll-to-top button
- **Hook** - `useExtraLargeModal`

---

### DatasetBrowserModal
`src/shared/components/DatasetBrowserModal.tsx` - Browse and select datasets

#### Components Used
- **4x4 grid** - Style references or structure videos
- **Search + pagination** - Browsing controls
- **HoverScrubVideo** - Video previews
- **Visibility toggle** - Filter by owner

---

### LoraSelectorModal
`src/shared/components/LoraSelectorModal/` - LoRA selection and management (folder-based module)

#### Structure
- `LoraSelectorModal.tsx` - Main modal component
- `components/` - CommunityLorasTab, MyLorasTab, LoraCard, DescriptionModal
- `hooks/useLoraFilters.ts` - Filter/sort/pagination logic
- `utils/` - filter-utils.ts, validation-utils.ts
- `types.ts`, `constants.ts`

#### Components Used
- **Tabbed interface** - Browse, filter, upload, manage
- **Pagination + search** - Discovery
- **HuggingFace integration** - External LoRA import

---

### PhaseConfigSelectorModal
`src/shared/components/PhaseConfigSelectorModal.tsx` - Generation phase configuration

#### Components Used
- **Tabs** - Browse/edit phase presets
- **CRUD operations** - Create, update, delete presets
- **Filters** - Sort, filter by model type
- **Sharing** - Preset sharing support

---

### VideoGenerationModal
`src/shared/components/VideoGenerationModal.tsx` - Video generation parameters

#### Components Used
- **Split-pane layout** - Settings (left), motion control (right)
- **BatchSettingsForm** - Prompts, frames, LoRAs
- **MotionControl** - Motion configuration

---

### LineageGifModal
`src/shared/components/LineageGifModal.tsx` - Animate generation lineage

#### Components Used
- **State machine** - idle → loading → generating → complete/error
- **Pattern** - Fetches lineage chain, generates GIF with progress, allows download

---

### ReferralModal
`src/shared/components/ReferralModal.tsx` - Referral program interface

#### Components Used
- **Referral link** - Copyable share link
- **ProfitSplitBar** - Visual profit-sharing breakdown
- **Stats** - Visits/sign-ups display

---

### WelcomeBonusModal
`src/shared/components/WelcomeBonusModal.tsx` - New user onboarding

#### Components Used
- **8-step wizard** - Stepper UI pattern
- **Lazy-loaded preferences** - Generation settings
- **Theme/privacy toggles** - User preferences
- **Confetti animation** - Celebration on completion
- **Credit granting** - Via edge function

---

## Contexts

### ProjectContext
`src/shared/contexts/ProjectContext.tsx` - Global project selection state

#### Consumers
- **App.tsx** - Accesses selectedProjectId
- **Layout.tsx** - Manages project switching
- **VideoTravelToolPage** - Projects list, setSelectedProjectId
- **ImageGenerationToolPage** - selectedProjectId access
- **CreateProjectModal** - addNewProject, projects list

---

### ShotsContext
`src/shared/contexts/ShotsContext.tsx` - Shots for current project

#### Consumers
- **App.tsx** - Retrieves shots
- **VideoTravelToolPage** - Loads/manages shot data
- **ImageGenerationToolPage** - Accesses shots
- **ShotListDisplay** - Shot loading state
- **CharacterList** - Context shots access

---

### CurrentShotContext
`src/shared/contexts/CurrentShotContext.tsx` - Currently selected shot

#### Consumers
- **Layout.tsx** - Manages currentShotId
- **VideoTravelToolPage** - Tracks currentShotId
- **ShotsPage** - currentShotId selection

---

### PanesContext
`src/shared/contexts/PanesContext.tsx` - Pane locks, sizes, visibility

#### Consumers
- **Layout.tsx** - All pane states (locks, dimensions, open/close)
- **VideoTravelToolPage** - Pane lock/open states
- **ImageGenerationToolPage** - Pane visibility
- **VideoShotDisplay** - Generations pane lock state

---

### GenerationTaskContext
`src/shared/contexts/GenerationTaskContext.tsx` - Current generation task

#### Consumers
- **VideoGallery/index.tsx** - Preloads and enhances generations with task data via `useGenerationTaskPreloader` and `useEnhancedGenerations`

---

### IncomingTasksContext
`src/shared/contexts/IncomingTasksContext.tsx` - Real-time incoming tasks

#### Consumers
- **ImageGenerationForm** - Task creation tracking
- **ShotEditor** - Incoming task display
- **SegmentSettingsModal** - Task status
- **TaskList, TasksPane** - Task display
- **SegmentRegenerateForm** - Task tracking

---

### LastAffectedShotContext
`src/shared/contexts/LastAffectedShotContext.tsx` - Last modified shot tracking

#### Consumers
- **ImageGenerationToolPage** - Shot focus
- **VideoTravelToolPage** - Shot focus
- **TasksPane** - Navigation
- **ImageGalleryItem** - Shot actions
- **useImageGalleryActions, useVideoTravelAddToShot** - Hooks

---

### ToolPageHeaderContext
`src/shared/contexts/ToolPageHeaderContext.tsx` - Dynamic header content per tool

#### Consumers
- **useVideoTravelHeader** - Sets header content
- **Layout** - Reads header via useHeaderState

---

### AIInputModeContext
`src/shared/contexts/AIInputModeContext.tsx` - AI input mode state

#### Consumers
- **ai-input-button** - Mode toggle

---

### ThemeContext
`src/shared/contexts/ThemeContext.tsx` - Dark/light mode

#### Consumers
- **Note:** Empty in repo; theme handled by `next-themes` library via sonner

---

## Summary

| Category | Count |
|----------|-------|
| Pages | 8 |
| Tools | 7 |
| Layout/Panes | 6 |
| Feature Components | 12 |
| Modals | 13 |
| Contexts | 10 |
| **Total** | **56** |

---

# Pattern Analysis

How each architectural pattern is implemented across the codebase, with inconsistencies noted.

---

## Pattern 1: Context Usage

**Standard pattern:** Context + Provider + `useX()` hook, memoized value, error on missing provider.

| Component | Context Used | How |
|-----------|--------------|-----|
| App.tsx | All contexts | Wraps entire app in provider hierarchy |
| Layout.tsx | Project, CurrentShot, Panes | Manages switching, pane state |
| VideoTravelToolPage | Project, Shots, CurrentShot, Panes, LastAffectedShot | Full access for tool orchestration |
| ImageGenerationToolPage | Project, Shots, Panes, LastAffectedShot | Full access for tool orchestration |
| ShotsPage | CurrentShot | Selection tracking |
| TasksPane | IncomingTasks, LastAffectedShot | Task display + navigation |
| ImageGalleryItem | LastAffectedShot | Shot actions |
| VideoGallery | GenerationTask | Preloading + enhancement |

**Inconsistencies:**
- **ThemeContext** is empty; theme handled externally by `next-themes` library
- **AIInputModeContext** has only one consumer (`ai-input-button`) — may be over-engineered for single use
- **GenerationTaskContext** has only one consumer — could potentially be a hook instead
- **ToolPageHeaderContext** only used by one hook + Layout — minimal adoption

---

## Pattern 2: Settings Persistence

**Standard pattern:** `useAutoSaveSettings` with scope cascade (shot > project > user > defaults).

| Tool | Settings Hook | Scope | Storage |
|------|---------------|-------|---------|
| Travel Between Images | `useAutoSaveSettings`, `useShotSettings` | Per-shot | tool_settings table |
| Image Generation | `useAutoSaveSettings`, `useToolSettings` | Per-shot (prompts), Per-project (model/refs) | tool_settings |
| Character Animate | `useAutoSaveSettings` | Per-project | tool_settings |
| Join Clips | `useAutoSaveSettings` (via `useJoinClipsSettings` wrapper) | Per-project | tool_settings |
| Edit Video | `useAutoSaveSettings` (via `useEditVideoSettings` wrapper) | Per-project | tool_settings |
| Edit Images | `useToolSettings` | Per-project (UI only) | lastEditedMediaId |
| Training Data Helper | `useTrainingData` | None (all in hook) | No persistence |

**Notes:**
- All tools now use `useAutoSaveSettings` (directly or via thin wrappers)
- Duplicate `useToolPageSettings` hook was deleted; wrappers migrated to `useAutoSaveSettings`
- **Travel Between Images** uses per-shot scope intentionally (each shot has different video segments)
- **Image Generation** uses sessionStorage for UI optimization (skeleton sizing, form expansion) — NOT for form data

**Remaining gaps:**
- **Edit Images** still uses raw `useToolSettings` (could migrate to `useAutoSaveSettings`)
- **Training Data Helper** has no settings persistence at all — state lives only in hook

---

## Pattern 3: Task Creation

**Standard pattern:** `create[TaskType]Task()` function from `src/shared/lib/tasks/` → `createTask()` from `taskCreation.ts` → `create-task` edge function.

| Tool | Task Function | Invocation |
|------|---------------|------------|
| Travel Between Images | `createTravelBetweenImagesTask()` | Via handlers in ShotEditor |
| Image Generation | `createBatchImageGenerationTasks()` | In `handleNewGenerate` |
| Character Animate | `createCharacterAnimateTask()` | In mutation |
| Join Clips | `createJoinClipsTask()` | In mutation |
| Edit Video | `createJoinClipsTask()` | Via `InlineEditVideoView` |
| Edit Images | `createMagicEditTask()`, `createImageInpaintTask()` | Via `InlineEditView` |
| Training Data Helper | `uploadVideosWithSplitModes()` | Via hook (upload, not generation) |

**All task creation now flows through unified pattern:**
```
Tool Page → create[Type]Task() → createTask() → create-task edge function
                                      ↓
                              • Authentication
                              • Rate limiting
                              • Project ownership check
                              • System logging
                              • 20s timeout protection
```

**Notes:**
- Edit Video/Images delegate to child components, but those components use the standard task functions
- Training Data Helper uploads videos for processing, not AI generation — different concern
- Batch tasks (Image Gen, Magic Edit, Inpaint, etc.) use `Promise.allSettled()` for parallel creation with partial failure tolerance

---

## Pattern 4: Modal Structure

**Standard pattern:** shadcn Dialog + `use[Size]Modal` hook + scroll fade + header/content/footer sections.

| Modal | Size Hook | Special Features |
|-------|-----------|------------------|
| SettingsModal | — | Tab navigation, scroll fade |
| CreateProjectModal | `useMediumModal` | Navigate on success |
| CreateShotModal | — | Image cropping |
| ProjectSettingsModal | — | Danger zone section |
| ProjectSelectorModal | — | Dual-mode UI |
| PromptEditorModal | `useExtraLargeModal` | Auto-save, AI tabs |
| DatasetBrowserModal | — | 4x4 grid, HoverScrubVideo |
| LoraSelectorModal | — | Tabs, pagination, HuggingFace |
| PhaseConfigSelectorModal | `useExtraLargeModal` | CRUD, sharing |
| VideoGenerationModal | `useExtraLargeModal` | Split-pane layout |
| LineageGifModal | — | State machine |
| ReferralModal | — | ProfitSplitBar |
| WelcomeBonusModal | — | 8-step wizard, confetti |

**Inconsistencies:**
- Only 4 of 13 modals use size hooks (`useMediumModal`, `useExtraLargeModal`)
- Others presumably hardcode dimensions or use defaults
- **WelcomeBonusModal** uses stepper pattern; no other modal does
- **LineageGifModal** uses explicit state machine; others use implicit state
- No consistent loading/error state pattern across modals

---

## Pattern 5: Data Fetching (React Query)

**Standard pattern:** `useQuery` with query key, staleTime, enabled flag; `useMutation` with onSuccess invalidation.

| Component | Query Hooks Used |
|-----------|------------------|
| ShotsPage | React Query mutations (add/delete/reorder) |
| SharePage | RPC calls (not React Query) |
| PaymentSuccessPage | React Query polling |
| Tool pages | `useGenerations`, `useToolSettings`, `useShots` |
| ImageGallery | Pagination queries, lazy-loading |
| TasksPane | `usePaginatedTasks`, `useTaskStatusCounts` |

**Inconsistencies:**
- **SharePage** uses direct RPC calls instead of React Query
- **ArtPage** uses hardcoded static data — no fetching at all
- Some components use `useQuery` directly, others use wrapper hooks
- Invalidation patterns vary — some invalidate specific keys, some broader

---

## Pattern 6: Desktop vs Mobile Handling

**Standard pattern:** `useIsMobile()` / `useIsTablet()` hooks + conditional rendering or Tailwind breakpoints.

| Component | Mobile Handling |
|-----------|-----------------|
| GlobalHeader | 2-row layout on mobile vs single row desktop |
| ShotImageManager | `ShotImageManagerMobile` vs `ShotImageManagerDesktop` |
| HoverScrubVideo | Autoplay prevention, no scrub on mobile |
| Layout | Split-view wrapper when generations pane locked |
| ImageGalleryItem | Mobile popover vs desktop hover actions |

**Inconsistencies:**
- **ShotImageManager** has entirely separate components for mobile/desktop
- **GlobalHeader** uses conditional JSX within single component
- **HoverScrubVideo** disables features on mobile rather than alternate UI
- **ImageGalleryItem** switches interaction pattern (popover vs hover)
- No single consistent approach — mix of separate components, conditional rendering, feature disabling

---

## Pattern 7: Component Composition

**Standard pattern:** Container component with sub-components in `/components` folder, hooks in `/hooks` folder.

| Component | Structure |
|-----------|-----------|
| MediaLightbox | Full structure: `/components`, `/hooks`, `/contexts` |
| ShotImageManager | Full structure: Container + Desktop/Mobile variants |
| TasksPane | Directory with sub-components |
| ToolsPane | Directory with sub-components |
| GenerationsPane | Directory with sub-components |
| ProductTour | Directory structure |
| ImageGallery | Directory with index.tsx |

**Inconsistencies:**
- **ImageGalleryItem** is a single 85KB file — no decomposition
- **CreditsManagement** is a single 48KB file — no decomposition
- **PhaseConfigSelectorModal** is 106KB — no decomposition
- Large single-file components vs well-structured directories inconsistent

**Well-structured examples:**
- **LoraSelectorModal** - Folder-based module with hooks/, utils/, components/

---

## Pattern 8: Animation/Transitions

**Standard pattern:** `PageFadeIn`, `FadeInSection` for page entry; Tailwind transitions for micro-interactions.

| Component | Animation Approach |
|-----------|-------------------|
| HomePage | Pane overlays, video background |
| ToolSelectorPage | `PageFadeIn`, `FadeInSection` |
| ArtPage | `PageFadeIn`, `FadeInSection`, parallax floats |
| NotFoundPage | Floating decorative elements |
| ConstellationCanvas | Canvas animation, parallax, shooting stars |
| WelcomeBonusModal | Confetti animation |
| ProductTour | react-joyride spotlight |

**Inconsistencies:**
- Most pages use `PageFadeIn`/`FadeInSection` but HomePage doesn't
- **ConstellationCanvas** uses raw canvas; everything else uses React/CSS
- **WelcomeBonusModal** has confetti; no other modal has celebration animations
- No shared animation utilities beyond fade components

---

## Pattern 9: Form State

**Standard pattern:** Local `useState` + `useAutoSaveSettings` for persistence.

| Component | Form State Approach |
|-----------|---------------------|
| ImageGenerationForm | `useAutoSaveSettings` for prompts (shot-scoped), `useToolSettings` for project settings |
| ShotEditor | Complex local state + per-shot settings |
| JoinClipsSettingsForm | Local state + project settings via `useAutoSaveSettings` |
| SegmentSettingsForm | Per-field overrides with shot inheritance |
| CreateProjectModal | Simple local state, no persistence |
| PromptEditorModal | Local state + auto-save every 3s |

**Clarification on ImageGenerationForm storage:**
The form uses **three storage mechanisms for three different concerns** (not triple-storing the same data):
1. **sessionStorage** - UI optimization only: form expansion state (`ig:formExpanded`), skeleton sizing (`ig:lastPromptCount`), session visit flags. These are session-scoped and don't need to persist across browser sessions.
2. **useState** - Component state during editing, derived from DB settings.
3. **Database** (via `useAutoSaveSettings`) - Single source of truth for actual form data: prompts, masterPrompt, promptMode, references. Uses shot-scoped `image-gen-prompts` and project-scoped `project-image-settings`.

This is correct architecture: appropriate storage for each concern type.

**Remaining inconsistencies:**
- **SegmentSettingsForm** has complex per-field override system
- **PromptEditorModal** auto-saves on timer; others save on blur/submit
- Create modals don't persist drafts; edit modals do
- No form library (react-hook-form, formik) — all manual

---

## Pattern 10: Error/Loading States

**Standard pattern:** Skeleton loaders during fetch; toast for errors; app-level error boundary for uncaught exceptions.

| Component | Loading | Error |
|-----------|---------|-------|
| SharePage | Skeleton state | Card with error message |
| PaymentSuccessPage | Loading → success states | — |
| ImageGallery | SkeletonGallery | — |
| TasksPane | — | — |
| LineageGifModal | State machine with loading state | State machine with error state |
| **AppErrorBoundary** | — | Full-screen recovery UI |

**Error Handling Infrastructure:**
- **Error types** (`src/shared/lib/errors.ts`): `NetworkError`, `AuthError`, `ValidationError`, `ServerError`, `SilentError`
- **Error handler** (`src/shared/lib/errorHandler.ts`): Centralized `handleError()` with logging, categorization, and toast display
- **App error boundary** (`src/shared/components/AppErrorBoundary.tsx`): Catches uncaught render errors, prevents white screens
- **Empty catches**: Audited and documented — most are intentional (localStorage, abort handling, fail-open patterns)

**Remaining inconsistencies:**
- Skeleton usage inconsistent — some use SkeletonGallery, some don't
- Not all components migrated to use `handleError()` yet (gradual adoption)

---

## Key Inconsistency Summary

| Pattern | Main Issue |
|---------|------------|
| **Context** | Some contexts have 1 consumer (over-engineered?) |
| **Settings** | Travel uses shot-scope; others project-scope; one tool has none |
| **Modals** | Size hooks used inconsistently; large files not decomposed |
| **Mobile** | Mix of separate components, conditional rendering, feature disabling |
| **Components** | Some 100KB+ single files vs well-structured directories |
| **Forms** | No form library; inconsistent auto-save timing (timer vs blur vs manual) |
| **Errors** | Error infrastructure added; gradual adoption in progress |

## Resolved Issues

| Issue | Resolution |
|-------|------------|
| **Duplicate settings hooks** | `useToolPageSettings` deleted; all tools now use `useAutoSaveSettings` |
| **Documentation gap** | `settings_system.md` and `adding_new_tool.md` now cross-reference and recommend `useAutoSaveSettings` |
| **Form "triple-storage"** | Investigated and found to be correct architecture: sessionStorage (UI optimization), useState (component state), DB (persistent data) serve different purposes |
| **Task creation bypass** | `imageInpaint.ts` and `annotatedImageEdit.ts` migrated from direct DB insert to unified `createTask()` pattern — now get rate limiting, auth validation, system logging, and timeout protection |
| **No global error boundary** | Added `AppErrorBoundary` in `main.tsx` to catch uncaught render errors and show recovery UI |
| **Inconsistent error types** | Created standardized error classes (`NetworkError`, `AuthError`, `ValidationError`, etc.) in `errors.ts` |
| **Inconsistent error handling** | Added `handleError()` utility for consistent logging, categorization, and toast display |
| **Task creation errors** | `taskCreation.ts` now uses typed errors (`AuthError`, `NetworkError`) for better handling |
