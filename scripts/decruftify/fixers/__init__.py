"""Auto-fixers for mechanical cleanup tasks.

Re-exports all fix functions so callers can do:
    from .fixers import fix_unused_imports, fix_debug_logs, ...
"""

from .logs import fix_debug_logs
from .imports import fix_unused_imports
from .exports import fix_dead_exports
from .vars import fix_unused_vars
from .params import fix_unused_params
from .useeffect import fix_dead_useeffect
from .if_chain import fix_empty_if_chain

__all__ = [
    "fix_debug_logs",
    "fix_unused_imports",
    "fix_dead_exports",
    "fix_unused_vars",
    "fix_unused_params",
    "fix_dead_useeffect",
    "fix_empty_if_chain",
]
