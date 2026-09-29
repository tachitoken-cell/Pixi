const staffTitles = new Set(['admin', 'administrator', 'gm', 'gamemaster', 'owner', 'mod', 'moderator', 'dev', 'developer', 'support', 'staff', 'system', '管理员', '管理員', '游戏管理员', '遊戲管理員', '客服', '官方', '开发者', '開發者', '版主']);
const staffNameError = 'Choose an adventurer name without staff titles such as Admin, GM or Owner.';
const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };
const nameLetters = (name: string) => name.toLowerCase().replace(/[ _-]/g, '').replace(/[01345789]/g, digit => leet[digit]);

/** Creation policy only: legacy names must remain loadable, and names never grant staff roles. */
export function characterNameError(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9\p{Script=Han} _-]{2,20}$/u.test(value.trim()) || value.trim().length > 20) return 'Use 2–20 English letters, Chinese characters, numbers, spaces, hyphens or underscores.';
  const name = value.trim();
  // Keep word and CamelCase boundaries; short titles must not reject Devin or Modric.
  const parts = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[ _-]+/);
  for (let start = 0; start < parts.length; start++) {
    let phrase = '';
    for (let end = start; end < parts.length; end++) {
      phrase += parts[end];
      // Joining complete parts catches Game Master, G_M and spaced-out spellings.
      for (const letters of [nameLetters(phrase), nameLetters(phrase.replace(/^\d+|\d+$/g, ''))]) {
        if (staffTitles.has(letters) || /^(?:admin|gamemaster|owner|moderator|developer|support|staff|system|gm|管理员|管理員|游戏管理员|遊戲管理員|客服|官方|开发者|開發者|版主)/.test(letters)) return staffNameError;
      }
      if (/^(?:DEV|MOD)/.test(phrase)) return staffNameError;
    }
  }
  return null;
}
