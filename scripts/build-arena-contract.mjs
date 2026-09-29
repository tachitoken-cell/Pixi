import { readFileSync, writeFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

export function compileArenaContract() {
  const contractName = 'MossvaleArena', file = `${contractName}.sol`;
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: {
    [file]: { content: readFileSync(new URL(`../contracts/${file}`, import.meta.url), 'utf8') },
  }, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } })));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const compiled = result.contracts[file][contractName], deployedBytecode = `0x${compiled.evm.deployedBytecode.object}`;
  return { contractName, compiler: solc.version(), abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode, runtimeCodeHash: keccak256(deployedBytecode) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  writeFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url), `${JSON.stringify(compileArenaContract(), null, 2)}\n`);
  console.log('Built MOSS arena escrow; no transaction sent.');
}
