#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")"
backup_dir=${1:-/var/backups/mossvale-shared}
mkdir -p "$backup_dir"
temporary=$(mktemp "$backup_dir/.mossvale-shared-XXXXXX")
trap 'rm -f "$temporary"' EXIT
trap 'exit 1' HUP INT TERM
docker compose run --rm --no-deps -T database-tools dump > "$temporary"
docker compose run --rm --no-deps -T database-tools verify < "$temporary" > /dev/null
mv "$temporary" "$backup_dir/mossvale-shared-$(date -u +%Y%m%dT%H%M%SZ).dump"
find "$backup_dir" -maxdepth 1 -type f -name 'mossvale-shared-*.dump' -mtime +14 -delete
