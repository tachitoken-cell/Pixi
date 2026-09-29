import { createSmartWalletClient, type AlchemyWalletTransport } from '@alchemy/wallet-apis';
import { createAccount } from '@turnkey/viem';
import type { TurnkeyClient } from '@turnkey/core';
import { custom, defineChain } from 'viem';
import { Interface, isHexString } from 'ethers';
import { validateSponsoredPrepared, validateSponsoredSigned, type SponsoredInfo } from './turnkey-sponsored-validation.mjs';
import type { TurnkeyTransaction } from './turnkey-wallet.ts';

export type SponsoredWalletRpc = (request: { method: string; params: unknown[] }) => Promise<unknown>;
export type SponsoredRecord = { prepared: unknown; signed: unknown };
const methods = new Set(['wallet_prepareCalls', 'wallet_sendPreparedCalls', 'wallet_getCallsStatus']);
const entryPointEvents = new Interface(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const chain = defineChain({ id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [] } } });
export const sponsoredJson = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? `0x${item.toString(16)}` : item));

function submissionError(error: unknown, info: SponsoredInfo): never {
  // viem wraps RPC errors. Only the private broker's exact finalized, unused expiry proof
  // may release a signed local journal; provider timeouts and stale quotes stay pending.
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const candidate = current as { code?: unknown; data?: { reason?: unknown; id?: unknown; userOpHash?: unknown; sender?: unknown; fingerprint?: unknown }; cause?: unknown };
    const proof = candidate.data;
    if (candidate.code === 5731 && proof?.reason === 'expired-unused' && proof.id === info.callId
      && proof.userOpHash === info.userOpHash && proof.fingerprint === info.fingerprint
      && typeof proof.sender === 'string' && proof.sender.toLowerCase() === info.sender.toLowerCase()) {
      throw Object.assign(Error('This sponsorship expired unused. Review the action before trying again.'), { confirmedSponsoredFailure: true });
    }
    current = candidate.cause;
  }
  throw error;
}

/** The SDK handles wire encoding; only our authenticated game proxy can request sponsorship. */
export async function createSponsoredWallet(options: {
  httpClient: TurnkeyClient['httpClient']; organizationId: string; address: string;
  rpc: SponsoredWalletRpc; guard: () => Promise<void>;
}) {
  const { guard, rpc } = options;
  const account = await createAccount({ client: options.httpClient, organizationId: options.organizationId, signWith: options.address });
  const unavailable = async (): Promise<never> => { throw Error('This signing method is not available for sponsored game actions.'); };
  const signer = { ...account, sign: unavailable, signTypedData: unavailable, signTransaction: unavailable,
    signMessage: async (...args: Parameters<typeof account.signMessage>) => {
      await guard(); const result = await account.signMessage(...args); await guard(); return result;
    },
    signAuthorization: async (...args: Parameters<NonNullable<typeof account.signAuthorization>>) => {
      await guard(); const result = await account.signAuthorization!(...args); await guard(); return result;
    },
  };
  let beforeSubmit: ((signed: unknown) => void) | undefined;
  // Alchemy's actions use the standard viem request contract. A custom transport keeps game credentials out of the SDK.
  const transport = custom({ request: async ({ method, params }) => {
    if (!methods.has(method) || !Array.isArray(params)) throw Error('Unsupported sponsored wallet request.');
    await guard();
    if (method === 'wallet_sendPreparedCalls') {
      if (!beforeSubmit) throw Error('Review this sponsored operation before submitting it.');
      beforeSubmit(structuredClone(params[0]));
    }
    const result = await rpc({ method, params });
    await guard(); return result;
  } }, { retryCount: 0 });
  const wallet = createSmartWalletClient({ signer, chain, transport: transport as unknown as AlchemyWalletTransport });

  async function status(info: SponsoredInfo) {
    const result = await wallet.waitForCallsStatus({ id: info.callId as `0x${string}`, timeout: 60_000, pollingInterval: 1000, retryCount: 0 });
    await guard();
    const receipts = result.receipts ?? [];
    if (result.chainId === 4663 && result.id === info.callId && [500, 600].includes(result.statusCode) && receipts.length === 1
      && receipts[0].status === 'success' && isHexString(receipts[0].transactionHash, 32) && isHexString(receipts[0].blockHash, 32)) {
      const failures = receipts[0].logs.filter(log => {
        if (log.address.toLowerCase() !== info.entryPoint.toLowerCase()) return false;
        try {
          const event = entryPointEvents.parseLog({ data: log.data, topics: [...log.topics] });
          return event?.name === 'UserOperationEvent' && event.args.userOpHash === info.userOpHash
            && event.args.sender.toLowerCase() === info.sender.toLowerCase() && event.args.paymaster.toLowerCase() === info.paymaster.toLowerCase()
            && event.args.success === false;
        } catch { return false; }
      });
      // The broker has independently verified this receipt's canonical block and exact EntryPoint event.
      if (failures.length === 1) throw Object.assign(Error('The sponsored transaction reverted. Review the action before trying again.'), { confirmedSponsoredFailure: true });
    }
    if (result.chainId !== 4663 || result.id !== info.callId || result.statusCode !== 200 || result.status !== 'success'
      || receipts.length !== 1 || receipts[0].status !== 'success' || !isHexString(receipts[0].transactionHash, 32)) {
      throw Error('The sponsored operation did not complete successfully. Check wallet activity before trying again.');
    }
    return receipts[0].transactionHash;
  }
  return {
    async send(transaction: TurnkeyTransaction, record: (value: SponsoredRecord) => void) {
      await guard();
      const calls = [...(transaction.approval ? [transaction.approval] : []), transaction]
        .map(call => ({ to: call.to as `0x${string}`, data: (call.data ?? '0x') as `0x${string}`, value: BigInt(call.value ?? '0') }));
      const prepared = await wallet.prepareCalls({ calls });
      const info = validateSponsoredPrepared(prepared, transaction);
      await guard();
      const signed = await wallet.signPreparedCalls(prepared);
      validateSponsoredSigned(signed, info, transaction);
      await guard();
      beforeSubmit = value => { validateSponsoredSigned(value, info, transaction); record({ prepared: sponsoredJson(prepared), signed: value }); };
      try {
        const result = await wallet.sendPreparedCalls(signed);
        if (result.id !== info.callId) throw Error('The wallet returned a different sponsored operation. Check wallet activity.');
      } catch (error) {
        submissionError(error, info);
      } finally { beforeSubmit = undefined; }
      return status(info);
    },
    async resume(transaction: TurnkeyTransaction, record: SponsoredRecord) {
      const info = validateSponsoredPrepared(record.prepared, transaction);
      validateSponsoredSigned(record.signed, info, transaction);
      await guard();
      // This is the exact SDK-encoded request saved before dispatch; no re-prepare or re-sign on an uncertain response.
      let result: { id?: string };
      try {
        result = await rpc({ method: 'wallet_sendPreparedCalls', params: [structuredClone(record.signed)] }) as { id?: string };
      } catch (error) {
        submissionError(error, info);
      }
      await guard();
      if (result?.id !== info.callId) throw Error('The wallet returned a different sponsored operation. Check wallet activity.');
      return status(info);
    },
  };
}
