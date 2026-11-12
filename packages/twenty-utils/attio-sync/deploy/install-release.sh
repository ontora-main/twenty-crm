#!/usr/bin/env bash
set -euo pipefail
# Deployment only installs a tested image; it never receives CRM credentials.
[[ $# == 2 && $2 =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: install-release.sh ARTIFACT_DIRECTORY COMMIT_SHA' >&2; exit 1; }
artifact_directory=$(realpath "$1")
revision=$2
installation=/opt/ontora/attio-sync
[[ $(id -u) == 0 ]] || { echo 'Run installer with sudo.' >&2; exit 1; }
cd "$artifact_directory"
sha256sum --check SHA256SUMS
[[ $(cat revision) == "$revision" ]] || { echo 'Revision mismatch' >&2; exit 1; }
install -d -m 755 "$installation/releases"
exec 9>"$installation/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
docker load --input image.tar.gz
image="ontora-attio-sync:$revision"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges "$image" --help
release_directory="$installation/releases/$revision"
install -d -m 755 "$release_directory"
install -m 755 run.sh "$release_directory/run.sh"
printf '%s\n' "$(docker image inspect --format '{{.Id}}' "$image")" > "$release_directory/image-id"
printf '%s\n' "$revision" > "$release_directory/revision"
install -d -m 700 -o 1000 -g 1000 "$installation/data"
if [[ -L "$installation/current" ]]; then
  ln -sfn "$(readlink "$installation/current")" "$installation/previous"
fi
ln -sfn "$release_directory" "$installation/current.next"
mv -Tf "$installation/current.next" "$installation/current"
printf 'Installed %s. No synchronization was started.\n' "$revision"
