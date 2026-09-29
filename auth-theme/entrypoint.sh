#!/bin/bash
set -euo pipefail
if [[ -n "${MOSSVALE_DB_CA_BASE64:-}" ]]; then
  umask 077
  rm -f /tmp/mossvale-db-ca.pem
  if ! printf '%s' "$MOSSVALE_DB_CA_BASE64" | base64 --decode > /tmp/mossvale-db-ca.pem 2>/dev/null; then
    rm -f /tmp/mossvale-db-ca.pem; printf '%s\n' 'Invalid database CA encoding.' >&2; exit 1
  fi
fi
exec /opt/keycloak/bin/kc.sh "$@"
