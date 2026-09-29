#!/usr/bin/env python3
"""Compatible game-image updates, with restricted first-time service activation."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

ROOT = Path('/opt/mossvale')
STATE = Path('/var/lib/mossvale/releases')
IMAGE_PATTERN = r'ghcr\.io/trappyon/mossvale-game@sha256:[a-f0-9]{64}'
HOST_FILES = ['deploy/ovh/compose.yml', 'deploy/ovh/Caddyfile', 'deploy/ovh/backup.sh',
              'deploy/ovh/database-tools.sh', 'public/realm-restarting.html']
APPLE_KEYS = {'APPLE_IAP_PRIVATE_KEY', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'MOBILE_PURCHASE_SANDBOX_ACCOUNTS'}
TURNKEY_KEYS = ['TURNKEY_ORGANIZATION_ID', 'TURNKEY_AUTH_PROXY_CONFIG_ID', 'ALCHEMY_WALLET_API_KEY', 'ALCHEMY_GAS_POLICY_ID',
                'TURNKEY_SPONSOR_MAX_OPERATION_WEI', 'TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI', 'TURNKEY_SPONSOR_WALLET_DAILY_WEI',
                'TURNKEY_SPONSOR_GLOBAL_DAILY_WEI', 'TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI', 'TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS']

ARENA_KEYS = ['MOSS_ARENA_CONTRACT', 'MOSS_ARENA_AUTHORITY_KEY', 'MOSS_ARENA_RPC_URL']

class Refused(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def validate_apple_iap(value):
    require(isinstance(value, dict) and set(value) == APPLE_KEYS, 'Expected exactly four Apple purchase settings.')
    require(all(isinstance(v, str) for v in value.values()), 'Invalid Apple purchase settings.')
    require(re.fullmatch(r'-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]{100,500}\n-----END PRIVATE KEY-----\n?', value['APPLE_IAP_PRIVATE_KEY']), 'Invalid Apple signing key encoding.')
    require(re.fullmatch(r'[A-Z0-9]{10}', value['APPLE_IAP_KEY_ID']), 'Invalid Apple key identifier.')
    require(re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', value['APPLE_IAP_ISSUER_ID']), 'Invalid Apple issuer identifier.')
    require(re.fullmatch(r'[a-f0-9]{64}(?:,[a-f0-9]{64}){0,19}', value['MOBILE_PURCHASE_SANDBOX_ACCOUNTS']), 'Explicit review account hashes are required.')
    return value


def validate_turnkey(value):
    require(isinstance(value, dict) and set(value) == set(TURNKEY_KEYS), 'Expected exactly the Turnkey identifiers, Alchemy credentials and explicit sponsorship limits.')
    require(all(isinstance(v, str) for v in value.values()), 'Invalid Turnkey activation settings.')
    for key in TURNKEY_KEYS[:2]:
        require(re.fullmatch(r'[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89aAbB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}', value[key]), 'Invalid Turnkey identifier.')
    require(re.fullmatch(r'[A-Za-z0-9_-]{8,256}', value['ALCHEMY_WALLET_API_KEY']), 'Invalid Alchemy API credential.')
    require(re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', value['ALCHEMY_GAS_POLICY_ID']), 'Invalid Alchemy policy identifier.')
    for key in TURNKEY_KEYS[4:9]:
        require(re.fullmatch(r'[1-9][0-9]{0,77}', value[key]) and int(value[key]) < 2 ** 256, 'Every sponsorship wei limit must be explicitly positive.')
    maximum, account, wallet, total = [int(value[key]) for key in TURNKEY_KEYS[4:8]]
    require(maximum <= account <= total and maximum <= wallet <= total, 'Sponsorship limits are inconsistent.')
    require(re.fullmatch(r'[1-9][0-9]{0,6}', value[TURNKEY_KEYS[9]]) and int(value[TURNKEY_KEYS[9]]) <= 1000000, 'An explicit daily operation limit is required.')
    return value


def turnkey_fingerprint(value):
    values = [value.get(key, '') for key in TURNKEY_KEYS]
    return hashlib.sha256(json.dumps(values, separators=(',', ':')).encode()).hexdigest() if any(values) else None


def validate_arena(value):
    require(isinstance(value, dict) and set(value) == set(ARENA_KEYS), 'Expected exactly three arena activation settings.')
    require(all(isinstance(v, str) for v in value.values()), 'Invalid arena activation settings.')
    require(re.fullmatch(r'0x[a-fA-F0-9]{40}', value[ARENA_KEYS[0]]) and int(value[ARENA_KEYS[0]], 16) > 0, 'Invalid arena contract address.')
    require(re.fullmatch(r'0x[a-fA-F0-9]{64}', value[ARENA_KEYS[1]]) and 0 < int(value[ARENA_KEYS[1]], 16) < 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141, 'Invalid arena signing key.')
    require(re.fullmatch(r'https://robinhood-mainnet\.g\.alchemy\.com/v2/[A-Za-z0-9_-]{8,256}', value[ARENA_KEYS[2]]), 'Invalid arena Alchemy RPC URL.')
    return value


def arena_fingerprint(value):
    values = [value.get(key, '') for key in ARENA_KEYS]
    return hashlib.sha256(json.dumps(values, separators=(',', ':')).encode()).hexdigest() if any(values) else None


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def stamp(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def environment(container):
    return dict(value.split('=', 1) for value in container['Config']['Env'])


def command(*args, cwd=None, input=None, stdin=None, timeout=120, env=None):
    # Rendered Compose and process errors may contain credentials. Never echo them.
    result = subprocess.run(args, cwd=cwd, input=input, stdin=stdin, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, env=env)
    require(result.returncode == 0, 'A deployment command failed; the current phase was retained.')
    return result.stdout


def lock(path):
    handle = path.open('a')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise Refused('Another regional release is running.') from None
    return handle


def catalog_version(manifest):
    # Before the first catalog barrier, every deployed realm uses talent catalog 4.
    value = manifest.get('playerCatalogVersion', 4)
    require(type(value) is int and value >= 4, 'Invalid player catalog version.')
    return value


def stopped_valid(old, state):
    require(old['Id'] == state['oldContainer'] and old['Image'] == state['oldImage'], 'Old writer identity changed.')
    require(old['State']['StartedAt'] == state['oldStartedAt'], 'The old writer restarted during deployment.')
    require(not old['State']['Running'] and old['State']['ExitCode'] == 0, 'The old writer has not saved and exited successfully.')
    require(old['HostConfig']['RestartPolicy']['Name'] == 'no', 'Old writer restart protection changed.')
    require(state.get('warningSentAt') and stamp(old['State']['FinishedAt']) >= stamp(state['warningAt']), 'A real shutdown observation is required.')
    require((stamp(old['State']['FinishedAt']) - stamp(state['warningAt'])).total_seconds() >= 300, 'The five-minute warning must finish before activation.')
    if state.get('oldFinishedAt'):
        require(old['State']['FinishedAt'] == state['oldFinishedAt'], 'Old writer restarted after the saved stop.')


VERIFY_IMAGE = r'''
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const manifest=JSON.parse(fs.readFileSync('/app/release.json','utf8'));
if(!/^[a-f0-9]{40}$/.test(manifest.revision)||!manifest.assets||!manifest.assets['index.html'])throw Error('Invalid release manifest');
if(fs.readFileSync('/app/release.json','utf8')!==fs.readFileSync('/app/dist/release.json','utf8'))throw Error('Public manifest differs');
for(const [name,hash]of Object.entries(manifest.assets)){
 if(!name||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='.')||!/^[\w.][\w./-]*$/.test(name)||!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid asset');
 const file=path.resolve('/app/dist',name);if(!file.startsWith('/app/dist/')||fs.lstatSync(file).isSymbolicLink())throw Error('Invalid asset path');
 if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Asset mismatch');
}
console.log(JSON.stringify(manifest));
'''

VERIFY_APPLE_KEY = """
const fs=require('fs'),crypto=require('crypto');
try{const key=crypto.createPrivateKey(JSON.parse(fs.readFileSync(0,'utf8')).APPLE_IAP_PRIVATE_KEY);
if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error();}
catch{process.exit(1);}
"""

VERIFY_TURNKEY_COMPATIBILITY = """
import('/app/src/deployment-control.mjs').then(m=>{
 if(typeof m.turnkeyConfigurationHash!=='function'||!Array.isArray(m.TURNKEY_ACTIVATION_KEYS))throw Error();
 console.log(JSON.stringify({keys:m.TURNKEY_ACTIVATION_KEYS,turnkeyHash:m.turnkeyConfigurationHash(process.env)}));
}).catch(()=>process.exit(1));
"""


VERIFY_ARENA_COMPATIBILITY = """
import('/app/src/deployment-control.mjs').then(m=>{
 if(typeof m.arenaConfigurationHash!=='function'||!Array.isArray(m.ARENA_ACTIVATION_KEYS))throw Error();
 console.log(JSON.stringify({keys:m.ARENA_ACTIVATION_KEYS,arenaHash:m.arenaConfigurationHash(process.env),treasury:process.env.TREASURE_TREASURY_CONTRACT}));
}).catch(()=>process.exit(1));
"""


class Release:
    def __init__(self, image, root=ROOT, directory=STATE, run=command, apple_iap=None, turnkey=None, arena=None):
        require(re.fullmatch(IMAGE_PATTERN, image), 'Use the exact Mossvale GHCR image digest.')
        self.image, self.root, self.run = image, Path(root), run
        self.apple_iap = validate_apple_iap(apple_iap) if apple_iap is not None else None
        self.turnkey = validate_turnkey(turnkey) if turnkey is not None else None
        self.arena = validate_arena(arena) if arena is not None else None
        require(sum(bool(value) for value in [self.apple_iap, self.turnkey, self.arena]) <= 1, 'Activate Apple, Turnkey and arena in separate releases.')
        config = json.loads(self.compose('config', '--format', 'json'))
        self.realm = config['services']['game']['environment'].get('REALM_ID')
        require(self.realm in ('us', 'asia'), 'Expected an existing US or Asia realm.')
        self.project = 'mossvale-' + self.realm
        self.game = self.project + '-game-1'
        self.local_image = self.project + ':local'
        self.directory = Path(directory) / image.rsplit(':', 1)[1]
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.directory / 'release.json'
        self.warning_owner_path = self.directory.parent / 'warning-owner.json'
        self.state = json.loads(self.path.read_text()) if self.path.exists() else None
        require(self.state is None or self.state.get('realm') == self.realm, 'Saved release belongs to another realm.')
        require(self.state is None or self.state.get('appleIapHash') == (digest(self.apple_iap) if self.apple_iap else None), 'Prepared Apple activation settings changed.')
        require(self.state is None or self.state.get('turnkeyHash') == (turnkey_fingerprint(self.turnkey) if self.turnkey else None), 'Prepared Turnkey activation settings changed.')
        require(self.state is None or self.state.get('arenaHash') == (arena_fingerprint(self.arena) if self.arena else None), 'Prepared arena activation settings changed.')

    def write_record(self, path, value):
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(value, indent=2) + '\n')
        temporary.chmod(0o600)
        with temporary.open('rb') as stream:
            os.fsync(stream.fileno())
        temporary.replace(path)
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def save(self, **changes):
        self.state.update(changes)
        self.write_record(self.path, self.state)

    def health(self):
        return json.loads(self.run('docker', 'exec', self.game, 'node', '-e',
            "fetch('http://127.0.0.1:2567/api/health').then(r=>{if(!r.ok&&r.status!==503)throw Error();return r.json()}).then(v=>console.log(JSON.stringify(v)))"))

    def notice(self, allow_committed=False):
        public = self.health()
        notice = public.get('deploymentWarning')
        require(public.get('realmId') == self.realm and (public.get('ok') is True and public.get('available') is True
                or allow_committed and public.get('available') is False and isinstance(notice, dict) and notice.get('held') is False and notice.get('id')),
                'The original game is not available for a held warning.')
        if notice is None:
            return None
        require(isinstance(notice, dict) and notice.get('version') == 1 and isinstance(notice.get('held'), bool)
                and type(notice.get('secondsRemaining')) is int and 0 <= notice['secondsRemaining'] <= 300
                and (notice.get('id') is None and notice.get('startedAt') is None and notice['held'] is False and notice['secondsRemaining'] == 0
                     or isinstance(notice.get('id'), str) and re.fullmatch(r'[\w-]{1,128}', notice['id'])
                     and type(notice.get('startedAt')) is int and notice['startedAt'] > 0), 'Invalid held-warning capability.')
        return notice

    def warning_process(self):
        old = self.inspect(self.game)
        require(old['Id'] == self.state['oldContainer'] and old['Image'] == self.state['oldImage']
                and old['State']['StartedAt'] == self.state['oldStartedAt'] and old['State']['Running'], 'The warned game process changed.')
        self.old_settings(old)
        return old

    def warning_owner(self):
        owner = json.loads(self.warning_owner_path.read_text()) if self.warning_owner_path.exists() else None
        require(owner == {'image': self.image, 'container': self.state['oldContainer'], 'startedAt': self.state['oldStartedAt'],
                          'requestedAt': self.state.get('warningRequestedAt')}, 'Another release owns the held warning.')

    def warning_ack(self, notice):
        self.warning_owner()
        require(notice and notice['held'] and notice['id'] == self.state.get('noticeId')
                and notice['startedAt'] == self.state.get('noticeStartedAt'), 'The saved held warning changed or was committed.')

    def warn(self):
        require(self.apple_iap is None and self.turnkey is None and self.arena is None and not (self.state and self.state.get('economyBarrierVersion')), 'Held warnings cannot activate service settings or the economy.')
        if self.state and self.state['phase'] == 'cancel-requested':
            self.cancel_warning()
        self.apply(prepare=True)
        require(self.state['phase'] in ['prepared', 'warning-requested', 'warned'], 'This release cannot start another held warning.')
        old = self.warning_process()
        require(old['HostConfig']['RestartPolicy'] == self.state['restartPolicy'], 'Held warnings must preserve restart protection.')
        notice = self.notice()
        require(notice is not None, 'The live game does not support held warnings.')  # SIGUSR1 opens the inspector on older Node games.
        if self.state['phase'] == 'warned':
            self.warning_ack(notice)
            return self.state
        if self.state['phase'] == 'warning-requested':
            self.warning_owner()
            if self.acknowledge_warning(notice):
                return self.state
            require(notice['id'] == self.state.get('priorNoticeId') and (notice['id'] is None or notice['held']),
                    'An unrelated warning replaced the unconfirmed request.')
        require(notice['id'] is None or notice['held'], 'A committed shutdown cannot be replaced.')
        requested_at = now()
        # Ownership is durable before the per-image intent and signal. A later candidate
        # can supersede a held notice, but an interrupted older helper cannot adopt it.
        self.write_record(self.warning_owner_path, {'image': self.image, 'container': old['Id'], 'startedAt': old['State']['StartedAt'], 'requestedAt': requested_at})
        self.save(phase='warning-requested', warningRequestedAt=requested_at, priorNoticeId=notice['id'], noticeId=None, noticeStartedAt=None)
        self.run('docker', 'kill', '--signal=SIGUSR1', old['Id'])
        for _ in range(50):
            self.warning_process()
            if self.acknowledge_warning(self.notice()):
                return self.state
            time.sleep(0.2)
        raise Refused('Held warning was not acknowledged; retry this same release before proceeding.')

    def acknowledge_warning(self, notice):
        self.warning_owner()
        if notice and notice['held'] and notice['id'] != self.state.get('priorNoticeId'):
            require(notice['startedAt'] >= int(stamp(self.state['warningRequestedAt']).timestamp() * 1000), 'The observed warning predates this request.')
            warning_at = datetime.datetime.fromtimestamp(notice['startedAt'] / 1000, datetime.timezone.utc).isoformat()
            self.save(phase='warned', noticeId=notice['id'], noticeStartedAt=notice['startedAt'], warningAt=warning_at, observedWarningAt=now())
            return True
        return False

    def cancel_warning(self):
        require(self.apple_iap is None and self.turnkey is None and self.arena is None and self.state and not self.state.get('economyBarrierVersion'), 'A saved normal-release warning is required.')
        require(self.state['phase'] in ['warning-requested', 'warned', 'cancel-requested', 'cancelled'], 'Only an uncommitted warning request can be cancelled.')
        self.unchanged()
        old = self.warning_process()
        require(old['HostConfig']['RestartPolicy'] == self.state['restartPolicy'], 'The warning already entered shutdown.')
        self.warning_owner()
        notice = self.notice()
        if self.state['phase'] == 'warning-requested' or self.state['phase'] == 'cancelled' and not self.state.get('noticeId'):
            require(notice is not None, 'The live game no longer supports held warnings.')
            if not self.acknowledge_warning(notice):
                require(notice['id'] == self.state.get('priorNoticeId') and (notice['id'] is None or notice['held']),
                        'An unrelated or committed warning replaced this request.')
                # Delivery never became visible. Do not cancel the prior candidate's notice.
                self.save(phase='cancelled', warningCancelledAt=now())
                return self.state
        if self.state['phase'] in ['cancel-requested', 'cancelled'] and notice and notice['id'] is None:
            self.save(phase='cancelled', warningCancelledAt=self.state.get('warningCancelledAt') or now())
            return self.state
        self.warning_ack(notice)
        self.save(phase='cancel-requested', cancellationRequestedAt=now())
        self.run('docker', 'kill', '--signal=SIGHUP', old['Id'])
        for _ in range(50):
            self.warning_process()
            notice = self.notice()
            if notice and notice['id'] is None:
                self.save(phase='cancelled', warningCancelledAt=now())
                return self.state
            self.warning_ack(notice)
            time.sleep(0.2)
        raise Refused('Warning cancellation was not acknowledged; retry this same release.')

    def inspect(self, name):
        return json.loads(self.run('docker', 'inspect', name))[0]

    def compose(self, *args, **kwargs):
        return self.run('docker', 'compose', *args, cwd=self.root / 'deploy/ovh', **kwargs)

    def settings(self, target=False):
        activation = self.apple_iap or self.turnkey or self.arena
        options = {'env': {**os.environ, **activation}} if target and activation else {}
        config = json.loads(self.compose('config', '--format', 'json', **options))
        require(config['name'] == self.project and config['services']['game']['image'] == self.local_image
                and config['services']['game']['environment'].get('REALM_ID') == self.realm, 'Unexpected Compose realm, project or game image.')
        files = {name: sha(self.root / name) for name in HOST_FILES + ['deploy/ovh/.env']}
        return config, {'configHash': digest(config), 'fileHashes': files}

    def infrastructure(self):
        ids = self.run('docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + self.project).decode().split()
        result = {}
        games = []
        caddy = False
        for identifier in ids:
            value = self.inspect(identifier)
            if value['Config']['Labels'].get('com.docker.compose.service') == 'game':
                games.append(value['Name'])
                continue
            if value['Name'] == '/' + self.project + '-caddy-1' and value['Config']['Labels'].get('com.docker.compose.service') == 'caddy':
                caddy = value['State']['Running']
            result[identifier] = {'startedAt': value['State']['StartedAt'], 'running': value['State']['Running'], 'image': value['Image'],
                                  'configHash': digest(value['Config']), 'hostConfigHash': digest(value['HostConfig'])}
        require(games == ['/' + self.game], 'Expected exactly one existing game container for this realm.')
        require(caddy, 'Expected running regional Caddy infrastructure is missing.')
        return result

    def unchanged(self):
        _, settings = self.settings()
        expected = self.state['targetSettings'] if self.state.get('appleIapApplied') or self.state.get('turnkeyApplied') or self.state.get('arenaApplied') else self.state['settings']
        require(settings == expected, 'Host Compose, environment, or deployment files changed.')
        require(self.infrastructure() == self.state['infrastructure'], 'Other services changed during deployment.')

    def old_settings(self, old):
        require(digest(environment(old)) == self.state['envHash'], 'The original game environment changed.')
        config = dict(old['HostConfig'])
        require(config['RestartPolicy'] in [self.state['restartPolicy'], {'Name': 'no', 'MaximumRetryCount': 0}], 'Old writer restart policy changed.')
        if self.state['phase'] != 'prepared':
            config['RestartPolicy'] = self.state['restartPolicy']
        require(digest(config) == self.state['hostConfigHash'], 'The original game runtime settings changed.')

    def candidate_image(self):
        # The digest is immutable. A prepared local image needs no registry refresh.
        try:
            image = self.inspect(self.image)
        except Refused:
            for attempt in range(2):
                try:
                    self.run('docker', 'pull', self.image, timeout=600)
                except subprocess.TimeoutExpired:
                    # The daemon may have finished while the pull client timed out.
                    try:
                        image = self.inspect(self.image)
                        break
                    except Refused:
                        require(attempt == 0, 'Candidate image pull timed out twice; the current release phase was retained.')
                        time.sleep(5)
                else:
                    image = self.inspect(self.image)
                    break
        require(self.image in image.get('RepoDigests', []), 'Local candidate does not match the requested immutable image.')
        return image

    def candidate(self):
        image = self.candidate_image()
        revision = image['Config'].get('Labels', {}).get('org.opencontainers.image.revision', '')
        require(re.fullmatch(r'[a-f0-9]{40}', revision), 'Candidate needs an exact OCI revision label.')
        manifest = json.loads(self.run('docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', self.image, '-e', VERIFY_IMAGE))
        require(manifest['revision'] == revision, 'OCI revision and release manifest differ.')
        config, settings = self.settings()
        expected_host = manifest.get('hostFiles')
        require(isinstance(expected_host, dict) and set(expected_host) == set(HOST_FILES), 'Candidate needs the supported host-file manifest.')
        require(expected_host == {name: settings['fileHashes'][name] for name in HOST_FILES}, 'Candidate expects different host deployment files.')
        predicted = environment(image)
        predicted.update(config['services']['game']['environment'])
        old = self.inspect(self.game)
        require(environment(old).get('REALM_ID') == self.realm and old['Name'] == '/' + self.game, 'Live game realm identity differs.')
        old_env = environment(old)
        # Translation may add only its disabled defaults; existing settings remain exact.
        translation_defaults = {'GOOGLE_TRANSLATE_API_KEY': '', 'CHAT_TRANSLATION_DAILY_CHARACTERS': '5000'}
        # Arena compatibility may add its three absent empty placeholders; Turnkey still requires its activation gate.
        # The original runtime fingerprint remains exact; unrelated missing/changed keys still fail.
        baseline = {key: value for key, value in predicted.items()
                    if not (key not in old_env and ((self.turnkey and key in TURNKEY_KEYS or key in ARENA_KEYS) and value == ''
                            or key in translation_defaults and value == translation_defaults[key]))}
        require(digest(baseline) == digest(old_env), 'Candidate would change the running game environment.')
        if self.apple_iap:
            self.run('docker', 'run', '--rm', '-i', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', self.image, '-e', VERIFY_APPLE_KEY,
                input=json.dumps(self.apple_iap).encode())
            old_env = environment(old)
            require(all(not old_env.get(key) or old_env[key] == value for key, value in self.apple_iap.items()), 'Apple activation cannot replace existing purchase credentials or review accounts.')
            target, _ = self.settings(target=True)
            expected = json.loads(json.dumps(config))
            expected['services']['game']['environment'].update(self.apple_iap)
            require(target == expected, 'Apple activation would change unrelated Compose settings.')
            predicted.update(self.apple_iap)
        if self.turnkey:
            if self.state is None:
                compatibility = json.loads(self.run('docker', 'exec', self.game, 'node', '-e', VERIFY_TURNKEY_COMPATIBILITY))
                require(compatibility.get('keys') == TURNKEY_KEYS and compatibility.get('turnkeyHash') == turnkey_fingerprint(old_env),
                        'Install the Turnkey compatibility release with its gate off before activation.')
            else:
                # A saved, stopped writer cannot answer a new exec; its image/environment stay pinned.
                require(self.state.get('turnkeyCompatibilityVersion') == 1, 'The prepared Turnkey compatibility proof is missing.')
            present = [key for key in TURNKEY_KEYS if old_env.get(key)]
            require(not present or len(present) == len(TURNKEY_KEYS) and all(old_env[key] == value for key, value in self.turnkey.items()),
                    'Turnkey activation cannot replace existing identifiers, credentials or limits.')
            target, _ = self.settings(target=True)
            expected = json.loads(json.dumps(config))
            expected['services']['game']['environment'].update(self.turnkey)
            require(target == expected, 'Install the reviewed Turnkey Compose passthrough; unrelated settings must remain unchanged.')
            predicted.update(self.turnkey)
        if self.arena:
            if self.state is None:
                compatibility = json.loads(self.run('docker', 'exec', self.game, 'node', '-e', VERIFY_ARENA_COMPATIBILITY))
                require(compatibility.get('treasury') == old_env.get('TREASURE_TREASURY_CONTRACT')
                        and re.fullmatch(r'0x[a-fA-F0-9]{40}', compatibility.get('treasury', ''))
                        and int(compatibility['treasury'], 16) > 0, 'Arena needs the existing immutable treasury.')
                require(compatibility.get('keys') == ARENA_KEYS and compatibility.get('arenaHash') == arena_fingerprint(old_env),
                        'Install the Arena compatibility release with its gate off before activation.')
            else:
                # A saved, stopped writer cannot answer a new exec; its image/environment stay pinned.
                require(self.state.get('arenaCompatibilityVersion') == 1, 'The prepared Arena compatibility proof is missing.')
            present = [key for key in ARENA_KEYS if old_env.get(key)]
            require(not present or len(present) == len(ARENA_KEYS) and all(old_env[key] == value for key, value in self.arena.items()),
                    'Arena activation cannot replace existing contract, signing key or RPC.')
            target, _ = self.settings(target=True)
            expected = json.loads(json.dumps(config))
            expected['services']['game']['environment'].update(self.arena)
            require(target == expected, 'Install the reviewed Arena Compose passthrough; unrelated settings must remain unchanged.')
            predicted.update(self.arena)
        for field in ['Cmd', 'Entrypoint', 'User', 'WorkingDir', 'ExposedPorts', 'Volumes']:
            require(image['Config'].get(field) == old['Config'].get(field), 'Candidate changes game runtime settings.')
        return image['Id'], revision, manifest, old, settings, digest(predicted)

    def activate_apple_iap(self, dry_run=False):
        if not self.apple_iap or self.state.get('appleIapApplied'):
            return
        # Called only after the observed five-minute shutdown and backup validation.
        old = self.inspect(self.state['oldContainer'])
        stopped_valid(old, self.state)
        self.old_settings(old)
        require(self.inspect(self.local_image)['Id'] == self.state['candidate'], 'The activation image tag changed.')
        require(self.infrastructure() == self.state['infrastructure'], 'Other services changed during Apple activation.')
        require(sha(Path(self.state['backup']['path'])) == self.state['backup']['sha256'], 'Verified backup changed.')
        for name in HOST_FILES:
            require(sha(self.root / name) == self.state['settings']['fileHashes'][name], 'Host deployment files changed.')
        source = self.root / 'deploy/ovh/.env'
        before = self.directory / 'environment.before-apple-iap'
        require(source.is_file() and not source.is_symlink(), 'Expected a regular host environment file.')
        require(not before.is_symlink() and (not before.exists() or before.stat().st_mode & 0o077 == 0), 'Environment backup must be private.')
        original = before if before.exists() else source
        require(sha(original) == self.state['settings']['fileHashes']['deploy/ovh/.env'], 'Original environment backup changed.')
        # These validated values contain no shell/dotenv interpolation characters.
        content = original.read_bytes().rstrip(b'\n') + b'\n' + ''.join(key + '=' + json.dumps(self.apple_iap[key]) + '\n' for key in sorted(APPLE_KEYS)).encode()
        target_hash = hashlib.sha256(content).hexdigest()
        require(sha(source) in [sha(original), target_hash], 'Environment changed during Apple activation.')
        expected = self.state['targetConfigHash'] if sha(source) == target_hash else self.state['settings']['configHash']
        require(self.settings()[1]['configHash'] == expected, 'Compose changed during Apple activation.')
        if dry_run:
            return
        if not before.exists():
            with before.open('xb') as stream:
                stream.write(source.read_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            before.chmod(0o600)
        if sha(source) != target_hash:
            with tempfile.NamedTemporaryFile(dir=source.parent, prefix='.env.apple-iap-', delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(source)
            descriptor = os.open(source.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        _, settings = self.settings()
        expected = self.state['targetConfigHash']
        require(settings['configHash'] == expected, 'Activated Apple settings differ from preparation.')
        self.save(appleIapApplied=True, targetSettings=settings)

    def backup(self):
        directory = self.directory / ('backup-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        self.run(str(self.root / 'deploy/ovh/backup.sh'), str(directory), timeout=300)
        dumps = list(directory.glob('*.dump'))
        require(len(dumps) == 1 and dumps[0].stat().st_size > 0, 'A complete shared database backup is required.')
        with dumps[0].open('rb') as stream:
            self.compose('run', '--rm', '--no-deps', '-T', '--entrypoint', 'pg_restore', 'database-tools', '--file=/dev/null', stdin=stream, timeout=180)
        self.save(backup={'path': str(dumps[0]), 'sha256': sha(dumps[0]), 'bytes': dumps[0].stat().st_size, 'verifiedAt': now()})

    def activate_service(self, dry_run=False):
        kind, activation, keys = ('arena', self.arena, ARENA_KEYS) if self.arena else ('turnkey', self.turnkey, TURNKEY_KEYS)
        if not activation or self.state.get(kind + 'Applied'):
            return
        old = self.inspect(self.state['oldContainer'])
        stopped_valid(old, self.state)
        self.old_settings(old)
        require(self.inspect(self.local_image)['Id'] == self.state['candidate'], 'The activation image tag changed.')
        require(self.infrastructure() == self.state['infrastructure'], 'Other services changed during service activation.')
        require(sha(Path(self.state['backup']['path'])) == self.state['backup']['sha256'], 'Verified backup changed.')
        for name in HOST_FILES:
            require(sha(self.root / name) == self.state['settings']['fileHashes'][name], 'Host deployment files changed.')
        source = self.root / 'deploy/ovh/.env'
        before = self.directory / ('environment.before-' + kind)
        require(source.is_file() and not source.is_symlink(), 'Expected a regular host environment file.')
        require(not before.is_symlink() and (not before.exists() or before.stat().st_mode & 0o077 == 0), 'Environment backup must be private.')
        original = before if before.exists() else source
        require(sha(original) == self.state['settings']['fileHashes']['deploy/ovh/.env'], 'Original environment backup changed.')
        # Validation admits no shell/dotenv interpolation characters in any activation value.
        content = original.read_bytes().rstrip(b'\n') + b'\n' + ''.join(key + '=' + json.dumps(activation[key]) + '\n' for key in sorted(keys)).encode()
        target_hash = hashlib.sha256(content).hexdigest()
        require(sha(source) in [sha(original), target_hash], 'Environment changed during service activation.')
        expected = self.state['targetConfigHash'] if sha(source) == target_hash else self.state['settings']['configHash']
        require(self.settings()[1]['configHash'] == expected, 'Compose changed during service activation.')
        if dry_run:
            return
        if not before.exists():
            with before.open('xb') as stream:
                stream.write(source.read_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            before.chmod(0o600)
        if sha(source) != target_hash:
            with tempfile.NamedTemporaryFile(dir=source.parent, prefix='.env.' + kind + '-', delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(source)
            descriptor = os.open(source.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        _, settings = self.settings()
        require(settings['configHash'] == self.state['targetConfigHash'], 'Activated service settings differ from preparation.')
        self.save(**{kind + 'Applied': True}, targetSettings=settings)

    def ready_to_start(self):
        self.unchanged()
        require(sha(Path(self.state['backup']['path'])) == self.state['backup']['sha256'], 'Verified backup changed.')
        require(self.inspect(self.local_image)['Id'] == self.state['candidate'], 'The activation image tag changed.')
        game = self.inspect(self.game)
        if game['Id'] == self.state['oldContainer']:
            stopped_valid(game, self.state)
            self.old_settings(game)
        else:
            require(game['Image'] == self.state['candidate'] and stamp(game['State']['StartedAt']) >= stamp(self.state['stoppedAt']), 'An unexpected game replaced the saved writer.')
            require(digest(environment(game)) == self.state.get('targetEnvHash', self.state['envHash']) and digest(game['HostConfig']) == self.state['hostConfigHash'], 'Replacement runtime settings changed.')
        return game

    def start(self):
        require(not self.state.get('catalogBarrierRequired') or self.state.get('catalogBarrierProof'),
                'All realm catalog drain proofs are required before starting a writer.')
        self.activate_apple_iap()
        self.activate_service()
        game = self.ready_to_start()
        if game['Id'] != self.state['oldContainer']:
            require(game['State']['Running'], 'The replacement stopped; inspect its failure before retrying.')
            return  # A previous Compose invocation already started this writer.
        # Reload only after the old writer's final save, before new WebSockets can enter.
        self.run('docker', 'exec', self.project + '-caddy-1', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile', timeout=30)
        self.unchanged()
        self.compose('up', '-d', '--no-build', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'game', timeout=180)

    def finish(self):
        self.unchanged()
        game = self.inspect(self.game)
        require(game['Image'] == self.state['candidate'] and game['State']['Running'] and game['State']['Health']['Status'] == 'healthy', 'The candidate game is not healthy.')
        require(digest(environment(game)) == self.state.get('targetEnvHash', self.state['envHash']) and digest(game['HostConfig']) == self.state['hostConfigHash'], 'Activated runtime settings changed.')
        public = json.loads(self.run('docker', 'exec', self.game, 'node', '-e', "fetch('http://127.0.0.1:2567/api/health').then(r=>r.json()).then(v=>console.log(JSON.stringify(v)))"))
        require(public.get('ok') is True and public.get('available') is True and public.get('realmId') == self.realm, 'Regional application health failed.')
        self.save(phase='complete', newContainer=game['Id'], completedAt=now())

    def apply(self, prepare=False, stop_only=False):
        require(not self.state or not self.state.get('catalogBarrierRequired') or prepare or getattr(self, 'catalog_action_active', False),
                'Resume the player catalog release through its workflow barrier.')
        require(not self.state or not self.state.get('economyBarrierVersion') or getattr(self, 'economy_action_active', False) or prepare,
                'Resume the economy activation through its workflow barrier; normal deploy cannot bypass it.')
        if self.state and self.state['phase'] in ['starting', 'complete']:
            if self.state['phase'] == 'starting':
                if prepare:
                    # No configuration mutation during preparation; deploy resumes it.
                    if self.apple_iap and not self.state.get('appleIapApplied'):
                        self.activate_apple_iap(dry_run=True)
                    elif (self.turnkey and not self.state.get('turnkeyApplied')) or (self.arena and not self.state.get('arenaApplied')):
                        self.activate_service(dry_run=True)
                    else:
                        self.ready_to_start()
                    return self.state
                self.start()
            self.finish()
            return self.state
        candidate, revision, manifest, old, settings, target_env_hash = self.candidate()
        if self.state is None:
            require(old['State']['Running'] and old['State']['Health']['Status'] == 'healthy', 'Existing game must be healthy before preparation.')
            public_config = json.loads(self.run('docker', 'exec', self.game, 'node', '-e', "fetch('http://127.0.0.1:2567/api/config').then(r=>{if(!r.ok)throw Error();return r.json()}).then(v=>console.log(JSON.stringify(v)))"))
            require(isinstance(public_config, dict), 'The original public configuration is unavailable.')
            old_manifest = json.loads(self.run('docker', 'exec', self.game, 'node', '-e',
                "console.log(require('fs').readFileSync('/app/release.json','utf8'))"))
            old_version, target_version = catalog_version(old_manifest), catalog_version(manifest)
            require(target_version >= old_version, 'Player catalog downgrade is unsafe.')
            require(re.fullmatch(r'[a-f0-9]{40}', old_manifest.get('revision', '')), 'Old writer revision is unavailable.')
            if self.turnkey and turnkey_fingerprint(environment(old)) is None:
                require(old_manifest['revision'] != revision, 'Initial Turnkey activation requires a fresh release after compatibility.')
            if self.arena and arena_fingerprint(environment(old)) is None:
                require(old_manifest['revision'] != revision, 'Initial arena activation requires a fresh release after compatibility.')
            self.state = {'catalogBarrierVersion': 1, 'catalogBarrierRequired': target_version != old_version,
                'oldRevision': old_manifest['revision'], 'oldCatalogVersion': old_version, 'playerCatalogVersion': target_version,
                'realm': self.realm, 'image': self.image, 'candidate': candidate, 'revision': revision, 'manifestHash': digest(manifest), 'phase': 'prepared', 'preparedAt': now(),
                'publicConfig': public_config,
                'oldContainer': old['Id'], 'oldImage': old['Image'], 'oldStartedAt': old['State']['StartedAt'], 'envHash': digest(environment(old)),
                'targetEnvHash': target_env_hash, 'appleIapHash': digest(self.apple_iap) if self.apple_iap else None,
                'turnkeyHash': turnkey_fingerprint(self.turnkey) if self.turnkey else None,
                **({'turnkeyCompatibilityVersion': 1} if self.turnkey else {}),
                'arenaHash': arena_fingerprint(self.arena) if self.arena else None,
                **({'arenaCompatibilityVersion': 1, 'arenaTreasury': environment(old)['TREASURE_TREASURY_CONTRACT']} if self.arena else {}),
                'targetConfigHash': self.settings(target=True)[1]['configHash'],
                'hostConfigHash': digest(old['HostConfig']), 'restartPolicy': old['HostConfig']['RestartPolicy'], 'settings': settings, 'infrastructure': self.infrastructure()}
            self.save()
        require(not self.state.get('catalogBarrierRequired') or prepare or getattr(self, 'catalog_action_active', False),
                'Prepare and drain every realm through the player catalog barrier.')
        require(candidate == self.state['candidate'] and revision == self.state['revision'] and digest(manifest) == self.state['manifestHash'], 'Prepared candidate changed.')
        self.unchanged()
        require(old['Id'] == self.state['oldContainer'] and old['Image'] == self.state['oldImage'] and old['State']['StartedAt'] == self.state['oldStartedAt'], 'The original game changed since preparation.')
        self.old_settings(old)
        if self.state['phase'] in ['warning-requested', 'warned', 'cancel-requested', 'cancelled']:
            require(old['State']['Running'] and old['HostConfig']['RestartPolicy'] == self.state['restartPolicy'], 'The held-warning process changed.')
            require(sha(Path(self.state['backup']['path'])) == self.state['backup']['sha256'], 'Verified backup changed.')
            if self.state['phase'] == 'cancelled':
                self.save(phase='prepared', noticeId=None, noticeStartedAt=None)
            elif prepare:
                return self.state
            else:
                require(self.state['phase'] == 'warned', 'Resolve the held-warning request before deployment.')
                self.warning_ack(self.notice())
                self.save(phase='warning', commitRequestedAt=now(), warningSentAt=now())
        if prepare and self.state['phase'] in ['warning', 'stopped']:
            if not old['State']['Running']:
                stopped_valid(old, self.state)
            require(sha(Path(self.state['backup']['path'])) == self.state['backup']['sha256'], 'Verified backup changed.')
            return self.state
        if self.state['phase'] == 'prepared':
            require(old['State']['Running'], 'Cannot infer an unrecorded final save.')
            self.backup()
            if prepare:
                # Only the installed helper plus the live game's explicit capability
                # can advertise SIGUSR1 support. Candidate-image support is insufficient.
                if not self.apple_iap and not self.turnkey and not self.arena and not getattr(self, 'economy_action_active', False):
                    self.save(warningVersion=1 if self.notice() is not None else None)
                return self.state
            self.unchanged()
            self.save(phase='warning', warningAt=now())
        if self.state['phase'] == 'warning':
            old = self.inspect(self.state['oldContainer'])
            require(old['State']['StartedAt'] == self.state['oldStartedAt'], 'The old writer restarted before shutdown.')
            self.old_settings(old)
            if old['State']['Running']:
                already_committed = False
                if self.state.get('noticeId'):
                    self.warning_owner()
                    notice = self.notice(allow_committed=True)
                    require(notice and notice['id'] == self.state['noticeId'] and notice['startedAt'] == self.state['noticeStartedAt'], 'The committed warning identity changed.')
                    already_committed = not notice['held']
                else:
                    notice = self.health().get('deploymentWarning')
                    require(notice is None or isinstance(notice, dict) and notice.get('held') is False,
                            'An unowned held warning must be resolved before deployment.')
                self.run('docker', 'update', '--restart=no', old['Id'])
                if not self.state.get('warningSentAt'):
                    self.save(warningAt=now())
                if not already_committed:
                    self.run('docker', 'kill', '--signal=SIGUSR2', old['Id'])
                self.save(warningSentAt=self.state.get('warningSentAt') or now())
                require(self.run('docker', 'wait', old['Id'], timeout=420).decode().strip() == '0', 'Final game save did not exit with code zero.')
            old = self.inspect(self.state['oldContainer'])
            stopped_valid(old, self.state)
            self.save(phase='stopped', stoppedAt=now(), oldFinishedAt=old['State']['FinishedAt'], saveExitCode=old['State']['ExitCode'])
        stopped_valid(self.inspect(self.state['oldContainer']), self.state)
        self.unchanged()
        if stop_only:
            return self.state
        backup = self.state['backup']
        require(sha(Path(backup['path'])) == backup['sha256'], 'Verified backup changed.')
        rollback = self.project + ':rollback-' + self.state['oldImage'].split(':')[1]
        existing = self.run('docker', 'image', 'ls', '--no-trunc', '--quiet', rollback).decode().strip()
        require(not existing or existing == self.state['oldImage'], 'Rollback tag is already bound to another image.')
        self.run('docker', 'image', 'tag', self.state['oldImage'], rollback)
        self.save(rollbackImage=self.state['oldImage'], rollbackTag=rollback)
        self.run('docker', 'image', 'tag', self.image, self.local_image)
        self.save(phase='starting', startRequestedAt=now())
        self.start()
        self.finish()
        return self.state

    def catalog_proof(self):
        return {**self.economy_proof(), 'playerCatalogVersion': self.state['oldCatalogVersion']}

    def validate_catalog_proof(self, proof):
        require(isinstance(proof, dict) and set(proof) == {'revision', 'image', 'playerCatalogVersion', 'realms'}
                and proof['revision'] == self.state['revision'] and proof['image'] == self.image
                and proof['playerCatalogVersion'] == self.state['playerCatalogVersion'], 'Catalog authorization targets another candidate.')
        require(isinstance(proof['realms'], dict) and set(proof['realms']) == {'eu', 'us', 'asia'}, 'Every realm needs a catalog drain proof.')
        for realm, value in proof['realms'].items():
            hold = 'admissionHeld' if realm == 'eu' else 'restartHeld'
            require(isinstance(value, dict) and set(value) == {'realm', 'revision', 'targetRevision', 'instanceId', 'playerCatalogVersion', 'finalSave', 'drainedAt', hold}
                    and value['realm'] == realm and value['targetRevision'] == self.state['revision']
                    and isinstance(value['revision'], str) and re.fullmatch(r'[a-f0-9]{40}', value['revision'])
                    and value['revision'] != self.state['revision'] and isinstance(value['instanceId'], str) and 0 < len(value['instanceId']) <= 256
                    and type(value['playerCatalogVersion']) is int and 4 <= value['playerCatalogVersion'] <= self.state['playerCatalogVersion']
                    and value['finalSave'] is True and value[hold] is True and type(value['drainedAt']) is int and value['drainedAt'] > 0,
                    'Invalid catalog final-save proof.')
        require(proof['realms'][self.realm] == self.catalog_proof(), 'The local catalog drain identity changed.')
        if self.state.get('catalogBarrierProof'):
            require(proof == self.state['catalogBarrierProof'], 'The saved catalog authorization changed.')

    def catalog_apply(self, action, proof=None):
        require(action in ['drain', 'status', 'authorize', 'start'], 'Invalid catalog action.')
        require(self.apple_iap is None and self.turnkey is None and self.arena is None and self.state and self.state.get('catalogBarrierVersion') == 1
                and not self.state.get('economyBarrierVersion'), 'Prepare a separate catalog release with the compatible helper.')
        self.catalog_action_active = True
        if action == 'drain':
            require(self.state['phase'] not in ['starting', 'complete'], 'A started catalog release requires its saved authorization.')
            self.save(catalogBarrierRequired=True)
            self.apply(stop_only=True)
        if action in ['drain', 'status', 'authorize']:
            if self.state['phase'] in ['starting', 'complete']:
                require(self.state.get('catalogBarrierProof'), 'A started catalog release has no authorization.')
                self.apply(prepare=True)
            else:
                require(self.state['phase'] == 'stopped', 'The catalog writer has not stopped.')
                stopped_valid(self.inspect(self.state['oldContainer']), self.state)
                self.apply(prepare=True)  # Recheck the candidate, manifest, host settings and backup before authorizing EU.
        if action == 'authorize':
            self.validate_catalog_proof(proof)
            self.save(catalogBarrierProof=proof)
        elif action == 'start':
            self.validate_catalog_proof(self.state.get('catalogBarrierProof'))
            self.apply()
        return {**self.state, 'drainProof': self.catalog_proof()}

    def economy_database(self, action, proof=None):
        require(self.state and self.state.get('economyBarrierVersion') == 1, 'Economy-compatible preparation is required.')
        game = self.inspect(self.game)
        values = environment(game)
        require(digest(values) == self.state['envHash'], 'Database environment changed during economy activation.')
        require(values.get('DATABASE_URL'), 'Shared database configuration is required.')
        payload = {'action': action, 'revision': self.state['revision'], 'proof': proof,
                   'connectionString': values['DATABASE_URL'], 'ca': values.get('DATABASE_CA_BASE64', '')}
        output = self.run('docker', 'run', '--rm', '-i', '--network', self.project + '_default', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', self.image, '/app/src/gold-migration.mjs',
            input=json.dumps(payload).encode(), timeout=600)
        return json.loads(output)

    def economy_proof(self):
        require(self.state and self.state.get('oldFinishedAt') and self.state.get('saveExitCode') == 0, 'An observed final save is required.')
        return {'realm': self.realm, 'revision': self.state['oldRevision'], 'targetRevision': self.state['revision'],
                'instanceId': self.state['oldContainer'] + ':' + self.state['oldStartedAt'], 'finalSave': True, 'restartHeld': True,
                'drainedAt': int(stamp(self.state['stoppedAt']).timestamp() * 1000)}

    def economy_apply(self, action, proof=None):
        self.economy_action_active = True
        require(self.apple_iap is None and self.turnkey is None and self.arena is None, 'Do not combine service configuration and economy activation.')
        require(action in ['prepare', 'status', 'arm', 'drain', 'backup', 'migrate', 'start', 'enable'], 'Invalid economy action.')
        if action == 'prepare':
            # Preparation is read-only with respect to players and gold. Missing installed capabilities fail here.
            self.apply(prepare=True)
            require(not self.state.get('catalogBarrierRequired'), 'Run catalog and economy activations in separate releases.')
            support = self.run('docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', self.image, '--input-type=module', '-e',
                "import {ECONOMY_VERSION} from '/app/src/gold-migration.mjs';console.log(ECONOMY_VERSION)")
            require(support.decode().strip() == '1', 'Candidate lacks the economy migration implementation.')
            if not self.state.get('economyBarrierVersion'):
                public = json.loads(self.run('docker', 'exec', self.game, 'node', '-e',
                    "Promise.all(['/api/health','/release.json'].map(p=>fetch('http://127.0.0.1:2567'+p).then(r=>{if(!r.ok)throw Error();return r.json()}))).then(([health,release])=>console.log(JSON.stringify({health,release})))"))
                require(public['health'].get('economy', {}).get('supportedVersion') == 1, 'Install the compatibility release on every realm before activation.')
                old_revision = public['release'].get('revision')
                require(isinstance(old_revision, str) and re.fullmatch(r'[a-f0-9]{40}', old_revision), 'Old writer revision is unavailable.')
                self.save(economyBarrierVersion=1, oldRevision=old_revision)
        else:
            require(self.state and self.state.get('economyBarrierVersion') == 1, 'Prepare with an economy-compatible helper first.')
        if action == 'status' and self.state['phase'] == 'stopped':
            stopped_valid(self.inspect(self.state['oldContainer']), self.state)
            self.unchanged()
        result = None
        if action == 'arm':
            self.unchanged()
            result = self.economy_database('arm')
        elif action == 'drain':
            require(self.economy_database('status')['maintenance'] is True, 'Arm the shared maintenance gate before draining.')
            self.apply(stop_only=True)
            stopped_valid(self.inspect(self.state['oldContainer']), self.state)
        elif action == 'backup':
            stopped_valid(self.inspect(self.state['oldContainer']), self.state)
            self.unchanged()
            self.backup()
            self.save(postDrainBackup=True)
        elif action == 'migrate':
            require(self.realm == 'us' and self.state.get('postDrainBackup'), 'Use the verified US post-drain backup for migration.')
            backup = self.state['backup']
            require(sha(Path(backup['path'])) == backup['sha256'], 'Post-drain backup changed.')
            require(proof and proof.get('backup') == {'sha256': backup['sha256'], 'bytes': backup['bytes'], 'at': int(stamp(backup['verifiedAt']).timestamp() * 1000)}, 'Migration backup proof differs.')
            if self.state['phase'] == 'stopped':
                stopped_valid(self.inspect(self.state['oldContainer']), self.state)
            result = self.economy_database('migrate', proof)
        elif action == 'start':
            current = self.economy_database('status')
            require(current['version'] == 1 and current['maintenance'] is False, 'Migration must commit before starting any replacement.')
            self.apply()
        elif action == 'enable':
            require(self.realm == 'us' and self.state['phase'] == 'complete', 'Only the completed US release can activate the exchange.')
            result = self.economy_database('enable', proof)
        if result is None:
            result = self.economy_database('status')
        return {**self.state, 'economy': result, **({'drainProof': self.economy_proof()} if self.state.get('oldFinishedAt') else {})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', help='ghcr.io/trappyon/mossvale-game@sha256:<64 lowercase hex characters>')
    parser.add_argument('--prepare', action='store_true', help='Pull, verify and back up without stopping the game.')
    parser.add_argument('--warning-action', choices=['warn', 'cancel-warning'])
    parser.add_argument('--apple-iap-stdin', action='store_true', help='Read the restricted Apple activation settings from standard input.')
    parser.add_argument('--turnkey-stdin', action='store_true', help='Read restricted first-time Turnkey activation settings from standard input.')
    parser.add_argument('--arena-stdin', action='store_true', help='Read restricted first-time arena activation settings from standard input.')
    parser.add_argument('--catalog-action', choices=['drain', 'status', 'authorize', 'start'])
    parser.add_argument('--economy-action', choices=['prepare', 'status', 'arm', 'drain', 'backup', 'migrate', 'start', 'enable'])
    args = parser.parse_args()
    require(os.geteuid() == 0, 'Run through sudo on the regional host.')
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(not STATE.is_symlink() and STATE.stat().st_uid == 0 and not STATE.stat().st_mode & 0o022, 'Release records must be root-owned and protected.')
    with lock(STATE / 'release.lock'):
        import sys
        require(sum([args.apple_iap_stdin, args.turnkey_stdin, args.arena_stdin]) <= 1, 'Activate Apple, Turnkey and arena separately.')
        require(not args.catalog_action or not (args.economy_action or args.apple_iap_stdin or args.turnkey_stdin or args.arena_stdin or args.prepare or args.warning_action), 'Catalog actions are separate guarded releases.')
        require(not (args.economy_action and (args.apple_iap_stdin or args.turnkey_stdin or args.arena_stdin)), 'Separate service and economy activation.')
        require(not args.warning_action or not (args.economy_action or args.apple_iap_stdin or args.turnkey_stdin or args.arena_stdin or args.prepare), 'Held warnings are a separate normal-release action.')
        apple_iap = json.loads(sys.stdin.buffer.read(8193)) if args.apple_iap_stdin else None
        turnkey = json.loads(sys.stdin.buffer.read(8193)) if args.turnkey_stdin else None
        arena = json.loads(sys.stdin.buffer.read(8193)) if args.arena_stdin else None
        proof = json.loads(sys.stdin.buffer.read(32769)) if args.economy_action or args.catalog_action else None
        release = Release(args.image, apple_iap=apple_iap, turnkey=turnkey, arena=arena)
        try:
            state = (release.warn() if args.warning_action == 'warn' else release.cancel_warning()) if args.warning_action else release.economy_apply(args.economy_action, proof) if args.economy_action else release.catalog_apply(args.catalog_action, proof) if args.catalog_action else release.apply(args.prepare)
        except Exception as error:
            if release.state:
                release.save(lastFailure={'at': now(), 'type': type(error).__name__})
            raise
        print(json.dumps({'realm': state['realm'], 'phase': state['phase'], 'revision': state['revision'], 'image': state['image'], 'proof': str(release.path),
                         **({key: state[key] for key in ['catalogBarrierVersion', 'catalogBarrierRequired', 'oldRevision', 'oldCatalogVersion', 'playerCatalogVersion', 'catalogBarrierProof'] if key in state}),
                         **({'publicConfig': state['publicConfig']} if 'publicConfig' in state else {}),
                         **({'turnkeyHash': state['turnkeyHash'], 'turnkeyCompatibilityVersion': 1} if state.get('turnkeyCompatibilityVersion') == 1 else {}),
                         **({key: state[key] for key in ['arenaHash', 'arenaCompatibilityVersion', 'arenaTreasury']} if state.get('arenaCompatibilityVersion') == 1 else {}),
                         **({'warningVersion': 1} if state.get('warningVersion') == 1 and not args.economy_action else {}),
                         **({'warningId': state['noticeId'], 'warningAt': state['warningAt']} if state.get('noticeId') else {}),
                         **({'economyBarrierVersion': 1, 'economy': state['economy']} if 'economy' in state else {}),
                         **({'drainProof': state['drainProof']} if 'drainProof' in state else {}),
                         **({'backup': {'sha256': state['backup']['sha256'], 'bytes': state['backup']['bytes'], 'at': int(stamp(state['backup']['verifiedAt']).timestamp() * 1000)}} if state.get('postDrainBackup') else {})}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error) if isinstance(error, Refused) else type(error).__name__}))
        raise SystemExit(1)
