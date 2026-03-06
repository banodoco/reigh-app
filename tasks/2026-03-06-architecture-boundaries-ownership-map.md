# Architecture Boundaries: Shared Ownership Map

Date: 2026-03-06

## Method
- Scope: `src/tools/<tool>/**` production source files (`.ts/.tsx`), excluding `__tests__`, `*.test.*`, `*.spec.*`, and `__mocks__`.
- Ownership signal: distinct tool modules importing from `src/shared/<subdir>`.
- Classification rule:
  - `true-shared`: used by 3 or more tools
  - `feature-specific`: used by 0-2 tools

## Shared Directory Ownership

| shared subdir | importing tools | classification | tools |
|---|---:|---|---|
| `auth` | 0 | feature-specific | - |
| `components` | 7 | true-shared | `character-animate`, `edit-images`, `edit-video`, `image-generation`, `join-clips`, `training-data-helper`, `travel-between-images` |
| `config` | 0 | feature-specific | - |
| `constants` | 2 | feature-specific | `edit-images`, `edit-video` |
| `contexts` | 6 | true-shared | `character-animate`, `edit-images`, `edit-video`, `image-generation`, `join-clips`, `travel-between-images` |
| `hooks` | 7 | true-shared | `character-animate`, `edit-images`, `edit-video`, `image-generation`, `join-clips`, `training-data-helper`, `travel-between-images` |
| `lib` | 7 | true-shared | `character-animate`, `edit-images`, `edit-video`, `image-generation`, `join-clips`, `training-data-helper`, `travel-between-images` |
| `media` | 1 | feature-specific | `edit-images` |
| `providers` | 0 | feature-specific | - |
| `realtime` | 0 | feature-specific | - |
| `runtime` | 0 | feature-specific | - |
| `services` | 0 | feature-specific | - |
| `settings` | 5 | true-shared | `character-animate`, `edit-video`, `image-generation`, `join-clips`, `travel-between-images` |
| `types` | 1 | feature-specific | `travel-between-images` |
| `utils` | 0 | feature-specific | - |

## Priority Candidates Highlighted In Queue

### `shared/components/MediaLightbox`
- Used by 4 tools: `edit-images`, `edit-video`, `join-clips`, `travel-between-images`
- Current size: 230 TS/TSX files, 25,750 lines
- Assessment: functionally cross-tool, but too large for `shared/components`; should become a dedicated domain boundary.

### `shared/components/ImageGenerationForm`
- Used by 2 tools: `image-generation`, `travel-between-images`
- Current size: 97 TS/TSX files, 10,676 lines
- Assessment: feature-scale module with limited tool spread; good extraction candidate to a domain/tool-owned module with shared interfaces.

## Interpretation
- `shared/components`, `shared/hooks`, `shared/lib`, `shared/contexts`, and `shared/settings` are truly shared by tool-usage criteria.
- Most remaining `shared/*` top-level directories are currently feature-specific by tool usage and are strong candidates for extraction or tighter boundary ownership.

## Caveats
- This map uses tool imports only. Some `shared/*` directories may be used by `domains/`, `features/`, `app/`, or infra code and still be valid shared runtime concerns.
- This is the intended first pass for queue step 1; step 3 (breaking `shared`↔`features` cycles) should refine ownership with layer-direction rules.
