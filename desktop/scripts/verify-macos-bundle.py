#!/usr/bin/env python3
"""Check the shipped DMG and start an installed copy; not a Gatekeeper assessment."""

import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}):\n{result.stdout}{result.stderr}")
    return result.stdout + result.stderr


def version(value):
    parts = tuple(int(part) for part in value.split("."))
    return parts + (0,) * (3 - len(parts))


def verify_app(app, config, architecture):
    with (app / "Contents/Info.plist").open("rb") as file:
        info = plistlib.load(file)
    assert info["CFBundleIdentifier"] == config["identifier"], "Wrong bundle identifier"
    assert info["CFBundleShortVersionString"] == config["version"], "Wrong app version"
    assert info["CFBundlePackageType"] == "APPL", "Not an application bundle"
    assert "television" in info.get("NSLocalNetworkUsageDescription", ""), "Missing local-network permission description"
    minimum = config["bundle"]["macOS"]["minimumSystemVersion"]
    assert version(info["LSMinimumSystemVersion"]) == version(minimum)
    name = info["CFBundleExecutable"]
    assert name and Path(name).name == name, "Invalid executable name"
    executable = app / "Contents/MacOS" / name
    assert executable.is_file() and os.access(executable, os.X_OK)
    assert run("lipo", "-archs", str(executable)).strip() == architecture, f"Expected {architecture}"
    load_commands = run("otool", "-l", str(executable)).split("Load command")
    minimum_versions = []
    for command in load_commands:
        if re.search(r"\bcmd LC_BUILD_VERSION\b", command):
            minimum_versions.extend(re.findall(r"\bminos ([0-9.]+)", command))
        elif re.search(r"\bcmd LC_VERSION_MIN_MACOSX\b", command):
            minimum_versions.extend(re.findall(r"\bversion ([0-9.]+)", command))
    assert len(minimum_versions) == 1, "Expected one Mach-O deployment version"
    assert version(minimum_versions[0]) == version(minimum), "Info.plist/Mach-O mismatch"
    assert (app / "Contents/_CodeSignature/CodeResources").is_file(), "Missing app resource seal"
    run("codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app))
    signature = run("codesign", "--display", "--verbose=4", str(app))
    assert f"Identifier={config['identifier']}" in signature.splitlines(), "Wrong signature identifier"
    print(f"Verified {app.name}: {architecture}, macOS {minimum}+, complete bundle signature", flush=True)
    return executable


def launch_copy(executable, directory, identifier):
    # Keep the runner's actual HOME. Refuse existing user data instead of replacing it.
    data_path = Path.home() / "Library/Application Support" / identifier
    assert not data_path.exists() and not data_path.is_symlink(), "Refusing existing app data"
    profile = directory / "test-profile"
    profile.mkdir()
    data_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.symlink_to(profile, target_is_directory=True)
    log = directory / "startup.log"
    process = None
    try:
        with log.open("wb") as output:
            process = subprocess.Popen(
                [str(executable)], cwd=directory, stdout=output, stderr=subprocess.STDOUT
            )
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("Installed copy stayed running for 5 seconds (no device operations)", flush=True)
            else:
                raise RuntimeError(f"Installed app exited during startup: {process.returncode}")
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if log.exists():
            print(log.read_text(errors="replace")[-8000:], end="", flush=True)
        if data_path.is_symlink() and data_path.readlink() == profile:
            data_path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="aarch64-apple-darwin")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This verification requires a native macOS runner")
    architecture = {"aarch64-apple-darwin":"arm64", "x86_64-apple-darwin":"x86_64"}[args.target]
    desktop = Path(__file__).resolve().parent.parent
    config = json.loads((desktop / "src-tauri/tauri.conf.json").read_text())
    bundles = desktop / "src-tauri/target" / args.target / "release/bundle"
    images = list((bundles / "dmg").glob("*.dmg"))
    assert len(images) == 1, f"Expected one DMG, got {images}"
    run("hdiutil", "verify", str(images[0]))
    with tempfile.TemporaryDirectory(prefix="puretv-macos-check-") as temporary:
        directory = Path(temporary)
        mount = directory / "mounted"
        mount.mkdir()
        mounted = False
        try:
            run("hdiutil", "attach", "-readonly", "-nobrowse", "-noautoopen",
                "-mountpoint", str(mount), str(images[0]))
            mounted = True
            apps = list(mount.glob("*.app"))
            assert len(apps) == 1 and apps[0].name == f"{config['productName']}.app"
            verify_app(apps[0], config, architecture)
            installed = directory / "Applications" / apps[0].name
            installed.parent.mkdir()
            run("ditto", str(apps[0]), str(installed))
            executable = verify_app(installed, config, architecture)
            launch_copy(executable, directory, config["identifier"])
        finally:
            if mounted:
                run("hdiutil", "detach", str(mount))
    print("DMG install/startup checks passed. This does not verify Apple notarization or Gatekeeper approval.")


if __name__ == "__main__":
    main()
