#!/usr/bin/env bash
set -euo pipefail
installation=/opt/ontora/attio-sync
[[ $(id -u) == 0 ]] || { echo 'Run with sudo to read the protected environment file.' >&2; exit 1; }
case "${1:-plan}" in
  plan) arguments=() ;;
  setup-plan) arguments=(setup) ;;
  setup-apply) arguments=(setup --apply) ;;
  apply) arguments=(--apply) ;;
  *) echo 'Usage: run.sh [plan|setup-plan|setup-apply|apply]' >&2; exit 1 ;;
esac
[[ $# -le 1 ]] || exit 1
[[ -f "$installation/runtime.env" && $(stat -c '%a:%u' "$installation/runtime.env") == '600:0' ]] || { echo 'runtime.env must exist, owned by root with mode 0600.' >&2; exit 1; }
release_directory=$(dirname "$(readlink -f "$0")")
image=$(cat "$release_directory/image-id")
[[ $image =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
# A fixed container name prevents concurrent runs even after a client disconnects.
exec docker run --rm --name ontora-attio-sync-run --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 1g --cpus 1 --pids-limit 128 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --env-file "$installation/runtime.env" \
  --mount "type=bind,source=$installation/data,target=/data" \
  "$image" "${arguments[@]}"
