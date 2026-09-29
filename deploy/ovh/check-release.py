#!/usr/bin/env python3
"""Run locally: python3 deploy/ovh/check-release.py. No Docker or network access."""
from copy import deepcopy
import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
gateway_spec = importlib.util.spec_from_file_location('gateway', Path(__file__).with_name('ci-release.py'))
gateway = importlib.util.module_from_spec(gateway_spec)
gateway_spec.loader.exec_module(gateway)
IMAGE = 'ghcr.io/trappyon/mossvale-game@sha256:' + 'c' * 64
OLD, NEW = 'sha256:' + 'a' * 64, 'sha256:' + 'b' * 64
REVISION = 'd' * 40
SECRET = 'private-database-credential-must-not-appear'
def signing_key(curve):
    return subprocess.check_output(['node', '-e', "process.stdout.write(require('crypto').generateKeyPairSync('ec',{namedCurve:process.argv[1]}).privateKey.export({format:'pem',type:'pkcs8'}))", curve]).decode()


APPLE = {'APPLE_IAP_PRIVATE_KEY': signing_key('prime256v1'),
         'APPLE_IAP_KEY_ID': 'ABCDE12345', 'APPLE_IAP_ISSUER_ID': '12345678-abcd-abcd-abcd-123456789abc',
         'MOBILE_PURCHASE_SANDBOX_ACCOUNTS': '1' * 64}
TURNKEY = {'TURNKEY_ORGANIZATION_ID': '11111111-1111-4111-8111-111111111111',
           'TURNKEY_AUTH_PROXY_CONFIG_ID': '22222222-2222-4222-8222-222222222222',
           'ALCHEMY_WALLET_API_KEY': 'private-alchemy-offline-fixture', 'ALCHEMY_GAS_POLICY_ID': '33333333-3333-4333-8333-333333333333',
           'TURNKEY_SPONSOR_MAX_OPERATION_WEI': '10', 'TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI': '100',
           'TURNKEY_SPONSOR_WALLET_DAILY_WEI': '100', 'TURNKEY_SPONSOR_GLOBAL_DAILY_WEI': '1000',
           'TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI': '1', 'TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS': '100'}

ARENA = {'MOSS_ARENA_CONTRACT': '0x' + '23' * 20, 'MOSS_ARENA_AUTHORITY_KEY': '0x' + '17' * 32,
         'MOSS_ARENA_RPC_URL': 'https://robinhood-mainnet.g.alchemy.com/v2/private-offline-test-key'}
TREASURY = '0x' + '45' * 20


def encoded(value):
    return json.dumps(value).encode()


fingerprint = subprocess.check_output(['node', '--input-type=module', '-e',
    "import{readFileSync}from'node:fs';const m=await import(process.argv[1]);console.log(JSON.stringify({keys:m.TURNKEY_ACTIVATION_KEYS,hash:m.turnkeyConfigurationHash(JSON.parse(readFileSync(0,'utf8')))}));",
    (Path(__file__).resolve().parents[2] / 'src/deployment-control.mjs').as_uri()], input=encoded(TURNKEY))
assert json.loads(fingerprint) == {'keys': release.TURNKEY_KEYS, 'hash': release.turnkey_fingerprint(TURNKEY)}, 'Runtime and host activation fingerprints must match exactly'

fingerprint = subprocess.check_output(['node', '--input-type=module', '-e',
    "import{readFileSync}from'node:fs';const m=await import(process.argv[1]);console.log(JSON.stringify({keys:m.ARENA_ACTIVATION_KEYS,hash:m.arenaConfigurationHash(JSON.parse(readFileSync(0,'utf8')))}));",
    (Path(__file__).resolve().parents[2] / 'src/deployment-control.mjs').as_uri()], input=encoded(ARENA))
assert json.loads(fingerprint) == {'keys': release.ARENA_KEYS, 'hash': release.arena_fingerprint(ARENA)}


