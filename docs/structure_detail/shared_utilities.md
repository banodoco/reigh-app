# Shared Utilities

**Source of Truth**: Source files below. **Key Invariants**: All in `src/shared/` (`@/shared/...`). Never hardcode colors. Prefer these over ad-hoc solutions.

## Utility Index

| Utility | Description | Source |
|---------|-------------|--------|
| `ModalContainer` / `ModalFooterButtons` | Responsive modal wrapping shadcn `Dialog` with header/footer/scroll. Use `ModalFooterButtons` for standard cancel/confirm footers. Props in TS interface | `src/shared/components/ModalContainer.tsx` |
| `ConfirmDialog` | Declarative confirmation dialog used directly or wrapped by feature-specific delete dialogs. Props in TS interface | `src/shared/components/dialogs/ConfirmDialog.tsx` |
| `DeleteGenerationConfirmDialog` | Shared deletion-confirm wrapper used across gallery/tool surfaces for generation deletion flows | `src/shared/components/dialogs/DeleteGenerationConfirmDialog.tsx` |

## Migration Status

**ModalContainer** -- migrated: CreateProjectModal, CreateShotModal, LineageGifModal, ProjectSettingsModal. Not migrated (custom layouts): VideoGenerationModal, SettingsModal, OnboardingModal.

**ConfirmDialog** -- used directly by ShotImageManager mobile and wrapped by `DeleteGenerationConfirmDialog` / `DeleteConfirmationDialog` where the copy needs to stay consistent.
