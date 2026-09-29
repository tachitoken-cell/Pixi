import { COMMUNITY_RULES, COMMUNITY_VERSION, REPORT_REASONS, type PlayerReport, type SecurityEvidence } from './community';
import type { ClientMessage } from './shared';
import './community.css';

export function mountCommunityUI(send: (message: ClientMessage) => void, onOpen: () => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'community-dialog'; dialog.setAttribute('aria-labelledby', 'community-title');
  document.body.append(dialog);
  let accepted = false, busy = false, includeReviewed = false, mode: 'rules' | 'report' | 'inbox' = 'rules';
  let target: { id: string; name: string; messageId?: string } | undefined;
  let reports: PlayerReport[] = [];
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  function status(text: string) { const node = dialog.querySelector<HTMLElement>('[role="status"]'); if (node) node.textContent = text; }
  function requestReports() { busy = true; status('Loading reports…'); send({ type: 'reportsList', ...(includeReviewed ? { reviewed: true } : {}) }); }
  function securityDetails(article: HTMLElement, evidence: SecurityEvidence) {
    const score = element('p'); score.append(element('strong', `Bot suspicion score: ${evidence.score}/100`), ` · Review threshold: ${evidence.threshold}`); article.append(score);
    const signals = element('ul'); signals.className = 'report-signals';
    for (const signal of evidence.signals) signals.append(element('li', `${signal.source === 'server' ? 'Server observed' : 'Client reported · unverified'} · +${signal.points}: ${signal.summary}`));
    article.append(signals);
    for (const limitation of evidence.limitations) article.append(element('p', limitation));
    const details = element('details'), observations = element('dl'); details.className = 'report-observations';
    details.append(element('summary', 'Collected observations'));
    const add = (label: string, value: string) => observations.append(element('dt', label), element('dd', value));
    const server = evidence.server;
    add('Observation period', `${new Date(server.startedAt).toLocaleString()} – ${new Date(server.endedAt).toLocaleString()}`);
    add('Server actions', `${server.actionType} · ${server.intervals} intervals over ${(server.durationMs / 60000).toFixed(1)} minutes`);
    add('Server timing', `${server.meanIntervalMs.toFixed(0)} ms mean interval · ${(server.jitterRatio * 100).toFixed(2)}% variation`);
    if (server.sequence) add('Repeated route', `${server.repetitions} repetitions · ${server.distinctTargets} targets · ${server.sequence.join(' → ')}`);
    const runtime = evidence.runtime;
    if (runtime) {
      add('Recent runtime checks', `${runtime.answered} of ${runtime.issued} fresh checks answered · ${runtime.unanswered} unanswered (inconclusive) · ${runtime.mismatched} mismatched`);
      add('Client automation claims', `${runtime.automation} replies report automation control · scripting-library header: ${runtime.declaredScript ? 'yes' : 'not observed'} · unverified`);
    }
    const client = evidence.client;
    if (client) {
      add('Browser sample', `${client.windows} windows over ${(client.durationMs / 60000).toFixed(1)} minutes · unverified`);
      add('Viewport buckets', `Widths: ${client.viewportWidths.join(', ')} px; heights: ${client.viewportHeights.join(', ')} px; ${client.resizes} resizes`);
      add('Input counts', `${client.clicks} clicks · ${client.keys} key presses · ${client.drags} drags · ${client.touchClicks} touch clicks`);
      add('Click patterns', `${client.syntheticClicks} synthetic clicks · ${client.sameCellClicks} repeated cells`);
      add('Click timing', `${client.clickIntervals} intervals · ${client.clickMeanMs.toFixed(0)} ms mean · ${(client.clickJitter * 100).toFixed(2)}% variation`);
    } else add('Browser sample', 'Unavailable; no conclusion drawn from missing telemetry.');
    add('Scoring version', String(evidence.version)); details.append(observations); article.append(details);
  }
  function render() {
    dialog.replaceChildren();
    const header = element('header'), title = element('h2', mode === 'rules' ? 'Community rules' : mode === 'report' ? `Report ${target?.name}` : 'Player reports'); title.id = 'community-title';
    const close = element('button', 'Close'); close.type = 'button'; close.onclick = () => dialog.close(); header.append(title, close); dialog.append(header);
    const body = element('div'); body.className = 'community-body'; dialog.append(body);
    const feedback = element('p'); feedback.setAttribute('role', 'status');
    if (mode === 'rules') {
      const list = element('ul'); for (const rule of COMMUNITY_RULES) list.append(element('li', rule)); body.append(list);
      const form = element('form'), label = element('label'), check = element('input'); check.type = 'checkbox'; check.required = true;
      label.append(check, ' I agree to follow these community rules.');
      const button = element('button', accepted ? 'Rules accepted' : 'Accept rules'); button.disabled = accepted;
      form.append(label, button); body.append(form);
      form.onsubmit = event => { event.preventDefault(); if (!check.checked || busy) return; busy = true; button.disabled = true; send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION }); };
    } else if (mode === 'report') {
      body.append(element('p', target?.messageId ? 'This report includes the selected chat message as received by the server.' : 'Describe the behavior you want a game master to review.'));
      const form = element('form'), reasonLabel = element('label', 'Reason'), reason = element('select');
      for (const value of REPORT_REASONS) { const option = element('option', value); option.value = value; reason.append(option); } reasonLabel.append(reason);
      const detailsLabel = element('label', 'Details (optional)'), details = element('textarea'); details.maxLength = 500; details.rows = 3; detailsLabel.append(details);
      const submit = element('button', 'Send report'); form.append(reasonLabel, detailsLabel, submit); body.append(form);
      form.onsubmit = event => { event.preventDefault(); if (!target || busy) return; busy = true; submit.disabled = true; send({ type: 'playerReport', targetId: target.id, ...(target.messageId ? { messageId: target.messageId } : {}), reason: reason.value, details: details.value.trim() }); };
    } else {
      const historyLabel = element('label'), history = element('input'); history.type = 'checkbox'; history.checked = includeReviewed;
      historyLabel.className = 'report-history'; historyLabel.append(history, ' Include reviewed reports'); body.append(historyLabel);
      history.onchange = () => { if (busy) { history.checked = includeReviewed; return; } includeReviewed = history.checked; requestReports(); };
      if (!reports.length) body.append(element('p', includeReviewed ? 'No reports.' : 'No open reports.'));
      for (const report of reports) {
        const article = element('article'); article.append(element('h3', `${report.targetName} · ${report.reason}`), element('p', `${report.status === 'banned' ? 'Account banned' : report.status === 'dismissed' ? 'Dismissed' : 'Awaiting review'} · ${new Date(report.createdAt).toLocaleString()}${report.realmId ? ` · ${report.realmId.toUpperCase()}` : ''}`));
        if (report.evidence) article.append(element('blockquote', `[${report.evidence.channel}] ${report.evidence.text}`));
        const decision = report.decisionEvidence, evidence = decision?.securityEvidence || report.securityEvidence;
        if (report.status !== 'open') {
          article.append(element('h4', report.status === 'banned' ? 'Why this account was banned' : 'Review decision'), element('p', decision?.resolution || report.resolution || 'No review reason was recorded.'));
          const reviewedAt = decision?.reviewedAt ?? report.reviewedAt, reviewerId = decision?.reviewerId ?? report.reviewerId;
          if (reviewedAt) article.append(element('p', `Reviewed ${new Date(reviewedAt).toLocaleString()}${reviewerId ? ` · Reviewer ${reviewerId}` : ''}`));
        }
        if (evidence) securityDetails(article, evidence);
        const description = decision?.details ?? report.details;
        if (description) article.append(element('p', `${report.source === 'guard' ? 'Server evidence' : 'Reporter’s description'}: ${description}`));
        if (report.status !== 'open') {
          body.append(article); continue;
        }
        const form = element('form'), label = element('label', 'Review reason'), reason = element('input'); reason.required = true; reason.maxLength = 160; label.append(reason);
        const confirmLabel = element('label'), confirm = element('input'); confirm.type = 'checkbox'; confirmLabel.append(confirm, ' Confirm account ban (all characters).');
        const dismiss = element('button', 'Dismiss'), ban = element('button', 'Ban account'); dismiss.type = ban.type = 'button';
        const review = (decision: 'dismiss' | 'ban') => { if (busy || !form.reportValidity()) return; if (decision === 'ban' && !confirm.checked) { status('Confirm the account ban first.'); return; } busy = true; dismiss.disabled = ban.disabled = true; send({ type: 'reviewReport', reportId: report.id, decision, reason: reason.value.trim() }); };
        dismiss.onclick = () => review('dismiss'); ban.onclick = () => review('ban'); form.onsubmit = event => event.preventDefault(); form.append(label, confirmLabel, dismiss, ban); article.append(form); body.append(article);
      }
    }
    body.append(feedback);
  }
  function open(next: typeof mode) { if (busy) return; mode = next; onOpen(); render(); if (!dialog.open) dialog.showModal(); }
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('pointerdown', event => event.stopPropagation());
  return {
    isOpen: () => dialog.open,
    close: () => { busy = false; dialog.close(); },
    rules: () => open('rules'),
    report(id: string, name: string, messageId?: string) { if (busy) return; target = { id, name, messageId }; open('report'); },
    inbox() { if (busy) return; reports = []; open('inbox'); requestReports(); },
    updateRules(value: boolean) { accepted = value; busy = false; if (!accepted) open('rules'); else if (dialog.open && mode === 'rules') dialog.close(); },
    updateReports(value: PlayerReport[]) { reports = value; busy = false; if (dialog.open && mode === 'inbox') render(); },
    result(success: boolean, text: string) { busy = false; for (const button of dialog.querySelectorAll('button')) button.disabled = false; status(text); if (success && mode === 'report') { dialog.querySelector('form')?.remove(); } },
  };
}
