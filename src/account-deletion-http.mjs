export const freshDeletionIdentity = (identity, now = Date.now()) => identity.expiresAt > now && Number.isSafeInteger(identity.authTime)
  && identity.authTime <= now + 30000 && identity.authTime >= now - 5 * 60 * 1000;

export function accountDeletionHandler({ database, provider, verify, closing, requested }) {
  const busy = new Set();
  return async (req, res) => {
    const reply = (status, value) => { if (!res.destroyed) res.writeHead(status).end(JSON.stringify(value)); };
    let key;
    try {
      if (!database || closing()) { reply(503, { error: 'Account deletion is unavailable. Please try again later.', code: 'DELETION_UNAVAILABLE' }); return; }
      let identity;
      try { const value = req.headers.authorization; if (typeof value !== 'string' || !value.startsWith('Bearer ')) throw Error(); identity = await verify(value.slice(7)); }
      catch { reply(401, { error: 'Sign in to manage account deletion.', code: 'AUTH_REQUIRED' }); return; }
      const status = await database.deletionStatus(identity.recordKey);
      if (req.method === 'GET') { reply(200, { available: provider.enabled, ...status, freshAuthRequired: !freshDeletionIdentity(identity) }); return; }
      if (!freshDeletionIdentity(identity)) { reply(401, { error: 'Sign in again to confirm account deletion.', code: 'FRESH_AUTH_REQUIRED' }); return; }
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { reply(415, { error: 'Send a JSON deletion confirmation.', code: 'INVALID_CONFIRMATION' }); return; }
      if (busy.has(identity.recordKey) || busy.size >= 128) { reply(429, { error: 'A deletion request is already in progress. Try again shortly.', code: 'REQUEST_PENDING' }); return; }
      key = identity.recordKey; busy.add(key);
      req.setTimeout(10000, () => req.destroy());
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1024) { reply(413, { error: 'Deletion request is too large.', code: 'INVALID_CONFIRMATION' }); return; } chunks.push(chunk); }
      req.setTimeout(0);
      let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { input = null; }
      if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || input.confirmation !== 'DELETE ACCOUNT') { reply(400, { error: 'Type DELETE ACCOUNT exactly to confirm.', code: 'INVALID_CONFIRMATION' }); return; }
      if (status.status !== 'none') { reply(status.status === 'complete' ? 200 : 202, status); return; }
      if (!provider.enabled) { reply(503, { error: 'Account deletion is not configured yet. Please try again later.', code: 'DELETION_UNAVAILABLE' }); return; }
      const result = await database.requestDeletion(key, identity.subject, () => !closing() && freshDeletionIdentity(identity));
      requested(key); reply(result.status === 'complete' ? 200 : 202, result);
    } catch (error) {
      if (error.code === 'ACCOUNT_PAYMENTS_PENDING') reply(409, { error: error.message, code: error.code });
      else if (error.code === 'FRESH_AUTH_REQUIRED') reply(401, { error: 'Sign in again to confirm account deletion.', code: error.code });
      else reply(503, { error: 'The deletion request could not be saved. Please retry.', code: 'DELETION_UNAVAILABLE' });
    } finally { if (key) busy.delete(key); }
  };
}
