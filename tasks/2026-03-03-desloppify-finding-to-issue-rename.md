# Desloppify: Rename "finding" → "issue", scoring "issues" → "failing"

## Problem

Desloppify uses "finding" as its canonical term for an individual detected problem, but every user and every comparable tool (SonarQube, CodeClimate, Snyk) calls these "issues." The word "issue" is currently blocked because `dimension_scores[dim]["issues"]` uses it for failing-check counts — a completely different concept.

Two files are also misnamed: `issues_render.py` renders findings, and `_work_queue/issues.py` handles review findings.

## Solution

1. Rename the scoring field `"issues"` → `"failing"` (frees the word)
2. Rename `"finding"` → `"issue"` everywhere (state model, functions, variables, CLI output, files)
3. State migration: read both old and new keys for backwards compatibility

## Master checklist

### Phase 1: Scoring field rename (`issues` → `failing`)

This unblocks everything. Small surface area, can land independently.

- [ ] **Schema**: `DimensionScore["issues"]` → `DimensionScore["failing"]` in `engine/_state/schema.py`
- [ ] **Scoring engine**: All writes of `["issues"]` in `engine/_state/scoring.py` → `["failing"]`
- [ ] **Migration shim**: Wherever `dimension_scores` is read, accept both `["issues"]` and `["failing"]` (helper function: `ds.get("failing", ds.get("issues", 0))`)
- [ ] **CLI output strings**:
  - `app/commands/next_parts/render.py:147` — `"({dimension_score['issues']} of..."` → `"failing"`
  - `app/commands/next_parts/render.py:252` — `"({ds['issues']} open issues)"` → `"({ds['failing']} checks failing)"`
  - `intelligence/narrative/headline.py:121` — `f"{top['issues']} items → +{top['impact']} pts"`
  - `app/commands/status_parts/render_dimensions.py` — dimension display
  - `engine/planning/render.py:113, 144` — plan display
- [ ] **Review prepare**: `intelligence/review/prepare.py:168` — `scoped["issues"] = issues` → `scoped["failing"]`
- [ ] **Scorecard rendering**: `app/output/scorecard_parts/dimensions.py` — output text
- [ ] **Health breakdown**: `engine/_scoring/results/health.py` — entries that return `"issues"` key
- [ ] **Subjective entries**: `engine/planning/scorecard_projection.py` — `all_subjective_entries` returns dicts with `"issues"` key
- [ ] **Synthetic items**: `engine/_work_queue/synthetic.py:247,268` — `detail["issues"]` in subjective items
- [ ] **Tests**: Update all assertions on `["issues"]` in dimension_scores context:
  - `tests/detectors/security/test_security.py` (5+ assertions)
  - `tests/scoring/test_scoring.py` (10+ assertions)
  - `tests/scoring/test_scorecard.py`
  - `tests/plan/test_subjective_policy.py`
  - `tests/review/work_queue_cases.py`
  - Any other test that constructs dimension_scores with `"issues"` key

### Phase 2: State model rename (`findings` → `issues`)

The big one. Touch every file that reads/writes `state["findings"]`.

- [ ] **TypedDict**: `Finding` → `Issue` in `engine/_state/schema.py:51-73`
  - Keep `Finding = Issue` alias for transition
  - `FindingStatus` → `IssueStatus` (keep alias)
  - `FINDING_STATUSES` → `ISSUE_STATUSES` (keep alias)
- [ ] **State key**: `state["findings"]` → `state["issues"]`
  - Migration helper in schema.py: when loading state, if `"findings"` exists and `"issues"` doesn't, copy it
  - When saving, write `"issues"` only (drop `"findings"`)
