#!/usr/bin/env bash
# Wait until the live site is serving a given commit.
#
# Comparing asset hashes does not work: the build stamp contains a timestamp, so a CI
# build never produces the same hash as a local one. The commit sha in the stamp is
# the thing worth checking anyway.
set -u
sha="${1:-$(git rev-parse --short HEAD)}"
url="https://geekbleek.github.io/chess-teacher/"
for _ in $(seq 1 90); do
  bundle=$(curl -s "$url" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$bundle" ] && curl -s "$url$bundle" | grep -q "· $sha"; then
    echo "DEPLOYED $sha"
    exit 0
  fi
  sleep 5
done
echo "TIMEOUT waiting for $sha"
exit 1
