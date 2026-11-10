#!/bin/sh
# Dupliqué de socle/ops/clamav/entrypoint.sh @ 4e1b625040c5f962f166ed74a691f5cee0126e27 — adaptations : HTTP immédiat, disponibilité par PONG, arrêt des enfants ; clamd et freshclam restent ceux de l'image officielle.
set -eu

/init &
clam_pid=$!
node /srv/server.mjs &
http_pid=$!

stop_children() {
  kill "$http_pid" "$clam_pid" 2>/dev/null || true
  wait "$http_pid" 2>/dev/null || true
  wait "$clam_pid" 2>/dev/null || true
}
trap 'stop_children; exit 0' INT TERM
while kill -0 "$clam_pid" 2>/dev/null && kill -0 "$http_pid" 2>/dev/null; do sleep 2; done
stop_children
exit 1
