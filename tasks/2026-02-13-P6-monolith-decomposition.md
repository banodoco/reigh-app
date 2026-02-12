# P6: Monolithic Component Decomposition

> Parent: `2026-02-13-master-ugliness-plan.md`
> Effort: Very High (ongoing, 1-2 components per session)
> Risk: High — structural changes to core UI components

## Priority Order

Ordered by **frequency of pain × coupling to other work**:

| Priority | Component | Lines | Key Problem | Decomp Strategy |
|----------|-----------|-------|-------------|-----------------|
| 1 | SegmentSettingsForm | 1,044 | 47+ props, form logic + video CRUD mixed | Extract sub-forms |
| 2 | ImageLightbox | 1,030 | 45 props, 12 hooks, state mirroring | Extract edit orchestrator |
| 3 | MediaGallery | 752 | 119 props (!!), filter+pagination+lightbox | Split into concerns |
| 4 | TimelineContainer | 988 | 24 props, drag+zoom+selection interleaved | Extract interaction hooks |
| 5 | InlineEditView | 956 | useInlineEditState returns 50+ fields | Split state hook |
| 6 | VideoLightbox | 903 | 32 props, 6 edit sub-modes | Extract mode handlers |
| 7 | useGenerationActions | 727 | 14 refs, stale closure workarounds | Split by operation |
| 8 | useAutoSaveSettings | 719 | Dual backend support, complex lifecycle | Simplify backends |
| 9 | useImageGenForm | 714 | 50+ returns (already has 8 sub-hooks) | Reduce surface area |
| 10 | useSharedLightboxState | 693 | 16 internal hooks composed | Already well-structured, reduce |
| 11 | EditModePanel | 628 | 20 props, 5 edit mode types | Extract per-mode panels |
| 12 | useTrainingData | 588 | CRUD for 3 entities + transforms | Split by entity |
| 13 | ImageEditContext | 319 | 70+ fields, any change re-renders all | Split by concern |

## Master Checklist

### Tier 1 — High Impact (do first)
- [ ] 1. SegmentSettingsForm → extract AdvancedSettings, StructureVideoSection, PromptField
- [ ] 2. ImageLightbox → extract ImageEditOrchestrator, extract mode-specific panels
- [ ] 3. MediaGallery → reduce props via context, extract LightboxCoordinator
- [ ] 4. ImageEditContext → split into EditModeContext, BrushToolContext, CanvasContext

### Tier 2 — Medium Impact
- [ ] 5. TimelineContainer → extract useTimelineInteractions, useTimelineZoom, useTimelineSelection
- [ ] 6. InlineEditView → split useInlineEditState into mode-specific sub-hooks
- [ ] 7. VideoLightbox → extract VideoEditOrchestrator (mirrors ImageLightbox pattern)
- [ ] 8. useGenerationActions → split into useImageAdd, useImageRemove, useImagePosition

### Tier 3 — Lower Impact (already partially decomposed)
- [ ] 9. useAutoSaveSettings → consider simplifying to single backend
- [ ] 10. useImageGenForm → reduce return surface (consumers should use context)
- [ ] 11. EditModePanel → extract InpaintPanel, RepositionPanel, Img2ImgPanel, UpscalePanel
- [ ] 12. useTrainingData → split into useTrainingBatches, useTrainingVideos, useTrainingSegments

---

## Decomposition Strategies Per Component

### 1. SegmentSettingsForm (1,044 lines, 47+ props)
**File:** `src/shared/components/SegmentSettingsForm/SegmentSettingsForm.tsx`

**Current responsibilities:**
- Prompt field with default handling
- Advanced settings collapsible (motion, LoRA, model options)
- Structure video upload/management/CRUD
- Submit + default save handlers
- Per-segment video CRUD

**Extraction plan:**
```
SegmentSettingsForm (~400 lines)
├── PromptField (existing? or extract)
├── AdvancedSettingsSection (~250 lines)
│   ├── MotionPresets
│   ├── LoraSelector
│   └── ModelOptions
├── StructureVideoSection (~200 lines)
│   ├── VideoUploader
│   └── VideoPreview
└── SubmitControls (~100 lines)
```

### 2. ImageLightbox (1,030 lines, 45 props)
**File:** `src/shared/components/MediaLightbox/ImageLightbox.tsx`

**Current responsibilities:**
- Upscale, inpaint, magic edit, reposition, img2img mode orchestration
- Variant management and navigation
- Star toggle and shot positioning
- Task details display
- Layout decisions
- ImageEditContext provider

**Extraction plan:**
```
ImageLightbox (~300 lines, display + layout only)
├── ImageEditOrchestrator (new, ~300 lines)
│   ├── Manages edit mode state machine
│   ├── Provides ImageEditContext
│   └── Delegates to mode-specific handlers
├── ImageLightboxHeader (~100 lines)
├── ImageLightboxContent (~150 lines)
└── ImageLightboxFooter (~100 lines)
```

### 3. MediaGallery (752 lines, 119 props)
**File:** `src/shared/components/MediaGallery/index.tsx`

**The #1 issue is 119 props.** Many of these are configuration flags (showDelete, showDownload, showShare, etc.) and callbacks.

**Reduction strategy:**
1. **Config object:** Group boolean flags into `GalleryConfig`:
   ```ts
   interface GalleryConfig {
     showDelete?: boolean;
     showDownload?: boolean;
     showShare?: boolean;
     showEdit?: boolean;
     showStar?: boolean;
     showAddToShot?: boolean;
     // ... etc
   }
   ```
2. **Context for shared state:** Gallery items shouldn't receive 20+ props — they should read from a `MediaGalleryContext`
3. **Extract LightboxCoordinator:** The lightbox management is a separate concern

### 4. ImageEditContext (319 lines, 70+ fields)
**File:** `src/shared/components/MediaLightbox/contexts/ImageEditContext.tsx`

**Problem:** Any mutation in any of 70+ fields triggers re-renders in all consumers.

**Split into:**
```
ImageEditContext (thin, composes sub-contexts)
├── EditModeContext        — 8 fields (current mode, mode switcher)
├── BrushToolContext       — 6 fields (size, opacity, color, tool type)
├── AnnotationToolContext  — 4 fields (annotation mode, shapes)
├── CanvasInteractionContext — 8 fields (zoom, pan, transform)
├── RepositionContext      — 6 fields (transform state)
├── EditFormContext        — 10+ fields (prompt, params, submit)
└── GenerationStatusContext — 8+ fields (loading, progress, results)
```

Each sub-context only re-renders its consumers when relevant state changes.

---

## General Decomposition Rules

1. **Extract when a section has its own state** — if a group of fields change together but independently of other groups, it's a natural boundary
2. **Props → Context when drilling >2 levels** — but split contexts by concern (don't create another mega-context)
3. **Hooks → smaller hooks when they have >5 useRef** — refs are a code smell for wrong boundaries
4. **Components → smaller components at ~300 LOC** — the sweet spot for readability
5. **Don't share what doesn't need sharing** — if only one consumer uses a field, it doesn't belong in shared context
6. **Config objects for boolean flag groups** — `{ showDelete, showDownload, showShare }` → `GalleryConfig`