- [ ] **State API** (`state.py`): Rename all public functions:
  - `make_finding` → `make_issue`
  - `match_findings` → `match_issues`
  - `resolve_findings` → `resolve_issues`
  - `path_scoped_findings` → `path_scoped_issues`
  - `upsert_findings` → `upsert_issues`
  - `remove_ignored_findings` → `remove_ignored_issues`
  - `finding_in_scan_scope` → `issue_in_scan_scope`
  - `apply_finding_noise_budget` → `apply_issue_noise_budget`
  - `resolve_finding_noise_budget` → `resolve_issue_noise_budget`
  - `resolve_finding_noise_global_budget` → `resolve_issue_noise_global_budget`
  - `resolve_finding_noise_settings` → `resolve_issue_noise_settings`
  - `DEFAULT_FINDING_NOISE_BUDGET` → `DEFAULT_ISSUE_NOISE_BUDGET`
  - `DEFAULT_FINDING_NOISE_GLOBAL_BUDGET` → `DEFAULT_ISSUE_NOISE_GLOBAL_BUDGET`
  - Keep old names as deprecated aliases: `make_finding = make_issue` etc.
- [ ] **Enums** (`core/enums.py`):
  - `canonical_finding_status` → `canonical_issue_status`
  - `finding_status_tokens` → `issue_status_tokens`

### Phase 3: Function and variable renames (by module area)

#### Work queue (`engine/_work_queue/`)
- [ ] `helpers.py`: `is_review_finding` → `is_review_issue`, `is_subjective_finding` → `is_subjective_issue`, `review_finding_weight` → `review_issue_weight`, `primary_command_for_finding` → `primary_command_for_issue`
- [ ] `ranking.py`: `build_finding_items` → `build_issue_items`
- [ ] `issues.py`: `list_open_review_findings` → `list_open_review_issues`, `expire_stale_holistic` (param names)
- [ ] `plan_order.py`: variable names (`finding_ids`, etc.)
- [ ] `core.py`: import updates, variable names

#### Review system (`intelligence/review/`)
- [ ] `importing/resolution.py`: `auto_resolve_review_findings` → `auto_resolve_review_issues`
- [ ] `importing/holistic.py`: `_validate_and_build_findings` → `_validate_and_build_issues`, `import_holistic_findings` → `import_holistic_issues`, `resolve_holistic_coverage_findings` → `resolve_holistic_coverage_issues`, `resolve_reviewed_file_coverage_findings` → `resolve_reviewed_file_coverage_issues`
- [ ] `importing/contracts.py`: `ReviewFindingPayload` → `ReviewIssuePayload`
- [ ] `importing/per_file.py`: `import_review_findings` → `import_review_issues`
- [ ] `selection_cache.py`: `get_file_findings` → `get_file_issues`
- [ ] `feedback_contract.py`: `max_batch_findings_for_dimension_count` → `max_batch_issues_for_dimension_count`
- [ ] `_prepare/remediation_engine.py`: `_collect_holistic_findings` → `_collect_holistic_issues`
- [ ] `_prepare/issue_history.py`: `_finding_dimension` → `_issue_dimension`, `_iter_review_findings` → `_iter_review_issues`, `_shape_finding` → `_shape_issue`
- [ ] `context.py`, `selection.py`, `context_holistic/selection_contexts.py`, `context_holistic/mechanical.py`: variable names

#### Planning (`engine/planning/`, `engine/_plan/`)
- [ ] `scan.py`: `_stamp_finding_context` → `_stamp_issue_context`, `_generate_findings_from_lang` → `_generate_issues_from_lang`, `generate_findings` → `generate_issues`
- [ ] `render.py`, `render_sections.py`: param names, variable names
- [ ] `auto_cluster.py`: `_sync_finding_clusters` → `_sync_issue_clusters`, `auto_cluster_findings` → `auto_cluster_issues`, variable names
- [ ] `reconcile.py`: `_is_finding_alive` → `_is_issue_alive`
- [ ] `epic_triage.py`: `extract_finding_citations` → `extract_issue_citations`
- [ ] `stale_dimensions.py`, `stale_dimensions_triage.py`, `stale_dimensions_workflow.py`: variable names
- [ ] `epic_triage_mutation.py`, `commit_tracking.py`: variable names

