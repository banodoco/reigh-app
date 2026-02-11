"""Shared data types for language-agnostic detectors."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class FunctionInfo:
    """Extracted function/method info for cross-language analysis."""
    name: str
    file: str
    line: int
    end_line: int
    loc: int
    body: str
    normalized: str = ""
    body_hash: str = ""
    params: list[str] = field(default_factory=list)


@dataclass
class ClassInfo:
    """Extracted class/component info for cross-language analysis.

    For OOP classes: methods/attributes/base_classes are populated directly.
    For React components: metrics holds hook counts (context_hooks, use_effects, etc.).
    """
    name: str
    file: str
    line: int
    loc: int
    methods: list[FunctionInfo] = field(default_factory=list)
    attributes: list[str] = field(default_factory=list)
    base_classes: list[str] = field(default_factory=list)
    metrics: dict[str, int] = field(default_factory=dict)


@dataclass
class ComplexitySignal:
    """A complexity signal to detect in source files.

    Either pattern-based (regex matched per line, counted) or compute-based
    (custom function that analyzes content and returns count + label).
    """
    name: str
    pattern: str | None = None       # regex (None = uses compute fn)
    weight: int = 1
    threshold: int = 0
    compute: Callable | None = None  # (content, lines) -> (count, label) | None


@dataclass
class GodRule:
    """A rule for detecting god classes/components.

    The extract callable pulls a metric from ClassInfo; if it meets the threshold,
    the rule fires and contributes to the "reasons" list.
    """
    name: str
    description: str
    extract: Callable  # (ClassInfo) -> int
    threshold: int


@dataclass
class SmellRule:
    """A code smell pattern to detect.

    Pattern-based smells use regex; None pattern means multi-line analysis
    handled by language-specific helpers.
    """
    id: str
    label: str
    pattern: str | None = None
    severity: str = "medium"
