import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import geoip from 'geoip-country';

const COUNTRY_CODES = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
export const normalizeCountry = value => typeof value === 'string' && COUNTRY_CODES.has(value.toUpperCase()) ? value.toUpperCase() : null;

// Only the country's code leaves this request. The address is never logged or retained.
export function createCountryLookup({ realmId, direct = false, proxy = process.env.STATS_COUNTRY_PROXY ?? (['us', 'asia'].includes(realmId) ? 'caddy' : ''), secret = process.env.STATS_COUNTRY_SECRET || '',
  deploymentToken = process.env.MOSSVALE_DEPLOY_TOKEN || '', lookup = geoip.lookup, resolve = dnsLookup, now = Date.now } = {}) {
  // The edge gets only a domain-separated country key, never the deployment credential.
  secret ||= /^[a-f0-9]{64}$/i.test(deploymentToken) ? createHmac('sha256', Buffer.from(deploymentToken, 'hex')).update('mossvale:country:v1').digest('hex') : '';
  let cachedPeers, resolving;
  const address = value => typeof value === 'string' && value.startsWith('::ffff:') ? value.slice(7) : value;
  async function proxyPeers() {
    if (!proxy) return [];
    if (cachedPeers && now() - cachedPeers.at < 60000) return cachedPeers.addresses;
    return resolving ??= resolve(proxy, { all: true }).then(rows => {
      const addresses = rows.map(row => address(row.address)); cachedPeers = { at: now(), addresses }; return addresses;
    }).catch(() => []).finally(() => { resolving = undefined; });
  }
  return async request => {
    try {
      const token = request.headers['x-mossvale-country-token'];
      if (/^[a-f0-9]{64}$/i.test(secret) && typeof token === 'string' && token.length === secret.length
          && timingSafeEqual(Buffer.from(secret), Buffer.from(token))) return normalizeCountry(request.headers['x-mossvale-country']);
      const peer = address(request.socket?.remoteAddress);
      let client = peer;
      if ((await proxyPeers()).includes(peer)) client = address(request.headers['x-mossvale-client-ip']);
      else if (!direct || proxy || secret) return null;
      return isIP(client || '') ? normalizeCountry(lookup(client)?.country) : null;
    } catch { return null; } // Analytics must never stop entry to the game.
  };
}
