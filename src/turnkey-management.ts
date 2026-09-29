import { getAddress, Interface, parseUnits, toQuantity, ZeroAddress } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';
import { NFT_HOUSES, NFT_LEGACY_PETS, NFT_PETS, type NftStatus } from './nfts.ts';
import { turnkeyRpc } from './turnkey-provider.ts';
import type { TurnkeyTransaction } from './turnkey-wallet.ts';

export type CollectionContracts = Pick<NftStatus, 'petsContract' | 'legacyPetsContract' | 'housesContract'>;
export type OwnedNft = { contract: string; tokenId: string; kind: 'pet' | 'house'; assetId: number; name: string; legacy: boolean };
export type TransferInput = { from: string; to: string } & ({ asset: 'eth' | 'moss'; amount: string } | { asset: 'nft'; contract: string; tokenId: string });
export type PaidTransferFees = { funded: false; chainId: 4663; nonce: string; gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string };
export type PreparedTransfer = { input: TransferInput; transaction: TurnkeyTransaction; fees: PaidTransferFees; maxFeeWei: string; nft?: OwnedNft };
type Dependencies = { rpc?: typeof turnkeyRpc; fetch?: typeof fetch };
const token = new Interface(['function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)']);
const nft = new Interface(['function ownerOf(uint256) view returns(address)', 'function assets(uint256) view returns(uint256)', 'function safeTransferFrom(address,address,uint256)']);
const address = (value: string) => { const result = getAddress(value); if (result === ZeroAddress) throw Error('Choose a nonzero wallet address.'); return result; };
const uint = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value) && BigInt(value) < 2n ** 256n;
const quantity = (value: unknown) => { if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value) || BigInt(value) >= 2n ** 256n) throw Error('Invalid chain response.'); return BigInt(value); };
const maxGas = 1000000n, maxGasPrice = 100000000000n;
const transferFeeMessage = 'Add ETH on Robinhood Chain to this wallet for the network fee. Manual transfers use your own gas.';
async function network(rpc: typeof turnkeyRpc) { if (quantity(await rpc('eth_chainId')) !== 4663n) throw Error('Select Robinhood Chain before sending funds.'); }
async function call(rpc: typeof turnkeyRpc, contract: string, abi: Interface, method: string, args: unknown[]) {
  return abi.decodeFunctionResult(method, await rpc('eth_call', [{ to: contract, data: abi.encodeFunctionData(method, args) }, 'latest']));
}
function collections(config: CollectionContracts) {
  return Object.entries(config).filter(([key, value]) => ['petsContract', 'legacyPetsContract', 'housesContract'].includes(key) && value)
    .map(([key, value]) => ({ contract: address(value!), kind: key === 'housesContract' ? 'house' as const : 'pet' as const, legacy: key === 'legacyPetsContract' }));
}
async function ownedNft(owner: string, contract: string, tokenId: string, config: CollectionContracts, rpc: typeof turnkeyRpc): Promise<OwnedNft> {
  if (!uint(tokenId) || tokenId === '0') throw Error('Enter a valid NFT token ID.');
  const collection = collections(config).find(item => item.contract === address(contract));
  if (!collection) throw Error('Choose a configured Mossvale NFT collection.');
  const [[currentOwner], [assetId]] = await Promise.all([call(rpc, collection.contract, nft, 'ownerOf', [tokenId]), call(rpc, collection.contract, nft, 'assets', [tokenId])]);
  if (address(currentOwner) !== owner) throw Error('This wallet no longer owns that NFT.');
  const catalog = collection.kind === 'house' ? NFT_HOUSES : collection.legacy ? NFT_LEGACY_PETS : NFT_PETS;
  const asset = catalog.find(item => BigInt(item.assetId) === assetId);
  if (!asset) throw Error('This token is not a recognized Mossvale NFT.');
  return { ...collection, tokenId, assetId: asset.assetId, name: asset.name };
}

