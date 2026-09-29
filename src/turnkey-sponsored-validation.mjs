import { Interface, ZeroAddress, getAddress, getBytes, hashAuthorization, hashMessage, isHexString, keccak256, recoverAddress, toBeHex, toUtf8Bytes, verifyMessage } from 'ethers';
import { getUserOperationHash } from 'viem/account-abstraction';

export const SPONSORED_CHAIN_ID = 4663;
export const SPONSORED_DELEGATE = '0x77021100bD87b7008E5E1989d0eB38555d0d0000';
export const SPONSORED_ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
export const SPONSORED_NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const account = new Interface(['function execute(address target,uint256 value,bytes data)', 'function executeBatch((address target,uint256 value,bytes data)[] calls)']);
const quantityFields = ['nonce', 'callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas', 'paymasterVerificationGasLimit', 'paymasterPostOpGasLimit'];
const dataFields = ['sender', 'callData', 'paymaster', 'paymasterData', ...quantityFields];
const fail = () => { throw Error('The sponsored operation does not match the reviewed wallet transaction.'); };
const address = value => { try { return getAddress(value); } catch { return fail(); } };
const same = (left, right) => address(left) === address(right);
const bytes = value => { if (typeof value !== 'string' || !isHexString(value, true) || value.length > 131074) fail(); return value.toLowerCase(); };
function number(value, maximum = 2n ** 256n) {
  if (!(typeof value === 'bigint' || typeof value === 'number' && Number.isSafeInteger(value)
    || typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value))) fail();
  const result = BigInt(value); if (result < 0n || result >= maximum) fail(); return result;
}
const quantity = value => `0x${number(value).toString(16)}`;
function partsOf(value) {
  const parts = value?.type === 'array' ? value.data : [value];
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 2
    || parts.filter(part => part?.type === 'user-operation-v070').length !== 1
    || parts.some(part => !['authorization', 'user-operation-v070'].includes(part?.type))) fail();
  return parts;
}
function identityParts(value) {
  return partsOf(value).map(part => {
    if (number(part.chainId) !== BigInt(SPONSORED_CHAIN_ID)) fail();
    const data = part.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail();
    if (part.type === 'authorization') {
      if (Object.keys(data).some(key => !['address', 'nonce'].includes(key)) || !same(data.address, SPONSORED_DELEGATE)) fail();
      return { type: part.type, data: { address: address(data.address), nonce: quantity(number(data.nonce, 2n ** 32n)) }, chainId: '0x1237' };
    }
    if (Object.keys(data).some(key => !dataFields.includes(key)) || dataFields.some(key => data[key] === undefined)) fail();
    const normalized = { sender: address(data.sender), callData: bytes(data.callData), paymaster: address(data.paymaster), paymasterData: bytes(data.paymasterData) };
    for (const key of quantityFields) normalized[key] = quantity(data[key]);
    return { type: part.type, data: normalized, chainId: '0x1237' };
  });
}
export function signedIdentity(value) {
  return keccak256(toUtf8Bytes(JSON.stringify(identityParts(value))));
}

