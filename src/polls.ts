export type PollAnswer = 'yes' | 'no' | 'skip';
export interface PollDefinition {
  id: string;
  title: string;
  description: string;
  opensAt: number;
  closesAt: number;
  questions: { id: string; text: string; description?: string }[];
}
export interface PollBallot { answers: Record<string, PollAnswer>; submittedAt: number }
export interface PollQuestionResult { yes: number; no: number; skip: number; approval: number | null; passed: boolean }
export interface PollView extends PollDefinition {
  status: 'upcoming' | 'open' | 'closed';
  ballot?: PollBallot;
  results?: { ballots: number; questions: Record<string, PollQuestionResult> };
}
export interface PollBoothView { boothId: string; polls: PollView[]; serverTime: number; submittedPollId?: string; open?: boolean; reason?: string }
export interface StoredPollBallot extends PollBallot { pollId: string; accountKey: string }
export interface PollCount { pollId: string; questionId: string; answer: PollAnswer; count: number }

export const POLL_APPROVAL_PERCENT = 70;
export const POLLS: readonly PollDefinition[] = [{
  id: '2026-09-stake-moss', title: 'Stake MOSS?', description: 'Should we add staking to the game',
  opensAt: Date.UTC(2026, 8, 20, 19, 30), closesAt: Date.UTC(2026, 8, 27, 19, 30),
  questions: [{ id: 'add-staking', text: 'Should we add staking to the game?' }],
}];
export const pollStatus = (poll: PollDefinition, now = Date.now()): PollView['status'] => now < poll.opensAt ? 'upcoming' : now < poll.closesAt ? 'open' : 'closed';
const idValid = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
export function pollsValid(polls: readonly PollDefinition[]): boolean {
  return Array.isArray(polls) && new Set(polls.map(poll => poll?.id)).size === polls.length && polls.every(poll => poll && idValid(poll.id)
    && typeof poll.title === 'string' && poll.title.trim().length > 0 && poll.title.length <= 160
    && typeof poll.description === 'string' && poll.description.length <= 4000
    && Number.isSafeInteger(poll.opensAt) && poll.opensAt > 0 && Number.isSafeInteger(poll.closesAt) && poll.closesAt > poll.opensAt
    && Array.isArray(poll.questions) && poll.questions.length > 0 && poll.questions.length <= 30
    && new Set(poll.questions.map((question: PollDefinition['questions'][number]) => question?.id)).size === poll.questions.length
    && poll.questions.every((question: PollDefinition['questions'][number]) => question && idValid(question.id) && typeof question.text === 'string' && question.text.trim().length > 0 && question.text.length <= 1000
      && (question.description === undefined || typeof question.description === 'string' && question.description.length <= 4000)));
}
export function pollAnswersValid(poll: PollDefinition, answers: unknown): answers is Record<string, PollAnswer> {
  return !!answers && typeof answers === 'object' && !Array.isArray(answers)
    && Object.keys(answers).length === poll.questions.length
    && poll.questions.every(question => Object.hasOwn(answers, question.id) && ['yes', 'no', 'skip'].includes((answers as Record<string, string>)[question.id]));
}
export function pollViews(polls: readonly PollDefinition[], own: StoredPollBallot[], counts: PollCount[], now = Date.now()): PollView[] {
  return polls.map(poll => {
    const status = pollStatus(poll, now), saved = own.find(ballot => ballot.pollId === poll.id);
    const view: PollView = { ...poll, status, ...(saved ? { ballot: { answers: { ...saved.answers }, submittedAt: saved.submittedAt } } : {}) };
    if (status === 'closed') {
      const questions: Record<string, PollQuestionResult> = {};
      for (const question of poll.questions) {
        const result = { yes: 0, no: 0, skip: 0, approval: null as number | null, passed: false };
        for (const count of counts) if (count.pollId === poll.id && count.questionId === question.id) result[count.answer] += count.count;
        const considered = result.yes + result.no;
        result.approval = considered ? result.yes / considered * 100 : null;
        result.passed = considered > 0 && result.yes * 100 >= POLL_APPROVAL_PERCENT * considered;
        questions[question.id] = result;
      }
      const first = questions[poll.questions[0].id];
      view.results = { ballots: first.yes + first.no + first.skip, questions };
    }
    return view;
  });
}