#### Detectors (`engine/detectors/`)
- [ ] `test_coverage/detector.py`: `_generate_findings` → `_generate_issues`, `_quality_issue_finding` → `_quality_issue` (note: already confusingly named!), `_transitive_coverage_gap_finding` → `_transitive_coverage_gap_issue`, `_untested_module_finding` → `_untested_module_issue`, `_no_tests_findings` → `_no_tests_issues`, `_select_direct_test_quality_finding` → `_select_direct_test_quality_issue`

#### Commands (`app/commands/`)
- [ ] `next_parts/render.py`: `_render_finding_detail` → `_render_issue_detail`
- [ ] `review/batch_core.py`: `NormalizedBatchFinding` → `NormalizedBatchIssue`, `_normalize_findings` → `_normalize_issues`, `_enforce_low_score_findings` → `_enforce_low_score_issues`, `_finding_pressure_by_dimension` → `_issue_pressure_by_dimension`, `_finding_identity_key` → `_issue_identity_key`
- [ ] `review/batch_merge.py`: `_merge_finding_payload` → `_merge_issue_payload`, `_should_merge_findings` → `_should_merge_issues`, `_append_batch_findings` → `_append_batch_issues`, `_merge_finding_group` → `_merge_issue_group`, `_merge_findings_transitively` → `_merge_issues_transitively`
- [ ] `review/batch_scoring.py`: `finding_severity` → `issue_severity`, `finding_pressure_by_dimension` → `issue_pressure_by_dimension`
- [ ] `review/import_output.py`: `_print_findings_only_policy_notice` → `_print_issues_only_policy_notice`
- [ ] `plan/triage_handlers.py`: `_manual_clusters_with_findings` → `_manual_clusters_with_issues`
- [ ] `plan/triage/reflect_dashboard.py`: `_print_resolved_findings` → `_print_resolved_issues`, `_print_recurring_patterns` (param)
- [ ] `plan/triage/progress_render.py`: `_collect_unclustered_findings` → `_collect_unclustered_issues`, `_print_unclustered_findings` → `_print_unclustered_issues`
- [ ] `plan/cluster_handlers.py`: `_load_findings_best_effort` → `_load_issues_best_effort`
- [ ] `exclude_cmd.py`: `_prune_excluded_findings` → `_prune_excluded_issues`
- [ ] `helpers/display.py`: `short_finding_id` → `short_issue_id`
- [ ] `scan/scan_wontfix.py`: `augment_with_stale_wontfix_findings` → `augment_with_stale_wontfix_issues`

#### Core (`core/`)
- [ ] `issues_render.py`: `finding_weight` → `issue_weight`, `render_issue_detail` (already named correctly!), internal variable names
- [ ] `enums.py`: function renames listed in Phase 2

#### Intelligence (`intelligence/`)
- [ ] `integrity.py`: `_iter_findings` → `_iter_issues`, `is_holistic_subjective_finding` → `is_holistic_subjective_issue`
- [ ] `narrative/dimensions.py`, `narrative/reminders.py`, `narrative/action_engine.py`, `narrative/signals.py`: variable names
- [ ] `review/finding_merge.py` → rename file to `issue_merge.py`; rename internal functions

#### State (`engine/_state/`)
- [ ] `merge_findings.py` → rename file to `merge_issues.py`
- [ ] `schema.py`: TypedDict rename (Phase 2)
- [ ] `resolution.py`, `merge.py`, `filtering.py`, `scoring.py`: variable names

#### Other
- [ ] `engine/policy/zones.py`: `should_skip_finding` → `should_skip_issue`
- [ ] `engine/concerns.py`: `_open_findings` → `_open_issues`
- [ ] `app/output/visualize.py`: `_findings_by_file` → `_issues_by_file`

