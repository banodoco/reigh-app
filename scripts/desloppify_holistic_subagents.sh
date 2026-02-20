#!/usr/bin/env bash
set -euo pipefail

# Streamlined holistic-review pipeline using Codex subagents.
# Usage:
#   scripts/desloppify_holistic_subagents.sh [repo_root]
#
# Optional env vars:
#   SCAN_PATH=src/            # path for final scan (default: src/)
#   RUN_SCAN=1                # run scan after import (default: 1)
#   DESLOPPIFY_PREP_ARGS=""   # extra args for `desloppify review --prepare`

ROOT="${1:-.}"
ROOT_ABS="$(cd "$ROOT" && pwd)"
SCAN_PATH="${SCAN_PATH:-src/}"
RUN_SCAN="${RUN_SCAN:-1}"
PREP_ARGS="${DESLOPPIFY_PREP_ARGS:-}"

QUERY="$ROOT_ABS/.desloppify/query.json"
SUBAGENT_DIR="$ROOT_ABS/.desloppify/subagents"
PROMPTS_DIR="$SUBAGENT_DIR/prompts"
RESULTS_DIR="$SUBAGENT_DIR/results"
LOGS_DIR="$SUBAGENT_DIR/logs"
MERGED_JSON="$SUBAGENT_DIR/holistic_findings_subagents.json"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd jq
require_cmd codex
require_cmd desloppify

mkdir -p "$PROMPTS_DIR" "$RESULTS_DIR" "$LOGS_DIR"
rm -f "$PROMPTS_DIR"/batch-*.md "$RESULTS_DIR"/batch-*.raw.txt "$RESULTS_DIR"/batch-*.json "$LOGS_DIR"/batch-*.log

echo "[1/6] Preparing holistic review packet..."
(
  cd "$ROOT_ABS"
  # shellcheck disable=SC2086
  desloppify review --prepare --holistic --refresh $PREP_ARGS >/dev/null
)

batch_count="$(jq '.investigation_batches | length' "$QUERY")"
if [[ "$batch_count" -le 0 ]]; then
  echo "No investigation batches found in $QUERY" >&2
  exit 1
fi

echo "[2/6] Building $batch_count batch prompts..."
for ((i=0; i<batch_count; i++)); do
  n=$((i + 1))
  name="$(jq -r ".investigation_batches[$i].name" "$QUERY")"
  dims="$(jq -r ".investigation_batches[$i].dimensions | join(\",\")" "$QUERY")"
  why="$(jq -r ".investigation_batches[$i].why" "$QUERY")"
  files="$(jq -r ".investigation_batches[$i].files_to_read[]" "$QUERY" | sed 's/^/- /')"

  cat > "$PROMPTS_DIR/batch-${n}.md" <<EOF
You are a focused subagent reviewer for a single holistic batch.

Repository root: $ROOT_ABS
Input packet: .desloppify/query.json
Batch index: $n
Batch name: $name
Batch dimensions: $dims
Batch rationale: $why

Files assigned:
$files

Task requirements:
1. Read .desloppify/query.json and use the holistic review rules in system_prompt.
2. Evaluate ONLY the listed files and ONLY the listed dimensions for this batch.
3. Emit 0-5 high-quality cross-file findings for this batch (empty array allowed).
4. Every finding must include related_files with at least 2 files from this batch.
5. Do not edit repository files.
6. Return ONLY valid JSON with this shape:
{
  "batch": "$name",
  "assessments": {"<dimension>": <0-100>, ...},
  "findings": [ ... ]
}
EOF
done

echo "[3/6] Running subagents in parallel..."
pids=()
for ((n=1; n<=batch_count; n++)); do
  prompt_text="$(cat "$PROMPTS_DIR/batch-${n}.md"; printf '\n\nReturn ONLY valid JSON, no markdown fences.\n')"
  codex -a never -s workspace-write exec --ephemeral \
    -C "$ROOT_ABS" \
    -o "$RESULTS_DIR/batch-${n}.raw.txt" \
    "$prompt_text" >"$LOGS_DIR/batch-${n}.log" 2>&1 &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

echo "[4/6] Validating subagent JSON outputs..."
for ((n=1; n<=batch_count; n++)); do
  jq -e . "$RESULTS_DIR/batch-${n}.raw.txt" > "$RESULTS_DIR/batch-${n}.json"
done

echo "[5/6] Merging outputs..."
jq -s '
  {
    assessments: (
      [ .[] | (.assessments // {}) | to_entries[] ]
      | group_by(.key)
      | map({
          key: .[0].key,
          value: ((map(.value) | add) / (length) | (.*10 | round / 10))
        })
      | from_entries
    ),
    findings: (
      [ .[] | (.findings // [])[] ]
      | unique_by((.dimension // "") + "::" + (.identifier // ""))
    )
  }
' "$RESULTS_DIR"/batch-*.json > "$MERGED_JSON"

echo "[6/6] Importing merged findings..."
(
  cd "$ROOT_ABS"
  desloppify review --import ".desloppify/subagents/holistic_findings_subagents.json" --holistic
)

if [[ "$RUN_SCAN" == "1" ]]; then
  echo "[7/7] Running scan on $SCAN_PATH..."
  (
    cd "$ROOT_ABS"
    desloppify scan --path "$SCAN_PATH"
  )
fi

echo "Done."
echo "Merged findings: $MERGED_JSON"
