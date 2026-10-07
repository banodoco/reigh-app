#!/usr/bin/env python3
"""Materialize and attest the V005 Astrid landing source package."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import shutil
import stat
import subprocess
import tarfile
import tempfile
from pathlib import Path
from typing import Any


ASTRID_COMMIT = "06dee36fbfa9d134a57b50536c045231e541b11e"
ASTRID_TREE = "5243a7825d1e22aeb60e46b13be8212c8d776f27"
APP_COMMIT = "8ff05e2bad85be33e6ff3ddafffefd7abf6dcbf5"
CATALOG_PATH = Path("astrid/packs/rendering/elements/catalog.ts")
LICENSE_PATH = Path("LICENSE")
ASSETS = (
    (
        "public/astrid-effects/end-spanning-layer/card-0.png",
        "astrid/packs/local/elements/effects/end-spanning-layer/assets/card-0.png",
        "812404d89d4579ab8c76bed109fa3a8c5643a0d1",
        "416aa587a0493d75f901256b00146ec8f34578535a9c67bdf6eb7cdd6fb5d6f1",
    ),
    (
        "public/astrid-effects/end-spanning-layer/card-1.png",
        "astrid/packs/local/elements/effects/end-spanning-layer/assets/card-1.png",
        "3679f7e54d0c17f5c608b03ef93181bf99cf9340",
        "9c348d11c59b973214b2aec0d9886017d70db44ecc0bc5ec44a42f4aacd55223",
    ),
    (
        "public/astrid-effects/end-spanning-layer/card-2.png",
        "astrid/packs/local/elements/effects/end-spanning-layer/assets/card-2.png",
        "a6f5da749c6b753005a07fdb2d2afd5e14f835e3",
        "2464851c6b826b96cc09b2d83aa79ba2b00ebfb1e4ccb1cf3a16a54242141fa8",
    ),
    (
        "public/astrid-effects/end-spanning-layer/card-3.png",
        "astrid/packs/local/elements/effects/end-spanning-layer/assets/card-3.png",
        "7c2cfc1709b35789d2c34f7e8e244276e5620c27",
        "721367fbd93d819af70b4d9993d271e2c29892557c859a837597f255a524be3d",
    ),
    (
        "public/astrid-effects/end-spanning-layer/card-4.png",
        "astrid/packs/local/elements/effects/end-spanning-layer/assets/card-4.png",
        "65b3556f65729ab482c6c4eda741c6eed84bf007",
        "cf1ddd8c30b3445e08344712e291447fd124cd76d9ecbdb7b14aa41433395669",
    ),
    (
        "public/astrid-effects/end-spanning-layer/card-5.png",
        "astrid/packs/local/elements/effects/end-spanning-layer/assets/card-5.png",
        "bb056561605ccc5a431afd538c3484d6d1a8e9b0",
        "3bda96e4105793b03b74f9a46fb9766ae510020c45140ca1f4b3e674aa0d3bd0",
    ),
    (
        "public/astrid-effects/frame-overlay/frame.png",
        "astrid/packs/local/elements/effects/frame-overlay/assets/frame.png",
        "ee81f42d271b805ae28330bc53102d3a3f3c641c",
        "730113561d7848cea6156c3c0e4f08c1d2db693d7522671cf654f044de528605",
    ),
)


def run(command: list[str], *, cwd: Path | None = None, text: bool = True) -> subprocess.CompletedProcess[Any]:
    return subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=text)


def git_text(repo: Path, *args: str) -> str:
    return run(["git", "-C", str(repo), *args]).stdout.strip()


def git_bytes(repo: Path, *args: str) -> bytes:
    return run(["git", "-C", str(repo), *args], text=False).stdout


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_repository(repo: Path, remote: str, commit: str) -> None:
    if git_text(repo, "rev-parse", "--show-toplevel") != str(repo.resolve()):
        raise RuntimeError(f"repository root mismatch: {repo}")
    remotes = git_text(repo, "remote", "-v")
    if remote not in remotes:
        raise RuntimeError(f"expected remote {remote!r} is absent from {repo}")
    if git_text(repo, "rev-parse", f"{commit}^{{commit}}") != commit:
        raise RuntimeError(f"required commit is unavailable: {repo} {commit}")


def committed_blob(repo: Path, commit: str, source: str, expected_blob: str) -> bytes:
    entry = git_text(repo, "ls-tree", commit, "--", source)
    fields = entry.split(None, 3)
    if len(fields) < 4 or fields[1] != "blob" or fields[2] != expected_blob:
        raise RuntimeError(f"Git blob mismatch for {source}: {entry!r}")
    return git_bytes(repo, "cat-file", "blob", expected_blob)


def safe_extract_archive(repo: Path, commit: str, destination: Path) -> None:
    archive = git_bytes(repo, "archive", "--format=tar", commit)
    destination.mkdir(parents=True, exist_ok=False)
    with tempfile.NamedTemporaryFile(suffix=".tar") as handle:
        handle.write(archive)
        handle.flush()
        with tarfile.open(handle.name) as tar:
            root = destination.resolve()
            for member in tar.getmembers():
                target = (destination / member.name).resolve()
                if target != root and root not in target.parents:
                    raise RuntimeError(f"archive member escapes destination: {member.name}")
            tar.extractall(destination)


def regenerate_catalog(snapshot: Path) -> dict[str, Any]:
    catalog = snapshot / CATALOG_PATH
    before = catalog.read_bytes()
    generated = snapshot / ".astrid-landing-catalog.generated.ts"
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    command = [
        str(Path(os.environ.get("ASTRID_PACKAGE_PYTHON", "/opt/homebrew/bin/python3.11"))),
        str(snapshot / "scripts/gen_element_catalog.py"),
        str(generated),
    ]
    completed = subprocess.run(
        command,
        cwd=snapshot,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    after = generated.read_bytes()
    generated.unlink()
    return {
        "command": command,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "before_sha256": sha256(before),
        "after_sha256": sha256(after),
        "changed": before != after,
        "generated_text": after.decode("utf-8"),
        "diff": "".join(
            difflib.unified_diff(
                before.decode("utf-8").splitlines(keepends=True),
                after.decode("utf-8").splitlines(keepends=True),
                fromfile=f"{CATALOG_PATH}@{ASTRID_COMMIT}",
                tofile=f"{CATALOG_PATH}@prepared-overlay",
            )
        ),
    }


def package_manifest(root: Path) -> tuple[list[dict[str, Any]], str]:
    entries: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*"), key=lambda value: value.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix()
        mode = stat.S_IMODE(path.lstat().st_mode)
        if path.is_symlink():
            entries.append({"path": relative, "type": "symlink", "mode": mode, "target": os.readlink(path)})
        elif path.is_file():
            data = path.read_bytes()
            entries.append(
                {"path": relative, "type": "file", "mode": mode, "bytes": len(data), "sha256": sha256(data)}
            )
    encoded = json.dumps(entries, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return entries, sha256(encoded)


def materialize(astrid_repo: Path, app_repo: Path, destination: Path) -> dict[str, Any]:
    safe_extract_archive(astrid_repo, ASTRID_COMMIT, destination)
    overlays: list[dict[str, Any]] = []
    for source, target, blob, expected_hash in ASSETS:
        data = committed_blob(app_repo, APP_COMMIT, source, blob)
        actual_hash = sha256(data)
        if actual_hash != expected_hash:
            raise RuntimeError(f"SHA-256 mismatch for committed overlay {source}: {actual_hash}")
        target_path = destination / target
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(data)
        overlays.append(
            {
                "source": source,
                "destination": target,
                "git_blob": blob,
                "bytes": len(data),
                "sha256": actual_hash,
            }
        )
    catalog = regenerate_catalog(destination)
    manifest, package_hash = package_manifest(destination)
    license_bytes = (destination / LICENSE_PATH).read_bytes()
    return {
        "package_sha256": package_hash,
        "file_count": len(manifest),
        "manifest": manifest,
        "overlays": overlays,
        "catalog": catalog,
        "license": {
            "path": str(LICENSE_PATH),
            "title": "Open Source Native License 0.2",
            "sha256": sha256(license_bytes),
            "bytes": len(license_bytes),
        },
    }


def snapshot_repository(repo: Path, paths: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "path": str(repo.resolve()),
        "head": git_text(repo, "rev-parse", "HEAD"),
        "tree": git_text(repo, "rev-parse", "HEAD^{tree}"),
        "status_porcelain_v1_z_sha256": sha256(git_bytes(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all")),
        "paths": {
            path: git_text(repo, "ls-tree", "HEAD", "--", path)
            for path in paths
        },
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--astrid-repo", type=Path, required=True)
    parser.add_argument("--app-repo", type=Path, required=True)
    parser.add_argument("--v002-repo", type=Path, required=True)
    parser.add_argument("--product-baseline-repo", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()

    astrid_repo = args.astrid_repo.resolve()
    app_repo = args.app_repo.resolve()
    v002_repo = args.v002_repo.resolve()
    product_repo = args.product_baseline_repo.resolve()
    destination = args.destination.resolve()
    evidence = args.evidence.resolve()
    require_repository(astrid_repo, "https://github.com/peteromallet/Astrid.git", ASTRID_COMMIT)
    require_repository(app_repo, "https://github.com/banodoco/reigh-app", APP_COMMIT)

    preserved_before = {
        "astrid_source": snapshot_repository(astrid_repo),
        "v002_snapshot": snapshot_repository(v002_repo),
        "product_source_baseline": snapshot_repository(product_repo, tuple(source for source, *_ in ASSETS)),
    }
    evidence.mkdir(parents=True, exist_ok=True)
    temp_parent = destination.parent
    temp_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".astrid-landing-prepare-a-", dir=temp_parent) as a_raw, tempfile.TemporaryDirectory(
        prefix=".astrid-landing-prepare-b-", dir=temp_parent
    ) as b_raw:
        a = Path(a_raw) / "snapshot"
        b = Path(b_raw) / "snapshot"
        first = materialize(astrid_repo, app_repo, a)
        second = materialize(astrid_repo, app_repo, b)
        if first["package_sha256"] != second["package_sha256"] or first["manifest"] != second["manifest"]:
            raise RuntimeError("independent preparations produced different package manifests")
        if destination.exists():
            if destination.name != "astrid-landing-source-v1":
                raise RuntimeError(f"refusing to replace unexpected destination: {destination}")
            shutil.rmtree(destination)
        shutil.copytree(a, destination, symlinks=True)

    published_manifest, published_hash = package_manifest(destination)
    if published_hash != first["package_sha256"] or published_manifest != first["manifest"]:
        raise RuntimeError("published prepared snapshot differs from independent preparations")
    package_python = str(Path(os.environ.get("ASTRID_PACKAGE_PYTHON", "/opt/homebrew/bin/python3.11")))
    check_command = [
        package_python,
        str(destination / "scripts/gen_element_catalog.py"),
        str(destination / CATALOG_PATH),
        "--check",
    ]
    check_env = os.environ.copy()
    check_env["PYTHONDONTWRITEBYTECODE"] = "1"
    canonical_check = subprocess.run(
        check_command,
        cwd=destination,
        env=check_env,
        check=False,
        capture_output=True,
        text=True,
    )
    preserved_after = {
        "astrid_source": snapshot_repository(astrid_repo),
        "v002_snapshot": snapshot_repository(v002_repo),
        "product_source_baseline": snapshot_repository(product_repo, tuple(source for source, *_ in ASSETS)),
    }
    if preserved_before != preserved_after:
        raise RuntimeError("a preserved source checkout or product baseline changed during preparation")

    identity = {
        "schema_version": 1,
        "name": "astrid-landing-source-v1",
        "astrid": {"remote": "https://github.com/peteromallet/Astrid.git", "commit": ASTRID_COMMIT, "tree": ASTRID_TREE},
        "overlay_source": {"remote": "https://github.com/banodoco/reigh-app", "commit": APP_COMMIT},
        "destination": str(destination),
        "package_sha256": published_hash,
        "file_count": len(published_manifest),
        "license": first["license"],
        "overlay_assets": first["overlays"],
        "catalog": {
            key: value
            for key, value in first["catalog"].items()
            if key not in {"diff", "generated_text"}
        },
        "reproducibility": {
            "independent_preparations": 2,
            "first_package_sha256": first["package_sha256"],
            "second_package_sha256": second["package_sha256"],
            "published_package_sha256": published_hash,
            "identical": True,
        },
    }
    generated_catalog = first["catalog"]["generated_text"]
    required_catalog_ids = ('"id": "end-spanning-layer"', '"id": "frame-overlay"')
    generator_stderr = str(first["catalog"]["stderr"])
    catalog_gate_passed = (
        canonical_check.returncode == 0
        and not canonical_check.stderr.strip()
        and all(marker in generated_catalog for marker in required_catalog_ids)
    )
    identity["qualification"] = {
        "status": "passed" if catalog_gate_passed else "failed",
        "gate": "3-canonical-catalog-revision",
        "reason": None if catalog_gate_passed else (
            "Canonical catalog generation rejected the local pack and produced output "
            "that differs from the committed catalog."
        ),
    }
    write_json(evidence / "package-identity.json", identity)
    write_json(evidence / "package-manifest.json", published_manifest)
    (evidence / "catalog-before-after.diff").write_text(first["catalog"]["diff"], encoding="utf-8")
    (evidence / "canonical-generated-catalog.ts").write_text(generated_catalog, encoding="utf-8")
    (evidence / "canonical-generator.stderr.log").write_text(canonical_check.stderr, encoding="utf-8")
    (evidence / "canonical-generator.stdout.log").write_text(canonical_check.stdout, encoding="utf-8")
    write_json(
        evidence / "canonical-generator-command.json",
        {
            "command": check_command,
            "cwd": str(destination),
            "environment": {"PYTHONDONTWRITEBYTECODE": "1"},
            "exit_code": canonical_check.returncode,
        },
    )
    write_json(evidence / "preserved-repositories.json", {"before": preserved_before, "after": preserved_after, "identical": True})
    if not catalog_gate_passed:
        write_json(
            evidence.parent / "early-return.json",
            {
                "status": "EARLY_RETURN",
                "failed_gate": 3,
                "contract": "canonical catalog revision validation against the complete prepared package",
                "exact_missing_resource": (
                    "astrid/packs/local/elements/effects/end-codex-transform/"
                    "element.yaml.assets.card0 -> assets/card-0.png"
                ),
                "generator_stderr": canonical_check.stderr.strip(),
                "catalog_consequence": (
                    "scripts/gen_element_catalog.py skips pack 'local'; generated output removes "
                    "end-spanning-layer, frame-overlay, and every other local descriptor"
                ),
                "authorized_overlay_assets_added": 7,
                "additional_assets_added": 0,
                "lock_file_created": False,
                "render_gate_run": False,
                "installed_app_build_retry_run": False,
                "minimal_host_build_run": False,
            },
        )
        print(json.dumps(identity, indent=2, sort_keys=True))
        return 3
    print(json.dumps(identity, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