export async function readBalances(wallet: string, { rpc = turnkeyRpc }: Dependencies = {}) {
  const owner = address(wallet); await network(rpc);
  const [eth, [moss]] = await Promise.all([rpc('eth_getBalance', [owner, 'latest']), call(rpc, MOSS_TOKEN.address, token, 'balanceOf', [owner])]);
  return { address: owner, ethWei: quantity(eth).toString(), mossWei: moss.toString() };
}

/** The index supplies token IDs only. Ownership and names come from the chain and local catalog. */
export async function readOwnedNfts(wallet: string, config: CollectionContracts, { rpc = turnkeyRpc, fetch: fetcher = fetch }: Dependencies = {}) {
  const owner = address(wallet), allowed = collections(config), items: OwnedNft[] = [], seen = new Set<string>();
  if (!allowed.length) return { items, truncated: false };
  await network(rpc);
  // Blockscout's documented address NFT cursor: token_contract_address_hash, token_id, token_type.
  let cursor: Record<string, string> = {}, truncated = false;
  for (let page = 0; page < 3; page++) {
    const url = new URL(`https://robinhoodchain.blockscout.com/api/v2/addresses/${owner}/nft`);
    url.search = new URLSearchParams({ type: 'ERC-721', ...cursor }).toString();
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('NFT list is unavailable. You can still enter a collection and token ID.');
    const result = await response.json();
    if (!Array.isArray(result.items) || result.items.length > 100) throw Error('NFT list is unavailable. You can still enter a collection and token ID.');
    const candidates = result.items.filter((item: { id?: string; token?: { address_hash?: string; address?: string } }) => {
      const contract = item.token?.address_hash ?? item.token?.address;
      return uint(item.id) && allowed.some(collection => collection.contract.toLowerCase() === contract?.toLowerCase());
    });
    for (let offset = 0; offset < candidates.length; offset += 8) {
      const batch = await Promise.all(candidates.slice(offset, offset + 8).map(async (item: { id: string; token: { address_hash?: string; address?: string } }) => {
        const contract = address((item.token.address_hash ?? item.token.address)!); const key = `${contract}:${item.id}`;
        if (seen.has(key)) return; seen.add(key);
        try { return await ownedNft(owner, contract, item.id, config, rpc); } catch { truncated = true; return; }
      }));
      items.push(...batch.filter((item): item is OwnedNft => !!item));
    }
    if (!result.next_page_params) return { items, truncated };
    const next = result.next_page_params;
    if (!uint(next.token_id) || next.token_type !== 'ERC-721') throw Error('Invalid NFT list cursor.');
    cursor = { token_contract_address_hash: address(next.token_contract_address_hash), token_id: next.token_id, token_type: 'ERC-721' };
  }
  return { items, truncated: true };
}

