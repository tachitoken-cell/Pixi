import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';

const etags = new Map();
export function serveStaticAsset(req, res, path, headers) {
  const accepted = new Map(String(req.headers['accept-encoding'] || '').toLowerCase().split(',').map(part => {
    const [name, ...parameters] = part.trim().split(';');
    const q = parameters.map(value => value.trim()).find(value => value.startsWith('q='));
    return [name.trim(), q === undefined ? 1 : /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q) ? Number(q.slice(2)) : 0];
  }));
  const quality = name => accepted.get(name) ?? (name === 'identity' ? accepted.get('*') === 0 ? 0 : 1 : accepted.get('*') ?? 0);
  const choices = ['br', 'gzip', 'identity'].filter(name => quality(name) > 0)
    .sort((a, b) => quality(b) - quality(a));
  const encoding = choices.find(name => name === 'identity' || existsSync(path + (name === 'br' ? '.br' : '.gz')));
  const vary = String(headers.Vary || res.getHeader('Vary') || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!vary.some(value => value.toLowerCase() === 'accept-encoding')) vary.push('Accept-Encoding');
  headers = { ...headers, Vary: vary.join(', ') };
  if (!encoding) { res.writeHead(406, { ...headers, 'Cache-Control': 'no-store' }).end(); return; }
  if (headers['Cache-Control'] !== 'no-store') {
    const stat = statSync(path), previous = etags.get(path);
    if (!previous || previous.size !== stat.size || previous.modified !== stat.mtimeMs) {
      etags.set(path, { size: stat.size, modified: stat.mtimeMs,
        value: `W/"${createHash('sha256').update(readFileSync(path)).digest('hex')}"` });
    }
    headers.ETag = etags.get(path).value;
    headers['Cache-Control'] ??= 'no-cache';
    const tags = String(req.headers['if-none-match'] || '').split(',').map(value => value.trim().replace(/^W\//, ''));
    if (tags.includes('*') || tags.includes(headers.ETag.slice(2))) { res.writeHead(304, headers).end(); return; }
  }
  const source = encoding === 'identity' ? path : path + (encoding === 'br' ? '.br' : '.gz');
  if (encoding !== 'identity') headers['Content-Encoding'] = encoding;
  headers['Content-Length'] = statSync(source).size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else createReadStream(source).on('error', () => res.destroy()).pipe(res);
}
