# Cleanup: enhancePrompt Defaults DRY Violation

## Problem

The `enhancePrompt` default is defined in **multiple places per tool**, creating confusion about where the value comes from and causing bugs (like the toggle unexpectedly becoming `true` after clearing a prompt).

Current anti-pattern:

```
settings.ts (defines defaults)
    ↓
useXxxSettings.ts (duplicates defaults instead of importing)
    ↓
Component destructuring (more fallbacks: `enhancePrompt = true`)
    ↓
Form rendering (yet more fallbacks: `enhancePrompt ?? true`)
```

Each layer adds its own fallback "just in case," but this makes debugging difficult and introduces subtle bugs.

## Solution

Each tool should have **one place** that defines its defaults. All other code imports from that source and trusts the value exists.

### Target Pattern

```typescript
// 1. settings.ts - THE source of truth
export const editVideoSettings = {
  defaults: {
    enhancePrompt: false,  // ← defined ONCE here
    // ...
  }
};

// 2. useEditVideoSettings.ts - imports defaults, no duplication
import { editVideoSettings } from '../settings';

export function useEditVideoSettings() {
  const [settings, setSettings] = useState(editVideoSettings.defaults);
  // NO fallbacks like `enhancePrompt ?? false`
}

// 3. Components - trust the value exists
const { enhancePrompt } = settings;  // NOT: enhancePrompt = false
```

---

## Master Checklist

- [ ] join-clips tool
- [ ] edit-video tool
- [ ] travel-between-images tool
- [ ] Shared segment settings

---

## join-clips

**Source of truth:** `src/tools/join-clips/settings.ts`

### Files to update

- [ ] `src/tools/join-clips/hooks/useJoinClipsSettings.ts`
  - Import `joinClipsSettings.defaults` instead of hardcoding initial state

- [ ] `src/tools/join-clips/hooks/useJoinClipsGenerate.ts`
  - `handleRestoreDefaults`: use `joinClipsSettings.defaults.enhancePrompt` instead of hardcoding `false`

- [ ] `src/tools/join-clips/components/JoinClipsSettingsForm.tsx`
  - Remove `DEFAULT_JOIN_CLIPS_PHASE_CONFIG` duplication if settings.ts has it
  - Remove any `enhancePrompt ?? false` fallbacks

---

## edit-video

**Source of truth:** `src/tools/edit-video/settings.ts`

### Files to update

- [ ] `src/shared/hooks/useEditVideoSettings.ts`
  - Import `editVideoSettings.defaults` instead of hardcoding initial state

- [ ] `src/tools/edit-video/components/InlineEditVideoView.tsx`
  - Remove destructuring fallbacks like `enhancePrompt = false`

- [ ] `src/shared/components/VideoPortionEditor/index.tsx`
  - Remove any hardcoded `enhance_prompt: false` defaults

---

## travel-between-images

**Source of truth:** `src/tools/travel-between-images/settings.ts`

Note: This tool has TWO different contexts:
1. **Batch generate** (shot-level) - `enhancePrompt: true` is correct default
2. **Join segments** (within shot editor) - `enhancePrompt: false` is correct default

### Files to update

- [ ] `src/tools/travel-between-images/hooks/useJoinSegmentsSettings.ts`
  - Define join-segments-specific defaults (separate from batch generate)

- [ ] `src/tools/travel-between-images/components/ShotEditor/hooks/useJoinSegmentsSetup.ts`
  - Import from `useJoinSegmentsSettings` defaults

- [ ] `src/tools/travel-between-images/components/ShotEditor/hooks/useJoinSegmentsHandler.ts`
  - `handleRestoreJoinDefaults`: import from settings instead of hardcoding

- [ ] `src/tools/travel-between-images/components/ShotEditor/sections/generation/BatchModeContent.tsx`
  - Remove any fallback defaults

---

## Shared segment settings

**Source of truth:** Define in `src/shared/components/SegmentSettingsForm/defaults.ts` (new file)

### Files to update

- [ ] Create `src/shared/components/SegmentSettingsForm/defaults.ts`
  - Export `SEGMENT_DEFAULTS = { enhance_prompt_enabled: false, ... }`

- [ ] `src/shared/components/MediaLightbox/hooks/useVideoEditing.ts`
  - Import from `SegmentSettingsForm/defaults.ts`

---

## Validation

After cleanup, grep should show minimal occurrences:

```bash
# Should only appear in settings.ts files
rg "enhancePrompt.*:" --type ts | grep -v "settings.ts" | grep -v ".test."

# Should NOT appear (hardcoded fallbacks)
rg "enhancePrompt.*=.*false" --type ts
rg "enhancePrompt.*\?\?.*false" --type ts
```
