# Mossvale on PONS

This launches a standard PONS v2 token on Robinhood Chain mainnet, chain ID **4663**, paired with **Roblox (RBLX)**. The developer buy spends **0.01 ETH** converting to RBLX. The PONS creation fee (currently **0.0005 ETH**) and transaction gas are additional.

PONS deploys its own fixed-supply ERC-20 through its factory. [`IPonsLaunch.sol`](IPonsLaunch.sol) defines the exact verified Solidity interfaces used by the deployment script. Token creation and the initial buy use PONS's existing `launchAndBuy` contract, preserving the signing wallet as both creator and fee recipient. There is no staking, proxy, extra token contract, or game auction change.

## Launch settings

The settings in [`mossvale-pons.json`](mossvale-pons.json) are **Mossvale / Moss**, [X](https://x.com/MossvaleMMO), [website](https://mossvale.world/), config 0 (currently one billion tokens), zero additional creator tax, and buybacks disabled. The logo and other social links are blank. Standard PONS trading fees still apply.

| Contract | Robinhood mainnet address |
|---|---|
| PONS factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| PONS launch and buy | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` |
| Roblox | `0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8` |
| Uniswap SwapRouter02 | `0xCaf681a66D020601342297493863E78C959E5cb2` |

## Preview and check

Use the project's installed dependencies (`npm ci` in a fresh checkout). All these commands are read-only on the network:

```sh
npm run pons:preview -- --wallet 0xYOUR_PUBLIC_WALLET
npm run check:pons
node scripts/check-pons-rblx-swap.mjs
npm run pons:simulate
```

Preview also works without `--wallet`; it then uses an unfunded address solely for quoting and cannot check your balance. The simulation forks live state into the local EVM and funds a simulated wallet. It executes the actual deployed swap, approval and launch bytecode, including a reverted buy. It does not send network transactions or need a private key. Reported simulation gas excludes L2 data fees.

## Deploy

```sh
npm run pons:deploy
```

Enter the funding wallet's private key in the **hidden local terminal prompt**. Keep it out of chat, shell arguments, source code and logs. Alternatively, use `npm run pons:deploy -- --key-file /absolute/local/key-file` with a private file whose permissions are `600`. `--wallet 0xPUBLIC_ADDRESS` additionally checks that the key belongs to the intended wallet. The script validates the network and reserves enough ETH for a conservative gas ceiling before the first spend.

The script submits three transactions:

1. Swap exactly 0.01 ETH into RBLX through the live WETH/RBLX 0.3% Uniswap v3 pool. The transaction has a five-minute deadline and a 1% minimum-output bound.
2. Approve exactly the RBLX credited in that swap's transaction receipt to PONS. Existing RBLX in the wallet is not included.
3. Create the token and buy into its curve atomically. Both the tokens and future creator fees belong to the signing wallet. The buy has a nonzero 1% output bound, and PONS economics and launch fee must still match the prepared terms.

The ETH-to-RBLX swap is a separate transaction. If token creation cannot proceed afterwards, the purchased RBLX remains in the wallet. The launch and developer token buy succeed or revert together. Successful completion prints the token, curve, wallet, buy receipt and transaction hash after checking on-chain state and events.

## Resume and receipts

Progress is stored in the ignored `.data/pons-launch.json`. It contains public launch settings, transaction hashes and signed transaction bytes; never the private key. Keep it until the launch is verified. A signed transaction is saved **before** submission. Re-running the same command resumes the same launch and only resubmits identical signed bytes when needed.

```sh
node scripts/deploy-pons.mjs --status
npm run pons:deploy
```

Do not delete the journal to retry an uncertain transaction: that could buy again or create another token. A reverted signed transaction, changed economics, consumed nonce or changed config stops the script for inspection. A crash before signing the swap can safely refresh its quote. An expired already-signed swap requires inspecting the journal before replacement. If a process was killed, a `.lock` file may remain; check that no deployment process is running before removing that lock, preserving the journal.

Both fresh and resumed receipts require two confirmations and a canonical block check before the next spending step. Final verification reads the receipt block and confirms token name, symbol, fixed supply, PONS registry, wallet attribution, fee recipient, RBLX pairing, zero additional tax, and the actual developer token receipt.

`PONS_RPC_URL` or `--rpc` selects another Robinhood mainnet RPC. Factory/router code hashes and their current binding are checked; if PONS changes deployments, inspect and update the verified addresses before proceeding.

Sources: [PONS v2 launch and fee documentation](https://docs.ponsfamily.com/v2), [verified PONS factory source](https://sourcify.dev/server/v2/contract/4663/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?fields=sources,abi), [Uniswap deployment registry](https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts), [SwapRouter02 interface](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol).
