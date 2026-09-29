import { readFileSync, writeFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

export function compileTreasuryContract() {
  const name = 'MossvaleTreasureTreasury';
  const source = readFileSync(new URL(`../contracts/${name}.sol`, import.meta.url), 'utf8');
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { [`${name}.sol`]: { content: source } }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  } }), { import: path => {
    if (!path.startsWith('@openzeppelin/contracts/') || path.includes('..')) return { error: 'Unsupported Solidity import' };
    return { contents: readFileSync(new URL(`../node_modules/${path}`, import.meta.url), 'utf8') };
  } }));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const contract = result.contracts[`${name}.sol`][name], deployedBytecode = `0x${contract.evm.deployedBytecode.object}`;
  return { contractName: name, compiler: solc.version(), openzeppelin: '5.6.1', abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`, deployedBytecode, runtimeCodeHash: keccak256(deployedBytecode) };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  writeFileSync(new URL('../public/contracts/MossvaleTreasureTreasury.json', import.meta.url), `${JSON.stringify(compileTreasuryContract(), null, 2)}\n`);
  console.log('Built MOSS treasure treasury; no transaction sent.');
}
