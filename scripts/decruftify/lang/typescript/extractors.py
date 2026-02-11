"""TypeScript/React extraction: function bodies, component hook metrics, prop patterns."""

import hashlib
import re
from pathlib import Path

from ...detectors.base import ClassInfo, FunctionInfo
from ...detectors.passthrough import _classify_params, classify_passthrough_tier
from ...utils import PROJECT_ROOT, find_tsx_files


def extract_ts_functions(filepath: str) -> list[FunctionInfo]:
    """Extract function/component bodies from a TS/TSX file.

    Uses brace-tracking to determine function boundaries.
    Returns FunctionInfo with normalized body and hash for comparison.
    """
    p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
    try:
        content = p.read_text()
    except (OSError, UnicodeDecodeError):
        return []

    lines = content.splitlines()
    functions = []

    # Match: export function X, const X = (...) =>, const X = function
    fn_re = re.compile(
        r"^(?:export\s+)?(?:"
        r"(?:function\s+(\w+))|"
        r"(?:const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:\([^)]*\)|[^=])*=>)|"
        r"(?:const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*function)"
        r")"
    )

    i = 0
    while i < len(lines):
        line = lines[i]
        m = fn_re.match(line.strip())
        if m:
            name = m.group(1) or m.group(2) or m.group(3)
            if not name:
                i += 1
                continue

            # Find the function body by tracking braces
            start_line = i
            brace_depth = 0
            found_open = False
            j = i
            while j < len(lines):
                for ch in lines[j]:
                    if ch == '{':
                        brace_depth += 1
                        found_open = True
                    elif ch == '}':
                        brace_depth -= 1
                if found_open and brace_depth <= 0:
                    break
                j += 1

            if found_open and j > start_line:
                body_lines = lines[start_line:j + 1]
                body = "\n".join(body_lines)
                normalized = normalize_ts_body(body)
                if len(normalized.splitlines()) >= 3:
                    functions.append(FunctionInfo(
                        name=name,
                        file=filepath,
                        line=start_line + 1,
                        end_line=j + 1,
                        loc=j - start_line + 1,
                        body=body,
                        normalized=normalized,
                        body_hash=hashlib.md5(normalized.encode()).hexdigest(),
                    ))
                i = j + 1
                continue
        i += 1

    return functions


def normalize_ts_body(body: str) -> str:
    """Normalize a TS/TSX function body for comparison.

    Strips comments, whitespace, console.log statements.
    """
    lines = body.splitlines()
    normalized = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            continue
        if "console." in stripped:
            continue
        normalized.append(stripped)
    return "\n".join(normalized)


def extract_ts_components(path: Path) -> list[ClassInfo]:
    """Extract React component metrics (hook counts) from TSX files.

    Each component file is represented as a ClassInfo with hook counts in metrics.
    Only files with >=100 LOC are included (smaller files rarely have god problems).
    """
    results = []
    for filepath in find_tsx_files(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
            loc = len(lines)
            if loc < 100:
                continue

            context_hooks = len(re.findall(r"use\w+Context\s*\(", content))
            use_effects = len(re.findall(r"useEffect\s*\(", content))
            use_states = len(re.findall(r"useState\s*[<(]", content))
            use_refs = len(re.findall(r"useRef\s*[<(]", content))
            custom_hooks = len(re.findall(r"use[A-Z]\w+\s*\(", content))

            results.append(ClassInfo(
                name=Path(filepath).stem,
                file=filepath,
                line=1,
                loc=loc,
                metrics={
                    "context_hooks": context_hooks,
                    "use_effects": use_effects,
                    "use_states": use_states,
                    "use_refs": use_refs,
                    "custom_hooks": custom_hooks,
                    "hook_total": context_hooks + use_effects + use_states + use_refs,
                },
            ))
        except (OSError, UnicodeDecodeError):
            continue
    return results


_COMPONENT_PATTERNS = [
    # const Foo: React.FC<Props> = ({ p1, p2 }) =>
    # const Foo = ({ p1, p2 }: Props) =>
    re.compile(
        r"(?:export\s+)?(?:const|let)\s+(\w+)"
        r"(?:\s*:\s*React\.FC\w*<[^>]*>)?"
        r"\s*=\s*\(\s*\{([^}]*)\}",
        re.DOTALL,
    ),
    # function Foo({ p1, p2 }: Props) {
    re.compile(
        r"(?:export\s+)?function\s+(\w+)\s*\(\s*\{([^}]*)\}",
        re.DOTALL,
    ),
]


def extract_props(destructured: str) -> list[str]:
    """Extract prop names from a destructuring pattern.

    Handles: simple names, defaults (p = val), aliases (p: alias -> use alias),
    rest (...rest -> use rest).
    """
    props = []
    cleaned = re.sub(r":\s*(?:React\.\w+(?:<[^>]*>)?|\w+(?:<[^>]*>)?(?:\[\])?)", "", destructured)
    for token in cleaned.split(","):
        token = token.strip()
        if not token:
            continue
        if token.startswith("..."):
            props.append(token[3:].strip())
            continue
        if ":" in token:
            _, alias = token.split(":", 1)
            alias = alias.split("=")[0].strip()
            if alias and alias.isidentifier():
                props.append(alias)
            continue
        name = token.split("=")[0].strip()
        if name and name.isidentifier():
            props.append(name)
    return props


def tsx_passthrough_pattern(name: str) -> str:
    """Match JSX same-name attribute: propName={propName}."""
    escaped = re.escape(name)
    return rf"\b{escaped}\s*=\s*\{{\s*{escaped}\s*\}}"


def detect_passthrough_components(path: Path) -> list[dict]:
    """Detect React components where most props are same-name forwarded to children."""
    entries = []

    for filepath in find_tsx_files(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
        except (OSError, UnicodeDecodeError):
            continue

        for pattern in _COMPONENT_PATTERNS:
            for m in pattern.finditer(content):
                name = m.group(1)
                destructured = m.group(2)
                props = extract_props(destructured)

                if len(props) < 4:
                    continue

                body_start = m.end()
                body = content[body_start:]

                pt, direct = _classify_params(props, body, tsx_passthrough_pattern)

                if len(pt) < 4:
                    continue

                ratio = len(pt) / len(props)
                classification = classify_passthrough_tier(len(pt), ratio)
                if classification is None:
                    continue
                tier, confidence = classification

                line = content[:m.start()].count("\n") + 1
                entries.append({
                    "file": filepath,
                    "component": name,
                    "total_props": len(props),
                    "passthrough": len(pt),
                    "direct": len(direct),
                    "ratio": round(ratio, 2),
                    "line": line,
                    "tier": tier,
                    "confidence": confidence,
                    "passthrough_props": sorted(pt),
                    "direct_props": sorted(direct),
                })

    return sorted(entries, key=lambda e: (-e["passthrough"], -e["ratio"]))
