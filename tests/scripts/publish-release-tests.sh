#!/usr/bin/env bash
# Drives the release script with a fake GitHub API and Velopack CLI.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state="$(mktemp -d)"
trap 'rm -rf -- "$state"' EXIT

export state
export GITHUB_REPOSITORY=example/task-tracker GITHUB_SERVER_URL=https://github.com GH_TOKEN=fake
release_api="repos/$GITHUB_REPOSITORY/releases"
export release_api

gh() {
  case "$*" in
    "api --paginate $release_api?per_page=100"*)
      if [[ -f "$state/release" ]]; then
        printf '%s\t42\t%s\t%s\n' "$GITHUB_REF_NAME" "$(cat "$state/release")" "$(cat "$state/pre")"
      fi
      ;;
    "api --method DELETE $release_api/42 --silent")
      [[ "$(cat "$state/release")" == true ]] || return 1
      rm -f -- "$state/release" "$state/assets"
      echo delete >> "$state/actions"
      ;;
    "api --paginate $release_api/42/assets"*)
      cat "$state/assets"
      ;;
    "api --method PATCH $release_api/42 -F draft=false --silent")
      echo publish >> "$state/actions"
      echo false > "$state/release"
      ;;
    *)
      printf 'Unexpected gh arguments: %s\n' "$*" >&2
      return 1
      ;;
  esac
}

dotnet() {
  [[ "$1 $2 $3" == 'vpk upload github' ]] || return 1
  local channel="" pre=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --channel) channel="$2"; shift ;;
      --pre) pre=true ;;
      --publish) return 1 ;;
    esac
    shift
  done
  [[ -n "$channel" && "$pre" == "$EXPECT_PRERELEASE" ]] || return 1
  if [[ -f "$state/assets" ]] && grep -Fxq "releases.$channel.json" "$state/assets"; then
    return 1
  fi
  echo true > "$state/release"
  echo "$pre" > "$state/pre"
  if [[ "$channel" == "${FAIL_CHANNEL:-}" ]]; then
    echo partial-installer >> "$state/assets"
    return 1
  fi
  if [[ "$channel" != "${OMIT_FEED:-}" ]]; then
    echo "releases.$channel.json" >> "$state/assets"
  fi
  echo "$channel" >> "$state/actions"
}

export -f gh dotnet
publish="$root/scripts/publish-release.sh"

export GITHUB_REF_NAME=v0.2.0-rc.1 EXPECT_PRERELEASE=true
if FAIL_CHANNEL=linux bash "$publish"; then
  echo 'A failed upload should fail the release.' >&2
  exit 1
fi
[[ "$(cat "$state/release")" == true && "$(cat "$state/actions")" == win ]]
bash "$publish"
expected_actions=$'win\ndelete\nwin\nlinux\nosx\npublish'
[[ "$(cat "$state/release")" == false && "$(cat "$state/actions")" == "$expected_actions" ]]
bash "$publish"
[[ "$(cat "$state/actions")" == "$expected_actions" ]]

rm -f -- "$state/release" "$state/assets" "$state/actions"
export GITHUB_REF_NAME=v0.3.0 EXPECT_PRERELEASE=false
if OMIT_FEED=osx bash "$publish"; then
  echo 'A draft missing a feed should stay unpublished.' >&2
  exit 1
fi
[[ "$(cat "$state/release")" == true && "$(cat "$state/actions")" == $'win\nlinux\nosx' ]]
bash "$publish"
[[ "$(cat "$state/release")" == false && "$(cat "$state/pre")" == false ]]
echo 'Release workflow scenarios passed.'