class Docker:
    def __init__(self, directory, realm='us'):
        self.realm = realm
        self.game_name = 'mossvale-' + realm + '-game-1'
        self.local_image = 'mossvale-' + realm + ':local'
        self.root = directory / 'host'
        for name in release.HOST_FILES + ['deploy/ovh/.env']:
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('existing configuration\n')
        self.clock = datetime.datetime(2026, 9, 14, tzinfo=datetime.timezone.utc)
        release.now = lambda: self.clock.isoformat()
        self.calls, self.fail, self.pull_outcomes = [], None, []
        self.warning, self.warning_count = None, 0
        self.draining = False
        self.turnkey_compatible = True
        self.arena_compatible = True
        self.economy = {'version': 0, 'maintenance': False, 'exchangeEnabled': False, 'targetRevision': None}
        self.config = {'name': 'mossvale-' + realm, 'services': {'game': {'image': self.local_image, 'environment': {'DATABASE_URL': SECRET, 'REALM_ID': realm}}}}
        self.manifest = {'revision': REVISION, 'assets': {'index.html': 'f' * 64}, 'hostFiles': {name: release.sha(self.root / name) for name in release.HOST_FILES}}
        self.old_manifest = {'revision': 'e' * 40}
        image_config = {'Env': ['NODE_ENV=production'], 'Labels': {'org.opencontainers.image.revision': REVISION},
                        'Cmd': ['node', 'server.mjs'], 'Entrypoint': ['docker-entrypoint.sh'], 'User': 'node', 'WorkingDir': '/app', 'ExposedPorts': {'2567/tcp': {}}, 'Volumes': None}
        self.images = {NEW: {'Id': NEW, 'Config': image_config, 'RepoDigests': [IMAGE]}}
        self.tags = {IMAGE: NEW, self.local_image: OLD}
        game_config = deepcopy(image_config)
        game_config['Env'].extend(['DATABASE_URL=' + SECRET, 'REALM_ID=' + realm])
        game_config['Labels']['com.docker.compose.service'] = 'game'
        self.host_config = {'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}, 'ReadonlyRootfs': True}
        self.game = {'Id': 'old-container', 'Name': '/' + self.game_name, 'Image': OLD, 'Config': game_config,
                     'HostConfig': deepcopy(self.host_config), 'State': {'Running': True, 'ExitCode': 0, 'StartedAt': self.clock.isoformat(), 'Health': {'Status': 'healthy'}}}
        self.caddy = {'Id': 'caddy', 'Name': '/mossvale-' + realm + '-caddy-1', 'Image': 'caddy-image', 'Config': {'Labels': {'com.docker.compose.service': 'caddy'}},
                      'HostConfig': {}, 'State': {'Running': True, 'StartedAt': self.clock.isoformat()}}
        self.postgres = {'Id': 'postgres', 'Name': '/mossvale-us-postgres-1', 'Image': 'postgres-image',
                         'Config': {'Labels': {'com.docker.compose.service': 'postgres'}}, 'HostConfig': {},
                         'State': {'Running': True, 'StartedAt': self.clock.isoformat()}} if realm == 'us' else None
        self.directory = directory / 'proofs'

    def deployment(self, apple=None, image=IMAGE, turnkey=None, arena=None):
        return release.Release(image, root=self.root, directory=self.directory, run=self.run, apple_iap=apple, turnkey=turnkey, arena=arena)

    def turnkey_placeholders(self):
        self.config['services']['game']['environment'].update({key: '' for key in release.TURNKEY_KEYS})

    def arena_placeholders(self):
        self.config['services']['game']['environment'].update({key: '' for key in release.ARENA_KEYS})
        self.config['services']['game']['environment']['TREASURE_TREASURY_CONTRACT'] = TREASURY
        self.game['Config']['Env'].append('TREASURE_TREASURY_CONTRACT=' + TREASURY)

    def held_warnings(self):
        self.warning = {'version': 1, 'id': None, 'startedAt': None, 'secondsRemaining': 0, 'held': False}

    def compose_config(self, overrides=None):
        config = deepcopy(self.config)
        for line in (self.root / 'deploy/ovh/.env').read_text().splitlines():
            key, _, value = line.partition('=')
            if key in release.APPLE_KEYS or key in release.TURNKEY_KEYS + release.ARENA_KEYS and key in self.config['services']['game']['environment']:
                config['services']['game']['environment'][key] = json.loads(value)
        config['services']['game']['environment'].update({key: value for key, value in (overrides or {}).items()
            if key in release.APPLE_KEYS or key in release.TURNKEY_KEYS + release.ARENA_KEYS and key in self.config['services']['game']['environment']})
        return config

    def run(self, *args, **kwargs):
        self.calls.append(args)
        if args[0].endswith('/backup.sh'):
            if self.fail == 'backup':
                raise release.Refused('Backup failed.')
            path = Path(args[1])
            path.mkdir()
            (path / 'database.dump').write_bytes(b'fake database dump')
            return b''
        assert args[0] == 'docker', args
        if args[1] == 'pull':
            assert args[2] == IMAGE and kwargs['timeout'] == 600
            outcome = self.pull_outcomes.pop(0) if self.pull_outcomes else 'complete'
            if outcome == 'error':
                raise release.Refused('Registry refused the image.')
            if outcome != 'timeout':
                self.tags[IMAGE] = NEW
            if outcome.startswith('timeout'):
                raise subprocess.TimeoutExpired(args, kwargs['timeout'], output=SECRET.encode())
            return b''
        if args[1] == 'inspect':
            name = args[2]
            if name == IMAGE and name not in self.tags:
                raise release.Refused('Image is not local.')
            if name in [self.game_name, self.game['Id']]:
                value = self.game
            elif name == 'caddy':
                value = self.caddy
            elif name == 'postgres':
                value = self.postgres
            else:
                identifier = self.tags.get(name, name)
                value = self.images.get(identifier, {'Id': identifier})
            return encoded([value])
        if args[1] == 'run':
            if args[-1] == '/app/src/gold-migration.mjs':
                assert args[args.index('--network') + 1] == 'mossvale-' + self.realm + '_default'
                payload = json.loads(kwargs['input'])
                assert payload['connectionString'] == SECRET
                action = payload['action']
                if action == 'arm':
                    self.economy.update(maintenance=True, targetRevision=REVISION)
                if action == 'migrate':
                    assert not self.game['State']['Running']
                    self.economy.update(version=1, maintenance=False, migration={'revision': REVISION})
                if action == 'enable':
                    assert self.economy['version'] == 1 and self.game['State']['Running']
                    self.economy['exchangeEnabled'] = True
                return encoded(self.economy)
            if 'console.log(ECONOMY_VERSION)' in args[-1]:
                return b'1\n'
            assert '--network' in args and args[args.index('--network') + 1] == 'none'
            if args[-1] == release.VERIFY_APPLE_KEY:
                result = subprocess.run(['node', '-e', release.VERIFY_APPLE_KEY], input=kwargs['input'], capture_output=True)
                release.require(result.returncode == 0, 'Invalid Apple signing key.')
                return b''
            return encoded(self.manifest)
        if args[1] == 'ps':
            assert args[-1] == 'label=com.docker.compose.project=mossvale-' + self.realm
            return (self.game['Id'] + '\ncaddy\n' + ('postgres\n' if self.postgres else '')).encode()
        if args[1:3] == ('compose', 'config'):
            return encoded(self.compose_config(kwargs.get('env')))
        if args[1:3] == ('compose', 'run'):
            assert kwargs['stdin'].read() == b'fake database dump'
            assert '--file=/dev/null' in args
            return b''
        if args[1] == 'update':
            assert args[2:] == ('--restart=no', self.game['Id'])
            self.game['HostConfig']['RestartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
            if self.fail == 'interrupt-before-warning':
                self.fail = None
                raise KeyboardInterrupt()
            return b''
        if args[1] == 'kill':
            assert args[3] == self.game['Id']
            if args[2] == '--signal=SIGUSR1':
                assert self.warning is not None, 'Older Node processes must never receive inspector signal SIGUSR1'
                if self.fail == 'interrupt-before-held-signal':
                    self.fail = None
                    raise KeyboardInterrupt()
                assert self.warning['id'] is None or self.warning['held']
                self.warning_count += 1
                self.warning.update(id='notice-' + str(self.warning_count), startedAt=int(self.clock.timestamp() * 1000), secondsRemaining=300, held=True)
                if self.fail == 'interrupt-after-held-signal':
                    self.fail = None
                    raise KeyboardInterrupt()
            elif args[2] == '--signal=SIGHUP':
                assert self.warning and self.warning['held']
                if self.fail == 'interrupt-before-cancel-signal':
                    self.fail = None
                    raise KeyboardInterrupt()
                self.held_warnings()
                if self.fail == 'interrupt-after-cancel-signal':
                    self.fail = None
                    raise KeyboardInterrupt()
            else:
                assert args[2] == '--signal=SIGUSR2'
                if self.warning is not None:
                    if self.warning['id'] is None:
                        self.warning_count += 1
                        self.warning.update(id='notice-' + str(self.warning_count), startedAt=int(self.clock.timestamp() * 1000), secondsRemaining=300)
                    self.warning['held'] = False
                if self.fail == 'interrupt-after-commit-signal':
                    self.fail = None
                    raise KeyboardInterrupt()
                if self.fail == 'interrupt-during-final-save':
                    self.fail = None
                    self.draining = True
                    raise KeyboardInterrupt()
            return b''
        if args[1] == 'wait':
            if self.fail == 'interrupt-wait':
                self.fail = None
                raise KeyboardInterrupt()
            remaining = max(0, 300 - (self.clock.timestamp() - self.warning['startedAt'] / 1000)) if self.warning and self.warning['id'] else 300
            self.clock += datetime.timedelta(seconds=remaining + 1 if self.fail != 'early-exit' else 1)
            self.game['State'].update(Running=False, FinishedAt=self.clock.isoformat(), ExitCode=1 if self.fail == 'save' else 0)
            self.draining = False
            return str(self.game['State']['ExitCode']).encode()
        if args[1:3] == ('image', 'ls'):
            return self.tags.get(args[-1], '').encode()
        if args[1:3] == ('image', 'tag'):
            if self.fail == 'interrupt-tag':
                self.fail = None
                raise KeyboardInterrupt()
            self.tags[args[4]] = self.tags.get(args[3], args[3])
            return b''
        if args[1:3] == ('compose', 'up'):
            assert args[3:] == ('-d', '--no-build', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'game')
            if self.fail == 'interrupt-up':
                self.fail = None
                raise KeyboardInterrupt()
            assert not self.game['State']['Running'] or self.game['Image'] == NEW
            self.clock += datetime.timedelta(seconds=1)
            self.game.update(Id='new-container', Image=self.tags[self.local_image], HostConfig=deepcopy(self.host_config))
            current = release.environment(self.game)
            current.update(self.compose_config()['services']['game']['environment'])
            self.game['Config']['Env'] = [key + '=' + value for key, value in current.items()]
            self.game['State'].update(Running=True, StartedAt=self.clock.isoformat(), Health={'Status': 'healthy'})
            if self.fail == 'interrupt-after-up':
                self.fail = None
                raise KeyboardInterrupt()
            return b''
        if args[1] == 'exec':
            if args[2] == 'mossvale-' + self.realm + '-caddy-1':
                assert args[3:] == ('caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
                assert not self.game['State']['Running'] and self.game['State']['ExitCode'] == 0, 'Proxy reload requires a saved, stopped game'
                assert self.game['Id'] == 'old-container', 'Never reload after the replacement admits players'
                if self.fail == 'proxy-reload':
                    raise release.Refused('Proxy reload failed.')
                return b''
            if args[-1] == release.VERIFY_ARENA_COMPATIBILITY:
                assert self.game['State']['Running']
                return encoded({'keys': release.ARENA_KEYS, 'arenaHash': release.arena_fingerprint(release.environment(self.game)), 'treasury': TREASURY} if self.arena_compatible else {})
            if args[-1] == release.VERIFY_TURNKEY_COMPATIBILITY:
                assert self.game['State']['Running'], 'A saved stopped writer cannot execute compatibility probes'
                return encoded({'keys': release.TURNKEY_KEYS, 'turnkeyHash': release.turnkey_fingerprint(release.environment(self.game))} if self.turnkey_compatible else {})
            if "readFileSync('/app/release.json'" in args[-1]:
                return encoded(self.old_manifest)
            if '/release.json' in args[-1]:
                return encoded({'health': {'economy': {'supportedVersion': 1}}, 'release': {'revision': 'e' * 40}})
            if '/api/config' in args[-1]:
                return encoded({'realmId': self.realm, 'mobilePurchases': {'apple': bool(release.environment(self.game).get('APPLE_IAP_PRIVATE_KEY')), 'google': False}})
            if self.warning and self.warning['id']:
                self.warning['secondsRemaining'] = max(0, int(300 - (self.clock.timestamp() - self.warning['startedAt'] / 1000)))
            return encoded({'ok': not self.draining, 'available': not self.draining, 'realmId': 'wrong' if self.fail == 'wrong-health' else self.realm,
                            **({'deploymentWarning': deepcopy(self.warning)} if self.warning is not None else {})})
        raise AssertionError(args)

    def mutations(self):
        return [call for call in self.calls if call[1] in ['update', 'kill', 'wait'] or call[1:3] in [('image', 'tag'), ('compose', 'up')] or call[3:5] == ('caddy', 'reload')]


def refused(callback, exception=release.Refused):
    try:
        callback()
    except exception:
        return
    raise AssertionError('Expected a closed guard')


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    for index, image in enumerate(['mossvale-us:local', IMAGE.replace('trappyon', 'another'), IMAGE + 'x']):
        refused(lambda: release.Release(image, directory=base / str(index)))
    with release.lock(base / 'lock'):
        refused(lambda: release.lock(base / 'lock'))
    request = {'action': 'prepare', 'image': IMAGE, 'registryToken': 'credential-for-fake-check-only'}
    gateway.validate(request)
    gateway.validate({**request, 'action': 'deploy'})
    gateway.validate({**request, 'action': 'warn'})
    gateway.validate({**request, 'action': 'cancel-warning'})
    for action in ['catalog-drain', 'catalog-status', 'catalog-authorize', 'catalog-start']:
        gateway.validate({**request, 'action': action})
        refused(lambda: gateway.validate({**request, 'action': action, 'appleIap': APPLE}), ValueError)
        if action != 'catalog-authorize':
            refused(lambda: gateway.validate({**request, 'action': action, 'proof': {}}), ValueError)
    gateway.validate({**request, 'action': 'catalog-authorize', 'proof': {}})
    for action in ['warn', 'cancel-warning']:
        refused(lambda: gateway.validate({**request, 'action': action, 'appleIap': APPLE}), ValueError)
        refused(lambda: gateway.validate({**request, 'action': action, 'proof': {}}), ValueError)
    gateway.validate({**request, 'appleIap': APPLE})
    for bad in [None, {}, {**APPLE, 'DATABASE_URL': 'replacement'}, {**APPLE, 'APPLE_IAP_KEY_ID': 'invalid'},
                {**APPLE, 'MOBILE_PURCHASE_SANDBOX_ACCOUNTS': '*'}, {**APPLE, 'APPLE_IAP_PRIVATE_KEY': '${INJECTED}'}]:
        refused(lambda: gateway.validate({**request, 'appleIap': bad}), ValueError)
    gateway.validate({**request, 'arena': ARENA})
    for action in ('warn', 'cancel-warning', 'catalog-drain', 'economy-prepare'):
        refused(lambda: gateway.validate({**request, 'action': action, 'arena': ARENA}), ValueError)
    for bad in [None, {}, {**ARENA, 'DATABASE_URL': 'replacement'}, {**ARENA, 'MOSS_ARENA_AUTHORITY_KEY': '0x' + '0' * 64},
                {**ARENA, 'MOSS_ARENA_RPC_URL': 'https://evil.invalid/${KEY}'}]:
        refused(lambda: gateway.validate({**request, 'arena': bad}), ValueError)
    refused(lambda: gateway.validate({**request, 'arena': ARENA, 'turnkey': TURNKEY}), ValueError)
    gateway.validate({**request, 'turnkey': TURNKEY})
    for action in ['warn', 'cancel-warning', 'economy-prepare', 'catalog-drain']:
        refused(lambda: gateway.validate({**request, 'action': action, 'turnkey': TURNKEY}), ValueError)
    refused(lambda: gateway.validate({**request, 'appleIap': APPLE, 'turnkey': TURNKEY}), ValueError)
    for bad in [None, {}, {**TURNKEY, 'DATABASE_URL': 'replacement'}, {**TURNKEY, 'ALCHEMY_WALLET_API_KEY': '${INJECTED}'},
                {**TURNKEY, 'TURNKEY_ORGANIZATION_ID': '11111111-1111-0111-0111-111111111111'},
                {**TURNKEY, 'TURNKEY_SPONSOR_MAX_OPERATION_WEI': '101'}, {**TURNKEY, 'TURNKEY_SPONSOR_GLOBAL_DAILY_WEI': '99'},
                {**TURNKEY, 'TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI': '0'}, {**TURNKEY, 'TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS': '1000001'}]:
        refused(lambda: gateway.validate({**request, 'turnkey': bad}), ValueError)
    for key in release.TURNKEY_KEYS:
        refused(lambda: gateway.validate({**request, 'turnkey': {name: value for name, value in TURNKEY.items() if name != key}}), ValueError)
    for bad in [None, {**request, 'action': 'shell'}, {**request, 'extra': 'value'},
                {**request, 'image': 'ghcr.io/trappyon/mossvale-game:latest'},
                {**request, 'registryToken': 'secret\nline'}, {**request, 'registryToken': 'x' * 4097}]:
        refused(lambda: gateway.validate(bad), ValueError)
    assert set(gateway.runtime_environment('/private-registry')) == {'PATH', 'HOME', 'LANG', 'DOCKER_CONFIG'}
    assert gateway.runtime_environment('/private-registry')['DOCKER_CONFIG'] == '/private-registry'

    for realm in ['us', 'asia']:
        realm_base = base / realm
        docker = Docker(realm_base / 'cached-candidate', realm)
        docker.held_warnings()
        docker.deployment().apply(prepare=True)
        docker.deployment().warn()
        docker.deployment().apply()
        assert not any(call[1] == 'pull' for call in docker.calls), 'Every phase reuses the exact local digest without another pull'
        assert sum(call[-1] == release.VERIFY_IMAGE for call in docker.calls) == 3, 'Cached images still undergo full candidate verification in every phase'

        original_sleep = release.time.sleep
        try:
            for index, (outcomes, expected_pulls, expected_pauses, succeeds) in enumerate([
                    ([], 1, [], True), (['timeout', 'complete'], 2, [5], True),
                    (['timeout-complete'], 1, [], True), (['timeout', 'timeout'], 2, [5], False),
                    (['error'], 1, [], False)]):
                docker = Docker(realm_base / ('pull-' + str(index)), realm)
                del docker.tags[IMAGE]
                docker.pull_outcomes = outcomes.copy()
                pauses = []
                release.time.sleep = pauses.append
                if succeeds:
                    assert docker.deployment().apply(prepare=True)['phase'] == 'prepared'
                else:
                    refused(lambda: docker.deployment().apply(prepare=True))
                    assert docker.deployment().state is None, 'Failed download cannot create a prepared release'
                assert sum(call[1] == 'pull' for call in docker.calls) == expected_pulls
                assert pauses == expected_pauses and not docker.mutations(), 'Only pull timeouts retry, before any warning or replacement'
        finally:
            release.time.sleep = original_sleep

        for invalid in ['digest', 'manifest']:
            docker = Docker(realm_base / ('cached-invalid-' + invalid), realm)
            if invalid == 'digest':
                docker.images[NEW]['RepoDigests'] = [IMAGE[:-1] + 'a']
            else:
                docker.manifest['revision'] = 'f' * 40
            refused(lambda: docker.deployment().apply(prepare=True))
            assert not any(call[1] == 'pull' for call in docker.calls) and not docker.mutations(), 'Cached candidate mismatches fail without retries'

        docker = Docker(realm_base / 'proxy-reload', realm)
        infrastructure = deepcopy(docker.caddy)
        docker.deployment().apply(prepare=True)
        assert not docker.mutations(), 'Preparing a proxy configuration never reloads active WebSockets'
        docker.fail = 'proxy-reload'
        refused(lambda: docker.deployment().apply())
        state = docker.deployment().state
        assert state['phase'] == 'starting' and state['saveExitCode'] == 0
        assert (release.stamp(state['oldFinishedAt']) - release.stamp(state['warningAt'])).total_seconds() >= 300
        assert next(i for i, call in enumerate(docker.calls) if call[1] == 'wait') < next(i for i, call in enumerate(docker.calls) if call[3:5] == ('caddy', 'reload'))
        assert not any(call[1:3] == ('compose', 'up') for call in docker.calls), 'A failed proxy reload must leave the saved game stopped'
        assert docker.caddy == infrastructure, 'Reload must preserve the existing proxy container and settings'
        docker.fail = None; docker.calls.clear()
        assert docker.deployment().apply()['phase'] == 'complete'
        assert next(i for i, call in enumerate(docker.calls) if call[3:5] == ('caddy', 'reload')) < next(i for i, call in enumerate(docker.calls) if call[1:3] == ('compose', 'up'))
        docker.calls.clear()
        docker.deployment().apply()
        assert not docker.mutations(), 'Retrying a completed release does not reload active replacement connections'

        docker = Docker(realm_base / 'apple-activation', realm)
        original = (docker.root / 'deploy/ovh/.env').read_bytes()
        state = docker.deployment(APPLE).apply(prepare=True)
        assert state['publicConfig']['mobilePurchases']['apple'] is False
        assert (docker.root / 'deploy/ovh/.env').read_bytes() == original and not docker.mutations()
        refused(lambda: docker.deployment())
        refused(lambda: docker.deployment({**APPLE, 'APPLE_IAP_KEY_ID': 'OTHER12345'}))
        docker.fail = 'interrupt-up'
        refused(lambda: docker.deployment(APPLE).apply(), KeyboardInterrupt)
        assert docker.deployment(APPLE).state['appleIapApplied']
        docker.calls.clear()
        docker.deployment(APPLE).apply(prepare=True)
        assert not docker.mutations()
        state = docker.deployment(APPLE).apply()
        assert state['phase'] == 'complete' and state['envHash'] != state['targetEnvHash']
        assert state['publicConfig']['mobilePurchases']['apple'] is False, 'Recovery retains the original public baseline after activation'
        assert release.environment(docker.game)['DATABASE_URL'] == SECRET
        assert all(release.environment(docker.game)[key] == value for key, value in APPLE.items())
        assert (docker.deployment(APPLE).directory / 'environment.before-apple-iap').read_bytes() == original
        assert all(value not in docker.deployment(APPLE).path.read_text() for value in APPLE.values())
        assert docker.deployment(APPLE).apply()['phase'] == 'complete'

        for failure in ['backup', 'save', 'early-exit']:
            docker = Docker(realm_base / ('apple-' + failure), realm)
            before = (docker.root / 'deploy/ovh/.env').read_bytes()
            docker.fail = failure
            refused(lambda: docker.deployment(APPLE).apply())
            assert (docker.root / 'deploy/ovh/.env').read_bytes() == before

        for index, key in enumerate(['-----BEGIN PRIVATE KEY-----\n' + 'A' * 150 + '\n-----END PRIVATE KEY-----\n', signing_key('secp384r1')]):
            docker = Docker(realm_base / ('apple-invalid-key-' + str(index)), realm)
            original = (docker.root / 'deploy/ovh/.env').read_bytes()
            refused(lambda: docker.deployment({**APPLE, 'APPLE_IAP_PRIVATE_KEY': key}).apply())
            assert not docker.mutations() and (docker.root / 'deploy/ovh/.env').read_bytes() == original

        docker = Docker(realm_base / 'apple-interrupted-environment-save', realm)
        instance = docker.deployment(APPLE)
        save = instance.save
        def interrupted_save(**changes):
            if changes.get('appleIapApplied'):
                raise KeyboardInterrupt()
            save(**changes)
        instance.save = interrupted_save
        refused(lambda: instance.apply(), KeyboardInterrupt)
        assert not docker.deployment(APPLE).state.get('appleIapApplied')
        assert docker.compose_config()['services']['game']['environment']['APPLE_IAP_PRIVATE_KEY'] == APPLE['APPLE_IAP_PRIVATE_KEY']
        docker.calls.clear()
        assert docker.deployment(APPLE).apply(prepare=True)['phase'] == 'starting'
        assert not docker.mutations()
        assert docker.deployment(APPLE).apply()['phase'] == 'complete'

        docker = Docker(realm_base / 'turnkey-activation', realm)
        docker.turnkey_placeholders()
        original = (docker.root / 'deploy/ovh/.env').read_bytes()
        old_environment = deepcopy(release.environment(docker.game))
        refused(lambda: docker.deployment().apply(prepare=True))
        state = docker.deployment(turnkey=TURNKEY).apply(prepare=True)
        assert state['envHash'] == release.digest(old_environment), 'Empty activation placeholders do not alter the recorded old runtime'
        assert (docker.root / 'deploy/ovh/.env').read_bytes() == original and not docker.mutations()
        refused(lambda: docker.deployment())
        refused(lambda: docker.deployment(turnkey={**TURNKEY, 'TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS': '99'}))
        docker.fail = 'interrupt-up'
        refused(lambda: docker.deployment(turnkey=TURNKEY).apply(), KeyboardInterrupt)
        assert docker.deployment(turnkey=TURNKEY).state['turnkeyApplied']
        docker.calls.clear()
        docker.deployment(turnkey=TURNKEY).apply(prepare=True)
        assert not docker.mutations(), 'Resuming preparation does not restart a saved writer'
        state = docker.deployment(turnkey=TURNKEY).apply()
        assert state['phase'] == 'complete' and state['envHash'] != state['targetEnvHash']
        assert (release.stamp(state['oldFinishedAt']) - release.stamp(state['warningAt'])).total_seconds() >= 300
        assert all(release.environment(docker.game)[key] == value for key, value in TURNKEY.items())
        assert release.environment(docker.game)['DATABASE_URL'] == SECRET
        assert (docker.deployment(turnkey=TURNKEY).directory / 'environment.before-turnkey').read_bytes() == original
        assert TURNKEY['ALCHEMY_WALLET_API_KEY'] not in docker.deployment(turnkey=TURNKEY).path.read_text()
        assert docker.deployment(turnkey=TURNKEY).apply()['phase'] == 'complete'

        for failure in ['backup', 'save', 'early-exit']:
            docker = Docker(realm_base / ('turnkey-' + failure), realm)
            docker.turnkey_placeholders()
            original = (docker.root / 'deploy/ovh/.env').read_bytes()
            docker.fail = failure
            refused(lambda: docker.deployment(turnkey=TURNKEY).apply())
            assert (docker.root / 'deploy/ovh/.env').read_bytes() == original, 'Failed warning/save cannot write wallet credentials'

        for failure in ['compatibility', 'compose', 'partial', 'rotation', 'unrelated', 'same-revision']:
            docker = Docker(realm_base / ('turnkey-reject-' + failure), realm)
            if failure != 'compose':
                docker.turnkey_placeholders()
            if failure == 'compatibility':
                docker.turnkey_compatible = False
            if failure in ['partial', 'rotation']:
                existing = {'TURNKEY_ORGANIZATION_ID': TURNKEY['TURNKEY_ORGANIZATION_ID']} if failure == 'partial' else {**TURNKEY, 'ALCHEMY_WALLET_API_KEY': 'previous-private-credential'}
                docker.config['services']['game']['environment'].update(existing)
                docker.game['Config']['Env'].extend(key + '=' + value for key, value in existing.items())
            if failure == 'unrelated':
                docker.config['services']['game']['environment']['EXTRA_SETTING'] = ''
            if failure == 'same-revision':
                docker.old_manifest['revision'] = REVISION
            refused(lambda: docker.deployment(turnkey=TURNKEY).apply(prepare=True))
            assert not docker.mutations(), 'Invalid activation cannot warn, stop or replace the live game'

        docker = Docker(realm_base / 'turnkey-interrupted-environment-save', realm)
        docker.turnkey_placeholders()
        instance = docker.deployment(turnkey=TURNKEY)
        save = instance.save
        def interrupted_turnkey_save(**changes):
            if changes.get('turnkeyApplied'):
                raise KeyboardInterrupt()
            save(**changes)
        instance.save = interrupted_turnkey_save
        refused(lambda: instance.apply(), KeyboardInterrupt)
        assert not docker.deployment(turnkey=TURNKEY).state.get('turnkeyApplied')
        assert docker.compose_config()['services']['game']['environment']['ALCHEMY_WALLET_API_KEY'] == TURNKEY['ALCHEMY_WALLET_API_KEY']
        docker.calls.clear()
        assert docker.deployment(turnkey=TURNKEY).apply(prepare=True)['phase'] == 'starting'
        assert not docker.mutations()
        assert docker.deployment(turnkey=TURNKEY).apply()['phase'] == 'complete'

        docker = Docker(realm_base / 'arena-compatible', realm)
        docker.arena_placeholders()
        state = docker.deployment().apply(prepare=True)
        assert not docker.mutations(), 'Gate-off compatibility permits only the reviewed absent empty arena placeholders'
        assert state['envHash'] != state['targetEnvHash']
        assert docker.deployment().apply()['phase'] == 'complete'
        assert all(release.environment(docker.game)[key] == '' for key in release.ARENA_KEYS)

        docker = Docker(realm_base / 'arena-activation', realm)
        docker.arena_placeholders()
        original = (docker.root / 'deploy/ovh/.env').read_bytes()
        state = docker.deployment(arena=ARENA).apply(prepare=True)
        assert state['arenaCompatibilityVersion'] == 1 and state['arenaTreasury'] == TREASURY
        assert not docker.mutations() and (docker.root / 'deploy/ovh/.env').read_bytes() == original
        refused(lambda: docker.deployment())
        refused(lambda: docker.deployment(arena={**ARENA, 'MOSS_ARENA_CONTRACT': '0x' + '67' * 20}))
        docker.fail = 'interrupt-up'
        refused(lambda: docker.deployment(arena=ARENA).apply(), KeyboardInterrupt)
        assert docker.deployment(arena=ARENA).state['arenaApplied']
        docker.calls.clear()
        docker.deployment(arena=ARENA).apply(prepare=True)
        assert not docker.mutations(), 'Resumed preparation cannot restart a saved arena writer'
        state = docker.deployment(arena=ARENA).apply()
        assert state['phase'] == 'complete'
        assert (release.stamp(state['oldFinishedAt']) - release.stamp(state['warningAt'])).total_seconds() >= 300
        assert all(release.environment(docker.game)[key] == value for key, value in ARENA.items())
        assert release.environment(docker.game)['TREASURE_TREASURY_CONTRACT'] == TREASURY
        assert (docker.deployment(arena=ARENA).directory / 'environment.before-arena').read_bytes() == original
        for key in ['MOSS_ARENA_AUTHORITY_KEY', 'MOSS_ARENA_RPC_URL']:
            assert ARENA[key] not in docker.deployment(arena=ARENA).path.read_text()
        assert docker.deployment(arena=ARENA).apply()['phase'] == 'complete'

        for failure in ['backup', 'save', 'early-exit']:
            docker = Docker(realm_base / ('arena-' + failure), realm)
            docker.arena_placeholders()
            original = (docker.root / 'deploy/ovh/.env').read_bytes()
            docker.fail = failure
            refused(lambda: docker.deployment(arena=ARENA).apply())
            assert (docker.root / 'deploy/ovh/.env').read_bytes() == original
        for failure in ['compatibility', 'compose', 'partial', 'rotation', 'unrelated', 'same-revision', 'catalog']:
            docker = Docker(realm_base / ('arena-reject-' + failure), realm)
            if failure != 'compose':
                docker.arena_placeholders()
            if failure == 'compatibility':
                docker.arena_compatible = False
            if failure in ['partial', 'rotation']:
                existing = {'MOSS_ARENA_CONTRACT': ARENA['MOSS_ARENA_CONTRACT']} if failure == 'partial' else {**ARENA, 'MOSS_ARENA_CONTRACT': '0x' + '67' * 20}
                docker.config['services']['game']['environment'].update(existing)
                docker.game['Config']['Env'].extend(key + '=' + value for key, value in existing.items())
            if failure == 'unrelated':
                docker.config['services']['game']['environment']['EXTRA_SETTING'] = ''
            if failure == 'same-revision':
                docker.old_manifest['revision'] = REVISION
            if failure == 'catalog':
                docker.manifest['playerCatalogVersion'] = 6
                refused(lambda: docker.deployment(arena=ARENA).catalog_apply('drain'))
            else:
                refused(lambda: docker.deployment(arena=ARENA).apply(prepare=True))
            assert not docker.mutations()

        docker = Docker(realm_base / 'arena-interrupted-environment-save', realm)
        docker.arena_placeholders()
        instance = docker.deployment(arena=ARENA)
        save = instance.save
        def interrupted_arena_save(**changes):
            if changes.get('arenaApplied'):
                raise KeyboardInterrupt()
            save(**changes)
        instance.save = interrupted_arena_save
        refused(lambda: instance.apply(), KeyboardInterrupt)
        assert not docker.deployment(arena=ARENA).state.get('arenaApplied')
        assert docker.compose_config()['services']['game']['environment']['MOSS_ARENA_CONTRACT'] == ARENA['MOSS_ARENA_CONTRACT']
        docker.calls.clear()
        assert docker.deployment(arena=ARENA).apply(prepare=True)['phase'] == 'starting'
        assert not docker.mutations()
        assert docker.deployment(arena=ARENA).apply()['phase'] == 'complete'

        docker = Docker(realm_base / 'prepare', realm)
        state = docker.deployment().apply(prepare=True)
        assert state['realm'] == realm and state['phase'] == 'prepared' and state['backup']['bytes'] > 0 and not docker.mutations()
        assert set(state['infrastructure']) == ({'caddy', 'postgres'} if realm == 'us' else {'caddy'})
        assert SECRET not in docker.deployment().path.read_text()
        assert docker.deployment().path.stat().st_mode & 0o777 == 0o600
        (docker.root / 'deploy/ovh/.env').write_text('changed')
        refused(lambda: docker.deployment().apply())
        assert not docker.mutations()

        docker = Docker(realm_base / 'translation-disabled-defaults', realm)
        defaults = {'GOOGLE_TRANSLATE_API_KEY': '', 'CHAT_TRANSLATION_DAILY_CHARACTERS': '5000'}
        original = deepcopy(release.environment(docker.game))
        docker.config['services']['game']['environment'].update(defaults)
        state = docker.deployment().apply(prepare=True)
        assert state['envHash'] == release.digest(original) and state['targetEnvHash'] == release.digest({**original, **defaults})
        assert not docker.mutations(), 'Disabled translation defaults never stop or modify the running writer during preparation'
        state = docker.deployment().apply()
        assert state['phase'] == 'complete' and release.environment(docker.game) == {**original, **defaults}
        assert (release.stamp(state['oldFinishedAt']) - release.stamp(state['warningAt'])).total_seconds() >= 300

        configured = {'GOOGLE_TRANSLATE_API_KEY': 'existing-translation-key', 'CHAT_TRANSLATION_DAILY_CHARACTERS': '1234'}
        docker = Docker(realm_base / 'translation-existing-preserved', realm)
        docker.game['Config']['Env'].extend(f'{key}={value}' for key, value in configured.items())
        docker.config['services']['game']['environment'].update(configured)
        assert docker.deployment().apply(prepare=True)['phase'] == 'prepared' and not docker.mutations()
        for index, (old, new) in enumerate([
                ({}, {**defaults, 'GOOGLE_TRANSLATE_API_KEY': 'new-translation-key'}),
                ({}, {**defaults, 'CHAT_TRANSLATION_DAILY_CHARACTERS': '5001'}),
                ({}, {**defaults, 'CHAT_TRANSLATION_DAILY_CHARACTERS': ''}),
                ({}, {**defaults, 'EXTRA_SETTING': ''}),
                (configured, defaults), (defaults, configured), (defaults, {}),
        ]):
            docker = Docker(realm_base / ('translation-rejected-' + str(index)), realm)
            docker.game['Config']['Env'].extend(f'{key}={value}' for key, value in old.items())
            docker.config['services']['game']['environment'].update(new)
            refused(lambda: docker.deployment().apply(prepare=True))
            assert not docker.mutations(), 'Translation activation, changes, removal and unrelated drift stay rejected'

        for invalid in ['realm', 'project', 'image', 'live-realm', 'caddy', 'saved-realm']:
            docker = Docker(realm_base / ('invalid-' + invalid), realm)
            if invalid == 'realm':
                docker.config['services']['game']['environment']['REALM_ID'] = 'eu'
            elif invalid == 'project':
                docker.config['name'] = 'mossvale-other'
            elif invalid == 'image':
                docker.config['services']['game']['image'] = 'mossvale-other:local'
            elif invalid == 'live-realm':
                docker.game['Config']['Env'] = [v if not v.startswith('REALM_ID=') else 'REALM_ID=wrong' for v in docker.game['Config']['Env']]
            elif invalid == 'caddy':
                docker.caddy['State']['Running'] = False
            else:
                instance = docker.deployment()
                instance.apply(prepare=True)
                instance.save(realm='asia' if realm == 'us' else 'us')
            refused(lambda: docker.deployment().apply())
            assert not docker.mutations()

        for failure in ['backup', 'save', 'early-exit']:
            docker = Docker(realm_base / failure, realm)
            docker.fail = failure
            refused(lambda: docker.deployment().apply())
            assert not any(call[1:3] in [('image', 'tag'), ('compose', 'up')] for call in docker.calls)
            if failure == 'backup':
                assert not docker.mutations()

        docker = Docker(realm_base / 'delayed-warning', realm)
        docker.fail = 'interrupt-before-warning'
        refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
        docker.clock += datetime.timedelta(hours=1)
        docker.fail = 'early-exit'
        refused(lambda: docker.deployment().apply())
        assert not any(call[1:3] == ('compose', 'up') for call in docker.calls), 'An old preparation timestamp cannot satisfy the countdown'

        docker = Docker(realm_base / 'resume-warning', realm)
        docker.fail = 'interrupt-wait'
        refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
        first_warning = docker.deployment().state['warningAt']
        docker.calls.clear()
        assert docker.deployment().apply(prepare=True)['phase'] == 'warning'
        assert not docker.mutations()
        state = docker.deployment().apply()
        assert state['phase'] == 'complete' and state['warningAt'] == first_warning and state['saveExitCode'] == 0
        assert docker.tags[state['rollbackTag']] == OLD and docker.tags[docker.local_image] == NEW
        assert docker.deployment().apply()['phase'] == 'complete'

        for supports_notice in [False, True]:
            for save_fails in [False, True]:
                docker = Docker(realm_base / ('fallback-draining-' + str(supports_notice) + '-' + str(save_fails)), realm)
                if supports_notice:
                    docker.held_warnings()
                docker.fail = 'interrupt-wait'
                refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
                assert not docker.deployment().state.get('noticeId')
                docker.clock += datetime.timedelta(seconds=300)
                docker.draining = True
                docker.calls.clear()
                if save_fails:
                    docker.fail = 'save'
                    refused(lambda: docker.deployment().apply())
                    assert not any(call[1:3] == ('compose', 'up') for call in docker.calls)
                else:
                    assert docker.deployment().apply()['phase'] == 'complete'
                assert any(call[1] == 'wait' for call in docker.calls), 'Fallback retry accepts unavailable health during final save and still requires the exit proof'

        docker = Docker(realm_base / 'fallback-uncertain-commit', realm)
        docker.held_warnings()
        docker.fail = 'interrupt-after-commit-signal'
        refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
        assert docker.warning['id'] and not docker.warning['held']
        assert not docker.deployment().state.get('noticeId') and not docker.deployment().state.get('warningSentAt')
        assert docker.deployment().apply()['phase'] == 'complete', 'An uncertain fallback commit is not mistaken for an unowned held notice'

        docker = Docker(realm_base / 'resume-activation', realm)
        docker.fail = 'interrupt-up'
        refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
        assert docker.deployment().state['phase'] == 'starting'
        docker.calls.clear()
        assert docker.deployment().apply(prepare=True)['phase'] == 'starting'
        assert not docker.mutations()
        docker.tags[docker.local_image] = OLD
        docker.calls.clear()
        refused(lambda: docker.deployment().apply())
        assert not docker.mutations()
        docker.tags[docker.local_image] = NEW
        assert docker.deployment().apply()['phase'] == 'complete'

        docker = Docker(realm_base / 'resume-stopped', realm)
        docker.fail = 'interrupt-tag'
        refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
        docker.calls.clear()
        assert docker.deployment().apply(prepare=True)['phase'] == 'stopped'
        assert not docker.mutations()
        assert docker.deployment().apply()['phase'] == 'complete'

        docker = Docker(realm_base / 'resume-running-candidate', realm)
        docker.fail = 'interrupt-after-up'
        refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
        docker.calls.clear()
        assert docker.deployment().apply()['phase'] == 'complete'
        assert not docker.mutations(), 'A healthy candidate must not be replaced again after interruption'

        for changed in ['image-env', 'host-file', 'runtime', 'infrastructure', 'realm']:
            docker = Docker(realm_base / changed, realm)
            docker.deployment().apply(prepare=True)
            if changed == 'image-env':
                docker.images[NEW]['Config']['Env'].append('NEW_SETTING=unexpected')
            elif changed == 'host-file':
                (docker.root / release.HOST_FILES[0]).write_text('changed')
            elif changed == 'runtime':
                docker.game['HostConfig']['ReadonlyRootfs'] = False
            elif changed == 'realm':
                docker.config['services']['game']['environment']['REALM_ID'] = 'asia' if realm == 'us' else 'us'
            else:
                docker.caddy['State']['StartedAt'] = '2026-09-15T00:00:00+00:00'
            refused(lambda: docker.deployment().apply())
            assert not docker.mutations()

        docker = Docker(realm_base / 'wrong-health', realm)
        docker.fail = 'wrong-health'
        refused(lambda: docker.deployment().apply())
        assert docker.deployment().state['phase'] == 'starting'

        docker = Docker(realm_base / 'unsupported-warning', realm)
        assert docker.deployment().apply(prepare=True).get('warningVersion') is None
        refused(lambda: docker.deployment().warn())
        assert not docker.mutations(), 'Old servers refuse SIGUSR1 without explicit live support'
        assert docker.deployment().apply()['phase'] == 'complete', 'Legacy deployment retains its original countdown'

        docker = Docker(realm_base / 'held-warning', realm)
        docker.held_warnings()
        assert docker.deployment().apply(prepare=True)['warningVersion'] == 1
        warned = deepcopy(docker.deployment().warn())
        assert warned['phase'] == 'warned' and warned['noticeId'] == docker.warning['id']
        assert docker.game['HostConfig']['RestartPolicy'] == docker.host_config['RestartPolicy']
        assert not any(call[1] in ['update', 'wait'] for call in docker.calls)
        docker.clock += datetime.timedelta(seconds=450)
        docker.calls.clear()
        assert docker.deployment().apply(prepare=True)['phase'] == 'warned'
        assert docker.deployment().warn()['noticeId'] == warned['noticeId']
        assert not docker.mutations(), 'Expired held warnings keep the game online and retries do not restart them'
        state = docker.deployment().apply()
        assert state['phase'] == 'complete' and state['warningAt'] == warned['warningAt']
        assert (docker.clock - release.stamp(warned['warningAt'])).total_seconds() < 460, 'A completed held countdown must not add another five minutes'

        docker = Docker(realm_base / 'held-warning-remaining', realm)
        docker.held_warnings()
        warned = deepcopy(docker.deployment().warn())
        docker.clock += datetime.timedelta(seconds=120)
        assert docker.deployment().apply()['phase'] == 'complete'
        elapsed = (docker.clock - release.stamp(warned['warningAt'])).total_seconds()
        assert 300 <= elapsed < 305, 'Committed held warning waits only its remaining time'

        for interruption in ['interrupt-before-held-signal', 'interrupt-after-held-signal']:
            docker = Docker(realm_base / interruption, realm)
            docker.held_warnings()
            docker.fail = interruption
            refused(lambda: docker.deployment().warn(), KeyboardInterrupt)
            intent = docker.deployment().state
            assert intent['phase'] == 'warning-requested' and docker.game['State']['Running']
            assert docker.game['HostConfig']['RestartPolicy'] == docker.host_config['RestartPolicy']
            before = docker.warning_count
            assert docker.deployment().warn()['phase'] == 'warned'
            assert docker.warning_count == (before if interruption.endswith('after-held-signal') else before + 1)

        for delivered in [False, True]:
            docker = Docker(realm_base / ('held-uncertain-cancel-' + str(delivered)), realm)
            docker.held_warnings()
            docker.fail = 'interrupt-after-held-signal' if delivered else 'interrupt-before-held-signal'
            refused(lambda: docker.deployment().warn(), KeyboardInterrupt)
            docker.calls.clear()
            assert docker.deployment().cancel_warning()['phase'] == 'cancelled'
            assert docker.warning['id'] is None and docker.game['State']['Running']
            assert bool(docker.mutations()) is delivered, 'Only an acknowledged delivered warning can be signalled for cancellation'
            docker.calls.clear()
            assert docker.deployment().cancel_warning()['phase'] == 'cancelled' and not docker.mutations()

        docker = Docker(realm_base / 'held-interrupted-intent', realm)
        docker.held_warnings()
        instance = docker.deployment()
        original_save = instance.save
        def interrupt_intent(**changes):
            if changes.get('phase') == 'warning-requested':
                raise KeyboardInterrupt()
            original_save(**changes)
        instance.save = interrupt_intent
        refused(lambda: instance.warn(), KeyboardInterrupt)
        assert docker.warning['id'] is None and not docker.mutations()
        assert docker.deployment().warn()['phase'] == 'warned', 'Global intent before per-image intent can be retried safely'

        for interruption in ['interrupt-before-warning', 'interrupt-after-commit-signal', 'interrupt-wait']:
            docker = Docker(realm_base / ('held-' + interruption), realm)
            docker.held_warnings()
            warned = deepcopy(docker.deployment().warn())
            docker.clock += datetime.timedelta(seconds=180)
            docker.fail = interruption
            refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
            assert docker.deployment().state['phase'] == 'warning'
            refused(lambda: docker.deployment().cancel_warning())
            state = docker.deployment().apply()
            assert state['phase'] == 'complete' and state['warningAt'] == warned['warningAt']
            assert (docker.clock - release.stamp(warned['warningAt'])).total_seconds() < 305

        for save_fails in [False, True]:
            docker = Docker(realm_base / ('held-draining-retry-' + str(save_fails)), realm)
            docker.held_warnings()
            docker.deployment().warn()
            docker.clock += datetime.timedelta(seconds=300)
            docker.fail = 'interrupt-during-final-save'
            refused(lambda: docker.deployment().apply(), KeyboardInterrupt)
            assert docker.draining and not docker.warning['held'] and docker.game['State']['Running']
            docker.calls.clear()
            if save_fails:
                docker.fail = 'save'
                refused(lambda: docker.deployment().apply())
                assert not any(call[1:3] == ('compose', 'up') for call in docker.calls)
            else:
                assert docker.deployment().apply()['phase'] == 'complete'
            assert any(call[1] == 'wait' for call in docker.calls), '503 health during a matching committed final save must still wait for the zero exit proof'
            assert not any(call[1] == 'kill' for call in docker.calls), 'A committed final save needs no additional signal'

        for interruption in [None, 'interrupt-before-cancel-signal', 'interrupt-after-cancel-signal']:
            docker = Docker(realm_base / ('held-cancel-' + str(interruption)), realm)
            docker.held_warnings()
            first_notice = docker.deployment().warn()['noticeId']
            docker.fail = interruption
            if interruption:
                refused(lambda: docker.deployment().cancel_warning(), KeyboardInterrupt)
            assert docker.deployment().cancel_warning()['phase'] == 'cancelled'
            docker.calls.clear()
            assert docker.deployment().cancel_warning()['phase'] == 'cancelled'
            assert not docker.mutations() and docker.game['State']['Running']
            assert docker.game['HostConfig']['RestartPolicy'] == docker.host_config['RestartPolicy']
            assert docker.deployment().warn()['noticeId'] != first_notice, 'A release retried after EU failure gets a fresh full warning'

        docker = Docker(realm_base / 'held-rewarn-after-interrupted-cancel', realm)
        docker.held_warnings()
        first_notice = docker.deployment().warn()['noticeId']
        docker.fail = 'interrupt-after-cancel-signal'
        refused(lambda: docker.deployment().cancel_warning(), KeyboardInterrupt)
        assert docker.deployment().warn()['noticeId'] != first_notice, 'Warn finishes its interrupted cancellation before issuing a new notice'

        for changed in ['notice', 'committed', 'container', 'started', 'backup', 'settings']:
            docker = Docker(realm_base / ('held-changed-' + changed), realm)
            docker.held_warnings()
            warned = docker.deployment().warn()
            if changed == 'notice':
                docker.warning['id'] = 'unrelated-notice'
            elif changed == 'committed':
                docker.warning['held'] = False
            elif changed == 'container':
                docker.game['Id'] = 'unexpected-container'
            elif changed == 'started':
                docker.game['State']['StartedAt'] = (docker.clock + datetime.timedelta(seconds=1)).isoformat()
            elif changed == 'backup':
                Path(warned['backup']['path']).write_bytes(b'changed backup')
            else:
                (docker.root / 'deploy/ovh/.env').write_text('changed settings')
            docker.calls.clear()
            refused(lambda: docker.deployment().apply())
            if changed != 'backup':
                refused(lambda: docker.deployment().cancel_warning())
            assert not docker.mutations(), 'Changed warning identity, process or release proof cannot signal or replace a writer'

        for interrupted in [False, True]:
            docker = Docker(realm_base / ('held-superseded-' + str(interrupted)), realm)
            docker.held_warnings()
            if interrupted:
                docker.fail = 'interrupt-after-held-signal'
                refused(lambda: docker.deployment().warn(), KeyboardInterrupt)
            else:
                docker.deployment().warn()
            previous_id = docker.warning['id']
            next_image = IMAGE[:-64] + 'f' * 64
            docker.tags[next_image] = NEW
            docker.images[NEW]['RepoDigests'].append(next_image)
            docker.clock += datetime.timedelta(seconds=1)
            newer = docker.deployment(image=next_image).warn()
            assert newer['noticeId'] != previous_id and docker.warning['secondsRemaining'] == 300
            docker.calls.clear()
            refused(lambda: docker.deployment().warn())
            refused(lambda: docker.deployment().cancel_warning())
            assert not docker.mutations(), 'An older release cannot adopt or cancel a newer candidate notice'
            assert docker.deployment(image=next_image).cancel_warning()['phase'] == 'cancelled'

        docker = Docker(realm_base / 'held-uncertain-new-candidate-cancel', realm)
        docker.held_warnings()
        prior_id = docker.deployment().warn()['noticeId']
        next_image = IMAGE[:-64] + 'f' * 64
        docker.tags[next_image] = NEW
        docker.images[NEW]['RepoDigests'].append(next_image)
        docker.fail = 'interrupt-before-held-signal'
        refused(lambda: docker.deployment(image=next_image).warn(), KeyboardInterrupt)
        docker.calls.clear()
        assert docker.deployment(image=next_image).cancel_warning()['phase'] == 'cancelled'
        assert docker.warning['id'] == prior_id and not docker.mutations(), 'Cancelling an undelivered new request cannot cancel the prior candidate warning'

        for cancelled in [False, True]:
            docker = Docker(realm_base / ('held-fallback-' + str(cancelled)), realm)
            docker.held_warnings()
            prior_id = docker.deployment().warn()['noticeId']
            docker.clock += datetime.timedelta(seconds=310)
            next_image = IMAGE[:-64] + 'f' * 64
            docker.tags[next_image] = NEW
            docker.images[NEW]['RepoDigests'].append(next_image)
            if cancelled:
                docker.fail = 'interrupt-before-held-signal'
                refused(lambda: docker.deployment(image=next_image).warn(), KeyboardInterrupt)
                assert docker.deployment(image=next_image).cancel_warning()['phase'] == 'cancelled'
            docker.deployment(image=next_image).apply(prepare=True)
            docker.calls.clear()
            refused(lambda: docker.deployment(image=next_image).apply())
            assert docker.warning['id'] == prior_id and docker.warning['held'] and docker.game['State']['Running']
            assert docker.game['HostConfig']['RestartPolicy'] == docker.host_config['RestartPolicy']
            assert not docker.mutations(), 'Fallback cannot commit an older held notice or disable restart before rejecting it'

        docker = Docker(realm_base / 'held-committed-new-candidate', realm)
        docker.held_warnings()
        docker.deployment().warn()
        docker.warning['held'] = False
        next_image = IMAGE[:-64] + 'f' * 64
        docker.tags[next_image] = NEW
        docker.images[NEW]['RepoDigests'].append(next_image)
        docker.calls.clear()
        refused(lambda: docker.deployment(image=next_image).warn())
        assert not docker.mutations(), 'A new candidate cannot supersede a committed notice'

    # Execute the actual candidate asset verifier, including traversal rejection.
    app = base / 'app'
    files = {'index.html': 'verified asset', '.well-known/apple-app-site-association': '{}', '.well-known/assetlinks.json': '[]'}
    for name, content in files.items():
        path = app / 'dist' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    manifest = {'revision': REVISION, 'assets': {name: release.sha(app / 'dist' / name) for name in files}}
    for invalid in [False, True]:
        if invalid:
            manifest['assets']['../escape'] = 'e' * 64
        for name in ['release.json', 'dist/release.json']:
            (app / name).write_text(json.dumps(manifest))
        result = subprocess.run(['node', '-e', release.VERIFY_IMAGE.replace('/app', str(app))], capture_output=True)
        assert (result.returncode == 0) is not invalid

print('US and Asia immutable release guards passed: preparation, backup, real save, resume, identity, settings, assets, lock, held warning capability, remaining countdown, uncertain signal/cancel recovery and cross-candidate ownership.')

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    for realm in ['us', 'asia']:
        docker = Docker(base / realm, realm)
        prepared = docker.deployment().economy_apply('prepare')
        assert prepared['economyBarrierVersion'] == 1 and not docker.mutations()
        refused(lambda: docker.deployment().apply())
        refused(lambda: docker.deployment().economy_apply('start'))
        refused(lambda: docker.deployment().economy_apply('migrate', {}))
        docker.deployment().economy_apply('arm')
        held = docker.deployment().economy_apply('drain')
        assert held['phase'] == 'stopped' and held['drainProof']['restartHeld']
        assert not docker.game['State']['Running']
        assert not any(call[1:3] == ('compose', 'up') for call in docker.calls)
        docker.deployment().economy_apply('prepare')
        assert not docker.game['State']['Running'], 'retry preparation cannot start a writer'
        if realm == 'us':
            backed = docker.deployment().economy_apply('backup')
            b = backed['backup']
            proof = {'backup': {'sha256': b['sha256'], 'bytes': b['bytes'], 'at': int(release.stamp(b['verifiedAt']).timestamp()*1000)}}
            refused(lambda: docker.deployment().economy_apply('migrate', {'backup': {}}))
            docker.deployment().economy_apply('migrate', proof)
            docker.deployment().economy_apply('migrate', proof)
        else:
            docker.economy.update(version=1, maintenance=False)
        complete = docker.deployment().economy_apply('start')
        assert complete['phase'] == 'complete' and docker.game['State']['Running']
        docker.deployment().economy_apply('prepare')
        docker.deployment().economy_apply('start')
        if realm == 'us':
            assert docker.deployment().economy_apply('enable', {})['economy']['exchangeEnabled']
print('PASS economy host barrier: staged compatibility, held final saves, no premature start, exact backup binding, migration/restart replay, and normal-route bypass rejection.')


def catalog_authorization(docker, held):
    local = held['drainProof']
    realms = {realm: {**local, 'realm': realm, 'instanceId': realm + '-original-writer'} for realm in ['eu', 'us', 'asia']}
    realms['eu'].pop('restartHeld')
    realms['eu']['admissionHeld'] = True
    realms[docker.realm] = local
    return {'revision': REVISION, 'image': IMAGE, 'playerCatalogVersion': 5, 'realms': realms}


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    for realm in ['us', 'asia']:
        for interruption in [None, 'interrupt-wait', 'interrupt-up', 'interrupt-after-up']:
            docker = Docker(base / realm / str(interruption), realm)
            docker.manifest['playerCatalogVersion'] = 5
            prepared = docker.deployment().apply(prepare=True)
            assert prepared['catalogBarrierVersion'] == 1 and prepared['catalogBarrierRequired']
            assert prepared['oldCatalogVersion'] == 4 and prepared['playerCatalogVersion'] == 5
            assert not docker.mutations(), 'Catalog preparation cannot warn or stop players'
            refused(lambda: docker.deployment().apply())
            refused(lambda: docker.deployment().economy_apply('prepare'))
            refused(lambda: docker.deployment().catalog_apply('start'))
            refused(lambda: docker.deployment().catalog_apply('authorize', {}))
            if interruption == 'interrupt-wait':
                docker.fail = interruption
                refused(lambda: docker.deployment().catalog_apply('drain'), KeyboardInterrupt)
                refused(lambda: docker.deployment().apply())
            held = docker.deployment().catalog_apply('drain')
            assert held['phase'] == 'stopped' and held['drainProof']['restartHeld']
            assert held['drainProof']['playerCatalogVersion'] == 4 and not docker.game['State']['Running']
            assert not any(call[1:3] == ('compose', 'up') for call in docker.calls)
            docker.calls.clear()
            docker.deployment().apply(prepare=True)
            docker.deployment().catalog_apply('status')
            refused(lambda: docker.deployment().apply())
            refused(lambda: docker.deployment().catalog_apply('start'))
            proof = catalog_authorization(docker, held)
            invalid = [None, {}, {**proof, 'revision': 'f' * 40}, {**proof, 'image': IMAGE[:-1] + 'f'},
                       {**proof, 'playerCatalogVersion': 6}, {**proof, 'realms': {realm: proof['realms'][realm]}}]
            for name in ['eu', 'us', 'asia']:
                for patch in [{'realm': 'wrong'}, {'targetRevision': 'f' * 40}, {'finalSave': False}, {'drainedAt': 0},
                              {'playerCatalogVersion': 6}, {'admissionHeld' if name == 'eu' else 'restartHeld': False}]:
                    malformed = deepcopy(proof)
                    malformed['realms'][name].update(patch)
                    invalid.append(malformed)
            malformed = deepcopy(proof)
            malformed['realms'][realm]['instanceId'] = 'restarted-writer'
            invalid.append(malformed)
            for malformed in invalid:
                refused(lambda: docker.deployment().catalog_apply('authorize', malformed))
            assert not docker.mutations(), 'Invalid or absent authorization cannot start a writer'
            authorized = docker.deployment().catalog_apply('authorize', proof)
            assert authorized['catalogBarrierProof'] == proof
            docker.deployment().catalog_apply('authorize', deepcopy(proof))
            malformed = deepcopy(proof)
            malformed['realms']['eu']['drainedAt'] += 1
            refused(lambda: docker.deployment().catalog_apply('authorize', malformed))
            if interruption in ['interrupt-up', 'interrupt-after-up']:
                docker.fail = interruption
                refused(lambda: docker.deployment().catalog_apply('start'), KeyboardInterrupt)
                docker.deployment().apply(prepare=True)
                docker.deployment().catalog_apply('status')
                refused(lambda: docker.deployment().apply())
            complete = docker.deployment().catalog_apply('start')
            assert complete['phase'] == 'complete' and complete['catalogBarrierProof'] == proof and docker.game['State']['Running']
            docker.calls.clear()
            docker.deployment().catalog_apply('status')
            docker.deployment().catalog_apply('start')
            refused(lambda: docker.deployment().apply())
            refused(lambda: docker.deployment().catalog_apply('drain'))
            assert not docker.mutations(), 'Completed catalog retries cannot replace the candidate again'

        for change in ['backup', 'environment', 'manifest', 'candidate', 'restart', 'old-start']:
            docker = Docker(base / realm / ('changed-' + change), realm)
            docker.manifest['playerCatalogVersion'] = 5
            docker.deployment().apply(prepare=True)
            held = docker.deployment().catalog_apply('drain')
            proof = catalog_authorization(docker, held)
            if change == 'backup':
                Path(held['backup']['path']).write_bytes(b'changed')
            elif change == 'environment':
                (docker.root / 'deploy/ovh/.env').write_text('changed\n')
            elif change == 'manifest':
                docker.manifest['assets']['index.html'] = 'a' * 64
            elif change == 'candidate':
                docker.images[NEW]['Id'] = 'sha256:' + 'f' * 64
            elif change == 'restart':
                docker.game['HostConfig']['RestartPolicy'] = docker.host_config['RestartPolicy']
            elif change == 'old-start':
                docker.game['State']['StartedAt'] = (docker.clock + datetime.timedelta(seconds=1)).isoformat()
            docker.calls.clear()
            refused(lambda: docker.deployment().catalog_apply('status'))
            refused(lambda: docker.deployment().catalog_apply('authorize', proof))
            assert not docker.mutations(), 'Changed candidate, backup or writer cannot authorize promotion'

        for old_version, new_version in [(5, 5), (5, 4), (4, None)]:
            docker = Docker(base / realm / f'versions-{old_version}-{new_version}', realm)
            docker.old_manifest['playerCatalogVersion'] = old_version
            docker.manifest['playerCatalogVersion'] = new_version
            if new_version is None or new_version < old_version:
                refused(lambda: docker.deployment().apply(prepare=True))
                assert not docker.mutations()
            else:
                assert not docker.deployment().apply(prepare=True)['catalogBarrierRequired']
                assert docker.deployment().apply()['phase'] == 'complete', 'Compatible catalogs retain normal rollout'

        docker = Docker(base / realm / 'same-version-coordination', realm)
        docker.old_manifest['playerCatalogVersion'] = docker.manifest['playerCatalogVersion'] = 5
        assert not docker.deployment().apply(prepare=True)['catalogBarrierRequired']
        assert docker.deployment().catalog_apply('drain')['catalogBarrierRequired'], 'Joining another realm catalog transition persists the same barrier'
        refused(lambda: docker.deployment().apply())
        refused(lambda: docker.deployment().catalog_apply('start'))

        for failure in ['backup', 'save', 'early-exit']:
            docker = Docker(base / realm / ('failed-catalog-' + failure), realm)
            docker.manifest['playerCatalogVersion'] = 5
            docker.fail = failure if failure == 'backup' else None
            if failure == 'backup':
                refused(lambda: docker.deployment().apply(prepare=True))
                assert not docker.mutations()
            else:
                docker.deployment().apply(prepare=True)
                docker.fail = failure
                refused(lambda: docker.deployment().catalog_apply('drain'))
            refused(lambda: docker.deployment().catalog_apply('start'))
            refused(lambda: docker.deployment().catalog_apply('authorize', {}))
            assert not any(call[1:3] == ('compose', 'up') for call in docker.calls), 'Failed backup or final save cannot reach a candidate start'

print('PASS catalog host barrier: immutable candidates, exact final saves, all-realm authorization, no normal-route bypass, interruption recovery, proof tampering, downgrade rejection and compatible rolling releases.')
