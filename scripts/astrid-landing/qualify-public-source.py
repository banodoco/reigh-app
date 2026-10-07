#!/usr/bin/env python3
"""Focused Gate 2/3 qualification for the derived Astrid public package."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import Any

import yaml

APP_ROOT = Path(__file__).resolve().parents[2]
LOCK_PATH = APP_ROOT / "config" / "astrid-public-source.lock.json"
PUBLIC_HOST = APP_ROOT / "src" / "pages" / "Home" / "astrid-public-host.tsx"
PUBLIC_SURFACE = APP_ROOT / "src" / "pages" / "Home" / "PublicAstridQualificationSurface.tsx"
MANAGED_VIDEO = APP_ROOT / "public" / "example-video.mp4"
PINNED_NODE = Path("/Users/hannahomalley/Documents/Codex/astrid/.otto/tools/node-v20.19.4/node-v20.19.4-darwin-arm64/bin/node")
ORIGINAL_V005 = Path("/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-landing-source-v1")
PUBLIC_PATCH = APP_ROOT / "scripts" / "astrid-landing" / "public-source.patch"
DEFAULT_IMPLEMENTATION_PATHS = frozenset({
    "astrid/core/element/catalog.py",
    "astrid/core/element/registry.py",
    "astrid/core/element/selected_profile.py",
    "astrid/packs/rendering/backends/remotion/run.py",
    "scripts/gen_effect_registry.py",
    "scripts/gen_element_catalog.py",
})
CATALOG_RELATIVE = Path("astrid/packs/rendering/elements/public-catalog.ts")
KINDS = {"effects": "effect", "animations": "animation", "transitions": "transition"}
RELATIVE_IMPORT = re.compile(r"(?:from\s+|import\s*)['\"](\.{1,2}/[^'\"]+)['\"]")
PUBLIC_IMPORT = re.compile(r"from\s+['\"]@astrid-public/([^'\"]+)['\"]")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_catalog(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    marker = "export const ASTRID_ELEMENT_CATALOG: readonly AstridRenderingElementDescriptor[] = Object.freeze(\n"
    start = text.index(marker) + len(marker)
    end = text.index("\n);", start)
    payload = json.loads(text[start:end])
    if not isinstance(payload, list):
        raise AssertionError("generated catalog payload is not a list")
    return payload


def resolve_relative_import(source: Path, specifier: str) -> Path:
    candidate = (source.parent / specifier).resolve()
    options = [candidate] if candidate.suffix else [
        candidate.with_suffix(".ts"),
        candidate.with_suffix(".tsx"),
        candidate.with_suffix(".js"),
        candidate.with_suffix(".jsx"),
        candidate / "index.ts",
        candidate / "index.tsx",
    ]
    for option in options:
        if option.is_file():
            return option
    raise AssertionError(f"unresolved relative import {specifier!r} from {source}")


def module_closure(roots: list[Path]) -> list[Path]:
    pending = list(roots)
    seen: set[Path] = set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        if not source.is_file():
            raise AssertionError(f"missing component module: {source}")
        seen.add(source)
        text = source.read_text(encoding="utf-8")
        for match in RELATIVE_IMPORT.finditer(text):
            dependency = resolve_relative_import(source, match.group(1))
            if dependency not in seen:
                pending.append(dependency)
    return sorted(seen)


def package_version(package_lock: dict[str, Any], name: str) -> str:
    package = package_lock.get("packages", {}).get(f"node_modules/{name}")
    if not isinstance(package, dict) or not isinstance(package.get("version"), str):
        raise AssertionError(f"missing locked package version for {name}")
    return package["version"]


def run_closure(package_root: Path) -> dict[str, Any]:
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    catalog_path = package_root / CATALOG_RELATIVE
    catalog = parse_catalog(catalog_path)
    expected = [
        (item["pack"], KINDS[item["kind"]], item["id"])
        for item in lock["selections"]
    ]
    actual = [(item["packId"], item["kind"], item["id"]) for item in catalog]
    if actual != expected or len(actual) != 12 or len(set(actual)) != 12:
        raise AssertionError(f"catalog selection mismatch: {actual!r}")

    components = [package_root / "astrid" / item["componentPath"] for item in catalog]
    closure = module_closure(components)
    relative_closure = [path.relative_to(package_root).as_posix() for path in closure]
    selected_local_prefixes = {
        "astrid/packs/local/elements/effects/end-spanning-layer/",
        "astrid/packs/local/elements/effects/frame-overlay/",
    }
    unexpected_local = [
        path for path in relative_closure
        if "astrid/packs/local/elements/effects/" in path
        and not any(path.startswith(prefix) for prefix in selected_local_prefixes)
    ]
    if unexpected_local:
        raise AssertionError(f"unselected local modules in public closure: {unexpected_local!r}")

    host_text = PUBLIC_HOST.read_text(encoding="utf-8")
    surface_text = PUBLIC_SURFACE.read_text(encoding="utf-8")
    if re.search(r"from\s+['\"]@astrid(?:/|['\"])", host_text + surface_text):
        raise AssertionError("public host graph imports the installed @astrid alias")
    if "import.meta.glob" in host_text or "sequences/registry" in host_text:
        raise AssertionError("public host uses an eager glob or installed sequence registry")
    public_imports = PUBLIC_IMPORT.findall(host_text)
    component_imports = [item for item in public_imports if item.endswith("/component.tsx")]
    if len(component_imports) != 12 or len(set(component_imports)) != 12:
        raise AssertionError(f"public host must import exactly 12 component modules: {component_imports!r}")

    asset_results = []
    for item in lock["asset_overlays"]:
        target = package_root / item["destination"]
        actual_hash = sha256(target)
        if actual_hash != item["sha256"]:
            raise AssertionError(f"asset hash mismatch: {item['destination']}")
        asset_results.append({
            "path": item["destination"],
            "bytes": target.stat().st_size,
            "sha256": actual_hash,
            "git_blob": item["git_blob"],
        })

    package_json = json.loads((APP_ROOT / "package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((APP_ROOT / "package-lock.json").read_text(encoding="utf-8"))
    versions = {
        "node_entrypoint": str(PINNED_NODE),
        "node": subprocess.run([str(PINNED_NODE), "--version"], check=True, capture_output=True, text=True).stdout.strip(),
        "react_declared": package_json["dependencies"]["react"],
        "react_locked": package_version(package_lock, "react"),
        "remotion_declared": package_json["dependencies"]["remotion"],
        "remotion_locked": package_version(package_lock, "remotion"),
        "remotion_media_declared": package_json["dependencies"]["@remotion/media"],
        "remotion_media_locked": package_version(package_lock, "@remotion/media"),
        "timeline_composition_declared": package_json["dependencies"]["@banodoco/timeline-composition"],
    }

    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration,size:stream=index,codec_name,codec_type,width,height,r_frame_rate",
            "-of", "json", str(MANAGED_VIDEO),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    managed_video = {
        "path": MANAGED_VIDEO.relative_to(APP_ROOT).as_posix(),
        "bytes": MANAGED_VIDEO.stat().st_size,
        "sha256": sha256(MANAGED_VIDEO),
        "ffprobe": json.loads(probe.stdout),
    }
    return {
        "status": "PASS",
        "catalog": {
            "path": CATALOG_RELATIVE.as_posix(),
            "sha256": sha256(catalog_path),
            "count": len(catalog),
            "keys": actual,
            "component_paths": [item["componentPath"] for item in catalog],
        },
        "module_graph": {
            "root_component_count": len(components),
            "transitive_files": relative_closure,
            "public_host_component_imports": component_imports,
            "unselected_local_modules": unexpected_local,
        },
        "assets": asset_results,
        "runtime_versions": versions,
        "managed_video_fixture": managed_video,
    }


def run_command(command: list[str], *, cwd: Path, env: dict[str, str]) -> dict[str, Any]:
    completed = subprocess.run(command, cwd=cwd, env=env, check=False, capture_output=True, text=True)
    return {
        "command": command,
        "cwd": str(cwd),
        "exit_code": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def controlled_default_generation(root: Path, python: str, label: str) -> dict[str, Any]:
    script = textwrap.dedent(
        """
        import hashlib
        import importlib.util
        import json
        import sys
        from pathlib import Path

        root = Path(sys.argv[1]).resolve()
        sys.path.insert(0, str(root))
        from astrid.core.element import catalog
        from astrid.core.element.schema import load_element_definition

        fixture = root / "tests/fixtures/local_effect_smoke/astrid/packs/local/elements/effects/fixture-smoke-effect"
        definition = load_element_definition(
            fixture,
            kind="effects",
            source="pack:local",
            editable=True,
            priority=30,
        )
        descriptor = catalog._element_descriptor(definition)
        generator_path = root / "scripts/gen_element_catalog.py"
        spec = importlib.util.spec_from_file_location("controlled_generator", generator_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules["controlled_generator"] = module
        spec.loader.exec_module(module)
        module.list_element_descriptors = lambda: (descriptor,)
        output = module.generate()
        print(json.dumps({
            "descriptor": [descriptor["packId"], descriptor["kind"], descriptor["id"]],
            "output_sha256": hashlib.sha256(output.encode("utf-8")).hexdigest(),
            "output_bytes": len(output.encode("utf-8")),
        }, sort_keys=True))
        """
    )
    result = run_command([python, "-c", script, str(root)], cwd=root, env=os.environ.copy())
    if result["exit_code"] != 0:
        raise AssertionError(f"controlled {label} default generation failed: {result['stderr']}")
    result["result"] = json.loads(result["stdout"])
    return result


def source_input_manifest(root: Path, *, exclude_implementation: bool) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix()
        if exclude_implementation and relative in DEFAULT_IMPLEMENTATION_PATHS:
            continue
        if "/__pycache__/" in f"/{relative}/" or relative.endswith((".pyc", ".pyo")):
            continue
        mode = stat.S_IMODE(path.lstat().st_mode)
        if path.is_symlink():
            entries.append({"path": relative, "type": "symlink", "mode": mode, "target": os.readlink(path)})
        elif path.is_file():
            entries.append({
                "path": relative,
                "type": "file",
                "mode": mode,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            })
    encoded = json.dumps(entries, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {"entries": entries, "sha256": hashlib.sha256(encoded).hexdigest()}


def normalize_process_text(value: str, roots: tuple[Path, ...]) -> str:
    normalized = value
    for root in sorted(roots, key=lambda item: len(str(item)), reverse=True):
        normalized = normalized.replace(str(root), "<fixture-root>")
    return normalized


def default_generation_observation(
    root: Path,
    python: str,
    env: dict[str, str],
    label: str,
    roots: tuple[Path, ...],
) -> dict[str, Any]:
    output = root / "v009-default-observed.ts"
    generate = run_command(
        [python, str(root / "scripts/gen_element_catalog.py"), str(output)],
        cwd=root,
        env=env,
    )
    check = run_command(
        [python, str(root / "scripts/gen_element_catalog.py"), "--check"],
        cwd=root,
        env=env,
    )
    descriptors = parse_catalog(output) if output.is_file() else []
    return {
        "label": label,
        "generate": generate,
        "check": check,
        "normalized": {
            "generate_stdout": normalize_process_text(generate["stdout"], roots),
            "generate_stderr": normalize_process_text(generate["stderr"], roots),
            "check_stdout": normalize_process_text(check["stdout"], roots),
            "check_stderr": normalize_process_text(check["stderr"], roots),
        },
        "output_exists": output.is_file(),
        "output_sha256": sha256(output) if output.is_file() else None,
        "output_bytes": output.stat().st_size if output.is_file() else None,
        "descriptor_identities": [
            [item["packId"], item["kind"], item["id"], item["revision"]]
            for item in descriptors
        ],
    }


def comparable_default_observation(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "generate_exit_code": value["generate"]["exit_code"],
        "check_exit_code": value["check"]["exit_code"],
        "normalized": value["normalized"],
        "output_exists": value["output_exists"],
        "output_sha256": value["output_sha256"],
        "output_bytes": value["output_bytes"],
        "descriptor_identities": value["descriptor_identities"],
    }


def run_canonical(package_root: Path, progress_path: Path | None = None) -> dict[str, Any]:
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    python = os.environ.get("ASTRID_PACKAGE_PYTHON", "/opt/homebrew/bin/python3.11")
    generator = package_root / "scripts" / "gen_element_catalog.py"
    catalog = package_root / CATALOG_RELATIVE
    commands = []
    generate_check = run_command(
        [python, str(generator), str(catalog), "--selection", str(package_root / "config" / LOCK_PATH.name), "--check"],
        cwd=package_root,
        env=env,
    )
    commands.append({"name": "selected-check", **generate_check})
    if generate_check["exit_code"] != 0:
        raise AssertionError(f"selected --check failed: {generate_check['stderr']}")

    sys.path.insert(0, str(package_root))
    try:
        selected_profile = load_module(
            package_root / "astrid/core/element/selected_profile.py",
            "v009_selected_profile_qualification",
        )
        context = selected_profile.load_selected_element_context({
            "id": "astrid-public-v1",
            "package_sha256": json.loads(
                package_root.with_name(f"{package_root.name}.profile-binding.json").read_text(encoding="utf-8")
            )["package_sha256"],
        })
    finally:
        sys.path.pop(0)
    if context is None or len(context.descriptors) != 12:
        raise AssertionError("selected profile did not admit exactly twelve descriptors")

    baseline = parse_catalog(catalog)
    baseline_revisions = {(item["kind"], item["id"]): item["revision"] for item in baseline}
    context_revisions = {(item["kind"], item["id"]): item["revision"] for item in context.descriptors}
    if context_revisions != baseline_revisions:
        raise AssertionError("selected context revisions differ from the generated catalog")

    frozen_before = {
        "package_sha256": context.package_sha256,
        "patch_sha256": sha256(PUBLIC_PATCH),
        "lock_sha256": sha256(LOCK_PATH),
    }
    expected_frozen = {
        "package_sha256": "5ed4e48254c864fb895f6758462f4299f9b699c5762b457ac61b2ede14413f06",
        "patch_sha256": "86a3f26e5b30362d96693eed2557300b8cc69ce680fdccd2fbe5279ea288626f",
        "lock_sha256": "79c5b1b83ea20b964e370f9388f9ba031c8c04a8acd2cfe8793fb040c8fea99b",
    }
    if frozen_before != expected_frozen:
        raise AssertionError(f"frozen P1 identity changed before replay: {frozen_before!r}")

    with tempfile.TemporaryDirectory(prefix="v009-default-equivalent-") as default_raw:
        default_root = Path(default_raw)
        baseline_root = default_root / "baseline"
        patched_root = default_root / "patched"
        ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo")
        shutil.copytree(ORIGINAL_V005, baseline_root, symlinks=True, ignore=ignore)
        shutil.copytree(ORIGINAL_V005, patched_root, symlinks=True, ignore=ignore)
        baseline_seed = source_input_manifest(baseline_root, exclude_implementation=False)
        patched_seed = source_input_manifest(patched_root, exclude_implementation=False)
        if baseline_seed != patched_seed:
            raise AssertionError("equivalent default fixtures differ before applying the frozen patch")
        apply_patch = run_command(
            ["patch", "-p1", "-i", str(PUBLIC_PATCH)],
            cwd=patched_root,
            env=env,
        )
        if apply_patch["exit_code"] != 0:
            raise AssertionError(f"frozen public patch did not apply to equivalent fixture: {apply_patch['stderr']}")
        baseline_inputs = source_input_manifest(baseline_root, exclude_implementation=True)
        patched_inputs = source_input_manifest(patched_root, exclude_implementation=True)
        roots = (baseline_root, patched_root)
        original_default = default_generation_observation(
            baseline_root, python, env, "original", roots,
        )
        selected_default = default_generation_observation(
            patched_root, python, env, "patched", roots,
        )
        original_controlled = controlled_default_generation(baseline_root, python, "original")
        selected_controlled = controlled_default_generation(patched_root, python, "patched")
        manifest_artifacts: dict[str, str] = {}
        if progress_path is not None:
            for name, manifest in (
                ("baseline-seed-full-manifest", baseline_seed),
                ("patched-seed-full-manifest", patched_seed),
                ("baseline-post-patch-resource-manifest", baseline_inputs),
                ("patched-post-patch-resource-manifest", patched_inputs),
            ):
                path = progress_path.with_name(f"{progress_path.stem}-{name}.json")
                write_json(path, manifest)
                manifest_artifacts[name] = str(path)
        default_behavior = {
            "fixture": {
                "seed": str(ORIGINAL_V005),
                "seed_package_sha256": "9cb6590adbc90df18c96071ab73b44fc8cf4373a7f95bb07ccc7cc1289350b3f",
                "patch_path": str(PUBLIC_PATCH),
                "patch_sha256": sha256(PUBLIC_PATCH),
                "excluded_implementation_paths_post_patch_only": sorted(DEFAULT_IMPLEMENTATION_PATHS),
                "baseline_seed_full_manifest_sha256": baseline_seed["sha256"],
                "patched_seed_full_manifest_sha256": patched_seed["sha256"],
                "baseline_resource_manifest_sha256": baseline_inputs["sha256"],
                "patched_resource_manifest_sha256": patched_inputs["sha256"],
                "complete_seed_identical": baseline_seed == patched_seed,
                "resource_inputs_identical": baseline_inputs == patched_inputs,
                "manifest_artifacts": manifest_artifacts,
            },
            "incomplete_original": original_default,
            "incomplete_patched_api": selected_default,
            "complete_controlled_original": original_controlled,
            "complete_controlled_patched_api": selected_controlled,
            "controlled_fixture_scope": "focused generator/descriptor check",
            "v005_recorded_failure": {
                "package_sha256": "9cb6590adbc90df18c96071ab73b44fc8cf4373a7f95bb07ccc7cc1289350b3f",
                "scope": "resource closure remains uncertified; default discovery is intentionally fault tolerant",
            },
        }
        if progress_path is not None:
            write_json(progress_path, {
                "replay": "V009-G3-T7-P1-replay-1",
                "status": "IN_PROGRESS",
                "frozen_identity_before": frozen_before,
                "default_behavior": default_behavior,
            })
        if baseline_inputs != patched_inputs:
            raise AssertionError("original and patched default tests do not have equivalent resource inputs")
        for label, observation in (("original", original_default), ("patched", selected_default)):
            if observation["generate"]["exit_code"] != 0 or not observation["output_exists"]:
                raise AssertionError(f"known incomplete {label} default generation did not exit 0 with a catalog")
            if observation["check"]["exit_code"] != 1:
                raise AssertionError(f"known incomplete {label} stale-catalog --check did not exit 1")
        if comparable_default_observation(original_default) != comparable_default_observation(selected_default):
            raise AssertionError("no-selection behavior changed on equivalent incomplete inputs")
        if original_controlled["result"] != selected_controlled["result"]:
            raise AssertionError("no-selection output changed on the complete controlled fixture")
        default_behavior["controlled_outputs_identical"] = True

    mutation_results = []
    with tempfile.TemporaryDirectory(prefix="v009-canonical-") as raw:
        temp_root = Path(raw)

        def projection(name: str) -> Path:
            destination = temp_root / name
            shutil.copytree(package_root, destination, symlinks=True, ignore=shutil.ignore_patterns("remotion-public"))
            return destination

        def invoke(root: Path, *, selection: Path | None = None, check: bool = False) -> dict[str, Any]:
            output = root / "qualified-output.ts"
            command = [python, str(root / "scripts/gen_element_catalog.py"), str(output)]
            if selection is not None:
                command.extend(["--selection", str(selection)])
            if check:
                command.append("--check")
            result = run_command(command, cwd=root, env=env)
            result["output_exists"] = output.exists()
            return result

        negative_cases: list[tuple[str, Any]] = []

        missing_asset_root = projection("missing-asset")
        missing_asset = missing_asset_root / lock["asset_overlays"][0]["destination"]
        missing_asset.unlink()
        negative_cases.append(("missing-selected-asset", invoke(
            missing_asset_root,
            selection=missing_asset_root / "config" / LOCK_PATH.name,
        )))

        pack_id_root = projection("pack-id")
        manifest = pack_id_root / "astrid/packs/local/elements/effects/frame-overlay/element.yaml"
        manifest.write_text(manifest.read_text(encoding="utf-8").replace("pack_id: local", "pack_id: rendering", 1), encoding="utf-8")
        negative_cases.append(("changed-pack-id", invoke(
            pack_id_root,
            selection=pack_id_root / "config" / LOCK_PATH.name,
        )))

        missing_selection_root = projection("missing-selection")
        missing_lock = json.loads((missing_selection_root / "config" / LOCK_PATH.name).read_text(encoding="utf-8"))
        missing_lock["selections"] = missing_lock["selections"][:-1]
        missing_lock_path = missing_selection_root / "missing-selection.json"
        write_json(missing_lock_path, missing_lock)
        negative_cases.append(("missing-selection", invoke(missing_selection_root, selection=missing_lock_path)))

        extra_selection_root = projection("extra-selection")
        extra_lock = json.loads((extra_selection_root / "config" / LOCK_PATH.name).read_text(encoding="utf-8"))
        extra_lock["selections"].append({"pack": "local", "kind": "effects", "id": "scrolling-guide"})
        extra_lock_path = extra_selection_root / "extra-selection.json"
        write_json(extra_lock_path, extra_lock)
        negative_cases.append(("thirteenth-selection", invoke(extra_selection_root, selection=extra_lock_path)))

        duplicate_selection_root = projection("duplicate-selection")
        duplicate_lock = json.loads((duplicate_selection_root / "config" / LOCK_PATH.name).read_text(encoding="utf-8"))
        duplicate_lock["selections"][-1] = dict(duplicate_lock["selections"][0])
        duplicate_lock_path = duplicate_selection_root / "duplicate-selection.json"
        write_json(duplicate_lock_path, duplicate_lock)
        negative_cases.append(("duplicate-selection", invoke(duplicate_selection_root, selection=duplicate_lock_path)))

        local_text_card_root = projection("local-text-card")
        local_text_lock = json.loads((local_text_card_root / "config" / LOCK_PATH.name).read_text(encoding="utf-8"))
        local_text_lock["selections"][7] = {"pack": "local", "kind": "effects", "id": "text-card"}
        local_text_path = local_text_card_root / "local-text-card.json"
        write_json(local_text_path, local_text_lock)
        local_text_result = invoke(local_text_card_root, selection=local_text_path)
        if local_text_result["exit_code"] == 0:
            local_catalog = parse_catalog(local_text_card_root / "qualified-output.ts")
            local_descriptor = local_catalog[7]
            if local_descriptor["packId"] == "local":
                local_text_result["semantic_failure"] = "local text-card was admitted"
        negative_cases.append(("local-text-card", local_text_result))

        for name, result in negative_cases:
            if result["exit_code"] == 0 or result["output_exists"]:
                raise AssertionError(f"negative case {name} did not fail closed: {result!r}")

        mutations = [
            ("component", "astrid/packs/rendering/elements/effects/text-card/component.tsx", ("effect", "text-card")),
            ("manifest", "astrid/packs/rendering/elements/animations/fade-up/element.yaml", ("animation", "fade-up")),
            ("asset", lock["asset_overlays"][-1]["destination"], ("effect", "frame-overlay")),
        ]
        for name, relative, expected_key in mutations:
            root = projection(f"mutation-{name}")
            target = root / relative
            if name == "manifest":
                payload = yaml.safe_load(target.read_text(encoding="utf-8"))
                payload["description"] = f"{payload.get('description', '')} v009 canonical mutation".strip()
                target.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
            else:
                target.write_bytes(target.read_bytes() + b"\n# v009 canonical mutation\n")
            result = invoke(root, selection=root / "config" / LOCK_PATH.name)
            if result["exit_code"] != 0:
                raise AssertionError(f"{name} mutation generation failed: {result['stderr']}")
            mutated = parse_catalog(root / "qualified-output.ts")
            revisions = {(item["kind"], item["id"]): item["revision"] for item in mutated}
            changed = sorted(key for key in baseline_revisions if baseline_revisions[key] != revisions[key])
            if changed != [expected_key]:
                raise AssertionError(f"{name} mutation changed unexpected revisions: {changed!r}")
            check_result = run_command(
                [python, str(root / "scripts/gen_element_catalog.py"), str(catalog), "--selection", str(root / "config" / LOCK_PATH.name), "--check"],
                cwd=root,
                env=env,
            )
            if check_result["exit_code"] == 0:
                raise AssertionError(f"{name} mutation did not make canonical catalog check fail")
            mutation_results.append({
                "name": name,
                "path": relative,
                "changed_revisions": changed,
                "generation": result,
                "baseline_check": check_result,
            })

    installed_catalog = parse_catalog(package_root / "astrid/packs/rendering/elements/catalog.ts")
    installed_revisions = {(item["kind"], item["id"]): item["revision"] for item in installed_catalog}
    rendering_keys = [(KINDS[item["kind"]], item["id"]) for item in lock["selections"] if item["pack"] == "rendering"]
    for key in rendering_keys:
        if installed_revisions.get(key) != baseline_revisions.get(key):
            raise AssertionError(f"selected rendering revision differs from installed catalog: {key!r}")

    frozen_after = {
        "package_sha256": selected_profile._package_manifest(package_root)[1],
        "patch_sha256": sha256(PUBLIC_PATCH),
        "lock_sha256": sha256(LOCK_PATH),
    }
    if frozen_after != frozen_before:
        raise AssertionError(f"frozen P1 identity changed during replay: {frozen_after!r}")
    return {
        "replay": "V009-G3-T7-P1-replay-1",
        "status": "PASS",
        "frozen_identity_before": frozen_before,
        "frozen_identity_after": frozen_after,
        "commands": commands,
        "selected_context": {
            "profile_id": context.profile_id,
            "package_sha256": context.package_sha256,
            "descriptor_count": len(context.descriptors),
            "keys": [(item["packId"], item["kind"], item["id"]) for item in context.descriptors],
        },
        "negative_cases": [{"name": name, **result} for name, result in negative_cases],
        "mutations": mutation_results,
        "default_behavior": default_behavior,
        "rendering_revision_comparison": {"keys": rendering_keys, "unchanged": True},
        "local_revision_keys": [
            key for key in baseline_revisions if key in {("effect", "end-spanning-layer"), ("effect", "frame-overlay")}
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate", choices=("closure", "canonical"), required=True)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    package_root = args.package.resolve()
    evidence = args.evidence.resolve()
    result = run_closure(package_root) if args.gate == "closure" else run_canonical(package_root, evidence)
    write_json(evidence, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
