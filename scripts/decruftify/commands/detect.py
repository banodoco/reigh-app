"""detect command: run a single detector directly (bypass state tracking)."""

import sys

from ..utils import c


def cmd_detect(args):
    """Run a single detector directly (bypass state tracking)."""
    detector = args.detector

    # Route through language config if --lang is passed
    from ..cli import _resolve_lang
    lang = _resolve_lang(args)

    if lang:
        # Validate detector name against language's list
        if lang.detector_names and detector not in lang.detector_names:
            print(c(f"Unknown detector for {lang.name}: {detector}", "red"))
            print(f"  Available: {', '.join(sorted(lang.detector_names))}")
            sys.exit(1)
        # Check for language-specific command override
        if hasattr(lang, 'detect_commands') and detector in lang.detect_commands:
            lang.detect_commands[detector](args)
            return

    # Fall through to generic (TypeScript) detector dispatch
    from importlib import import_module
    _det = lambda mod, fn: lambda: getattr(import_module(f"scripts.decruftify.detectors.{mod}"), fn)
    detector_cmds = {
        "logs":       _det("logs", "cmd_logs"),
        "unused":     _det("unused", "cmd_unused"),
        "exports":    _det("exports", "cmd_exports"),
        "deprecated": _det("deprecated", "cmd_deprecated"),
        "large":      _det("large", "cmd_large"),
        "complexity": _det("complexity", "cmd_complexity"),
        "gods":       _det("gods", "cmd_god_components"),
        "single-use": _det("single_use", "cmd_single_use"),
        "props":      _det("props", "cmd_props"),
        "concerns":   _det("concerns", "cmd_concerns"),
        "deps":       _det("deps", "cmd_deps"),
        "dupes":      _det("dupes", "cmd_dupes"),
        "smells":     _det("smells", "cmd_smells"),
        "coupling":   _det("coupling", "cmd_coupling"),
        "patterns":   _det("patterns", "cmd_patterns"),
        "naming":     _det("naming", "cmd_naming"),
        "cycles":     _det("deps", "cmd_cycles"),
        "orphaned":   _det("orphaned", "cmd_orphaned"),
        "react":      _det("react", "cmd_react"),
        "passthrough": _det("passthrough", "cmd_passthrough"),
    }

    if detector not in detector_cmds:
        print(c(f"Unknown detector: {detector}", "red"))
        print(f"  Available: {', '.join(sorted(detector_cmds))}")
        sys.exit(1)

    if args.threshold is None:
        if detector == "large":
            args.threshold = 500
        elif detector == "dupes":
            args.threshold = 0.8

    cmd_fn = detector_cmds[detector]()
    cmd_fn(args)
