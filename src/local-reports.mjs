import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { reportDecisionEvidence } from './community.ts';

// Loopback development uses the same acknowledgement-after-save behavior as SQL.
export function localReports(directory) {
  const path = join(directory, 'reports.json');
  const read = () => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  const write = rows => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path + '.tmp', JSON.stringify(rows), { mode: 0o600 });
    const fd = openSync(path + '.tmp', 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(path + '.tmp', path);
    const dir = openSync(directory, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  };
  return {
    addGuard(report) {
      const rows = read(), previous = rows.find(row => row.source === 'guard' && row.status === 'open'
        && row.reporterAccount === report.reporterAccount && row.reason === report.reason);
      if (previous) Object.assign(previous, report, { id: previous.id, createdAt: previous.createdAt,
        blockedUntil: Math.max(previous.blockedUntil || 0, report.blockedUntil || 0) });
      else rows.push(report);
      write(rows);
      return previous || report;
    },
    guardBlockedUntil(key) { return read().reduce((until, row) => row.source === 'guard' && row.reporterAccount === key ? Math.max(until, row.blockedUntil || 0) : until, 0); },
    add(report) { const rows = read(); if (rows.some(row => row.source !== 'guard' && row.reporterAccount === report.reporterAccount && row.createdAt > report.createdAt - 60000)) throw Error('Wait one minute before sending another report.'); rows.push(report); write(rows); },
    list(includeReviewed = false) { return read().filter(row => includeReviewed === true || row.status === 'open').sort((a, b) => (b.reviewedAt || b.createdAt) - (a.reviewedAt || a.createdAt)).slice(0, 50); },
    get(id) { return read().find(row => row.id === id); },
    resolve(id, status, resolution, reviewerId) {
      const rows = read(), row = rows.find(row => row.id === id);
      if (!row || row.status !== 'open') throw Error('This report has already been reviewed.');
      const reviewedAt = Date.now(), decisionEvidence = reportDecisionEvidence(row, status === 'banned' ? 'ban' : 'dismiss', resolution, reviewerId, reviewedAt);
      Object.assign(row, { status, resolution, reviewerId, reviewedAt, decisionEvidence }); write(rows); return row;
    },
  };
}
