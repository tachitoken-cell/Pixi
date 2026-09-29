export const SPONSORED_CHAIN_ID: 4663;
export const SPONSORED_DELEGATE: string;
export const SPONSORED_ENTRY_POINT: string;
export const SPONSORED_NATIVE_TOKEN: string;
export type SponsoredInfo = { fingerprint: string; userOpHash: string; entryPoint: string; paymaster: string; sender: string; costWei: bigint; parts: unknown[]; callId: string };
export function signedIdentity(value: unknown): string;
export function validateSponsoredPrepared(prepared: unknown, transaction: { from: string; to: string; value?: string; data?: string; chainId?: string | number; approval?: { to: string; data: string; value: string } }, limits?: { maxOperationWei?: bigint | string; maxFeePerGasWei?: bigint | string }): SponsoredInfo;
export function validateSponsoredSigned(signed: unknown, info: SponsoredInfo, transaction: { from: string }): SponsoredInfo;
