import { Interface, keccak256 } from 'ethers';
import { getChainRpc } from '../src/nft-rpc.mjs';

export const TREASURIES = [
  // Current USD-valued vouchers, previous whole-MOSS vouchers, and the original treasury.
  ['0xF44A6d7E2eca15771ad62291f621b31E9A13748a', '0x25ea2170369328ea43385719338a0ac9908a37a663049c63316fda0569931486'],
  ['0x8671Bc2c3A675239c7A2CFcdc4516Ec45e2d677f', '0xf70a43fc113e5ba5308a896df6f46fe058e7cfbd323f6d058d2f506f03c8bbb9'],
  ['0xac278da160bC4E2db77F287EA9a09c5d52466C92', '0xe4d0971189ef86884a07d2a19cc50780a14bb753bab88981c12ffc0041135cbb'],
];
export const MOSS_TOKEN = '0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5';
const TOKEN_HASH = '0x41881f8aa07050b6e0432355047d8c4fa6ea3648afbe5b6945ce96502b4c1542';
const abi = new Interface(['function totalPaid() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const tag = block => ({ blockHash: block.hash, requireCanonical: true });
const publicBlock = block => ({ number: BigInt(block.number).toString(), hash: block.hash, timestamp: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() });
const metadata = { chainId: 4663, token: MOSS_TOKEN, decimals: 18, contract: TREASURIES[0][0], contracts: TREASURIES.map(([address]) => address), payoutBasis: 'finalized', balanceBasis: 'latest' };

// The official header endpoint throttles Cloudflare egress. Keep stats reads on
// the public state endpoint; the same freshness and canonical checks still apply.
export function createTreasuryStats({ rpc = getChainRpc('https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public', { routeHeaders: false }), now = Date.now, hashCode = keccak256 } = {}) {
  let result, saved, pending, checkedAt = -Infinity, previousFinal, previousLatest;
  function blockValid(block, maximumAge, at) {
    return hash(block?.hash) && quantity(block.number) && quantity(block.timestamp)
      && BigInt(block.timestamp) <= BigInt(Math.floor(at / 1000) + 30)
      && BigInt(block.timestamp) >= BigInt(Math.floor(at / 1000) - maximumAge);
  }
  async function read(to, name, args, block) {
    const encoded = await rpc('eth_call', [{ to, data: abi.encodeFunctionData(name, args) }, tag(block)]);
    if (!hash(encoded)) throw Error('Invalid treasury value.');
    return abi.decodeFunctionResult(name, encoded)[0];
  }
  async function snapshot() {
    const at = now();
    const [chain, finalized, latest] = await Promise.all([
      rpc('eth_chainId', []), rpc('eth_getBlockByNumber', ['finalized', false]), rpc('eth_getBlockByNumber', ['latest', false]),
    ]);
    if (!quantity(chain) || BigInt(chain) !== 4663n || !blockValid(finalized, 1800, at) || !blockValid(latest, 120, at)
      || BigInt(latest.number) < BigInt(finalized.number) || BigInt(latest.timestamp) < BigInt(finalized.timestamp)
      || latest.number === finalized.number && latest.hash !== finalized.hash
      || previousFinal && (BigInt(finalized.number) < BigInt(previousFinal.number) || finalized.number === previousFinal.number && finalized.hash !== previousFinal.hash)
      || previousLatest && BigInt(latest.number) < BigInt(previousLatest.number)) throw Error('Treasury chain is stale or inconsistent.');
    const [codes, paid, balance] = await Promise.all([
      Promise.all([...TREASURIES.map(([address]) => address), MOSS_TOKEN].map(address => rpc('eth_getCode', [address, tag(finalized)]))),
      Promise.all(TREASURIES.map(([address]) => read(address, 'totalPaid', [], finalized))),
      read(MOSS_TOKEN, 'balanceOf', [TREASURIES[0][0]], latest),
    ]);
    const expectedHashes = [...TREASURIES.map(([, codeHash]) => codeHash), TOKEN_HASH];
    if (codes.some((code, index) => hashCode(code) !== expectedHashes[index])) throw Error('Unexpected treasury deployment.');
    // The public provider rejects old numeric headers, including its own finalized
    // block. Require that exact block to remain finalized; an advancing finality
    // tag fails closed until the next snapshot. Latest still gets a numeric check.
    const canonical = await Promise.all([
      rpc('eth_getBlockByNumber', ['finalized', false]),
      rpc('eth_getBlockByNumber', [latest.number, false]),
    ]);
    if (canonical.some((block, index) => block?.number !== [finalized, latest][index].number || block?.hash !== [finalized, latest][index].hash)) throw Error('Treasury chain changed during verification.');
    // totalPaid counts successful treasury claims (vouchers and gold rounds); owner withdrawals never increase it.
    return { finalized, latest, data: { ...metadata, status: 'ok', totalPaidWei: paid.reduce((sum, value) => sum + value, 0n).toString(), balanceWei: balance.toString(),
      updatedAt: new Date(at).toISOString(), finalizedBlock: publicBlock(finalized), balanceBlock: publicBlock(latest) } };
  }
  return function getTreasuryStats() {
    if (pending) return pending;
    if (now() - checkedAt < 30000) return Promise.resolve(result);
    let timer;
    pending = Promise.race([snapshot(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Treasury verification timed out.')), 18000); })])
      .then(({ data, finalized, latest }) => { previousFinal = finalized; previousLatest = latest; saved = data; return data; }).catch(() => saved ? { ...saved, status: 'stale' }
      : { ...metadata, status: 'unavailable', totalPaidWei: null, balanceWei: null, updatedAt: null, finalizedBlock: null, balanceBlock: null })
      .then(value => { result = value; checkedAt = now(); return value; }).finally(() => { clearTimeout(timer); pending = undefined; });
    return pending;
  };
}

export const getTreasuryStats = createTreasuryStats();
