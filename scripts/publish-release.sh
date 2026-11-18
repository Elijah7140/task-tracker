#!/usr/bin/env bash
# Publishes the three channel artifacts downloaded by release.yml.
set -euo pipefail

tag="$GITHUB_REF_NAME"
version="${tag#v}"
releases_api="repos/$GITHUB_REPOSITORY/releases"
channels=(win linux osx)
pre_args=()
prerelease=false
if [[ "$version" == *-* ]]; then
  prerelease=true
  pre_args+=(--pre)
fi

find_release() {
  local releases release_tag id draft pre
  # Listing with maintainer credentials includes drafts. An API error must abort the run.
  releases="$(gh api --paginate "$releases_api?per_page=100" --jq '.[] | [.tag_name, .id, .draft, .prerelease] | @tsv')" || return
  while IFS=$'\t' read -r release_tag id draft pre; do
    if [[ "$release_tag" == "$tag" ]]; then
      printf '%s\t%s\t%s\n' "$id" "$draft" "$pre"
      return
    fi
  done <<< "$releases"
}

verify_feeds() {
  local assets channel
  assets="$(gh api --paginate "$releases_api/$1/assets" --jq '.[] | select(.state == "uploaded") | .name')"
  for channel in "${channels[@]}"; do
    if ! grep -Fxq "releases.$channel.json" <<< "$assets"; then
      echo "Release '$tag' is missing releases.$channel.json." >&2
      return 1
    fi
  done
}

release="$(find_release)"
IFS=$'\t' read -r release_id is_draft is_prerelease <<< "$release"
if [[ "$is_draft" == true ]]; then
  # A failed upload can leave installer assets before the channel manifest is uploaded.
  gh api --method DELETE "$releases_api/$release_id" --silent
elif [[ -n "$release_id" ]]; then
  verify_feeds "$release_id"
  echo "Release '$tag' is already published."
  exit 0
fi

for channel in "${channels[@]}"; do
  dotnet vpk upload github \
    --outputDir "artifacts/releases/release-$channel" \
    --channel "$channel" \
    --repoUrl "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" \
    --token "$GH_TOKEN" \
    --tag "$tag" \
    --releaseName "Task Tracker $version" \
    --merge "${pre_args[@]}"
done

release="$(find_release)"
IFS=$'\t' read -r release_id is_draft is_prerelease <<< "$release"
if [[ "$is_draft" != true || "$is_prerelease" != "$prerelease" ]]; then
  echo "Release '$tag' must be a draft with prerelease=$prerelease before publishing." >&2
  exit 1
fi
verify_feeds "$release_id"
gh api --method PATCH "$releases_api/$release_id" -F draft=false --silent