/** Both the browser and broker verify the bytes being authorized, independently of display metadata. */
export function validateSponsoredPrepared(prepared, transaction, limits = {}) {
  const original = partsOf(prepared), parts = identityParts(prepared);
  const operation = parts.find(part => part.type === 'user-operation-v070'), data = operation.data;
  const source = original.find(part => part.type === 'user-operation-v070');
  if (!same(data.sender, transaction.from) || BigInt(transaction.value ?? 0) < 0n || BigInt(transaction.value ?? 0) >= 2n ** 256n || transaction.chainId !== undefined && BigInt(transaction.chainId) !== 4663n
    || data.paymaster === ZeroAddress || data.paymasterData === '0x' || source.feePayment?.sponsored !== true
    || !same(source.feePayment.tokenAddress, SPONSORED_NATIVE_TOKEN)) fail();
  let call;
  try { call = account.parseTransaction({ data: data.callData }); } catch { fail(); }
  if (!call || !['execute', 'executeBatch'].includes(call.name) || account.encodeFunctionData(call.name, call.args).toLowerCase() !== data.callData) fail();
  const calls = call.name === 'execute' ? [call.args] : call.args[0];
  const expected = [transaction];
  // Pinned SMA7702 v1.1.0 executeBatch bubbles any call revert, including the preceding approval:
  // https://github.com/alchemyplatform/modular-account/blob/7e2105743e286cf696ecb2b8a484d2e97c27e153/src/account/ModularAccountBase.sol#L244-L266
  if (transaction.approval !== undefined) {
    const approval = transaction.approval;
    if (!approval || typeof approval !== 'object' || Array.isArray(approval) || Object.keys(approval).some(key => !['to', 'data', 'value'].includes(key))
      || typeof approval.data !== 'string' || approval.value === undefined || BigInt(approval.value) !== 0n || BigInt(transaction.value ?? 0) !== 0n
      || call.name !== 'executeBatch') fail();
    expected.unshift(approval);
  }
  if (calls.length !== expected.length || calls.some((value, index) => !same(value[0], expected[index].to)
    || value[1] !== BigInt(expected[index].value ?? 0) || bytes(value[2]) !== bytes(expected[index].data ?? '0x'))) fail();
  const op = { ...data };
  for (const key of quantityFields) op[key] = number(data[key], key === 'nonce' ? 2n ** 256n : 2n ** 128n);
  if (op.callGasLimit === 0n || op.verificationGasLimit === 0n || op.preVerificationGas === 0n || op.maxFeePerGas === 0n || op.maxPriorityFeePerGas > op.maxFeePerGas) fail();
  const costWei = (op.callGasLimit + op.verificationGasLimit + op.preVerificationGas + op.paymasterVerificationGasLimit + op.paymasterPostOpGasLimit) * op.maxFeePerGas;
  // Alchemy reports the sponsor's native gas estimate here, not a debit from the player.
  // Require the observed quote format and reserve the maximum derived from signed gas fields.
  if (number(source.feePayment.maxAmount) !== costWei) fail();
  if (costWei >= 2n ** 256n || limits.maxOperationWei !== undefined && costWei > BigInt(limits.maxOperationWei)
    || limits.maxFeePerGasWei !== undefined && op.maxFeePerGas > BigInt(limits.maxFeePerGasWei)) fail();
  const userOpHash = getUserOperationHash({ chainId: SPONSORED_CHAIN_ID, entryPointAddress: SPONSORED_ENTRY_POINT, entryPointVersion: '0.7', userOperation: op });
  // The configured Modular Account path signs the EntryPoint hash with EIP-191. Never sign an arbitrary provider message.
  const request = source.signatureRequest;
  if (request?.type !== 'personal_sign' || request.data?.raw?.toLowerCase() !== userOpHash
    || request.rawPayload?.toLowerCase() !== hashMessage(getBytes(userOpHash))) fail();
  const authorization = parts.find(part => part.type === 'authorization');
  if (authorization) {
    const request = original.find(part => part.type === 'authorization').signatureRequest;
    if (request?.type !== 'eip7702Auth' || request.rawPayload?.toLowerCase() !== hashAuthorization({ ...authorization.data, chainId: 4663 })) fail();
  }
  return { fingerprint: signedIdentity(prepared), userOpHash, entryPoint: SPONSORED_ENTRY_POINT, paymaster: data.paymaster, sender: data.sender, costWei, parts,
    callId: `${toBeHex(4663, 32)}${userOpHash.slice(2)}` };
}

/** A submit/retry may carry only the exact prepared operation and signatures from its wallet. */
export function validateSponsoredSigned(signed, info, transaction) {
  if (signedIdentity(signed) !== info.fingerprint || !same(info.sender, transaction.from)) fail();
  if (signed.capabilities !== undefined && (!signed.capabilities || typeof signed.capabilities !== 'object' || Array.isArray(signed.capabilities) || Object.keys(signed.capabilities).length)) fail();
  for (const part of partsOf(signed)) {
    if (Object.keys(part).some(key => !['type', 'data', 'chainId', 'signature', 'capabilities'].includes(key))) fail();
    if (part.signature?.type !== 'secp256k1' || !isHexString(part.signature.data, 65)) fail();
    const signer = part.type === 'authorization'
      ? recoverAddress(hashAuthorization({ ...part.data, chainId: 4663 }), part.signature.data)
      : verifyMessage(getBytes(info.userOpHash), part.signature.data);
    if (!same(signer, info.sender)) fail();
  }
  return info;
}
