"""Code smell detection: patterns that indicate problems beyond simple cruft."""

import json
import re
import subprocess
from pathlib import Path

from ..utils import PROJECT_ROOT, c, log, print_table, rel, grep


SMELL_CHECKS = [
    {
        "id": "empty_catch",
        "label": "Empty catch blocks",
        "pattern": r"catch\s*\([^)]*\)\s*\{\s*\}",
        "severity": "high",
    },
    {
        "id": "any_type",
        "label": "Explicit `any` types",
        "pattern": r":\s*any\b",
        "severity": "medium",
    },
    {
        "id": "ts_ignore",
        "label": "@ts-ignore / @ts-expect-error",
        "pattern": r"@ts-(?:ignore|expect-error)",
        "severity": "medium",
    },
    {
        "id": "non_null_assert",
        "label": "Non-null assertions (!.)",
        "pattern": r"\w+!\.",
        "severity": "low",
    },
    {
        "id": "hardcoded_color",
        "label": "Hardcoded color values",
        "pattern": r"""(?:color|background|border|fill|stroke)\s*[:=]\s*['"]#[0-9a-fA-F]{3,8}['"]""",
        "severity": "medium",
    },
    {
        "id": "hardcoded_rgb",
        "label": "Hardcoded rgb/rgba",
        "pattern": r"rgba?\(\s*\d+",
        "severity": "medium",
    },
    {
        "id": "async_no_await",
        "label": "Async functions without await",
        # Detected separately — needs multi-line analysis
        "pattern": None,
        "severity": "medium",
    },
    {
        "id": "magic_number",
        "label": "Magic numbers (>100 in logic)",
        "pattern": r"(?:===?|!==?|>=?|<=?|[+\-*/])\s*\d{3,}",
        "severity": "low",
    },
    {
        "id": "console_error_no_throw",
        "label": "console.error without throw/return",
        # Detected separately
        "pattern": None,
        "severity": "medium",
    },
    {
        "id": "empty_if_chain",
        "label": "Empty if/else chains",
        # Detected separately — multi-line analysis
        "pattern": None,
        "severity": "high",
    },
    {
        "id": "dead_useeffect",
        "label": "useEffect with empty body",
        # Detected separately — multi-line analysis
        "pattern": None,
        "severity": "high",
    },
]


def detect_smells(path: Path) -> list[dict]:
    """Detect code smell patterns across the codebase."""
    result = subprocess.run(
        ["find", str(path), "-name", "*.ts", "-o", "-name", "*.tsx"],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )

    smell_counts: dict[str, list[dict]] = {s["id"]: [] for s in SMELL_CHECKS}

    for filepath in result.stdout.strip().splitlines():
        if not filepath or "node_modules" in filepath or ".d.ts" in filepath:
            continue
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
        except Exception:
            continue

        # Regex-based smells
        for check in SMELL_CHECKS:
            if check["pattern"] is None:
                continue
            for i, line in enumerate(lines):
                if re.search(check["pattern"], line):
                    smell_counts[check["id"]].append({
                        "file": filepath,
                        "line": i + 1,
                        "content": line.strip()[:100],
                    })

        # Async without await detection
        _detect_async_no_await(filepath, content, lines, smell_counts)

        # Console.error without throw/return
        _detect_error_no_throw(filepath, lines, smell_counts)

        # Empty if/else chains (fixer artifact)
        _detect_empty_if_chains(filepath, lines, smell_counts)

        # useEffect with empty body (fixer artifact)
        _detect_dead_useeffects(filepath, lines, smell_counts)

    # Build summary entries sorted by severity then count
    severity_order = {"high": 0, "medium": 1, "low": 2}
    entries = []
    for check in SMELL_CHECKS:
        matches = smell_counts[check["id"]]
        if matches:
            entries.append({
                "id": check["id"],
                "label": check["label"],
                "severity": check["severity"],
                "count": len(matches),
                "files": len(set(m["file"] for m in matches)),
                "matches": matches[:50],  # Cap for JSON output
            })
    entries.sort(key=lambda e: (severity_order.get(e["severity"], 9), -e["count"]))
    return entries


