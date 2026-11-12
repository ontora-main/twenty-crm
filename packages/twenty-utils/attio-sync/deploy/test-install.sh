#!/usr/bin/env bash
set -euo pipefail
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
mkdir "$workspace/bin" "$workspace/artifact"
cat > "$workspace/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  load) exit 0 ;;
  run) [[ ${FAIL_SMOKE:-false} != true ]] ;;
  image) printf 'sha256:%064d\n' 0 ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "$workspace/bin/docker"
export PATH="$workspace/bin:$PATH"
cp /tests/run.sh "$workspace/artifact/run.sh"
cp /tests/install-release.sh "$workspace/artifact/install-release.sh"
printf 'test image' > "$workspace/artifact/image.tar.gz"
first_revision=1111111111111111111111111111111111111111
second_revision=2222222222222222222222222222222222222222
prepare() {
  printf '%s\n' "$1" > "$workspace/artifact/revision"
  (cd "$workspace/artifact" && sha256sum image.tar.gz install-release.sh run.sh revision > SHA256SUMS)
}
prepare "$first_revision"
bash /tests/install-release.sh "$workspace/artifact" "$first_revision"
[[ $(cat /opt/ontora/attio-sync/current/revision) == "$first_revision" ]]
prepare "$second_revision"
if FAIL_SMOKE=true bash /tests/install-release.sh "$workspace/artifact" "$second_revision"; then
  echo 'Failed smoke test was accepted' >&2; exit 1
fi
[[ $(cat /opt/ontora/attio-sync/current/revision) == "$first_revision" ]]
printf 'corruption' >> "$workspace/artifact/image.tar.gz"
if bash /tests/install-release.sh "$workspace/artifact" "$second_revision"; then
  echo 'Corrupted artifact was accepted' >&2; exit 1
fi
[[ $(cat /opt/ontora/attio-sync/current/revision) == "$first_revision" ]]
prepare "$second_revision"
bash /tests/install-release.sh "$workspace/artifact" "$second_revision"
[[ $(cat /opt/ontora/attio-sync/current/revision) == "$second_revision" ]]
[[ $(cat /opt/ontora/attio-sync/previous/revision) == "$first_revision" ]]
if bash /opt/ontora/attio-sync/current/run.sh plan; then
  echo 'Missing credentials were accepted' >&2; exit 1
fi
printf 'Deployment safety tests passed.\n'