### Phase 4: File renames

- [ ] `intelligence/review/finding_merge.py` → `issue_merge.py`
- [ ] `engine/_state/merge_findings.py` → `merge_issues.py`
- [ ] `languages/_framework/finding_factories.py` → `issue_factories.py`
- [ ] `tests/lang/common/test_lang_finding_factories_direct.py` → `test_lang_issue_factories_direct.py`
- [ ] Update all imports referencing renamed files

### Phase 5: CLI output text

- [ ] All help strings in `app/cli_support/parser_plan.py`: "Finding ID(s)" → "Issue ID(s)" (9+ locations)
- [ ] `parser_groups.py:134`: sort choice `"findings"` → keep for backwards compat, add `"issues"` alias
- [ ] `parser_review.py:253`: "Findings always import" → "Issues always import"
- [ ] Triage prompts: "contradictory findings" → "contradictory issues"
- [ ] Review prompts: "findings must be defects only" → "issues must be defects only"
- [ ] Narrative/scorecard text: "code findings" → "code issues"
- [ ] All `click.echo` / `print` that say "finding" or "findings" in user-facing context
- [ ] Queue output: "118 new review finding(s)" → "118 new review issue(s)"

### Phase 6: Tests

- [ ] Rename test functions containing "finding" → "issue" (100+ methods across 30+ files)
- [ ] Update test fixtures: `_state_with_findings` → `_state_with_issues`, `_finding()` → `_issue()`
- [ ] Update assertions on `state["findings"]` → `state["issues"]`
- [ ] Update assertions on `dimension_scores[dim]["issues"]` → `["failing"]`
- [ ] Run full test suite, fix any breakage

### Phase 7: Documentation and config

- [ ] Update README.md in desloppify repo
- [ ] Update any docstrings that explain the terminology
- [ ] Add migration note: "State files with `findings` key are auto-migrated to `issues`"
- [ ] Update `__all__` exports in all modules to use new names (keep old as aliases)

### Phase 8: State file migration

- [ ] Add migration function in `engine/_state/schema.py`:
  ```python
  def migrate_state_keys(state: dict) -> dict:
      # findings → issues
      if "findings" in state and "issues" not in state:
          state["issues"] = state.pop("findings")
      # dimension_scores: issues → failing
      for ds in state.get("dimension_scores", {}).values():
          if "issues" in ds and "failing" not in ds:
              ds["failing"] = ds.pop("issues")
      return state
  ```
- [ ] Call migration on state load (before any processing)
- [ ] On state save, write only new keys
- [ ] Test with existing state files from reigh and other projects

## Execution strategy

**Order matters.** Do it in this sequence to minimize breakage:

1. **Phase 1 first** (scoring `issues` → `failing`) — small, self-contained, unblocks everything
2. **Phase 8 next** (migration shim) — safety net for existing state files
3. **Phase 2** (state model + TypedDict) — the core rename
4. **Phase 3** (functions/variables) — biggest phase, mechanical find-and-replace with verification
5. **Phase 4** (file renames) — after function renames so imports are already updated
6. **Phase 5** (CLI text) — user-facing polish
7. **Phase 6** (tests) — can partially interleave with phases 3-5
8. **Phase 7** (docs) — last

**Run tests after each phase.** The migration shim means old state files still work, and deprecated aliases mean old code paths still resolve during the transition.

## Verification

After all phases:
1. `pytest` — full suite green
2. `desloppify scan --path .` on reigh — produces state with `"issues"` key, no `"findings"`
3. `desloppify next` — output says "issues" not "findings"
4. `desloppify status` — dimension scores show `"failing"` not `"issues"`
5. `grep -r '"findings"' desloppify/` — only hits migration shim and deprecated aliases
6. `grep -r 'finding' desloppify/ --include='*.py'` — only hits migration shim, aliases, and the word "finding" in natural-English comments where appropriate (e.g., "after finding the root cause")
