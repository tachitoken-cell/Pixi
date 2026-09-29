import { getAddress, verifyMessage } from 'ethers';
import { treasureClaimValid, type TreasureClaim } from './treasure-rewards.ts';

export type NativeWalletOperation = { kind: 'connect' }
  | { kind: 'sign'; address: string; message: string; expiresAt: number }
  | { kind: 'claim'; claim: TreasureClaim };
export type NativeWalletResult = { address: string } | { signature: string } | { transactionHash: string }
  | { error: { code: 4000 | 4001 | -32000; message: string } };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** The native handoff can only connect, prove ownership, or collect a fixed voucher payout. */
export function validateNativeWalletOperation(value: unknown, origin: string, now = Date.now()): NativeWalletOperation {
  if (!record(value)) throw Error('Invalid wallet action.');
  if (value.kind === 'connect' && fields(value, ['kind'])) return value as NativeWalletOperation;
  if (value.kind === 'claim' && fields(value, ['kind', 'claim']) && treasureClaimValid(value.claim) && value.claim.status === 'pending') return value as NativeWalletOperation;
  if (value.kind === 'sign' && fields(value, ['kind', 'address', 'message', 'expiresAt'])
    && typeof value.address === 'string' && /^0x[\da-f]{40}$/i.test(value.address)
    && typeof value.message === 'string' && value.message.length <= 2048
    && typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + 300000) {
    const lines = value.message.split('\n');
    if (lines.length === 7 && lines[0] === 'Mossvale wallet' && lines[1] === `Origin: ${origin}`
      && /^Character: store:[^\x00-\x1f\x7f]{1,128}$/.test(lines[2]) && lines[3] === `Wallet: ${getAddress(value.address)}`
      && /^Nonce: [\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(lines[4]) && lines[5] === `Expires: ${new Date(value.expiresAt).toISOString()}`
      && lines[6] === 'This links your wallet for the ingame store and auction trading. It does not authorize a payment.') return value as NativeWalletOperation;
  }
  throw Error('Invalid or expired voucher wallet action. Return to Mossvale and try again.');
}

export function nativeWalletResultValid(operation: NativeWalletOperation, result: unknown): result is NativeWalletResult {
  try {
    if (!record(result)) return false;
    if (fields(result, ['error']) && record(result.error) && fields(result.error, ['code', 'message']))
      return [4000, 4001, -32000].includes(Number(result.error.code)) && typeof result.error.code === 'number' && typeof result.error.message === 'string' && result.error.message.length > 0 && result.error.message.length <= 240;
    if (operation.kind === 'connect') return fields(result, ['address']) && typeof result.address === 'string' && /^0x[\da-f]{40}$/i.test(result.address) && BigInt(getAddress(result.address)) !== 0n;
    if (operation.kind === 'sign') return fields(result, ['signature']) && typeof result.signature === 'string' && /^0x[\da-f]{130}$/i.test(result.signature)
      && verifyMessage(operation.message, result.signature) === getAddress(operation.address);
    return fields(result, ['transactionHash']) && typeof result.transactionHash === 'string' && /^0x[\da-f]{64}$/i.test(result.transactionHash) && BigInt(result.transactionHash) !== 0n;
  } catch { return false; }
}
