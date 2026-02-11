"""Language registry: auto-detection and lookup."""

from pathlib import Path
from .base import LangConfig

_registry: dict[str, type] = {}


def register_lang(name: str):
    """Decorator to register a language config module."""
    def decorator(cls):
        _registry[name] = cls
        return cls
    return decorator


def get_lang(name: str) -> LangConfig:
    """Get a language config by name."""
    if name not in _registry:
        # Lazy-load language modules to populate registry
        _load_all()
    if name not in _registry:
        available = ", ".join(sorted(_registry.keys()))
        raise ValueError(f"Unknown language: {name!r}. Available: {available}")
    return _registry[name]()


def auto_detect_lang(project_root: Path) -> str | None:
    """Auto-detect language from project files."""
    if (project_root / "package.json").exists():
        return "typescript"
    if ((project_root / "pyproject.toml").exists()
            or (project_root / "setup.py").exists()
            or (project_root / "setup.cfg").exists()):
        return "python"
    if (project_root / "go.mod").exists():
        return "go"
    return None


def available_langs() -> list[str]:
    """Return list of registered language names."""
    _load_all()
    return sorted(_registry.keys())


def _load_all():
    """Import all language modules to trigger registration."""
    import importlib
    lang_dir = Path(__file__).parent
    # Discover .py modules (e.g. lang/rust.py)
    for f in sorted(lang_dir.glob("*.py")):
        if f.name in ("__init__.py", "base.py"):
            continue
        module_name = f.stem
        try:
            importlib.import_module(f".{module_name}", __package__)
        except ImportError:
            pass
    # Discover packages (e.g. lang/typescript/)
    for d in sorted(lang_dir.iterdir()):
        if d.is_dir() and (d / "__init__.py").exists() and not d.name.startswith("_"):
            try:
                importlib.import_module(f".{d.name}", __package__)
            except ImportError:
                pass
