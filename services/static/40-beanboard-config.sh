#!/bin/sh
set -eu

api_url="${BEANBOARD_API_URL:-}"
case "$api_url" in
  ""|http://*|https://*) ;;
  *) echo "BEANBOARD_API_URL must be blank or an HTTP(S) URL" >&2; exit 1 ;;
esac

escaped_url=$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.BEANBOARD_CONFIG = { apiUrl: "%s" };\n' "$escaped_url" > /usr/share/nginx/html/config.js
