import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = dirname(fileURLToPath(import.meta.url)), temporary = mkdtempSync(join(tmpdir(), 'mossvale-ovh-check-'));
try {
  const dockerfile = readFileSync(join(cwd, 'Dockerfile'), 'utf8');
  const buildCopies = dockerfile.split('\n')
    .filter(line => line.startsWith('COPY ') && !line.includes('--from='))
    .flatMap(line => line.split(/\s+/).slice(1, -1));
  for (const [, entry] of readFileSync(join(cwd, '../../vite.config.js'), 'utf8').matchAll(/resolve\('([^']+\.html)'\)/g)) {
    assert.ok(buildCopies.includes(entry), `Production image must copy Vite entry ${entry}`);
  }
  const runtime = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
  assert.match(runtime, /^COPY scripts\/open-gold-round\.mjs \.\/scripts\/open-gold-round\.mjs$/m,
    'Production runtime must include the gold round operator command');
  assert(buildCopies.includes('mobile/app-update.ts'), 'The build includes the shared mobile update policy helper');
  assert.match(runtime, /^COPY --from=build \/app\/mobile\/app-update\.ts \.\/mobile\/app-update\.ts$/m, 'The runtime includes its imported policy helper');
  assert.match(runtime, /^COPY config\/mobile-app-updates\.json \.\/config\/mobile-app-updates\.json$/m, 'The runtime includes the reviewed required-version policy');
  assert.match(runtime, /^COPY config\/mobile-push\.json \.\/config\/mobile-push\.json$/m, 'The runtime includes the reviewed push activation setting');
  const envFile = join(temporary, 'empty.env');
  writeFileSync(envFile, '', { mode: 0o600 });
  const nftKeys = ['NFT_PETS_CONTRACT', 'NFT_HOUSES_CONTRACT', 'NFT_FEE_RECEIVER', 'NFT_AUTHORITY_KEY', 'NFT_RPC_URL'];
  const treasuryKeys = ['TREASURE_TREASURY_CONTRACT', 'TREASURE_LEGACY_CONTRACT', 'TREASURE_AUTHORITY_KEY', 'TREASURE_RPC_URL'];
  const releaseKeys = ['GOOGLE_TRANSLATE_API_KEY', 'MOSS_ARENA_CONTRACT', 'MOSS_ARENA_AUTHORITY_KEY', 'MOSS_ARENA_RPC_URL', 'KEYCLOAK_SOCIAL_PROVIDERS', 'KEYCLOAK_DELETE_CLIENT_ID', 'KEYCLOAK_DELETE_CLIENT_SECRET', 'KEYCLOAK_DELETE_CLIENT_REALM', 'APPLE_IAP_PRIVATE_KEY', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_RTDN_AUDIENCE', 'GOOGLE_RTDN_EMAIL', 'GOOGLE_RTDN_SUBSCRIPTION', 'MOBILE_PURCHASE_SANDBOX_ACCOUNTS', ...nftKeys, ...treasuryKeys];
  const env = { ...process.env, ...Object.fromEntries(releaseKeys.map(key => [key, ''])), CHAT_TRANSLATION_DAILY_CHARACTERS: '', COMPOSE_PROFILES: '', COMPOSE_PROJECT_NAME: '', REALM_ID: '', REALM_HOST: '', US_HOST: '', REALM_ASIA_ORIGIN: '', POSTGRES_PASSWORD: '', DATABASE_URL: 'postgresql://test:check-only-password@canonical.example.test/mossvale', DATABASE_CA_BASE64: 'check-only-ca', KEYCLOAK_URL: 'https://auth.example.test', KEYCLOAK_REALM: 'mossvale', KEYCLOAK_CLIENT_ID: 'mossvale-browser' };
  const compose = (overrides, allProfiles = false) => spawnSync('docker', ['compose', '--env-file', envFile, ...(allProfiles ? ['--profile', '*'] : []), 'config', '--format', 'json'], { cwd, env: { ...env, ...overrides }, encoding: 'utf8' });
  const result = compose({});
  assert.equal(result.status, 0, result.stderr);
  const { name, services, networks, volumes } = JSON.parse(result.stdout);
  assert.equal(name, 'mossvale-us', 'Existing US containers and volumes must keep their project name');
  assert.equal(services.game.image, 'mossvale-us:local');
  assert.equal(services.game.environment.REFERRALS_ENABLED, undefined, 'Referral activation preserves the host Compose environment');
  assert.match(readFileSync(join(cwd, '../../server.mjs'), 'utf8'), /referralsEnabled = process\.env\.REFERRALS_ENABLED === undefined\s+\? isProductionMossAuctionContract\(process\.env\.MOSS_AUCTION_CONTRACT\) && Number\(process\.env\.MOSS_AUCTION_CHAIN_ID \|\| 4663\) === 4663\s+: process\.env\.REFERRALS_ENABLED === '1'/, 'Referral defaults require the exact production auction family on chain 4663 and preserve explicit overrides');
  assert.equal(volumes.caddy_data.name, 'mossvale-us_caddy_data');
  assert.equal(services.caddy.environment.US_HOST, 'us.mossvale.world');
  assert.equal(services.game.environment.REALM_ASIA_ORIGIN, '', 'Asia must remain unavailable until configured');
  assert.equal(JSON.parse(compose({ US_HOST: 'legacy.example.test' }).stdout).services.caddy.environment.US_HOST, 'legacy.example.test');
  const asia = JSON.parse(compose({ REALM_ID: 'asia', REALM_HOST: 'asia.mossvale.world', REALM_ASIA_ORIGIN: 'https://asia.mossvale.world', US_HOST: 'legacy.example.test' }, true).stdout);
  assert.equal(asia.name, 'mossvale-asia');
  assert.equal(asia.services.game.image, 'mossvale-asia:local');
  assert.equal(asia.services.game.environment.REALM_ID, 'asia');
  assert.equal(asia.services.game.environment.REALM_ASIA_ORIGIN, 'https://asia.mossvale.world');
  assert.equal(asia.services.game.environment.DATABASE_URL, env.DATABASE_URL);
  assert.equal(asia.services.caddy.environment.US_HOST, 'asia.mossvale.world');
  assert.equal(asia.volumes.caddy_data.name, 'mossvale-asia_caddy_data');
  assert.equal(asia.volumes.postgres_data.name, 'mossvale-asia_postgres_data');
  assert.deepEqual(Object.keys(services).sort(), ['caddy', 'game']);
  const optionalConfig = JSON.parse(compose({}, true).stdout), optional = optionalConfig.services;
  assert.equal(optionalConfig.volumes.postgres_data.name, 'mossvale-us_postgres_data');
  assert.deepEqual(optional.postgres.profiles, ['local-storage']);
  assert.equal(optional.postgres.ports, undefined);
  assert.equal(services.game.ports, undefined);
  assert.equal(networks.database.internal, true);
  assert.deepEqual(Object.keys(optional.postgres.networks), ['database']);
  assert.equal(services.game.environment.REALM_ID, 'us');
  assert.equal(services.game.read_only, true);
  assert.equal(services.game.depends_on, undefined, 'The canonical DB must not silently fall back to the old local service.');
  assert.equal(services.game.environment.DATABASE_URL, env.DATABASE_URL);
  assert.equal(services.game.environment.DATABASE_CA_BASE64, env.DATABASE_CA_BASE64);
  for (const key of releaseKeys) assert.equal(services.game.environment[key], '', `${key} must remain disabled by default`);
  const releaseEnvironment = Object.fromEntries(releaseKeys.map(key => [key, key === 'APPLE_IAP_PRIVATE_KEY' ? 'check-only\nmultiline-value' : key === 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON' ? '{"check":"only"}' : `check-only-${key}`]));
  assert.equal(services.game.environment.CHAT_TRANSLATION_DAILY_CHARACTERS, '5000');
  assert.equal(JSON.parse(compose({ CHAT_TRANSLATION_DAILY_CHARACTERS: '1234' }).stdout).services.game.environment.CHAT_TRANSLATION_DAILY_CHARACTERS, '1234');
  const configuredServices = JSON.parse(compose(releaseEnvironment, true).stdout).services;
  const configuredRelease = configuredServices.game.environment;
  for (const [key, value] of Object.entries(releaseEnvironment)) assert.equal(configuredRelease[key], value, `${key} must reach only the game runtime unchanged`);
  // The activation helper appends JSON-quoted values to .env after the final save.
  // Exercise real Compose parsing, including multiline PEM and overriding an old blank assignment.
  const appleFromFile = Object.fromEntries(Object.entries(releaseEnvironment).filter(([key]) => key.startsWith('APPLE_IAP_') || key === 'MOBILE_PURCHASE_SANDBOX_ACCOUNTS'));
  writeFileSync(envFile, 'APPLE_IAP_KEY_ID=""\n' + Object.entries(appleFromFile).map(([key, value]) => `${key}=${JSON.stringify(value)}\n`).join(''));
  const fromFile = compose(Object.fromEntries(Object.keys(appleFromFile).map(key => [key, undefined])));
  assert.equal(fromFile.status, 0, 'Apple .env activation must render valid Compose');
  assert.deepEqual(JSON.parse(fromFile.stdout).services, { ...services, game: { ...services.game, environment: { ...services.game.environment, ...appleFromFile } } });
  writeFileSync(envFile, '');
  for (const [name, service] of Object.entries(configuredServices)) if (name !== 'game') {
    for (const key of ['GOOGLE_TRANSLATE_API_KEY', ...nftKeys, ...treasuryKeys]) assert.equal(service.environment?.[key], undefined, `${key} must not reach ${name}`);
  }
  const storeEnvironment = { STORE_CONTRACT: 'check-only-contract', STORE_LEGACY_CONTRACT: 'check-only-legacy', STORE_AUTHORITY_KEY: 'check-only-authority', STORE_RPC_URL: 'https://rpc.example.test' };
  const configuredStore = JSON.parse(compose(storeEnvironment).stdout).services.game.environment;
  for (const [key, value] of Object.entries(storeEnvironment)) assert.equal(configuredStore[key], value, `${key} must reach the store process`);
  assert.equal(optional['database-tools'].environment.DATABASE_URL, env.DATABASE_URL);
  assert.equal(optional['database-tools'].environment.DATABASE_CA_BASE64, env.DATABASE_CA_BASE64);
  assert.deepEqual(optional['database-tools'].profiles, ['maintenance']);
  assert.equal(optional['database-tools'].read_only, true);
  assert.equal(optional['database-tools'].ports, undefined);
  assert.equal(services.caddy.depends_on.game.condition, 'service_healthy');
  for (const variable of ['DATABASE_URL', 'KEYCLOAK_URL', 'KEYCLOAK_REALM', 'KEYCLOAK_CLIENT_ID']) assert.notEqual(compose({ [variable]: '' }).status, 0, `Missing ${variable} must block startup`);

  const unit = Object.fromEntries([...readFileSync(join(cwd, 'mossvale-us.service'), 'utf8').matchAll(/^([A-Za-z]+)=(.+)$/gm)].map(match => [match[1], match[2]]));
  for (const dependency of ['Requires', 'After', 'PartOf']) assert.ok(unit[dependency]?.split(/\s+/).includes('docker.service'), `${dependency} must keep Docker available until the ordered stack stop finishes`);
  assert.ok(unit.After.split(/\s+/).includes('network-online.target'));
  assert.equal(unit.Type, 'oneshot');
  assert.equal(unit.RemainAfterExit, 'yes');
  assert.equal(unit.WorkingDirectory, '/opt/mossvale/deploy/ovh');
  assert.equal(unit.ExecStart, '/usr/bin/docker compose up -d --wait --no-build');
  assert.equal(unit.ExecStop, '/usr/bin/docker compose stop', 'Compose must finish the game save before Docker stops');
  assert.ok(Number(unit.TimeoutStopSec) >= 300, 'Host shutdown must allow the complete ordered stack stop');
  assert.equal(unit.WantedBy, 'multi-user.target');

  const fakeDocker = join(temporary, 'docker'), backups = join(temporary, 'backups');
  writeFileSync(fakeDocker, '#!/bin/sh\ncase "$*" in\n*"database-tools dump") printf "test archive"; exit "${DUMP_EXIT:-0}" ;;\n*"database-tools verify") cat >/dev/null; exit "${RESTORE_EXIT:-0}" ;;\n*) exit 99 ;;\nesac\n', { mode: 0o700 });
  const backup = overrides => spawnSync('sh', ['./backup.sh', backups], { cwd, env: { ...process.env, PATH: `${temporary}:${process.env.PATH}`, ...overrides }, encoding: 'utf8' });
  assert.equal(backup({}).status, 0);
  const [archive] = readdirSync(backups);
  assert.ok(archive.startsWith('mossvale-shared-') && archive.endsWith('.dump'));
  assert.equal(readFileSync(join(backups, archive), 'utf8'), 'test archive');
  for (const overrides of [{ DUMP_EXIT: '1' }, { RESTORE_EXIT: '1' }]) {
    assert.notEqual(backup(overrides).status, 0);
    assert.deepEqual(readdirSync(backups), [archive], 'A failed backup must keep the previous archive and remove its temporary file');
  }
  console.log('US/Asia configuration, host shutdown ordering and backup failure checks passed.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
