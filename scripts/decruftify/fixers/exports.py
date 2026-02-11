"""Dead exports fixer: removes `export` keyword from declarations with zero external importers."""

import re

from .common import apply_fixer


# Matches: export [declare] (const|let|function|class|type|interface|enum) name
_EXPORT_DECL_RE = re.compile(
    r"^(\s*)export\s+(declare\s+)?"
    r"((?:const|let|var|function|async\s+function|class|abstract\s+class|type|interface|enum)\s)"
)


def fix_dead_exports(entries: list[dict], *, dry_run: bool = False) -> list[dict]:
    """Remove `export` keyword from declarations with zero external importers.

    Args:
        entries: [{file, line, name}, ...] from detect_dead_exports().
        dry_run: If True, don't write files.

    Returns:
        List of {file, removed: [str], lines_removed: int} dicts.
    """
    def transform(lines, file_entries):
        target_lines = {e["line"] for e in file_entries}  # 1-indexed
        removed_names = []

        for line_idx in range(len(lines)):
            lineno = line_idx + 1
            if lineno not in target_lines:
                continue

            line = lines[line_idx]
            m = _EXPORT_DECL_RE.match(line)
            if m:
                indent = m.group(1)
                declare = m.group(2) or ""
                decl_keyword = m.group(3)
                rest = line[m.end():]
                lines[line_idx] = f"{indent}{declare}{decl_keyword}{rest}"
                name = next((e["name"] for e in file_entries if e["line"] == lineno), "?")
                removed_names.append(name)
                continue

            # Handle: export { name1, name2 }
            stripped = line.strip()
            if stripped.startswith("export {"):
                names_in_entry = {e["name"] for e in file_entries if e["line"] == lineno}
                brace_content = re.search(r"\{([^}]*)\}", stripped)
                if brace_content:
                    all_names = [n.strip() for n in brace_content.group(1).split(",") if n.strip()]
                    remaining = [n for n in all_names if n.split(" as ")[0].strip() not in names_in_entry]
                    if not remaining:
                        lines[line_idx] = ""
                    else:
                        indent_str = line[:len(line) - len(line.lstrip())]
                        from_clause = ""
                        from_match = re.search(r"from\s+['\"].*?['\"];?\s*$", stripped)
                        if from_match:
                            from_clause = " " + from_match.group(0).rstrip()
                            if not from_clause.rstrip().endswith(";"):
                                from_clause += ";"
                        else:
                            from_clause = ";"
                        lines[line_idx] = f"{indent_str}export {{ {', '.join(remaining)} }}{from_clause}\n"
                    removed_names.extend(names_in_entry)

        return lines, removed_names

    results = apply_fixer(entries, transform, dry_run=dry_run)
    # Dead exports don't remove lines, just the keyword
    for r in results:
        r["lines_removed"] = 0
    return results
