#!/usr/bin/env bash
# Publishes Task Tracker self-contained for one runtime and packs it with Velopack (§7.13).
#
# Usage: scripts/pack.sh [runtime] [version] [update-feed-url]
#   runtime  a .NET runtime identifier: linux-x64 (default on Linux) or osx-arm64 (default on macOS)
#   version  the package version, e.g. 0.2.0; defaults to <Version> in Directory.Build.props
#   update-feed-url  the public GitHub repository for updates; defaults to TaskTrackerUpdateFeedUrl
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

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
project="$root/src/TaskTracker.App.Desktop/TaskTracker.App.Desktop.csproj"

if [ "$(uname -s)" = "Darwin" ]; then
  default_runtime="osx-arm64"
else
  default_runtime="linux-x64"
fi

runtime="${1:-$default_runtime}"
version="${2:-}"
feed_url="${3:-}"
case "$runtime" in
  win-x64|linux-x64|osx-arm64) ;;
  *)
    echo "Unsupported runtime '$runtime'. Use win-x64, linux-x64, or osx-arm64." >&2
    exit 1
    ;;
esac

safe_output_directory() {
  local parent="$root/artifacts/$1"
  local folder="$parent/$runtime"
  if [[ "$folder" != "$root/artifacts/"* || -L "$root/artifacts" || -L "$parent" || -L "$folder" ]]; then
    echo "Output directory '$folder' must stay under '$root/artifacts' without symbolic links." >&2
    return 1
  fi
  printf '%s\n' "$folder"
}

publish_dir="$(safe_output_directory publish)"
release_dir="$(safe_output_directory releases)"
cd "$root"

if [ -z "$version" ]; then
  version="$(dotnet msbuild "$project" -getProperty:Version | tr -d '[:space:]')"
fi

rm -rf -- "$publish_dir" "$release_dir"

echo "Publishing Task Tracker $version for $runtime"
publish_args=(publish "$project" --configuration Release --runtime "$runtime"
  --self-contained true "-p:Version=$version" --output "$publish_dir")
if [ -n "$feed_url" ]; then
  publish_args+=("-p:TaskTrackerUpdateFeedUrl=$feed_url")
fi
dotnet "${publish_args[@]}"

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
