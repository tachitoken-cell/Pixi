#!/bin/sh
set -eu
umask 077
test "$(id -u)" = 0 || { echo 'Run as root on the regional host.' >&2; exit 1; }
test "$#" = 1 || { echo 'Usage: install-ci.sh deployment-key.pub' >&2; exit 1; }
deployment_key=$(realpath -- "$1")
ssh-keygen -l -f "$deployment_key" >/dev/null
cd "$(dirname "$0")"
python3 - "$deployment_key" <<'PY'
import os
from pathlib import Path
import pwd
import re
import sys

key = Path(sys.argv[1]).read_text().strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]{68}=?(?: [A-Za-z0-9_.@-]+)?', key):
    raise SystemExit('Use a single deployment-only Ed25519 public key.')
account = pwd.getpwnam('ubuntu')
home = Path(account.pw_dir)
directory = Path('/usr/local/lib/mossvale-release')
for parent in [directory, *directory.parents]:
    if parent.exists() and (parent.is_symlink() or parent.stat().st_uid != 0 or parent.stat().st_mode & 0o022):
        raise SystemExit('The helper path must be root-owned and protected.')
directory.mkdir(mode=0o755, parents=True, exist_ok=True)
for name in ['release.py', 'ci-release.py']:
    destination = directory / name
    if destination.is_symlink():
        raise SystemExit('Refusing a symlink helper.')
    temporary = directory / (name + '.new')
    if temporary.exists() or temporary.is_symlink():
        raise SystemExit('A previous helper installation needs inspection.')
    with temporary.open('xb') as target:
        target.write(Path(name).read_bytes())
    temporary.chmod(0o755)
    temporary.replace(destination)
ssh = home / '.ssh'
if not ssh.is_dir() or ssh.is_symlink() or ssh.stat().st_mode & 0o022:
    raise SystemExit('Expected a protected existing ubuntu SSH directory.')
authorized = ssh / 'authorized_keys'
if authorized.is_symlink() or not authorized.is_file() or authorized.stat().st_mode & 0o022:
    raise SystemExit('Expected a protected existing authorized_keys file.')
current = authorized.read_text()
entry = 'restrict,command="sudo -n /usr/bin/python3 /usr/local/lib/mossvale-release/ci-release.py" ' + key
matching = [line for line in current.splitlines() if key.split()[1] in line.split()]
if matching and matching != [entry]:
    raise SystemExit('This key already exists with different access; use a new deployment key.')
if not matching:
    backup = ssh / 'authorized_keys.before-mossvale-ci'
    if not backup.exists():
        with backup.open('x') as file:
            file.write(current)
        os.chown(backup, account.pw_uid, account.pw_gid)
    temporary = ssh / 'authorized_keys.mossvale-new'
    with temporary.open('x') as file:
        file.write(current.rstrip('\n') + '\n' + entry + '\n')
    os.chown(temporary, account.pw_uid, account.pw_gid)
    temporary.replace(authorized)
print('Installed the deployment-only SSH command. No realm was restarted.')
PY