def _detect_async_no_await(filepath: str, content: str, lines: list[str],
                           smell_counts: dict[str, list[dict]]):
    """Find async functions that don't use await."""
    # Simple heuristic: find `async function` or `async (` and check the body
    async_re = re.compile(r"(?:async\s+function\s+(\w+)|(\w+)\s*=\s*async)")
    for i, line in enumerate(lines):
        m = async_re.search(line)
        if not m:
            continue
        name = m.group(1) or m.group(2)
        # Scan the function body for `await`
        brace_depth = 0
        found_open = False
        has_await = False
        for j in range(i, min(i + 200, len(lines))):
            body_line = lines[j]
            for ch in body_line:
                if ch == '{':
                    brace_depth += 1
                    found_open = True
                elif ch == '}':
                    brace_depth -= 1
            if "await " in body_line or "await\n" in body_line:
                has_await = True
            if found_open and brace_depth <= 0:
                break

        if found_open and not has_await:
            smell_counts["async_no_await"].append({
                "file": filepath,
                "line": i + 1,
                "content": f"async {name or '(anonymous)'} has no await",
            })


def _detect_error_no_throw(filepath: str, lines: list[str],
                           smell_counts: dict[str, list[dict]]):
    """Find console.error calls not followed by throw or return."""
    for i, line in enumerate(lines):
        if "console.error" in line:
            # Check next 3 lines for throw/return
            following = "\n".join(lines[i+1:i+4])
            if not re.search(r"\b(?:throw|return)\b", following):
                smell_counts["console_error_no_throw"].append({
                    "file": filepath,
                    "line": i + 1,
                    "content": line.strip()[:100],
                })


def _detect_empty_if_chains(filepath: str, lines: list[str],
                            smell_counts: dict[str, list[dict]]):
    """Find if/else chains where all branches are empty."""
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        # Look for if (...) { on one line or if (...) { } on one line
        if not re.match(r"(?:else\s+)?if\s*\(", stripped):
            i += 1
            continue

        # Check single-line: if (...) { }
        if re.match(r"(?:else\s+)?if\s*\([^)]*\)\s*\{\s*\}\s*$", stripped):
            # Single-line empty if — check if followed by else
            chain_start = i
            chain_all_empty = True
            j = i + 1
            # Walk through any else-if / else continuations
            while j < len(lines):
                next_stripped = lines[j].strip()
                if re.match(r"else\s+if\s*\([^)]*\)\s*\{\s*\}\s*$", next_stripped):
                    j += 1
                    continue
                if re.match(r"(?:\}\s*)?else\s*\{\s*\}\s*$", next_stripped):
                    j += 1
                    continue
                break
            if j > i + 1 or chain_all_empty:
                smell_counts["empty_if_chain"].append({
                    "file": filepath,
                    "line": chain_start + 1,
                    "content": stripped[:100],
                })
            i = j
            continue

        # Multi-line: if (...) { followed by } on next non-blank line
        if re.match(r"(?:else\s+)?if\s*\([^)]*\)\s*\{\s*$", stripped):
            chain_start = i
            chain_all_empty = True
            j = i
            while j < len(lines):
                cur = lines[j].strip()
                # Expect an if or else-if opening
                if j == chain_start:
                    if not re.match(r"(?:else\s+)?if\s*\([^)]*\)\s*\{\s*$", cur):
                        chain_all_empty = False
                        break
                elif re.match(r"\}\s*else\s+if\s*\([^)]*\)\s*\{\s*$", cur):
                    pass  # } else if (...) { — continue checking
                elif re.match(r"\}\s*else\s*\{\s*$", cur):
                    pass  # } else { — continue checking
                elif cur == "}":
                    # Could be end of an empty block — peek ahead for else
                    k = j + 1
                    while k < len(lines) and lines[k].strip() == "":
                        k += 1
                    if k < len(lines) and re.match(r"else\s", lines[k].strip()):
                        j = k
                        continue
                    # End of chain
                    j += 1
                    break
                elif cur == "":
                    j += 1
                    continue
                else:
                    # Non-empty content inside a block — chain is not all-empty
                    chain_all_empty = False
                    break
                j += 1

            if chain_all_empty and j > chain_start + 1:
                smell_counts["empty_if_chain"].append({
                    "file": filepath,
                    "line": chain_start + 1,
                    "content": lines[chain_start].strip()[:100],
                })
            i = max(i + 1, j)
            continue

        i += 1


