#!/usr/bin/env python3
"""Materialize and attest the strict 12-definition Astrid public package."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
APP_ROOT = SCRIPT_DIR.parents[1]
PATCH_PATH = SCRIPT_DIR / "public-source.patch"
LOCK_PATH = APP_ROOT / "config" / "astrid-public-source.lock.json"
PUBLIC_CATALOG = Path("astrid/packs/rendering/elements/public-catalog.ts")
PROFILE_ID = "astrid-public-v1"


def _load_base_module():
    spec = importlib.util.spec_from_file_location("astrid_landing_v005_prepare", SCRIPT_DIR / "prepare.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load preserved V005 preparation helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = _load_base_module()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, env=env, check=True, capture_output=True, text=True)


def materialize_public(
    astrid_repo: Path,
    app_repo: Path,
    destination: Path,
    *,
    patch_path: Path = PATCH_PATH,
) -> dict[str, Any]:
    base_result = BASE.materialize(astrid_repo, app_repo, destination)
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    if len(lock.get("selections", [])) != 12 or len(lock.get("asset_overlays", [])) != 7:
        raise RuntimeError("public lock must contain exactly 12 selections and seven overlays")
    locked_assets = [(item["source"], item["destination"], item["git_blob"], item["sha256"]) for item in lock["asset_overlays"]]
    if tuple(locked_assets) != BASE.ASSETS:
        raise RuntimeError("public lock asset mappings differ from the preserved V005 mappings")

    patch_result = run(["patch", "-p1", "-i", str(patch_path)], cwd=destination)
    target_lock = destination / "config" / LOCK_PATH.name
    target_lock.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LOCK_PATH, target_lock)

    registry_lock = destination / "remotion" / ".astrid-registry.lock"
    registry_lock.parent.mkdir(parents=True, exist_ok=True)
    registry_lock.write_bytes(b"")
    registry_lock.chmod(0o644)

    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    package_python = str(Path(os.environ.get("ASTRID_PACKAGE_PYTHON", "/opt/homebrew/bin/python3.11")))
    catalog_path = destination / PUBLIC_CATALOG
    generate_command = [
        package_python,
        str(destination / "scripts" / "gen_element_catalog.py"),
        str(catalog_path),
        "--selection",
        str(target_lock),
    ]
    generate = run(generate_command, cwd=destination, env=env)
    check_command = [*generate_command, "--check"]
    check = run(check_command, cwd=destination, env=env)

    manifest, package_hash = BASE.package_manifest(destination)
    return {
        "package_sha256": package_hash,
        "manifest": manifest,
        "file_count": len(manifest),
        "catalog_sha256": sha256(catalog_path.read_bytes()),
        "catalog_path": PUBLIC_CATALOG.as_posix(),
        "patch_stdout": patch_result.stdout,
        "generate_command": generate_command,
        "generate_stdout": generate.stdout,
        "generate_stderr": generate.stderr,
        "check_command": check_command,
        "check_stdout": check.stdout,
        "check_stderr": check.stderr,
        "license": base_result["license"],
        "overlays": base_result["overlays"],
        "preserved_v005_package_sha256": base_result["package_sha256"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--astrid-repo", type=Path, required=True)
    parser.add_argument("--app-repo", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--preparation-root", type=Path, required=True)
    parser.add_argument("--patch", type=Path, default=PATCH_PATH)
    args = parser.parse_args()

    astrid_repo = args.astrid_repo.resolve()
    app_repo = args.app_repo.resolve()
    destination = args.destination.resolve()
    evidence = args.evidence.resolve()
    preparation_root = args.preparation_root.resolve()
    patch_path = args.patch.resolve()
    BASE.require_repository(astrid_repo, "https://github.com/peteromallet/Astrid.git", BASE.ASTRID_COMMIT)
    BASE.require_repository(app_repo, "https://github.com/banodoco/reigh-app", BASE.APP_COMMIT)

    preserved = {
        "original_v005_package_sha256": "9cb6590adbc90df18c96071ab73b44fc8cf4373a7f95bb07ccc7cc1289350b3f",
        "original_v005_candidate": str((app_repo / ".otto/sources/astrid-landing-source-v1").resolve()),
        "release_manifest_sha256": sha256((app_repo / "config/releases/extension-ship-quality.json").read_bytes()),
        "astrid_repository": BASE.snapshot_repository(astrid_repo),
    }

    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise RuntimeError(f"refusing to replace existing destination: {destination}")
    if preparation_root.exists():
        raise RuntimeError(f"refusing to replace existing preparation root: {preparation_root}")
    first_root = preparation_root / "first"
    second_root = preparation_root / "second"
    first = materialize_public(astrid_repo, app_repo, first_root, patch_path=patch_path)
    second = materialize_public(astrid_repo, app_repo, second_root, patch_path=patch_path)
    if first["manifest"] != second["manifest"] or first["package_sha256"] != second["package_sha256"] or first["catalog_sha256"] != second["catalog_sha256"]:
        raise RuntimeError("independent public preparations are not byte-identical")
    shutil.copytree(first_root, destination, symlinks=True)

    published_manifest, published_hash = BASE.package_manifest(destination)
    if published_manifest != first["manifest"] or published_hash != first["package_sha256"]:
        raise RuntimeError("published public package differs from independent preparations")

    worker_project = destination / "remotion-public"
    shutil.copytree(destination / "remotion", worker_project, symlinks=True)
    binding = {
        "id": PROFILE_ID,
        "package_sha256": published_hash,
        "worker_project": str(worker_project),
        "manifest_sha256": published_hash,
    }
    binding_path = destination.with_name(f"{destination.name}.profile-binding.json")
    write_json(binding_path, binding)

    identity = {
        "schema_version": 1,
        "name": destination.name,
        "profile": binding,
        "astrid": {"commit": BASE.ASTRID_COMMIT, "tree": BASE.ASTRID_TREE},
        "app": {"commit": BASE.APP_COMMIT},
        "package_sha256": published_hash,
        "file_count": len(published_manifest),
        "catalog_path": first["catalog_path"],
        "catalog_sha256": first["catalog_sha256"],
        "patch_sha256": sha256(patch_path.read_bytes()),
        "lock_sha256": sha256(LOCK_PATH.read_bytes()),
        "license": first["license"],
        "overlay_assets": first["overlays"],
        "reproducibility": {
            "independent_preparations": 2,
            "first_package_sha256": first["package_sha256"],
            "second_package_sha256": second["package_sha256"],
            "published_package_sha256": published_hash,
            "first_catalog_sha256": first["catalog_sha256"],
            "second_catalog_sha256": second["catalog_sha256"],
            "identical": True,
        },
        "preserved": preserved,
    }
    write_json(evidence / "package-identity.json", identity)
    write_json(evidence / "package-manifest.json", published_manifest)
    write_json(evidence / "profile-binding.json", binding)
    write_json(evidence / "commands.json", {
        "selected_patch": {
            "path": str(patch_path),
            "sha256": sha256(patch_path.read_bytes()),
        },
        "generate": first["generate_command"],
        "check": first["check_command"],
        "generate_stdout": first["generate_stdout"],
        "generate_stderr": first["generate_stderr"],
        "check_stdout": first["check_stdout"],
        "check_stderr": first["check_stderr"],
    })
    print(json.dumps(identity, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
