# Master Plan: Codebase Deep Dive — What's Ugly

> Created: 2026-02-13
> Status: Planning
> Scope: 6 themes, ~40 individual items

## Executive Summary

Six themes of technical debt, ordered by **impact × tractability**:

| # | Theme | Items | Effort | Risk | Sub-plan |
|---|-------|-------|--------|------|----------|
| 1 | Dead code & vestigial patterns | ~12 | Low | Low | `2026-02-13-P1-dead-code-cleanup.md` |
| 2 | Inconsistency across similar things | ~15 | Medium | Low-Med | `2026-02-13-P2-inconsistency-cleanup.md` |
| 3 | Notable specific issues | 6 | Medium | Low | `2026-02-13-P3-specific-issues.md` |
| 4 | Scattered mobile-specific logic | ~10 | Medium | Medium | `2026-02-13-P4-mobile-architecture.md` |
| 5 | Architectural smells | 6 | High | High | `2026-02-13-P5-architectural-smells.md` |
| 6 | Monolithic components | 13 | Very High | High | `2026-02-13-P6-monolith-decomposition.md` |

## Recommended Execution Order

### Phase A — Quick Wins (1-2 sessions)
**Goal:** Remove noise, reduce LOC, fix easy correctness issues.

- [ ] **P1: Dead code cleanup** — Delete ~15 dead items. Low risk, immediate LOC reduction.
- [ ] **P3: Specific issues** — Hardcoded colors, imagesPerPrompt silent change, complete_task double query. Each is a targeted fix.

### Phase B — Consistency Pass (2-4 sessions)
**Goal:** Standardize patterns so future work is cheaper.

- [ ] **P2: Inconsistency cleanup** — Unify LoRA types, auth patterns, device detection. Extract shared processBatchResults. Standardize edge function patterns.

### Phase C — Mobile Architecture (2-3 sessions)
**Goal:** Replace scattered mobile hacks with a coherent system.

- [ ] **P4: Mobile architecture** — Centralize device detection, extract timeout recovery, unify PanesContext lock setters, fix PaymentSuccessPage timeout soup.

### Phase D — Structural Refactors (ongoing, interleave with feature work)
**Goal:** Break apart god objects and fix architectural issues.

- [ ] **P5: Architectural smells** — ProjectContext decomposition, rate limiting fix, context nesting, window globals. These are higher risk and should be done one at a time with testing.
- [ ] **P6: Monolith decomposition** — The 13 mega-components. Each is its own multi-session project. Prioritize by pain frequency.

## Cross-Cutting Principles

1. **Each PR should be shippable independently** — no multi-week branches
2. **Test after each extraction** — verify no behavior change
3. **Update docs when changing system patterns** — per CLAUDE.md rules
4. **Prefer context over props when drilling >3 levels** — but split contexts by concern
5. **Every change should make the codebase smaller or more explicit** — per code quality audit
