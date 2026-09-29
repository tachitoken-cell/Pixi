import type { WalletProvider } from './wallet-provider.ts';

const network = {
  chainId: '0x1237', chainName: 'Robinhood Chain',
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};
export const walletErrorCode = (error: unknown) => {
  const value = error as { code?: number | string; error?: { code?: number | string }; info?: { error?: { code?: number | string } } } | null;
  const codes = [value?.code, value?.error?.code, value?.info?.error?.code].map(code => typeof code === 'string' && /^-?\d+$/.test(code) ? Number(code) : code);
  return codes.find(code => code === 4001 || code === 'ACTION_REJECTED') ?? codes.find(code => code === 4902) ?? codes[0];
};

/** Both browser and native wallet handoffs collect the same saved Robinhood payout. */
export async function switchRobinhoodNetwork(provider: WalletProvider, guard: () => void) {
  async function request(method: string, params: unknown[], allowMissing = false) {
    guard();
    try { return await provider.request({ method, params }); }
    catch (error) {
      const reason = walletErrorCode(error);
      if (reason === 4001 || reason === 'ACTION_REJECTED' || allowMissing && reason === 4902) throw error;
      throw Error('Your wallet could not switch to Robinhood Chain. Update your wallet and enable Robinhood Chain in its network settings, or choose another wallet with the same payout address. Your payout stays saved.');
    }
  }
  try { await request('wallet_switchEthereumChain', [{ chainId: network.chainId }], true); }
  catch (error) {
    if (walletErrorCode(error) !== 4902) throw error;
    await request('wallet_addEthereumChain', [network]);
    await request('wallet_switchEthereumChain', [{ chainId: network.chainId }]);
  }
}
