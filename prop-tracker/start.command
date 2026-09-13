#!/bin/sh
# Double-click this to start the tracker (macOS / Linux).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node isn't installed. Get it from https://nodejs.org (the LTS button),"
  echo "  then double-click this file again."
  echo ""
  read -r _ 2>/dev/null
  exit 1
fi

URL="http://127.0.0.1:${PORT:-3100}"

# Give the server a moment to bind before the browser goes looking for it.
(
  sleep 2
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

exec node server.js
