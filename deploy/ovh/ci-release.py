#!/usr/bin/env python3
"""Root-owned forced SSH command. Accepts only Mossvale image preparation/deployment."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
from release import validate_apple_iap, validate_turnkey, validate_arena


def validate(request):
    if not isinstance(request, dict) or set(request) not in [{'action', 'image', 'registryToken'}, {'action', 'image', 'registryToken', 'appleIap'}, {'action', 'image', 'registryToken', 'turnkey'}, {'action', 'image', 'registryToken', 'arena'}, {'action', 'image', 'registryToken', 'proof'}]:
        raise ValueError('Invalid deployment request')
    if 'appleIap' in request:
        try:
            validate_apple_iap(request['appleIap'])
        except Exception:
            raise ValueError('Invalid Apple activation settings') from None
    if 'turnkey' in request:
        try:
            validate_turnkey(request['turnkey'])
        except Exception:
            raise ValueError('Invalid Turnkey activation settings') from None
    if 'arena' in request:
        try:
            validate_arena(request['arena'])
        except Exception:
            raise ValueError('Invalid arena activation settings') from None
    actions = ('prepare', 'deploy', 'warn', 'cancel-warning', 'economy-prepare', 'economy-status', 'economy-arm', 'economy-drain', 'economy-backup', 'economy-migrate', 'economy-start', 'economy-enable', 'catalog-drain', 'catalog-status', 'catalog-authorize', 'catalog-start')
    if request['action'] not in actions:
        raise ValueError('Invalid deployment action')
    if request['action'].startswith(('economy-', 'catalog-')) and 'appleIap' in request or 'proof' in request and request['action'] not in ('economy-migrate', 'economy-enable', 'catalog-authorize'):
        raise ValueError('Invalid barrier activation payload')
    if request['action'] in ('warn', 'cancel-warning') and 'appleIap' in request:
        raise ValueError('Held warnings cannot activate Apple settings')
    if 'turnkey' in request and request['action'] not in ('prepare', 'deploy'):
        raise ValueError('Turnkey activation is a separate guarded release')
    if 'arena' in request and request['action'] not in ('prepare', 'deploy'):
        raise ValueError('Arena activation is a separate guarded release')
    if not isinstance(request['image'], str) or not re.fullmatch(r'ghcr\.io/trappyon/mossvale-game@sha256:[a-f0-9]{64}', request['image']):
        raise ValueError('An immutable Mossvale image is required')
    token = request['registryToken']
    if not isinstance(token, str) or not 20 <= len(token) <= 4096 or any(c.isspace() for c in token):
        raise ValueError('Invalid registry credential')


def runtime_environment(directory):
    # SSH/user variables must not select another daemon, Compose file or Python path.
    return {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root', 'LANG': 'C.UTF-8', 'DOCKER_CONFIG': directory}


def main():
    if os.geteuid() != 0:
        raise ValueError('Use the installed forced command')
    os.umask(0o077)
    # The SSH key cannot request a shell, command arguments, forwarding, or uploads.
    if len(sys.argv) != 1:
        raise ValueError('No command arguments are accepted')
    def input_timeout(_signal, _frame):
        raise ValueError('Deployment request timed out')
    signal.signal(signal.SIGALRM, input_timeout)
    signal.alarm(15)
    try:
        raw = sys.stdin.buffer.read(32769)
    finally:
        signal.alarm(0)
    if len(raw) > 32768:
        raise ValueError('Request too large')
    request = json.loads(raw)
    validate(request)
    with tempfile.TemporaryDirectory(prefix='mossvale-registry-', dir='/run') as directory:
        environment = runtime_environment(directory)
        login = subprocess.run(['docker', 'login', 'ghcr.io', '--username', 'trappyon', '--password-stdin'],
                               input=request['registryToken'].encode(), capture_output=True, env=environment, timeout=40)
        if login.returncode:
            raise ValueError('Registry authentication failed')
        script = Path(__file__).with_name('release.py')
        for path in [script, *script.absolute().parents]:
            if path.is_symlink() or path.stat().st_uid != 0 or path.stat().st_mode & 0o022:
                raise ValueError('Deployment helper and its directories must be root-owned and protected')
        args = ['python3', str(script), request['image']]
        if request['action'] == 'prepare':
            args.append('--prepare')
        if request['action'] in ('warn', 'cancel-warning'):
            args.extend(['--warning-action', request['action']])
        if 'appleIap' in request:
            args.append('--apple-iap-stdin')
        if 'turnkey' in request:
            args.append('--turnkey-stdin')
        if 'arena' in request:
            args.append('--arena-stdin')
        if request['action'].startswith('economy-'):
            args.extend(['--economy-action', request['action'].removeprefix('economy-')])
        if request['action'].startswith('catalog-'):
            args.extend(['--catalog-action', request['action'].removeprefix('catalog-')])
        payload = request.get('proof') if request['action'].startswith(('economy-', 'catalog-')) else request.get('appleIap', request.get('turnkey', request.get('arena')))
        completed = subprocess.run(args, input=json.dumps(payload).encode() if payload is not None or request['action'].startswith(('economy-', 'catalog-')) else None, env=environment, timeout=1800)
        if completed.returncode:
            raise ValueError('Regional rollout stopped; inspect its saved phase')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print registry credentials or subprocess stderr.
        print(json.dumps({'ok': False, 'error': str(error) if isinstance(error, ValueError) else type(error).__name__}))
        sys.exit(1)