def _detect_dead_useeffects(filepath: str, lines: list[str],
                            smell_counts: dict[str, list[dict]]):
    """Find useEffect calls with empty or whitespace/comment-only bodies."""
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not re.match(r"(?:React\.)?useEffect\s*\(\s*\(\s*\)\s*=>\s*\{", stripped):
            continue

        # Find the extent of the useEffect call by tracking parens
        paren_depth = 0
        brace_depth = 0
        end = None
        for j in range(i, min(i + 30, len(lines))):
            in_str = None
            prev_ch = ""
            for ch in lines[j]:
                if in_str:
                    if ch == in_str and prev_ch != "\\":
                        in_str = None
                    prev_ch = ch
                    continue
                if ch in "'\"`":
                    in_str = ch
                elif ch == "(":
                    paren_depth += 1
                elif ch == ")":
                    paren_depth -= 1
                    if paren_depth <= 0:
                        end = j
                        break
                elif ch == "{":
                    brace_depth += 1
                elif ch == "}":
                    brace_depth -= 1
                prev_ch = ch
            if end is not None:
                break

        if end is None:
            continue

        # Extract the callback body (between first { after => and matching })
        # Use \n join since splitlines() strips newlines — needed for // comment stripping
        text = "\n".join(lines[i:end + 1])
        arrow_pos = text.find("=>")
        if arrow_pos == -1:
            continue
        brace_pos = text.find("{", arrow_pos)
        if brace_pos == -1:
            continue

        # Find matching closing brace
        depth = 0
        body_end = None
        in_str = None
        prev_ch = ""
        for ci in range(brace_pos, len(text)):
            ch = text[ci]
            if in_str:
                if ch == in_str and prev_ch != "\\":
                    in_str = None
                prev_ch = ch
                continue
            if ch in "'\"`":
                in_str = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    body_end = ci
                    break
            prev_ch = ch

        if body_end is None:
            continue

        body = text[brace_pos + 1:body_end]
        # Check if body is empty or only whitespace/comments
        body_stripped = re.sub(r"//[^\n]*", "", body)  # strip line comments
        body_stripped = re.sub(r"/\*.*?\*/", "", body_stripped, flags=re.DOTALL)  # strip block comments
        if body_stripped.strip() == "":
            smell_counts["dead_useeffect"].append({
                "file": filepath,
                "line": i + 1,
                "content": stripped[:100],
            })


def cmd_smells(args):
    entries = detect_smells(Path(args.path))
    if args.json:
        print(json.dumps({"entries": entries}, indent=2))
        return

    if not entries:
        print(c("No code smells detected.", "green"))
        return

    total = sum(e["count"] for e in entries)
    print(c(f"\nCode smells: {total} instances across {len(entries)} patterns\n", "bold"))

    rows = []
    for e in entries[:args.top]:
        sev_color = {"high": "red", "medium": "yellow", "low": "dim"}.get(e["severity"], "dim")
        rows.append([
            c(e["severity"].upper(), sev_color),
            e["label"],
            str(e["count"]),
            str(e["files"]),
        ])
    print_table(["Sev", "Pattern", "Count", "Files"], rows, [8, 40, 6, 6])

    # Show top instances for high-severity smells
    high = [e for e in entries if e["severity"] == "high"]
    for e in high:
        print(c(f"\n  {e['label']} ({e['count']} instances):", "red"))
        for m in e["matches"][:10]:
            print(f"    {rel(m['file'])}:{m['line']}  {m['content'][:60]}")
