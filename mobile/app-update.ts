export type AppPlatform = 'apple' | 'google';
type MinimumAppVersion = { minVersion: string; minBuild?: string };
export type AppUpdatePolicy = Partial<Record<AppPlatform, MinimumAppVersion>>;
export type RequiredAppUpdate = MinimumAppVersion & { platform: AppPlatform };
export const APP_STORE_URLS: Record<AppPlatform, string> = {
  apple: 'https://apps.apple.com/app/id6811825860',
  google: 'https://play.google.com/store/apps/details?id=world.mossvale.game',
};
const numericVersion = (value: unknown): value is string => typeof value === 'string' && /^\d{1,10}(?:\.\d{1,10}){0,2}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function parseAppUpdatePolicy(value: unknown): AppUpdatePolicy {
  if (value === undefined || value === null) return {};
  if (!record(value) || Object.keys(value).some(key => key !== 'apple' && key !== 'google')) throw Error('Invalid app update policy.');
  const policy: AppUpdatePolicy = {};
  for (const platform of ['apple', 'google'] as const) {
    if (!Object.hasOwn(value, platform)) continue;
    const minimum = value[platform];
    if (!record(minimum) || !numericVersion(minimum.minVersion) || Object.keys(minimum).some(key => key !== 'minVersion' && key !== 'minBuild') || minimum.minBuild !== undefined && !numericVersion(minimum.minBuild)) throw Error('Invalid app update policy.');
    policy[platform] = { minVersion: minimum.minVersion, ...(minimum.minBuild === undefined ? {} : { minBuild: minimum.minBuild }) };
  }
  return policy;
}

function compare(left: string, right: string) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function requiredAppUpdate(policy: AppUpdatePolicy, installed: { platform: AppPlatform; version?: string | null; build?: string | null }): RequiredAppUpdate | undefined {
  const minimum = policy[installed.platform];
  if (!minimum) return;
  const version = numericVersion(installed.version) ? compare(installed.version, minimum.minVersion) : -1;
  if (version < 0 || version === 0 && minimum.minBuild !== undefined && (!numericVersion(installed.build) || compare(installed.build, minimum.minBuild) < 0)) return { platform: installed.platform, ...minimum };
}
