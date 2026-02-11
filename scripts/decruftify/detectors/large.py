"""Large file detection (LOC threshold)."""

from pathlib import Path

from ..utils import PROJECT_ROOT


def detect_large_files(path: Path, file_finder, threshold: int = 500) -> list[dict]:
    """Find files exceeding a line count threshold.

    Args:
        file_finder: callable(path) -> list[str]. Required.
        threshold: LOC threshold.
    """
    entries = []
    for filepath in file_finder(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            loc = len(p.read_text().splitlines())
            if loc > threshold:
                entries.append({"file": filepath, "loc": loc})
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(entries, key=lambda e: -e["loc"])
