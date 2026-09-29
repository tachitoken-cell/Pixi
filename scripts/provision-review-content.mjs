import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayerStore } from '../src/player-store.mjs';
import { migrateRecords, validateRecords } from '../server.mjs';
import { STORE_PRODUCTS, mobileIntentIdValid } from '../src/ingame-store.ts';
import { maxHealth } from '../src/progression.ts';
import { MOUNT_UNLOCK_LEVEL } from '../src/travel.ts';

const refuse = message => { throw Object.assign(Error(message), { reviewContent: true }); };
const products = STORE_PRODUCTS.filter(product => ['mount', 'pet', 'boost'].includes(product.kind));

// An explicit, offline review bundle. It never writes paid orders, receipt ledgers,
// account roles, or a generic administrative endpoint.
export async function provisionReviewContent(store, { accountKey, characterId, expectedName, prepareRiding = false, apply = false, now = Date.now() }) {
  if (!/^[a-f0-9]{64}$/.test(accountKey || '') || !mobileIntentIdValid(characterId) || !expectedName?.trim()
      || !Number.isSafeInteger(now) || now <= 0 || typeof prepareRiding !== 'boolean' || typeof apply !== 'boolean')
    refuse('Provide the exact review account key, character UUID, and expected character name.');
  const account = await store.claim(accountKey, undefined, { existingOnly: true });
  if (!account) refuse('The review account is missing or currently online. No account was created.');
  try {
    validateRecords({ [accountKey]: account }, true);
    const player = account.characters.find(character => character.id === characterId);
    if (!player || player.name !== expectedName) refuse('The character ID and expected name do not match this account.');
    if (account.ban || account.gmProtected) refuse('Use an ordinary, unbanned review account.');
    if (player.storeOrders.some(order => !['delivered', 'expired'].includes(order.status))
        || player.mobileStoreOrders.some(order => !['delivered', 'refunded', 'abandoned'].includes(order.status)))
      refuse('Resolve this character’s unsettled purchases before granting review content.');
    const next = structuredClone(account), target = next.characters.find(character => character.id === characterId);
    const added = [];
    for (const product of products) {
      // Permanent benefits already bought need no second entitlement. Boosts
      // are granted once even when their complimentary charge was consumed.
      if (target.storeGrants.some(grant => grant.productId === product.id)
          || product.kind !== 'boost' && target.storePurchases.includes(product.id)) continue;
      target.storeGrants.push({ id: randomUUID(), characterId, productId: product.id, grantedAt: now, reason: 'review-access' });
      if (product.kind === 'boost') target.storeConsumables[product.boostId] = (target.storeConsumables[product.boostId] || 0) + 1;
      else {
        target.storePurchases.push(product.id);
        if (product.kind === 'mount') target.ownedMounts.push(product.rewardId);
        if (product.kind === 'pet') target.ownedPets.push(product.rewardId);
      }
      added.push(product.id);
    }
    if (prepareRiding) {
      // Ordinary progression fields only: enough to inspect both store mounts
      // and the character UI. Do not lower subsequent earned progress or heal.
      target.level = Math.max(target.level, MOUNT_UNLOCK_LEVEL);
      target.ridingRank = Math.max(target.ridingRank, 1);
      target.maxHp = maxHealth(target);
      target.onboarding = { version: 1, looted: true, bagViewed: true, gearViewed: true, completed: true };
    }
    validateRecords({ [accountKey]: next }, true);
    const changed = !isDeepStrictEqual(account, next);
    if (apply && changed) {
      const [saved] = await store.commit([{ key: accountKey, state: next, expected: account }]);
      const [readback] = await store.read([accountKey]);
      if (!readback || !isDeepStrictEqual(saved.state, readback.state)) refuse('The write completed but its readback differs. Inspect before retrying.');
    }
    return { mode: apply ? 'apply' : 'dry-run', changed, addedProducts: added,
      level: target.level, ridingRank: target.ridingRank, onboardingCompleted: target.onboarding?.completed === true,
      boostCharges: { ...target.storeConsumables }, paymentRecordsChanged: false };
  } finally {
    await store.release(accountKey);
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    'account-key': { type: 'string' }, 'character-id': { type: 'string' }, 'expected-name': { type: 'string' },
    'prepare-riding': { type: 'boolean', default: false }, apply: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log('DATABASE_URL=… node scripts/provision-review-content.mjs --account-key HASH --character-id UUID --expected-name NAME [--prepare-riding] [--apply]\nDefaults to dry-run. Keep database credentials in the environment, never command arguments.');
    return;
  }
  if (!process.env.DATABASE_URL) refuse('DATABASE_URL must point to the existing shared player database.');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) refuse('DATABASE_URL must be a PostgreSQL URL.');
  let ssl;
  if (process.env.DATABASE_CA_BASE64) {
    const ca = Buffer.from(process.env.DATABASE_CA_BASE64, 'base64').toString('utf8');
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) refuse('DATABASE_CA_BASE64 must contain a PEM certificate.');
    for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'sslmode']) url.searchParams.delete(key);
    ssl = { ca, rejectUnauthorized: true };
  }
  const store = createPlayerStore({ connectionString: url.toString(), ssl,
    migrate: (account, key) => migrateRecords({ [key]: account })[key],
    validate: (account, key) => validateRecords({ [key]: account }, true) });
  try {
    await store.start();
    console.log(JSON.stringify(await provisionReviewContent(store, { accountKey: values['account-key'], characterId: values['character-id'],
      expectedName: values['expected-name'], prepareRiding: values['prepare-riding'], apply: values.apply }), null, 2));
  } finally { await store.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    console.error(error.reviewContent ? error.message : 'Review provisioning failed. Inspect database availability and save validation; credentials and player records are not printed.');
    process.exitCode = 1;
  }
}
