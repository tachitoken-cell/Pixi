import { formatUnits, parseUnits } from 'ethers';
import { auctionEthPrice, MOSS_TOKEN } from './auction.ts';
import type { AuctionCryptoStatus } from './auction.ts';

export const ARENA_MAX_PENDING_WAGERS = 8;
export interface ArenaWagerOrder {
  matchId: string; playerA: string; playerB: string; stakeWei: string;
  fundingDeadline: number; refundAfter: number; termsHash: string; signature: string;
  chainId: number; contract: string; token: string; to: string; data: string;
  approval: { to: string; data: string };
}
export interface ArenaWagerResult {
  winner: string; signature: string; to: string; data: string; chainId: number; contract: string; matchId: string;
}
export interface ArenaWager {
  order: ArenaWagerOrder; opponentId: string; opponentName: string; result?: ArenaWagerResult;
}
export interface ArenaWagerView extends ArenaWager { funded: number | null; closed: boolean | null }
export interface ArenaWagersState {
  status: AuctionCryptoStatus & { authority?: string }; wallet: string | null; wagers: ArenaWagerView[]; reason?: string; open?: boolean;
}
export function arenaWagerAmount(value: unknown): bigint | null {
  if (value === '' || value === '0') return 0n;
  return auctionEthPrice(value) ? parseUnits(value, 18) : null;
}
export function arenaWagerSummary(stake: bigint) {
  const pot = stake * 2n, tax = pot / 20n, share = tax / 10n;
  return Object.fromEntries(Object.entries({ stake, pot, tax, payout: pot - tax, burn: tax - share * 2n, treasury: share, devTeam: share })
    .map(([key, amount]) => [key, formatUnits(amount, 18)])) as Record<'stake' | 'pot' | 'tax' | 'payout' | 'burn' | 'treasury' | 'devTeam', string>;
}

const hex = (value: unknown, bytes?: number): value is string => typeof value === 'string'
  && (bytes ? new RegExp(`^0x[\\da-f]{${bytes * 2}}$`, 'i').test(value) : /^0x(?:[\da-f]{2})+$/i.test(value));
const address = (value: unknown): value is string => hex(value, 20) && !/^0x0{40}$/i.test(value);
export function arenaWagersValid(value: unknown): value is ArenaWager[] {
  if (!Array.isArray(value) || value.length > ARENA_MAX_PENDING_WAGERS) return false;
  return value.every((entry: ArenaWager) => {
    const order = entry?.order, result = entry?.result;
    return order && hex(order.matchId, 32) && !/^0x0{64}$/i.test(order.matchId) && address(order.playerA) && address(order.playerB)
      && order.playerA.toLowerCase() !== order.playerB.toLowerCase() && typeof order.stakeWei === 'string' && /^[1-9]\d{0,23}$/.test(order.stakeWei)
      && Number.isSafeInteger(order.fundingDeadline) && order.fundingDeadline > 0 && Number.isSafeInteger(order.refundAfter) && order.refundAfter > order.fundingDeadline
      && hex(order.termsHash, 32) && hex(order.signature, 65) && order.chainId === MOSS_TOKEN.chainId && address(order.contract)
      && order.token === MOSS_TOKEN.address && order.to === order.contract && hex(order.data) && order.data.length < 4096
      && order.approval?.to === MOSS_TOKEN.address && hex(order.approval.data) && order.approval.data.length < 4096
      && typeof entry.opponentId === 'string' && /^[\da-f-]{36}$/i.test(entry.opponentId) && typeof entry.opponentName === 'string' && entry.opponentName.length <= 20
      && (!result || (hex(result.winner, 20) && [order.playerA, order.playerB, '0x0000000000000000000000000000000000000000'].some(wallet => wallet.toLowerCase() === result.winner.toLowerCase())
        && hex(result.signature, 65) && result.to === order.contract && result.contract === order.contract && result.chainId === order.chainId
        && result.matchId === order.matchId && hex(result.data) && result.data.length < 4096));
  }) && new Set(value.map(entry => entry.order.matchId)).size === value.length;
}

export const ARENA_MATCH_TYPES = { Match: [{name:'matchId',type:'bytes32'},{name:'playerA',type:'address'},{name:'playerB',type:'address'},{name:'stakeWei',type:'uint256'},{name:'fundingDeadline',type:'uint64'},{name:'refundAfter',type:'uint64'}] };
export const ARENA_RESULT_TYPES = { Result: [{name:'matchId',type:'bytes32'},{name:'termsHash',type:'bytes32'},{name:'winner',type:'address'}] };
