import './login.css';
import './wallet-provider.css';
import './wallet-action.css';
import { mountWalletAction } from './wallet-action-ui';

const fragment = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);
const ui = mountWalletAction(document.querySelector<HTMLElement>('#wallet-content')!, {
  id: fragment.get('id') || '', token: fragment.get('token') || '', origin: location.origin,
  request: (...args) => fetch(...args),
});
window.addEventListener('pagehide', () => ui.dispose());
window.addEventListener('hashchange', () => ui.dispose());
