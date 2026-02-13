# Desloppify Road to 100 — Action Plan

**Current: 83.0/100 | Target: ~95+ | 1,624 open findings**

## Finding Breakdown (by category)

| Category | Open | % of Total | Health | Fixable Now? |
|----------|------|-----------|--------|-------------|
| test_coverage | 898 | 55% | 2.9% | Partially — pure logic yes, React components need RTL |
| smells | 286 | 18% | 86.5% | Yes — mostly code quality fixes |
| props | 119 | 7% | 99% | Yes — prop drilling, unused props |
| structural | 90 | 6% | 93.1% | Yes — large files, mixed concerns |
| exports | 53 | 3% | 97% | Yes — unused exports |
| logs | 45 | 3% | 95.4% | Yes — remove console.log statements |
| react | 26 | 2% | 96% | Yes — React anti-patterns |
| facade | 25 | 2% | 100% | Maybe — barrel file issues |
| unused | 12 | <1% | 92% | Yes — dead code |
| flat dirs | 10 | <1% | - | Yes — directory organization |
| coupling | 7 | <1% | 99.1% | Maybe — architectural |
| cycles | 6 | <1% | 75% | Yes — import cycles |
| patterns | 5 | <1% | 91.7% | Yes — inconsistencies |
| orphaned | 4 | <1% | 100% | Yes — orphaned files |
| deprecated | 4 | <1% | 100% | Yes — deprecated API usage |
| dupes | 3 | <1% | 75% | Yes — code duplication |

## Strategy (by impact)

### Phase 1: Quick Wins (no test infra needed) — ~200 findings

These categories are mechanical fixes with high confidence. Can be done now.

- [ ] **logs (45)**: Remove `console.log` statements from production code
- [ ] **unused (12)**: Delete dead code
- [ ] **exports (53)**: Remove unused exports, make internal
- [ ] **deprecated (4)**: Replace deprecated API usage
- [ ] **orphaned (4)**: Delete or integrate orphaned files
- [ ] **dupes (3)**: Consolidate duplicated code
- [ ] **cycles (6)**: Break import cycles
- [ ] **patterns (5)**: Fix inconsistency patterns

**Estimated impact: ~130 findings, health → ~85-86**

### Phase 2: Code Quality (smells + structural) — ~376 findings

These need judgment but are fixable without test infra.

- [ ] **smells (286)**: Code quality issues (long functions, complex conditionals, magic numbers, etc.)
- [ ] **structural (90)**: Files >300 LOC, mixed concerns — need extraction/splitting

**Estimated impact: ~200-250 fixable findings, health → ~88-90**

### Phase 3: React & Props — ~145 findings

Requires understanding component architecture.

- [ ] **props (119)**: Prop drilling, unused props, wide interfaces
- [ ] **react (26)**: React anti-patterns (missing keys, inline handlers, etc.)

**Estimated impact: ~100 findings, health → ~91-93**

### Phase 4: Test Coverage (the elephant) — ~898 findings

This is 55% of all findings. Two sub-phases:

#### 4a: Pure Logic Tests (no new deps) — ~60 more files
Continue what we're doing. Remaining `src/shared/lib/` and `src/shared/utils/` files
that are pure functions. Need to mock Supabase/toast for some.

#### 4b: React Component Tests (needs @testing-library/react) — ~600+ files
Every React component, hook, and context is flagged. Requires:
- Install `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- Set up component test patterns
- This is the bulk of the work — 600+ components/hooks

**Estimated impact: Phase 4a → ~5-8% test health. Phase 4b → 50%+ test health**

### Phase 5: Architectural (coupling, facade, flat dirs) — ~42 findings

These require design decisions, not mechanical fixes.

- [ ] **facade (25)**: Barrel/index file issues
- [ ] **flat dirs (10)**: Directory organization
- [ ] **coupling (7)**: Cross-module coupling

## Priority Order for Maximum Score Impact

1. **Phase 1** (quick wins) — 130 fixes, +2-3 health points
2. **Phase 2** (smells/structural) — 200+ fixes, +4-5 health points
3. **Phase 4a** (more pure logic tests) — 60 files, test health → ~8%
4. **Phase 3** (React/props) — 100+ fixes, +2-3 health points
5. **Phase 4b** (component tests) — 600+ files, test health → 50%+
6. **Phase 5** (architectural) — 42 fixes, +1 health point

## Realistic Target

Without React testing infra: **~90-93/100** (by fixing phases 1-3 + 4a)
With React testing infra: **~95-97/100** (full pass on all phases)
True 100: Would require testing every UI component — diminishing returns after ~95.
