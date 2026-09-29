import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

export function compileAuctionContract(contractName = 'MossvaleAuction') {
  if (!['MossvaleAuction', 'MossvaleTokenAuction'].includes(contractName)) throw Error('Unknown auction contract.');
  const file = `${contractName}.sol`;
  const source = readFileSync(new URL(`../contracts/${file}`, import.meta.url), 'utf8');
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { [file]: { content: source } }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  } })));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const contract = result.contracts[file][contractName];
  const deployedBytecode = `0x${contract.evm.deployedBytecode.object}`;
  return { contractName, compiler: solc.version(), abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode, runtimeCodeHash: keccak256(deployedBytecode) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const directory = new URL('../public/contracts/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  for (const contractName of ['MossvaleAuction', 'MossvaleTokenAuction'])
    writeFileSync(new URL(`${contractName}.json`, directory), `${JSON.stringify(compileAuctionContract(contractName), null, 2)}\n`);
  console.log('Built ETH and MOSS auction ABIs and deployment bytecode (no transaction sent).');
}