/** Manual sends always use this wallet's own ETH; they never request game-funded gas. */
export async function prepareTransfer(input: TransferInput, config: CollectionContracts = {}, { rpc = turnkeyRpc }: Dependencies = {}): Promise<PreparedTransfer> {
  const from = address(input.from), to = address(input.to);
  if (from === to) throw Error('Choose a recipient other than this wallet.');
  const balances = await readBalances(from, { rpc });
  let data = '0x', value = 0n, destination = to, owned: OwnedNft | undefined;
  if (input.asset === 'eth' || input.asset === 'moss') {
    if (typeof input.amount !== 'string' || !/^(?:0|[1-9]\d{0,59})(?:\.\d{1,18})?$/.test(input.amount)) throw Error('Enter a positive amount with at most 18 decimals.');
    const amount = parseUnits(input.amount, 18);
    if (amount <= 0n || amount >= 2n ** 256n) throw Error('Enter a positive transfer amount.');
    if (input.asset === 'eth') value = amount;
    else {
      if (BigInt(balances.mossWei) < amount) throw Error('This wallet does not have enough MOSS.');
      destination = MOSS_TOKEN.address; data = token.encodeFunctionData('transfer', [to, amount]);
    }
  } else if (input.asset === 'nft') {
    owned = await ownedNft(from, input.contract, input.tokenId, config, rpc);
    destination = owned.contract; data = nft.encodeFunctionData('safeTransferFrom', [from, to, owned.tokenId]);
  } else throw Error('Choose ETH, MOSS or a Mossvale NFT.');
  const transaction: TurnkeyTransaction = { from, to: destination, data, value: value.toString(), chainId: 4663 };
  const [block, tip, nextNonce] = await Promise.all([rpc('eth_getBlockByNumber', ['latest', false]), rpc('eth_maxPriorityFeePerGas'), rpc('eth_getTransactionCount', [from, 'pending'])]);
  const priority = quantity(tip), maxFee = quantity(block?.baseFeePerGas) * 2n + priority, nonce = quantity(nextNonce);
  if (maxFee <= 0n || maxFee > maxGasPrice || nonce >= 2n ** 64n) throw Error('Network fees or wallet nonce are outside the transfer limits.');
  const fee = { maxFeePerGas: toQuantity(maxFee), maxPriorityFeePerGas: toQuantity(priority) };
  if (BigInt(balances.ethWei) < value) throw Error('This wallet does not have enough ETH for the transfer.');
  if (BigInt(balances.ethWei) === value) throw Error(transferFeeMessage);
  let estimated: bigint;
  try { estimated = quantity(await rpc('eth_estimateGas', [{ from, to: destination, data, value: toQuantity(value), ...fee }, 'latest'])); }
  catch (error) {
    if (error instanceof Error && /^insufficient funds for (?:transfer|gas \* price \+ value)(?::|$)/i.test(error.message)) throw Error(transferFeeMessage);
    throw error;
  }
  const gasLimit = (estimated * 120n + 99n) / 100n, maxFeeWei = gasLimit * maxFee;
  if (!estimated || gasLimit > maxGas) throw Error('This transfer exceeds the gas limit.');
  if (BigInt(balances.ethWei) < value + maxFeeWei) throw Error(transferFeeMessage);
  return { input: { ...input, from, to }, transaction, fees: { funded: false, chainId: 4663, nonce: toQuantity(nonce), gasLimit: toQuantity(gasLimit), ...fee }, maxFeeWei: maxFeeWei.toString(), ...(owned ? { nft: owned } : {}) };
}

/** Recheck after review, then keep the exact reviewed envelope instead of silently increasing a fee. */
export async function revalidateTransfer(prepared: PreparedTransfer, config: CollectionContracts = {}, dependencies: Dependencies = {}): Promise<PaidTransferFees> {
  const latest = await prepareTransfer(prepared.input, config, dependencies), reviewed = prepared.fees;
  if (JSON.stringify(latest.transaction) !== JSON.stringify(prepared.transaction) || reviewed.funded !== false || reviewed.chainId !== 4663
    || latest.fees.nonce !== reviewed.nonce || quantity(latest.fees.gasLimit) > quantity(reviewed.gasLimit)
    || quantity(latest.fees.maxFeePerGas) > quantity(reviewed.maxFeePerGas) || quantity(latest.fees.maxPriorityFeePerGas) > quantity(reviewed.maxPriorityFeePerGas))
    throw Error('The transfer or network fee changed. Review it again before sending.');
  const maximum = quantity(reviewed.gasLimit) * quantity(reviewed.maxFeePerGas);
  if (quantity(reviewed.gasLimit) > maxGas || quantity(reviewed.maxFeePerGas) > maxGasPrice || maximum.toString() !== prepared.maxFeeWei
    || BigInt((await readBalances(prepared.transaction.from, dependencies)).ethWei) < BigInt(prepared.transaction.value!) + maximum)
    throw Error('The wallet balance or reviewed fee changed. Review the transfer again.');
  return { ...reviewed };
}
