#!/bin/bash
# Clipi watchdog: keep the local Clipi server up after VM restarts/replacements.
# Bounded scope: only the Clipi service. If the health check passes, do nothing.
set -u
UNIT_SRC="/home/hatch/workspace/clipstudio/clipi.service"
UNIT_DST="/etc/systemd/system/clipi.service"
if curl -fsS -m 5 http://localhost:4000/api/health >/dev/null 2>&1; then
  exit 0
fi
# Server down: restore the unit file if it vanished (e.g. VM replacement),
# then (re)start the service. The service itself auto-resumes running jobs.
if [ ! -f "$UNIT_DST" ] || ! cmp -s "$UNIT_SRC" "$UNIT_DST"; then
  cp "$UNIT_SRC" "$UNIT_DST"
  systemctl daemon-reload
fi
# Outbound traffic must go through the runtime egress proxy, which lives in
# this script's environment (set by the runtime, may rotate). Pass it to the
# service manager as runtime state — never write the credential into a file.
if [ -n "${HTTPS_PROXY:-}" ]; then
  systemctl set-environment HTTPS_PROXY="$HTTPS_PROXY" HTTP_PROXY="${HTTP_PROXY:-$HTTPS_PROXY}" \
    https_proxy="${https_proxy:-$HTTPS_PROXY}" http_proxy="${http_proxy:-$HTTPS_PROXY}" \
    NODE_USE_ENV_PROXY=1
fi
systemctl enable clipi.service >/dev/null 2>&1
systemctl restart clipi.service
sleep 5
curl -fsS -m 5 http://localhost:4000/api/health >/dev/null 2>&1
