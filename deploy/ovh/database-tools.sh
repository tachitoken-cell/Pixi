#!/bin/sh
set -eu
umask 077
case "${1:-}" in
  verify) exec pg_restore --list ;;
  dump) ;;
  *) echo 'Expected dump or verify.' >&2; exit 1 ;;
esac
: "${DATABASE_URL:?Set the canonical shared database URL}"
case "$DATABASE_URL" in postgres://*|postgresql://*) ;; *) echo 'Expected a PostgreSQL URL.' >&2; exit 1 ;; esac
backup_url=$DATABASE_URL
if [ -n "${DATABASE_CA_BASE64:-}" ]; then
  printf '%s' "$DATABASE_CA_BASE64" | base64 --decode > /tmp/mossvale-db-ca.pem
  case "$backup_url" in *\?*) separator='&' ;; *) separator='?' ;; esac
  # libpq uses the last occurrence: enforce the supplied CA and hostname check
  # even if the original provider URI specified a weaker sslmode.
  backup_url="${backup_url}${separator}sslmode=verify-full&sslrootcert=/tmp/mossvale-db-ca.pem"
fi
# Expansion happens only inside this short-lived private container. Never enable
# shell tracing or print the connection URL, which contains database credentials.
exec pg_dump --dbname="$backup_url" --format=custom
