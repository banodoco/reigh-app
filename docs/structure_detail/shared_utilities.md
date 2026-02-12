# Shared Utilities

**Source of Truth**: Source files below. **Key Invariants**: All in `src/shared/` (`@/shared/...`). Never hardcode colors. Prefer these over ad-hoc solutions.

## Utility Index

| Utility | Description | Source |
|---------|-------------|--------|
| `ModalContainer` / `ModalFooterButtons` | Responsive modal wrapping shadcn `Dialog` with header/footer/scroll. Use `ModalFooterButtons` for standard cancel/confirm footers. Props in TS interface | `src/shared/components/ModalContainer.tsx` |
| `useConfirmDialog` / `ConfirmDialog` | Promise-based confirmation dialog. Hook mode (imperative, `confirm()` returns promise) or standalone (declarative). Props in TS interface | `src/shared/components/ConfirmDialog.tsx` |

## `confirmPresets`

Pre-configured option sets for `useConfirmDialog` / `ConfirmDialog`:

| Preset | Purpose |
|--------|---------|
| `confirmPresets.delete(itemName?)` | Destructive delete confirmation |
| `confirmPresets.discard(itemName?)` | Discard unsaved changes |
| `confirmPresets.unsavedChanges()` | Leave page with unsaved changes |

## Migration Status

**ModalContainer** -- migrated: CreateProjectModal, CreateShotModal, LineageGifModal, ProjectSettingsModal. Not migrated (custom layouts): VideoGenerationModal, SettingsModal, OnboardingModal.

**ConfirmDialog** -- migrated: DeleteConfirmationDialog (ShotImageManager), ShotImageManagerMobile delete. Not migrated (custom content): dialogs with checkboxes or conditional notes.
