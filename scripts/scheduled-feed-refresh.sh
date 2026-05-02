#!/usr/bin/env bash
#
# Trigger the bulk feed refresh endpoint on the deployed app.
#
# Provider-neutral: this script depends only on bash + curl, so it
# works as the command behind any cron-like facility — Replit
# Scheduled Deployments, Hostinger / cPanel cron jobs, plain Linux
# cron, systemd timers, GitHub Actions, etc. See replit.md →
# "Inbound Feeds (PESOS)" → "Scheduled refresh" for per-provider
# wiring instructions.
#
# Required env (set wherever the cron runs):
#   CRON_SECRET      — must match the API server's CRON_SECRET
#   PUBLIC_SITE_URL  — fully-qualified origin of the deployed app
#                      (e.g. https://yourdomain.com). The endpoint
#                      `/api/feed-sources/refresh` is appended.
#
# Optional env:
#   FORCE=1          — append ?force=1 to bypass the per-source cadence
#                      gate (normally OFF — daily/weekly sources should
#                      self-throttle).
#
# Behavior:
#   - Fails fast on non-2xx (curl --fail-with-body), prints the
#     server's response body to stdout even on error, and exits
#     non-zero so the cron host surfaces the failure.
#   - Never echoes CRON_SECRET to logs.
set -euo pipefail

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "scheduled-feed-refresh: CRON_SECRET is not set" >&2
  exit 2
fi

if [[ -z "${PUBLIC_SITE_URL:-}" ]]; then
  echo "scheduled-feed-refresh: PUBLIC_SITE_URL is not set" >&2
  exit 2
fi

base="${PUBLIC_SITE_URL%/}"
url="${base}/api/feed-sources/refresh"
if [[ "${FORCE:-}" == "1" ]]; then
  url="${url}?force=1"
fi

echo "scheduled-feed-refresh: POST ${url}"

curl --fail-with-body -sS -X POST \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  -H "Accept: application/json" \
  "${url}"

echo
echo "scheduled-feed-refresh: ok"
