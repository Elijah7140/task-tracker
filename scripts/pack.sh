#!/usr/bin/env bash
# Publishes Task Tracker self-contained for one runtime and packs it with Velopack (§7.13).
#
# Usage: scripts/pack.sh [runtime] [version]
#   runtime  a .NET runtime identifier: linux-x64 (default on Linux) or osx-arm64 (default on macOS)
#   version  the package version, e.g. 0.2.0; defaults to <Version> in Directory.Build.props
#
# Writes the publish output to artifacts/publish/<runtime> and the Velopack release files
# (the AppImage or .app bundle, the .nupkg and releases.<channel>.json) to
# artifacts/releases/<runtime>. Both folders are emptied first. Velopack packs for the OS it runs
# on, so use this script on Linux and macOS and scripts/pack.ps1 on Windows.
set -euo pipefail

# Not "TaskTracker": on Windows Velopack installs to %LocalAppData%\<packId> and deletes that whole
# folder on uninstall, while the database lives in %LocalAppData%\TaskTracker (§7.13). One id for
# every OS keeps the packages consistent. Keep in step with pack.ps1.
pack_id="TaskTrackerApp"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="$root/src/TaskTracker.App.Desktop/TaskTracker.App.Desktop.csproj"

if [ "$(uname -s)" = "Darwin" ]; then
  default_runtime="osx-arm64"
else
  default_runtime="linux-x64"
fi

runtime="${1:-$default_runtime}"
version="${2:-}"
if [ -z "$version" ]; then
  version="$(dotnet msbuild "$project" -getProperty:Version | tr -d '[:space:]')"
fi

publish_dir="$root/artifacts/publish/$runtime"
release_dir="$root/artifacts/releases/$runtime"
rm -rf "$publish_dir" "$release_dir"

echo "Publishing Task Tracker $version for $runtime"
dotnet publish "$project" --configuration Release --runtime "$runtime" \
  --self-contained true "-p:Version=$version" --output "$publish_dir"

dotnet tool restore

# The repository has only a Windows .ico and an SVG; Velopack wants a .png on Linux and an
# .icns on macOS, so these packages use Velopack's default icon until those files exist.
echo "Note: no .png or .icns app icon in the repository; packing without --icon." >&2

dotnet vpk pack \
  --packId "$pack_id" \
  --packVersion "$version" \
  --packTitle "Task Tracker" \
  --packAuthors "Task Tracker" \
  --packDir "$publish_dir" \
  --mainExe TaskTracker.App.Desktop \
  --runtime "$runtime" \
  --outputDir "$release_dir"

echo "Release files in $release_dir"
