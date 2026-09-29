import { getAddress, isHexString } from 'ethers';
import type { AuctionPurchaseReview, WalletProvider } from './wallet-provider.ts';
import type { SponsoredWalletRpc, TurnkeyTransaction, TurnkeyWalletSession } from './turnkey-wallet.ts';

export const TURNKEY_CHAIN_ID = '0x1237';
const readMethods = new Set(['eth_chainId', 'eth_call', 'eth_estimateGas', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount',
  'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_blockNumber', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory']);
export const walletCancelled = () => Object.assign(Error('Wallet request cancelled.'), { code: 4001 });

export async function turnkeyRpc(method: string, params: unknown[] = []) {
  if (!readMethods.has(method)) throw Error('Unsupported wallet read request.');
  const response = await fetch('https://rpc.mainnet.chain.robinhood.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Robinhood Chain is unavailable. Please try again.');
  const result = await response.json();
  if (result.error) throw Object.assign(Error(result.error.message || 'Wallet network request failed.'), { code: result.error.code, data: result.error.data });
  if (result.id !== 1 || !Object.hasOwn(result, 'result')) throw Error('Invalid wallet network response.');
  return result.result;
}

/** Keep the selected account pinned; the game still validates every quote and receipt. */
export function createTurnkeyProvider(session: TurnkeyWalletSession, address: string, options: {
  approve: (request: { message: string } | { transaction: TurnkeyTransaction; auctionPurchase?: AuctionPurchaseReview }) => Promise<void>;
  walletRpc: SponsoredWalletRpc;
  rpc?: typeof turnkeyRpc;
}): WalletProvider {
  const selected = getAddress(address), rpc = options.rpc ?? turnkeyRpc;
  let busy = false;
  async function connected() {
    if (!(await session.accounts()).some(account => getAddress(account.address) === selected)) throw Error('Your wallet session changed. Connect your wallet again.');
  }
  return {
    mossvaleWallet: true,
    async request({ method, params = [], auctionPurchase }) {
      const purchase = method === 'eth_sendTransaction' && auctionPurchase !== undefined ? structuredClone(auctionPurchase) : undefined;
      const input = method === 'eth_sendTransaction' ? structuredClone(params[0]) : undefined;
      if (method === 'eth_chainId') return TURNKEY_CHAIN_ID;
      if (method === 'net_version') return '4663';
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') { await connected(); return [selected]; }
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        if (BigInt((params[0] as { chainId?: string })?.chainId ?? 0) !== 4663n) throw Object.assign(Error('Mossvale Wallet supports Robinhood Chain only.'), { code: 4902 });
        return null;
      }
      if (readMethods.has(method)) return rpc(method, params);
      if (!['personal_sign', 'eth_sendTransaction'].includes(method)) throw Object.assign(Error('This wallet request is not supported.'), { code: 4200 });
      if (busy) throw Object.assign(Error('Finish the open wallet request first.'), method === 'eth_sendTransaction' ? { transactionNotSubmitted: true } : {});
      busy = true;
      let handedOff = false;
      try {
        await connected();
        if (method === 'personal_sign') {
          const [message, account] = params;
          if (params.length !== 2 || typeof message !== 'string' || !isHexString(message) || message.length > 16386 || getAddress(String(account)) !== selected) throw Error('Invalid wallet ownership message.');
          await options.approve({ message }); await connected();
          return session.signMessage(message, selected);
        }
        const value = input as Record<string, unknown>;
        if (params.length !== 1 || !value || typeof value !== 'object' || Array.isArray(value)
          || Object.keys(value).some(key => !['from', 'to', 'data', 'value', 'chainId', 'gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce', 'type', 'approval'].includes(key))
          || getAddress(String(value.from)) !== selected || BigInt(String(value.chainId ?? 4663)) !== 4663n) throw Error('The wallet account or network changed. Review the transaction again.');
        const transaction: TurnkeyTransaction = { from: selected, to: getAddress(String(value.to)), data: String(value.data ?? '0x'), value: BigInt(String(value.value ?? 0)).toString(), chainId: 4663 };
        if (!isHexString(transaction.data) || transaction.data!.length > 65538 || BigInt(transaction.value!) < 0n || BigInt(transaction.value!) >= 2n ** 256n) throw Error('Invalid wallet transaction.');
        if (value.approval !== undefined) {
          const approval = value.approval as Record<string, unknown>;
          if (!purchase || !approval || typeof approval !== 'object' || Array.isArray(approval) || Object.keys(approval).length !== 3
            || Object.keys(approval).some(key => !['to', 'data', 'value'].includes(key)) || typeof approval.data !== 'string'
            || !isHexString(approval.data, true) || approval.data.length > 65538 || BigInt(String(approval.value)) !== 0n || transaction.value !== '0') throw Error('Invalid auction purchase approval.');
          transaction.approval = { to: getAddress(String(approval.to)), data: approval.data, value: '0' };
        }
        // Only the authenticated game broker may sponsor the exact reviewed call.
        await options.approve({ transaction, ...(purchase !== undefined ? { auctionPurchase: purchase } : {}) }); await connected();
        handedOff = true;
        const hash = await session.sendTransaction(transaction, options.walletRpc);
        await session.acknowledgeTransaction(hash);
        return hash;
      } catch (error) {
        // Once the session can sign or recover a journal, only it knows whether submission occurred.
        if (method === 'eth_sendTransaction' && !handedOff) throw Object.assign(error instanceof Error ? error : Error('Wallet review failed before submission.'), { transactionNotSubmitted: true });
        throw error;
      } finally { busy = false; }
    },
  };
}
