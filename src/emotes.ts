export const EMOTES = {
  dance: { text: 'starts dancing.', duration: null },
  laugh: { text: 'laughs heartily.', duration: 3200 },
  wave: { text: 'waves hello.', duration: 2500 },
  cheer: { text: 'cheers!', duration: 3000 },
  clap: { text: 'claps enthusiastically.', duration: 3000 },
  bow: { text: 'bows respectfully.', duration: 2800 },
  shrug: { text: 'shrugs.', duration: 2200 },
  cry: { text: 'bursts into tears.', duration: 3500 },
} as const;

export type EmoteId = keyof typeof EMOTES;
export interface EmoteState { id: EmoteId; startedAt: number; endsAt: number | null }
export const emoteValid = (id: unknown): id is EmoteId => typeof id === 'string' && Object.hasOwn(EMOTES, id);
export const EMOTE_HELP = `${Object.keys(EMOTES).map(id => `/${id}`).join(', ')}. Each race has its own dance. Move or use /stop to stop.`;

/** Undefined is regular chat; an empty string is an unrecognized slash command. */
export function emoteCommand(text: string): EmoteId | 'stop' | 'help' | '' | undefined {
  const command = text.trim().toLowerCase();
  if (!command.startsWith('/')) return undefined;
  const id = command.slice(1);
  if (emoteValid(id)) return id;
  if (id === 'stop') return 'stop';
  if (id === 'emotes' || id === 'help') return 'help';
  return '';
}
