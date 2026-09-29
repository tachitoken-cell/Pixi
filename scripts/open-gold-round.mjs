import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parseUnits, formatUnits } from 'ethers';
import { createPlayerStore } from '../src/player-store.mjs';
import { migrationConnection } from '../src/gold-migration.mjs';
import { createTreasureChain } from '../src/treasury-chain.mjs';
import { createGoldRound } from '../src/gold-rounds.ts';

export function goldRoundArguments(args, now = Date.now()) {
  const { values } = parseArgs({ args, options: { id: { type: 'string' },
    usd: { type: 'string', default: '1000' }, hours: { type: 'string', default: '4' },
    'max-usd-per-1000': { type: 'string', default: '1' }, open: { type: 'boolean', default: false }, help: { type: 'boolean' } } });
  if (values.help) return { help: true };
  if (!values.id) throw Error('Supply --id for this dollar-budget gold round.');
  const hours = Number(values.hours), cents = Number(parseUnits(values.usd, 2)), cap = Number(parseUnits(values['max-usd-per-1000'], 2));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || !Number.isSafeInteger(hours * 3600000)) throw Error('Choose a round length up to 24 hours.');
  return { open: values.open, terms: { id: values.id, budgetUsdCents: cents,
    startsAt: now, endsAt: now + hours * 3600000, maxPriceCentsPer1000: cap } };
}
async function main() {
  const args = goldRoundArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/open-gold-round.mjs --id ROUND_ID [--usd 1000] [--hours 4] [--max-usd-per-1000 1] [--open]\nDefaults to a funding preview. The USD budget stays fixed; MOSS amounts lock at round settlement. --open reserves funding for one round. No wallet transaction is sent.');
    return;
  }
  const chain = createTreasureChain(), funding = await chain.quoteGoldBudget({ payoutUsdMicros: (BigInt(args.terms.budgetUsdCents) * 10000n).toString() });
  const round = createGoldRound({ ...args.terms, contract: funding.contract });
  if (BigInt(funding.amountWei) > BigInt(funding.balanceWei)) throw Error('The treasury needs more MOSS to fund this USD budget.');
  if (!args.open) {
    console.log(JSON.stringify({ preview: true, ...round, estimatedMoss: formatUnits(funding.amountWei, 18), price: funding.price,
      note: 'The USD budget is fixed. MOSS changes with its price and locks at settlement. Opening also checks all reserved payouts; preview does not reserve funds.' }, null, 2));
    return;
  }
  const store = createPlayerStore(migrationConnection(process.env.DATABASE_URL || '', process.env.DATABASE_CA_BASE64 || ''));
  try {
    await store.start();
    const opened = await store.openGoldRound(round, funding);
    console.log(JSON.stringify({ opened: true, ...opened, estimatedMoss: formatUnits(funding.amountWei, 18), price: funding.price }, null, 2));
  } finally { await store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => { console.error(error.code ? 'Gold round operation failed; inspect the private operator environment.' : error.message); process.exitCode = 1; });
