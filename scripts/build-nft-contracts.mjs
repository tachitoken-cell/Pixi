import { readFileSync, writeFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

export function compileNftContracts(extraSources = {}) {
  const names = ['MossvaleNFT', 'MossvaleBuyBurn', 'MossvalePets', 'MossvaleMounts', 'MossvaleSpecialists'];
  const sources = Object.fromEntries(names.map(name => [`${name}.sol`, { content: readFileSync(new URL(`../contracts/${name}.sol`, import.meta.url), 'utf8') }]));
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { ...sources, ...extraSources }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  } }), { import: path => {
    if (!path.startsWith('@openzeppelin/contracts/') || path.includes('..')) return { error: 'Unsupported Solidity import' };
    return { contents: readFileSync(new URL(`../node_modules/${path}`, import.meta.url), 'utf8') };
  } }));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const artifacts = {};
  for (const [file, contracts] of Object.entries(result.contracts)) {
    if (file.startsWith('@openzeppelin/')) continue;
    for (const [name, contract] of Object.entries(contracts)) {
      if (!contract.evm.bytecode.object) continue;
      const deployedBytecode = `0x${contract.evm.deployedBytecode.object}`;
      artifacts[name] = { contractName: name, compiler: solc.version(), openzeppelin: '5.6.1', abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`, deployedBytecode, runtimeCodeHash: keccak256(deployedBytecode) };
    }
  }
  return artifacts;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const [name, artifact] of Object.entries(compileNftContracts()))
    writeFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log('Built NFT collections and MOSS buy/burn receiver; no transaction sent.');
}
