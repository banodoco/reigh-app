"""Passthrough/forwarding detection: components/functions that mostly forward params."""

import json
import re
from pathlib import Path
from typing import Callable

from ..utils import PROJECT_ROOT, c, find_source_files, find_tsx_files, print_table, rel


# ── Shared core ──────────────────────────────────────────────


def _classify_params(
    params: list[str],
    body: str,
    make_pattern: Callable[[str], str],
    occurrences_per_match: int = 2,
) -> tuple[list[str], list[str]]:
    """Classify params as passthrough vs direct-use.

    For each param, count total word-boundary occurrences vs passthrough
    pattern matches. If ALL occurrences are accounted for by passthrough
    patterns, it's passthrough.

    Args:
        params: Parameter names to classify.
        body: Function/component body text.
        make_pattern: Returns a regex that matches passthrough usage of a param name.
        occurrences_per_match: How many \bname\b occurrences each passthrough match accounts for.

    Returns:
        (passthrough_params, direct_params)
    """
    passthrough = []
    direct = []
    for name in params:
        total = len(re.findall(rf"\b{re.escape(name)}\b", body))
        if total == 0:
            # Unused param — not passthrough, not direct-use either.
            # Count as direct (it's destructured, just unused).
            direct.append(name)
            continue
        pt_matches = len(re.findall(make_pattern(name), body))
        pt_occurrences = pt_matches * occurrences_per_match
        if pt_occurrences >= total:
            passthrough.append(name)
        else:
            direct.append(name)
    return passthrough, direct


# ── TSX: React component passthrough detection ───────────────


# Match component declarations with destructured props
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


def _extract_props(destructured: str) -> list[str]:
    """Extract prop names from a destructuring pattern.

    Handles: simple names, defaults (p = val), aliases (p: alias → use alias),
    rest (...rest → use rest).
    """
    props = []
    # Remove nested destructuring and type annotations for simpler parsing
    # Strip inline type annotations like `: string`, `: number`, etc.
    cleaned = re.sub(r":\s*(?:React\.\w+(?:<[^>]*>)?|\w+(?:<[^>]*>)?(?:\[\])?)", "", destructured)
    for token in cleaned.split(","):
        token = token.strip()
        if not token:
            continue
        # Rest spread: ...rest
        if token.startswith("..."):
            props.append(token[3:].strip())
            continue
        # Alias: original: alias (after type stripping)
        if ":" in token:
            _, alias = token.split(":", 1)
            alias = alias.split("=")[0].strip()
            if alias and alias.isidentifier():
                props.append(alias)
            continue
        # Default: name = value
        name = token.split("=")[0].strip()
        if name and name.isidentifier():
            props.append(name)
    return props


def _tsx_passthrough_pattern(name: str) -> str:
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
                props = _extract_props(destructured)

                if len(props) < 4:
                    continue

                # Get the component body (from end of match to end of file,
                # or a reasonable window)
                body_start = m.end()
                body = content[body_start:]

                pt, direct = _classify_params(props, body, _tsx_passthrough_pattern)

                if len(pt) < 4:
                    continue

                ratio = len(pt) / len(props)

                # Thresholds
                if len(pt) >= 20 or ratio >= 0.8:
                    tier, confidence = 4, "high"
                elif len(pt) >= 8 and ratio >= 0.5:
                    tier = 3
                    confidence = "high" if ratio >= 0.7 else "medium"
                else:
                    continue

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


# ── Python: function passthrough detection ────────────────────


_PY_FUNC_PATTERN = re.compile(
    r"^def\s+(\w+)\s*\(([^)]*)\)\s*(?:->.*?)?:",
    re.MULTILINE | re.DOTALL,
)


def _extract_py_params(param_str: str) -> list[str]:
    """Extract parameter names from a Python function signature.

    Handles: simple names, defaults (p=val), type annotations (p: int),
    *args, **kwargs.
    """
    params = []
    # Normalize multiline
    param_str = " ".join(param_str.split())
    for token in param_str.split(","):
        token = token.strip()
        if not token or token == "self" or token == "cls":
            continue
        # Strip * prefix for *args, **kwargs
        clean = token.lstrip("*")
        # Strip type annotation
        name = clean.split(":")[0].split("=")[0].strip()
        if name and name.isidentifier():
            params.append(name)
    return params


def _py_passthrough_pattern(name: str) -> str:
    """Match same-name keyword arg: param=param in a function call."""
    escaped = re.escape(name)
    return rf"\b{escaped}\s*=\s*{escaped}\b"


def detect_passthrough_functions(path: Path) -> list[dict]:
    """Detect Python functions where most params are same-name forwarded."""
    entries = []

    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
        except (OSError, UnicodeDecodeError):
            continue

        for m in _PY_FUNC_PATTERN.finditer(content):
            name = m.group(1)
            param_str = m.group(2)
            params = _extract_py_params(param_str)

            if len(params) < 4:
                continue

            # Get function body: from end of def line to next unindented line
            body_start = m.end()
            # Find the end of the function (next line at indent 0 or EOF)
            rest = content[body_start:]
            body_end = len(rest)
            for bm in re.finditer(r"\n(?=[^\s\n#])", rest):
                body_end = bm.start()
                break
            body = rest[:body_end]

            # Also check for **kwargs spread
            has_kwargs_spread = bool(re.search(r"\*\*kwargs\b", body))

            pt, direct = _classify_params(
                params, body, _py_passthrough_pattern,
                occurrences_per_match=2,
            )

            if len(pt) < 4 and not has_kwargs_spread:
                continue

            ratio = len(pt) / len(params)

            # Thresholds
            if len(pt) >= 20 or ratio >= 0.8:
                tier, confidence = 4, "high"
            elif len(pt) >= 8 and ratio >= 0.5:
                tier = 3
                confidence = "high" if ratio >= 0.7 else "medium"
            elif has_kwargs_spread and len(pt) >= 4:
                tier, confidence = 3, "medium"
            else:
                continue

            line = content[:m.start()].count("\n") + 1
            entries.append({
                "file": filepath,
                "function": name,
                "total_params": len(params),
                "passthrough": len(pt),
                "direct": len(direct),
                "ratio": round(ratio, 2),
                "line": line,
                "tier": tier,
                "confidence": confidence,
                "passthrough_params": sorted(pt),
                "direct_params": sorted(direct),
                "has_kwargs_spread": has_kwargs_spread,
            })

    return sorted(entries, key=lambda e: (-e["passthrough"], -e["ratio"]))


# ── CLI handler ──────────────────────────────────────────────


def cmd_passthrough(args):
    lang = getattr(args, "lang", None)
    if lang == "python":
        entries = detect_passthrough_functions(Path(args.path))
        name_key, total_key = "function", "total_params"
    else:
        entries = detect_passthrough_components(Path(args.path))
        name_key, total_key = "component", "total_props"

    if args.json:
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No passthrough components/functions found.", "green"))
        return

    label = "functions" if lang == "python" else "components"
    print(c(f"\nPassthrough {label}: {len(entries)}\n", "bold"))
    rows = []
    for e in entries[:args.top]:
        rows.append([
            e[name_key],
            rel(e["file"]),
            f"{e['passthrough']}/{e[total_key]}",
            f"{e['ratio']:.0%}",
            f"T{e['tier']}",
            str(e["line"]),
        ])
    print_table(
        ["Name", "File", "PT/Total", "Ratio", "Tier", "Line"],
        rows,
        [30, 55, 10, 7, 5, 6],
    )
