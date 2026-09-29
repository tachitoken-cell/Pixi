import { AccountPageError, createAccountSession, type AccountDeletionStatus } from './account-auth.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const deleteStep = 'mossvale-account-delete-step';
let account: Awaited<ReturnType<typeof createAccountSession>> | undefined;
let busy = false, status: AccountDeletionStatus['status'] | 'unknown' = 'unknown', deletionReady = false, deletionAvailable = false;
let authPending = false, actionRevision = 0;

function message(text: string, error = false) {
  $('account-message').textContent = text;
  $('account-message').classList.toggle('is-error', error);
}
function date(value?: number) { return value ? new Date(value).toLocaleString() : ''; }
function render() {
  const signedIn = !!account?.signedIn(), terminal = status === 'pending' || status === 'complete';
  $('account-loading').hidden = !!account;
  $('account-signed-out').hidden = !account || signedIn;
  $('account-details').hidden = !signedIn || status === 'complete';
  for (const provider of ['google', 'apple'] as const) {
    button(`account-${provider}`).hidden = !account?.socialProviders[provider] || signedIn;
    button(`account-${provider}`).disabled = busy;
  }
  $('account-social').hidden = !account || signedIn || (!account.socialProviders.google && !account.socialProviders.apple);
  $('account-social-update').hidden = !account?.socialSignInRequiresUpdate || signedIn;
  button('delete-sign-in').hidden = !account || signedIn;
  button('delete-begin').hidden = !signedIn || terminal || deletionReady;
  button('deletion-check').hidden = !signedIn;
  $('deletion-form').hidden = !signedIn || terminal || !deletionReady;
  for (const id of ['account-sign-in', 'account-register', 'account-sign-out', 'account-manage', 'account-password', 'delete-sign-in', 'delete-begin', 'deletion-check', 'delete-cancel']) button(id).disabled = busy;
  button('delete-begin').disabled = busy || status !== 'none' || !deletionAvailable;
  button('delete-confirm').disabled = busy || status !== 'none' || !deletionAvailable || $<HTMLInputElement>('delete-phrase').value !== 'DELETE ACCOUNT';
  if (signedIn) {
    const profile = account!.profile();
    $('account-name').textContent = profile.name;
    $('account-email').textContent = profile.email ? `${profile.email}${profile.emailVerified ? ' · verified' : ' · not verified'}` : 'No email was shared by your sign-in provider.';
    $('account-session').textContent = profile.expiresAt ? `Signed in. Session valid until ${date(profile.expiresAt)} and renewed as you use account services.` : 'Signed in to the Mossvale account service.';
  }
}
async function action(work: () => void | Promise<void>, authenticating = false) {
  if (busy) return;
  const revision = ++actionRevision;
  busy = true; authPending = authenticating; render();
  try { await work(); }
  catch (cause) {
    if (revision !== actionRevision) return;
    const known = cause instanceof AccountPageError;
    if (known && ['FRESH_AUTH_REQUIRED', 'SESSION_EXPIRED'].includes(cause.code)) deletionReady = false;
    message(known ? cause.message : 'This action could not finish. Try again or contact support.', true);
  } finally { if (revision === actionRevision) { busy = false; authPending = false; render(); } }
}
async function checkDeletion() {
  const next = await account!.deletionStatus();
  status = next.status; deletionAvailable = next.available;
  $('deletion-status').textContent = next.status === 'complete' ? `Your Mossvale account has been deleted.${next.completedAt ? ` Completed ${date(next.completedAt)}.` : ''}`
    : next.status === 'pending' ? `Your deletion request has been received${next.requestedAt ? ` (${date(next.requestedAt)})` : ''}. Access is being closed and account data is being removed. If sign-in stops working before you can check completion, contact support.`
      : !next.available ? 'Account deletion is temporarily unavailable. Try Check deletion status again later, or contact support.' : 'No account deletion request is pending.';
  if (next.status !== 'none') { deletionReady = false; $<HTMLInputElement>('delete-phrase').value = ''; }
}
function signIn() { return action(async () => { await account!.signIn(); }, true); }
button('account-sign-in').onclick = signIn;
button('delete-sign-in').onclick = signIn;
button('account-register').onclick = () => action(async () => { await account!.createAccount(); }, true);
for (const provider of ['google', 'apple'] as const) button(`account-${provider}`).onclick = () => action(() => account!.signInWithSocial(provider), true);
button('account-manage').onclick = () => action(() => account!.manageAccount());
button('account-password').onclick = () => action(async () => { await account!.changePassword(); }, true);
button('account-sign-out').onclick = () => action(async () => { await account!.signOut(); deletionReady = false; message('You have signed out.'); });
button('account-retry').onclick = () => location.reload();
button('deletion-check').onclick = () => action(async () => { await checkDeletion(); message('Deletion status updated.'); });
button('delete-begin').onclick = () => action(async () => {
  if (status !== 'none' || !deletionAvailable) return;
  try { sessionStorage.setItem(deleteStep, 'confirm'); } catch { throw new AccountPageError('STORAGE_UNAVAILABLE', 'Enable session storage to complete the secure deletion confirmation.'); }
  try { await account!.reauthenticate(); }
  catch (cause) { sessionStorage.removeItem(deleteStep); throw cause; }
}, true);
button('delete-cancel').onclick = () => { if (busy) return; deletionReady = false; $<HTMLInputElement>('delete-phrase').value = ''; render(); button('delete-begin').focus(); };
window.addEventListener('mossvale:auth-result', event => {
  const result = (event as CustomEvent).detail?.status;
  if ((globalThis as typeof globalThis & { __MOSSVALE_NATIVE_AUTH__?: boolean }).__MOSSVALE_NATIVE_AUTH__ !== true || !authPending || !['cancelled', 'error'].includes(result)) return;
  actionRevision++; authPending = false; busy = false; deletionReady = false;
  try { sessionStorage.removeItem(deleteStep); } catch { /* No authority is stored in this marker. */ }
  message(result === 'cancelled' ? 'Sign-in was cancelled. Choose a sign-in method to try again.' : 'Sign-in could not finish. Please try again.', result === 'error');
  render();
});
$<HTMLInputElement>('delete-phrase').oninput = () => render();
$<HTMLFormElement>('deletion-form').onsubmit = event => {
  event.preventDefault();
  if (!deletionReady || status !== 'none' || !deletionAvailable || $<HTMLInputElement>('delete-phrase').value !== 'DELETE ACCOUNT') return;
  void action(async () => {
    try {
      const result = await account!.requestDeletion($<HTMLInputElement>('delete-phrase').value);
      status = result.status; deletionReady = false; $<HTMLInputElement>('delete-phrase').value = '';
      $('deletion-status').textContent = result.status === 'complete' ? 'Your Mossvale account has been deleted.' : 'Your deletion request has been received. Access is being closed and account data is being removed. Use Check deletion status, or contact support if sign-in becomes unavailable.';
      message('Deletion request received.');
      $('deletion-status').focus();
    } catch (cause) {
      // A lost response does not prove that deletion was rejected. Lock confirmation
      // until the server status has been read again; never automatically re-submit.
      if (cause instanceof AccountPageError && cause.code === 'STATUS_UNKNOWN') { status = 'unknown'; deletionReady = false; }
      throw cause;
    }
  });
};

async function start() {
  try {
    account = await createAccountSession();
    $('account-loading').hidden = true;
    message(account.signedIn() ? 'Your account is ready.' : 'Sign in to manage your Mossvale account.');
    if (account.signedIn()) {
      await checkDeletion();
      let returnToDeletion = false;
      try { returnToDeletion = sessionStorage.getItem(deleteStep) === 'confirm'; sessionStorage.removeItem(deleteStep); } catch { /* Keep normal account controls usable. */ }
      if (returnToDeletion && status === 'none' && deletionAvailable) {
        deletionReady = account.recentAuthentication();
        if (!deletionReady) message('Verify your sign-in again to continue with deletion.', true);
      }
    }
  } catch (cause) {
    message(cause instanceof AccountPageError ? cause.message : 'Account services could not load. Try again or contact support.', true);
    $('account-loading').textContent = 'Account services are unavailable.';
    button('account-retry').hidden = false;
  }
  render();
  if (deletionReady) $<HTMLInputElement>('delete-phrase').focus();
}
void start();
