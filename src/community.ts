export const COMMUNITY_VERSION = 1;
export const COMMUNITY_RULES = [
  'Treat other players with respect. Do not harass, threaten, discriminate or share sexual content.',
  'Keep character names and chat suitable for a general gaming community. Do not share private information, scams or spam.',
  'Use Report for abusive content and Ignore to stop chat and invitations from a player. Game masters review reports and may remove access for rule violations.',
] as const;
export const REPORT_REASONS = ['Harassment or threats', 'Hate or sexual content', 'Scam or spam', 'Inappropriate name', 'Other'] as const;
export type SecurityEvidence = {
  version: 1; score: number; threshold: number;
  signals: { id: string; source: 'server' | 'client'; points: number; summary: string }[];
  server: { actionType: string; startedAt: number; endedAt: number; intervals: number; durationMs: number; meanIntervalMs: number; jitterRatio: number;
    sequence?: string[]; repetitions?: number; distinctTargets?: number };
  runtime?: { declaredScript: boolean; issued: number; answered: number; unanswered: number; mismatched: number; automation: number };
  client?: { windows: number; durationMs: number; viewportWidths: number[]; viewportHeights: number[]; clicks: number; keys: number; drags: number; touchClicks: number; syntheticClicks: number; clickIntervals: number; clickMeanMs: number; clickJitter: number; sameCellClicks: number; resizes: number };
  limitations: string[];
};
export type ReportDecisionEvidence = {
  score?: number; securityEvidence?: SecurityEvidence; details: string; reason: string;
  reviewerId: string; reviewedAt: number; decision: 'ban' | 'dismiss'; resolution: string;
};
export type PlayerReport = { id: string; targetId: string; targetName: string; reason: string; details: string; source?: 'guard'; realmId?: string; evidence?: { text: string; channel: string; at: number }; securityEvidence?: SecurityEvidence; decisionEvidence?: ReportDecisionEvidence; createdAt: number; status: 'open' | 'dismissed' | 'banned'; resolution?: string; reviewerId?: string; reviewedAt?: number };
/** Copy the stored evidence at the decision boundary; subsequent observations cannot rewrite it. */
export function reportDecisionEvidence(report: PlayerReport, decision: 'ban' | 'dismiss', resolution: string, reviewerId: string, reviewedAt: number): ReportDecisionEvidence {
  return { details: report.details, reason: report.reason, reviewerId, reviewedAt, decision, resolution,
    ...(report.securityEvidence ? { score: report.securityEvidence.score, securityEvidence: structuredClone(report.securityEvidence) } : {}) };
}
export const communityText = (value: unknown, max: number, multiline = false) => typeof value === 'string' && value.length <= max && value === value.trim() && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[<>\u0000-\u001f\u007f]/).test(value);
// Reject common profanity/slurs and explicit threats before publication. Reports
// remain necessary: a word filter cannot decide every context or language.
export function objectionableText(text: string): boolean {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[013457@$]/g, c => ({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'})[c]!);
  return /\b(?:fuck\w*|shit\w*|cunt\w*|nigg\w*|faggot\w*|rape|porn\w*|kys)\b|\b(?:kill|dox)\s+(?:yourself|you)\b/i.test(normalized);
}
