import { readFileSync, writeFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

export function compileStoreContract() {
  const source = readFileSync(new URL('../contracts/MossvaleStore.sol', import.meta.url), 'utf8');
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'MossvaleStore.sol': { content: source } }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  } })));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const contract = result.contracts['MossvaleStore.sol'].MossvaleStore, deployedBytecode = `0x${contract.evm.deployedBytecode.object}`;
  return { contractName: 'MossvaleStore', compiler: solc.version(), abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, deployedBytecode, runtimeCodeHash: keccak256(deployedBytecode) };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  writeFileSync(new URL('../public/contracts/MossvaleStore.json', import.meta.url), `${JSON.stringify(compileStoreContract(), null, 2)}\n`);
  console.log('Built MOSS store burn contract; no transaction sent.');
}
