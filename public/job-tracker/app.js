/* Hireboard: applications, interviews, follow-ups, reminders and calendar sync.
   Everything is stored in this browser. Calendar sync uses .ics files and Google Calendar links,
   so it works without accounts or API keys. */
window.Store.ready.then(function () {
  'use strict';

  const U = window.UI;
  const {
    $, $$, esc, icon, num, pct, badge, avatar, hbar, sum, uid, today, addDays, daysBetween, parseISO,
    fmtDate, toISO, toCSV, downloadFile, emptyState, field, input, select, textarea, toast, confirmDialog,
    openModal, barChart, initTheme, initShell, initRouter, createStore,
  } = U;

  const KEY = 'hireboard-v1';
  const REMINDERS_KEY = 'hireboard-reminders';
  const NOTIFIED_KEY = 'hireboard-notified';
  const COLUMNS = [
    { id: 'new', label: 'New', color: '#0ea5e9' },
    { id: 'applied', label: 'Applied', color: '#f59e0b' },
    { id: 'interview', label: 'Interview', color: '#8b5cf6' },
    { id: 'accepted', label: 'Accepted', color: '#10b981' },
    { id: 'archived', label: 'Archived', color: '#94a3b8' },
  ];
  const STATUS_IDS = COLUMNS.map((c) => c.id);
  const STATUS_TONE = { new: 'info', applied: 'warning', interview: 'accent', accepted: 'success', archived: '' };
  const SOURCES = ['LinkedIn', 'Referral', 'Company website', 'Job board', 'Recruiter', 'Event', 'Other'];
  const INTERVIEW_TYPES = ['Phone screen', 'Technical', 'Take-home review', 'Panel', 'Final', 'HR'];
  const ARCHIVE_REASONS = ['Rejected', 'Withdrawn', 'Ghosted', 'Closed'];
  const ACTIVE = ['new', 'applied', 'interview'];

  /* ---------- Small helpers ---------- */
  const p2 = (n) => String(n).padStart(2, '0');
  const nowStamp = () => {
    const d = new Date();
    return `${toISO(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  const statusName = (status) => (COLUMNS.find((c) => c.id === status) || COLUMNS[0]).label;
  const isActive = (job) => ACTIVE.includes(job.status);
  const hasInterview = (job) => job.interviews.length > 0 || job.status === 'interview' || job.status === 'accepted';
  const interviewLabel = (iv) => `${fmtDate(iv.date, true)}${iv.time ? ` · ${iv.time}` : ''}`;
  const fmtStamp = (at) => {
    const [date, time = ''] = at.split('T');
    return `${fmtDate(date, true)}${time ? ` · ${time}` : ''}`;
  };

  /* ---------- Data shape (also used when importing backups) ---------- */
  function normalizeInterview(i) {
    return {
      id: i.id || uid(),
      date: i.date || today(),
      time: /^\d{2}:\d{2}$/.test(i.time || '') ? i.time : '',
      type: i.type || 'Phone screen',
      interviewer: String(i.interviewer || ''),
      notes: String(i.notes || ''),
      done: !!i.done,
    };
  }

  function normalizeJob(j) {
    const created = j.createdAt || today();
    return {
      id: j.id || uid(),
      company: String(j.company || 'Untitled company'),
      role: String(j.role || ''),
      location: String(j.location || ''),
      source: SOURCES.includes(j.source) ? j.source : 'Other',
      salary: String(j.salary || ''),
      link: String(j.link || ''),
      status: STATUS_IDS.includes(j.status) ? j.status : 'new',
      archiveReason: ARCHIVE_REASONS.includes(j.archiveReason) ? j.archiveReason : '',
      appliedDate: j.appliedDate || '',
      followUp: j.followUp || '',
      notes: String(j.notes || ''),
      contactName: String(j.contactName || ''),
      contactEmail: String(j.contactEmail || ''),
      contactPhone: String(j.contactPhone || ''),
      interviews: Array.isArray(j.interviews) ? j.interviews.map(normalizeInterview) : [],
      activity: Array.isArray(j.activity)
        ? j.activity.filter((a) => a && a.text).map((a) => ({ id: a.id || uid(), at: a.at || created, text: String(a.text) }))
        : [],
      createdAt: created,
      updatedAt: j.updatedAt || created,
    };
  }

  function seed() {
    const t = today();
    const at = (n, time = '09:00') => `${addDays(t, n)}T${time}`;
    const ev = (n, text, time) => ({ id: uid(), at: at(n, time), text });
    const iv = (n, type, interviewer, notes, done, time) => ({ id: uid(), date: addDays(t, n), time: time || '', type, interviewer, notes, done });
    const jobs = [
      { company: 'Apple', role: 'Product Designer', location: 'Cupertino, CA · Hybrid', source: 'LinkedIn', status: 'new', salary: '$140k–$170k', createdAt: addDays(t, -2), notes: 'Saved from LinkedIn. Tailor the portfolio to the motion work.', activity: [ev(-2, 'Added to the board')] },
      { company: 'Stripe', role: 'Software Engineer, Payments', location: 'Remote (EU)', source: 'Referral', status: 'new', contactName: 'Lina Khoury', contactEmail: 'lina@example.com', createdAt: addDays(t, -1), notes: 'Referral from a former colleague. Ask about the team structure.', activity: [ev(-1, 'Added to the board'), ev(-1, 'Contact added: Lina Khoury', '11:20')] },
      { company: 'Netflix', role: 'Senior UI Engineer', location: 'Los Gatos, CA', source: 'Company website', status: 'applied', appliedDate: addDays(t, -9), followUp: addDays(t, -1), salary: '$180k–$220k', link: 'https://careers.example.com/senior-ui', contactName: 'Maya Haddad', contactEmail: 'maya@example.com', contactPhone: '+1 555 0100', notes: 'Applied through the careers site. The recruiter reviews applications weekly.', createdAt: addDays(t, -9), activity: [ev(-9, 'Added to the board'), ev(-9, 'Moved from New to Applied')] },
      { company: 'Airbnb', role: 'UX Researcher', location: 'Remote (US)', source: 'Job board', status: 'applied', appliedDate: addDays(t, -4), followUp: addDays(t, 3), createdAt: addDays(t, -4), activity: [ev(-4, 'Added to the board'), ev(-4, 'Moved from New to Applied')] },
      { company: 'Booking.com', role: 'Frontend Developer', location: 'Amsterdam · Hybrid', source: 'Referral', status: 'applied', appliedDate: addDays(t, -2), followUp: addDays(t, 5), createdAt: addDays(t, -3), activity: [ev(-3, 'Added to the board'), ev(-2, 'Moved from New to Applied')] },
      { company: 'Meta', role: 'Product Manager', location: 'Menlo Park, CA', source: 'Recruiter', status: 'interview', appliedDate: addDays(t, -20), createdAt: addDays(t, -20), notes: 'Panel booked. Prepare a short product teardown.', contactName: 'Sam Ortiz', contactEmail: 'sam@example.com', interviews: [iv(-6, 'Phone screen', 'Recruiter', 'Went well. The team is hiring for growth.', true, '14:00'), iv(2, 'Panel', 'Hiring manager', '', false, '11:00')], activity: [ev(-20, 'Added to the board'), ev(-20, 'Moved from New to Applied'), ev(-6, 'Interview completed: Phone screen', '15:10'), ev(-6, 'Moved from Applied to Interview')] },
      { company: 'Vercel', role: 'Developer Advocate', location: 'Remote', source: 'Event', status: 'interview', appliedDate: addDays(t, -12), createdAt: addDays(t, -12), interviews: [iv(4, 'Technical', 'Engineering lead', 'Live coding and a short demo', false, '15:30')], activity: [ev(-12, 'Added to the board'), ev(-12, 'Moved from New to Applied'), ev(-5, 'Moved from Applied to Interview')] },
      { company: 'Google', role: 'AI Researcher', location: 'Mountain View, CA', source: 'LinkedIn', status: 'accepted', appliedDate: addDays(t, -45), createdAt: addDays(t, -45), notes: 'Offer received. Compare with the Meta process before the deadline.', interviews: [iv(-30, 'Final', 'Panel', 'Strong feedback', true, '10:00')], activity: [ev(-45, 'Added to the board'), ev(-45, 'Moved from New to Applied'), ev(-30, 'Interview completed: Final'), ev(-4, 'Moved from Interview to Accepted')] },
      { company: 'Amazon', role: 'Business Analyst', location: 'Seattle, WA', source: 'Company website', status: 'archived', archiveReason: 'Rejected', appliedDate: addDays(t, -60), createdAt: addDays(t, -60), activity: [ev(-60, 'Added to the board'), ev(-40, 'Archived: Rejected')] },
      { company: 'Uber', role: 'Backend Engineer', location: 'Remote', source: 'Job board', status: 'archived', archiveReason: 'Withdrawn', appliedDate: addDays(t, -35), createdAt: addDays(t, -35), activity: [ev(-35, 'Added to the board'), ev(-20, 'Archived: Withdrawn')] },
      { company: 'Spotify', role: 'Data Scientist', location: 'Stockholm', source: 'LinkedIn', status: 'archived', archiveReason: 'Ghosted', appliedDate: addDays(t, -75), createdAt: addDays(t, -75), activity: [ev(-75, 'Added to the board'), ev(-50, 'Archived: Ghosted')] },
    ].map((j) => normalizeJob({ ...j, updatedAt: j.createdAt }));
    return { jobs };
  }

  /* ---------- State ---------- */
  const store = createStore(KEY, seed);
  const db = () => store.get();
  const ui = { view: 'board', company: 'all', sort: 'updated', boardFilter: 'all', listFilter: 'all', listSource: 'all', query: '' };
  const findJob = (id) => db().jobs.find((j) => j.id === id);
  function logTo(job, text) {
    job.activity.unshift({ id: uid(), at: nowStamp(), text });
    job.updatedAt = today();
  }

  /* ---------- Derived information ---------- */
  function dueKind(job) {
    if (!isActive(job) || !job.followUp) return null;
    const d = daysBetween(today(), job.followUp);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 3) return 'soon';
    return 'later';
  }
  const isDue = (job) => ['overdue', 'today', 'soon'].includes(dueKind(job));

  function upcomingInterviews() {
    return db().jobs
      .flatMap((job) => job.interviews.filter((iv) => !iv.done && iv.date >= today()).map((iv) => ({ job, iv })))
      .sort((a, b) => (a.iv.date + a.iv.time).localeCompare(b.iv.date + b.iv.time));
  }

  const nextInterview = (job) => job.interviews
    .filter((iv) => !iv.done && iv.date >= today())
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  function metrics() {
    const jobs = db().jobs;
    const applied = jobs.filter((j) => j.appliedDate);
    const interviewed = applied.filter(hasInterview);
    const responded = applied.filter((j) => hasInterview(j) || (j.status === 'archived' && j.archiveReason === 'Rejected'));
    const offers = jobs.filter((j) => j.status === 'accepted');
    const active = jobs.filter(isActive);
    const due = jobs.filter(isDue);
    const upcoming = upcomingInterviews();
    const soon = upcoming.filter(({ iv }) => daysBetween(today(), iv.date) <= 2);
    const gaps = interviewed
      .map((j) => {
        const first = j.interviews.map((iv) => iv.date).sort()[0];
        return first && first >= j.appliedDate ? daysBetween(j.appliedDate, first) : null;
      })
      .filter((g) => g !== null);
    return {
      applied,
      interviewed,
      responded,
      offers,
      active,
      due,
      upcoming,
      soon,
      responseRate: applied.length ? (responded.length / applied.length) * 100 : 0,
      interviewRate: applied.length ? (interviewed.length / applied.length) * 100 : 0,
      avgDaysToInterview: gaps.length ? sum(gaps) / gaps.length : null,
    };
  }

  function relativeDays(iso) {
    const d = daysBetween(iso, today());
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    return `${d} days ago`;
  }

  function appliedLabel(job) {
    if (!job.appliedDate) return `Saved ${fmtDate(job.createdAt, true)}`;
    return `Applied ${relativeDays(job.appliedDate)}`;
  }

  /* ---------- Calendar: Google Calendar links and .ics files ---------- */
  const gcalDate = (iso) => iso.replace(/-/g, '');
  const gcalTime = (time) => `${time.replace(':', '')}00`;
  function endTime(time) {
    const [h, m] = time.split(':').map(Number);
    return `${p2((h + 1) % 24)}:${p2(m)}`;
  }
  function eventRange(date, time) {
    if (time) {
      return { start: `${gcalDate(date)}T${gcalTime(time)}`, end: `${gcalDate(date)}T${gcalTime(endTime(time))}`, allDay: false };
    }
    return { start: gcalDate(date), end: gcalDate(addDays(date, 1)), allDay: true };
  }
  function googleCalendarUrl({ title, date, time, details = '', location = '' }) {
    const { start, end } = eventRange(date, time);
    const params = [
      ['action', 'TEMPLATE'],
      ['text', title],
      ['dates', `${start}/${end}`],
      ['details', details],
      ['location', location],
    ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `https://calendar.google.com/calendar/render?${params.join('&')}`;
  }

  const icsText = (s) => String(s || '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const utcStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  function fold(line) {
    const parts = [];
    let rest = line;
    while (rest.length > 74) {
      parts.push(rest.slice(0, 74));
      rest = ` ${rest.slice(74)}`;
    }
    parts.push(rest);
    return parts.join('\r\n');
  }
  function icsEvent({ id, title, date, time, description = '', location = '' }) {
    const { start, end, allDay } = eventRange(date, time);
    const lines = ['BEGIN:VEVENT', `UID:${id}@hireboard`, `DTSTAMP:${utcStamp()}`];
    lines.push(allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`);
    lines.push(allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`);
    lines.push(`SUMMARY:${icsText(title)}`);
    if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
    if (location) lines.push(`LOCATION:${icsText(location)}`);
    lines.push('END:VEVENT');
    return lines;
  }
  function calendarEvents() {
    const followUps = db().jobs.filter((j) => isActive(j) && j.followUp).map((j) => ({
      id: `followup-${j.id}`,
      title: `Follow up: ${j.company} · ${j.role}`,
      date: j.followUp,
      description: j.contactName ? `Contact: ${j.contactName}` : 'Check in on your application.',
    }));
    const interviews = upcomingInterviews().map(({ job, iv }) => ({
      id: `interview-${iv.id}`,
      title: `${iv.type}: ${job.company} · ${job.role}`,
      date: iv.date,
      time: iv.time,
      description: [iv.interviewer && `Interviewer: ${iv.interviewer}`, iv.notes].filter(Boolean).join('\n'),
      location: job.location,
    }));
    return [...followUps, ...interviews];
  }
  function calendarFile(events) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hireboard//Job tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      ...events.flatMap((e) => icsEvent(e)), 'END:VCALENDAR',
    ];
    return `${lines.map(fold).join('\r\n')}\r\n`;
  }

  /* ---------- Reminders (browser notifications, checked while the app is open) ---------- */
  const canNotify = () => 'Notification' in window;
  function remindersOn() {
    try { return localStorage.getItem(REMINDERS_KEY) === 'on'; } catch (_) { return false; }
  }
  function setRemindersOn(on) {
    try { localStorage.setItem(REMINDERS_KEY, on ? 'on' : 'off'); } catch (_) { /* storage unavailable */ }
  }
  function readNotified() {
    try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) || {}; } catch (_) { return {}; }
  }
  function writeNotified(map) {
    const day = today();
    const kept = Object.fromEntries(Object.entries(map).filter(([key]) => key.endsWith(day)));
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(kept)); } catch (_) { /* storage unavailable */ }
  }

  function checkReminders() {
    if (!remindersOn() || !canNotify() || Notification.permission !== 'granted') return;
    const m = metrics();
    const seen = readNotified();
    const day = today();
    const items = [
      ...m.due.map((job) => ({ key: `followup:${job.id}:${day}`, title: 'Follow-up due', body: `${job.company} · ${job.role}` })),
      ...m.soon.map(({ job, iv }) => ({ key: `interview:${iv.id}:${day}`, title: 'Interview coming up', body: `${job.company}: ${iv.type}, ${interviewLabel(iv)}` })),
    ];
    items.forEach((item) => {
      if (seen[item.key]) return;
      try { new Notification(item.title, { body: item.body, tag: item.key }); } catch (_) { /* notifications unavailable */ }
      seen[item.key] = true;
    });
    writeNotified(seen);
  }

  async function toggleReminders() {
    if (remindersOn()) {
      setRemindersOn(false);
      toast('Reminders turned off');
      renderSettings();
      return;
    }
    if (!canNotify()) {
      toast('This browser does not support notifications.', 'error');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      try { permission = await Notification.requestPermission(); } catch (_) { permission = 'denied'; }
    }
    if (permission !== 'granted') {
      toast('Notifications are blocked. Allow them for this page in your browser settings.', 'warning');
      renderSettings();
      return;
    }
    setRemindersOn(true);
    toast('Reminders are on');
    checkReminders();
    renderSettings();
  }

  function sendTestNotification() {
    if (!canNotify() || Notification.permission !== 'granted') {
      toast('Turn reminders on first.', 'warning');
      return;
    }
    try {
      new Notification('Hireboard', { body: 'Reminders are working.', tag: 'hireboard-test' });
      toast('Test notification sent');
    } catch (_) {
      toast('Could not show a notification.', 'error');
    }
  }

  /* ---------- Mutations ---------- */
  function moveJob(id, status) {
    const job = findJob(id);
    if (!job || job.status === status) return;
    const from = job.status;
    store.update((s) => {
      const target = s.jobs.find((x) => x.id === id);
      target.status = status;
      if (status !== 'new' && !target.appliedDate) target.appliedDate = today();
      if (status !== 'archived') target.archiveReason = '';
      logTo(target, `Moved from ${statusName(from)} to ${statusName(status)}`);
    });
    toast(`Moved to ${statusName(status)}`);
    render();
  }

  function followUpDone(id) {
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      if (!job || !job.followUp) return;
      job.followUp = '';
      logTo(job, 'Follow-up done');
    });
    toast('Follow-up marked done');
    render();
  }

  function setFollowUp(id, date) {
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      job.followUp = date;
      logTo(job, `Follow-up set for ${fmtDate(date)}`);
    });
    toast('Follow-up set');
    render();
  }

  function snoozeFollowUp(id, days) {
    const next = addDays(today(), days);
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      if (!job) return;
      job.followUp = next;
      logTo(job, `Follow-up snoozed to ${fmtDate(next)}`);
    });
    toast(`Follow-up moved to ${fmtDate(next, true)}`);
    render();
  }

  function addInterview(id, data) {
    if (!data.date) {
      toast('Pick a date for the interview.', 'warning');
      return false;
    }
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      const interview = normalizeInterview({ ...data, done: false });
      const from = job.status;
      job.interviews.push(interview);
      if (job.status === 'new' || job.status === 'applied') job.status = 'interview';
      if (!job.appliedDate) job.appliedDate = today();
      logTo(job, `Interview scheduled: ${interview.type} on ${fmtDate(interview.date)}${interview.time ? ` at ${interview.time}` : ''}`);
      if (from !== job.status) logTo(job, `Moved from ${statusName(from)} to ${statusName(job.status)}`);
    });
    toast('Interview added');
    render();
    return true;
  }

  function toggleInterview(id, ivId) {
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      const iv = job && job.interviews.find((x) => x.id === ivId);
      if (!iv) return;
      iv.done = !iv.done;
      logTo(job, iv.done ? `Interview completed: ${iv.type}` : `Interview marked upcoming: ${iv.type}`);
    });
    render();
  }

  function removeInterview(id, ivId) {
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      if (!job) return;
      const iv = job.interviews.find((x) => x.id === ivId);
      job.interviews = job.interviews.filter((x) => x.id !== ivId);
      if (iv) logTo(job, `Interview removed: ${iv.type}`);
    });
    toast('Interview removed');
    render();
  }

  function addNote(id, text) {
    store.update((s) => {
      const job = s.jobs.find((x) => x.id === id);
      if (job) logTo(job, `Note: ${text}`);
    });
    toast('Note added');
    render();
  }

  async function deleteJob(id) {
    const job = findJob(id);
    if (!job) return;
    const ok = await confirmDialog({
      title: 'Delete application?',
      message: `${job.company} · ${job.role}, with its interviews and activity, will be removed.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    store.update((s) => { s.jobs = s.jobs.filter((x) => x.id !== id); });
    toast('Application deleted');
    render();
  }

  /* ---------- Rendering helpers ---------- */
  const chip = (text, tone = '', iconName = '') => `<span class="chip ${tone}">${iconName ? icon(iconName) : ''}${esc(text)}</span>`;
  const statusBadge = (job) => (job.status === 'archived' && job.archiveReason
    ? badge(`Archived · ${job.archiveReason}`, '')
    : badge(statusName(job.status), STATUS_TONE[job.status]));
  const kpi = (iconName, value, label, alert = false) => `
    <div class="kpi ${alert ? 'alert' : ''}">
      <span class="kpi-icon">${icon(iconName)}</span>
      <div><strong>${esc(value)}</strong><small>${esc(label)}</small></div>
    </div>`;
  const statCard = (label, value, foot, iconName) => `
    <article class="card stat">
      <div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(iconName)}</span></div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-foot"><span>${esc(foot)}</span></div>
    </article>`;

  function followUpChip(job) {
    const kind = dueKind(job);
    if (!kind) return '';
    if (kind === 'overdue') return chip(`Overdue · ${fmtDate(job.followUp, true)}`, 'danger', 'clock');
    if (kind === 'today') return chip('Follow up today', 'warning', 'clock');
    return chip(`Follow up ${fmtDate(job.followUp, true)}`, kind === 'soon' ? 'warning' : 'accent', 'clock');
  }

  function matchesQuery(job, q) {
    return !q || [job.company, job.role, job.location, job.source, job.contactName, job.notes].join(' ').toLowerCase().includes(q);
  }

  function sortJobs(list) {
    const copy = list.slice();
    if (ui.sort === 'company') copy.sort((a, b) => a.company.localeCompare(b.company));
    else if (ui.sort === 'followup') copy.sort((a, b) => (a.followUp || '9999').localeCompare(b.followUp || '9999'));
    else copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return copy;
  }

  function jobCard(job) {
    const chips = [];
    const fu = followUpChip(job);
    if (fu) chips.push(fu);
    const next = nextInterview(job);
    if (next) chips.push(chip(`${next.type} · ${interviewLabel(next)}`, 'info', 'calendar'));
    if (job.status === 'archived' && job.archiveReason) chips.push(chip(job.archiveReason));
    const quick = isDue(job) ? `
      <div class="job-quick">
        <button type="button" class="btn sm soft" data-action="followup-done" data-id="${esc(job.id)}">${icon('check')}Done</button>
        <button type="button" class="btn sm" data-action="followup-snooze" data-id="${esc(job.id)}">${icon('clock')}Snooze 3 days</button>
      </div>` : '';
    return `
      <article class="job-card" draggable="true" tabindex="0" data-job="${esc(job.id)}" aria-label="${esc(job.company)}, ${esc(job.role)}">
        <div class="job-head">${avatar(job.company, 'sm')}<div><strong>${esc(job.company)}</strong><small>${esc(job.role)}</small></div></div>
        ${job.location ? `<div class="job-meta">${icon('building')}<span>${esc(job.location)}</span></div>` : ''}
        ${chips.length ? `<div class="job-chips">${chips.join('')}</div>` : ''}
        ${quick}
        <div class="job-foot"><span class="source">${esc(job.source)}</span><span>${esc(appliedLabel(job))}</span></div>
      </article>`;
  }

  function interviewItem(job, iv, { manage = false } = {}) {
    const d = parseISO(iv.date);
    const gcal = googleCalendarUrl({
      title: `${iv.type}: ${job.company} · ${job.role}`,
      date: iv.date,
      time: iv.time,
      details: [iv.interviewer && `Interviewer: ${iv.interviewer}`, iv.notes].filter(Boolean).join('\n'),
      location: job.location,
    });
    const toggleLabel = iv.done ? 'Mark as upcoming' : 'Mark as done';
    return `
      <li class="iv ${iv.done ? 'done' : ''}">
        <div class="iv-date"><span>${d.getDate()}</span>${d.toLocaleDateString('en-US', { month: 'short' })}</div>
        <div class="iv-main">
          <strong>${esc(iv.type)}${iv.time ? ` · ${esc(iv.time)}` : ''}${iv.done ? ' · done' : ''}</strong>
          <small>${esc(job.company)} · ${esc(job.role)}${iv.interviewer ? ` · ${esc(iv.interviewer)}` : ''}</small>
          ${iv.notes ? `<p>${esc(iv.notes)}</p>` : ''}
        </div>
        <div class="iv-actions">
          ${manage ? `<button type="button" class="icon-btn sm" data-interview-toggle="${esc(iv.id)}" aria-label="${toggleLabel}" title="${toggleLabel}">${icon('check')}</button>` : ''}
          ${iv.done ? '' : `<a class="icon-btn sm" href="${esc(gcal)}" target="_blank" rel="noopener noreferrer" aria-label="Add to Google Calendar" title="Add to Google Calendar">${icon('calendar')}</a>`}
          ${manage ? `<button type="button" class="icon-btn sm danger" data-interview-remove="${esc(iv.id)}" aria-label="Remove interview" title="Remove">${icon('trash')}</button>` : ''}
        </div>
      </li>`;
  }

  /* ---------- Sidebar & banner ---------- */
  function renderSidebar() {
    const m = metrics();
    document.title = m.due.length ? `(${m.due.length}) Hireboard` : 'Hireboard';
    $('#sidebar-due').innerHTML = `
      <div class="due-box">
        <strong>${m.due.length ? `${num(m.due.length)} follow-up${m.due.length === 1 ? '' : 's'} due` : 'No follow-ups due'}</strong>
        <small>${m.soon.length ? `${num(m.soon.length)} interview${m.soon.length === 1 ? '' : 's'} within two days` : 'Nothing urgent right now'}</small>
      </div>`;
  }

  function renderBanner(m) {
    const box = $('#due-banner');
    if (!m.due.length && !m.soon.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const parts = [];
    if (m.due.length) parts.push(`${num(m.due.length)} follow-up${m.due.length === 1 ? '' : 's'} due`);
    if (m.soon.length) parts.push(`${num(m.soon.length)} interview${m.soon.length === 1 ? '' : 's'} within two days`);
    box.hidden = false;
    box.innerHTML = `
      <span class="due-ico">${icon('bell')}</span>
      <div><strong>${esc(parts.join(' · '))}</strong><small>Mark follow-ups done or snooze them right on the card.</small></div>
      <button type="button" class="btn sm" data-action="show-due">Show due items</button>`;
  }

  /* ---------- Board ---------- */
  function syncCompanyFilter() {
    const select = $('#company-filter');
    const companies = [...new Set(db().jobs.map((j) => j.company))].sort((a, b) => a.localeCompare(b));
    if (ui.company !== 'all' && !companies.includes(ui.company)) ui.company = 'all';
    select.innerHTML = ['<option value="all">All companies</option>', ...companies.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)].join('');
    select.value = ui.company;
    $('#sort-by').value = ui.sort;
  }

  function renderBoard() {
    const m = metrics();
    syncCompanyFilter();
    const q = ui.query.trim().toLowerCase();
    $('#board-sub').textContent = `${num(m.active.length)} active · ${num(m.applied.length)} applications sent · ${num(m.offers.length)} offer${m.offers.length === 1 ? '' : 's'}`;
    $('#board-kpis').innerHTML = [
      kpi('briefcase', num(m.active.length), 'Active applications'),
      kpi('clock', num(m.due.length), 'Follow-ups due', m.due.length > 0),
      kpi('calendar', num(m.upcoming.length), 'Upcoming interviews'),
      kpi('star', num(m.offers.length), 'Offers received'),
    ].join('');
    renderBanner(m);
    $$('#board-filter [data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === ui.boardFilter));

    let jobs = db().jobs
      .filter((j) => ui.company === 'all' || j.company === ui.company)
      .filter((j) => matchesQuery(j, q));
    if (ui.boardFilter === 'due') jobs = jobs.filter(isDue);
    if (ui.boardFilter === 'interviews') {
      const ids = new Set(m.upcoming.map(({ job }) => job.id));
      jobs = jobs.filter((j) => ids.has(j.id));
    }
    jobs = sortJobs(jobs);

    $('#board').innerHTML = COLUMNS.map((col) => {
      const items = jobs.filter((j) => j.status === col.id);
      const empty = jobs.length ? 'Nothing here yet' : 'Drop applications here';
      return `
        <div class="column" data-status="${col.id}" style="--c:${col.color}">
          <div class="column-head">
            <span class="column-dot"></span>
            <strong>${esc(col.label)}</strong>
            <span class="column-count">${items.length}</span>
          </div>
          <div class="column-body">${items.map(jobCard).join('') || `<div class="column-empty">${empty}</div>`}</div>
        </div>`;
    }).join('');
  }

  /* ---------- List ---------- */
  function syncSourceFilter() {
    const select = $('#list-source');
    select.innerHTML = ['<option value="all">All sources</option>', ...SOURCES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)].join('');
    select.value = ui.listSource;
  }

  function listRow(job) {
    const next = nextInterview(job);
    return `
      <tr class="clickable" data-action="open-job" data-id="${esc(job.id)}">
        <td><div class="job-main">${avatar(job.company)}<div><strong>${esc(job.company)}</strong><small>${esc(job.role)}</small></div></div></td>
        <td>${statusBadge(job)}</td>
        <td>${job.appliedDate ? esc(fmtDate(job.appliedDate, true)) : '<span class="muted">Not yet</span>'}</td>
        <td>${followUpChip(job) || '<span class="muted">—</span>'}</td>
        <td class="hide-md">${next ? esc(`${next.type} · ${interviewLabel(next)}`) : '<span class="muted">—</span>'}</td>
        <td class="hide-md">${esc(job.source)}</td>
        <td class="actions">
          <button type="button" class="icon-btn sm" data-action="edit-job" data-id="${esc(job.id)}" aria-label="Edit application" title="Edit">${icon('edit')}</button>
          <button type="button" class="icon-btn sm danger" data-action="delete-job" data-id="${esc(job.id)}" aria-label="Delete application" title="Delete">${icon('trash')}</button>
        </td>
      </tr>`;
  }

  function renderList() {
    syncSourceFilter();
    const q = ui.query.trim().toLowerCase();
    const rows = sortJobs(db().jobs
      .filter((j) => ui.listFilter === 'all' || j.status === ui.listFilter)
      .filter((j) => ui.listSource === 'all' || j.source === ui.listSource)
      .filter((j) => matchesQuery(j, q)));
    $('#list-sub').textContent = `${num(db().jobs.length)} applications · ${num(rows.length)} shown`;
    $$('#list-filter [data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === ui.listFilter));
    $('#list-table').innerHTML = rows.length ? `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Company</th><th>Status</th><th>Applied</th><th>Follow-up</th><th class="hide-md">Next interview</th><th class="hide-md">Source</th><th class="actions"></th></tr>
          </thead>
          <tbody>${rows.map(listRow).join('')}</tbody>
        </table>
      </div>` : emptyState('briefcase', 'No applications match', 'Clear the filters, or add a new application.',
      `<button type="button" class="btn primary" data-action="new-job">${icon('plus')}Add application</button>`);
  }

  /* ---------- Insights ---------- */
  function renderInsights() {
    const m = metrics();
    const jobs = db().jobs;

    $('#ins-stats').innerHTML = [
      statCard('Applications sent', num(m.applied.length), `${num(jobs.length)} tracked in total`, 'briefcase'),
      statCard('Response rate', pct(m.responseRate), `${num(m.responded.length)} of ${num(m.applied.length)} heard back`, 'message'),
      statCard('Interview rate', pct(m.interviewRate), `${num(m.interviewed.length)} reached an interview`, 'target'),
      statCard('Days to first interview', m.avgDaysToInterview === null ? '—' : num(m.avgDaysToInterview, 1), 'Average, counted from applying', 'clock'),
    ].join('');

    const weekOf = (iso) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
    const thisWeek = weekOf(today());
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, (i - 7) * 7));
    const counts = weeks.map((w) => m.applied.filter((j) => weekOf(j.appliedDate) === w).length);
    $('#ins-weekly').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Applications per week</h3>
          <div class="card-sub">Last eight weeks, by the week you applied</div>
        </div>
      </div>
      ${barChart(weeks.map((w) => fmtDate(w, true)), [{ name: 'Applications', color: 'var(--accent)', values: counts }], { label: 'Applications per week', height: 230 })}`;

    const perStage = COLUMNS.map((c) => ({ c, n: jobs.filter((j) => j.status === c.id).length }));
    const maxN = Math.max(1, ...perStage.map((x) => x.n));
    $('#ins-funnel').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Where applications sit</h3>
          <div class="card-sub">Count by stage</div>
        </div>
      </div>
      <div class="stack">${perStage.map(({ c, n }) => hbar(c.label, n, maxN, num(n), c.color)).join('')}</div>`;

    const sourceRows = SOURCES
      .map((src) => {
        const ap = m.applied.filter((j) => j.source === src);
        const iv = ap.filter(hasInterview);
        const offers = ap.filter((j) => j.status === 'accepted');
        return { src, applied: ap.length, interviews: iv.length, offers: offers.length, rate: ap.length ? (iv.length / ap.length) * 100 : 0 };
      })
      .filter((r) => r.applied > 0)
      .sort((a, b) => b.rate - a.rate || b.applied - a.applied);
    $('#ins-sources').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Where your interviews come from</h3>
          <div class="card-sub">Interview rate by source, across applications you sent</div>
        </div>
      </div>
      ${sourceRows.length ? `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Source</th><th class="num">Applied</th><th class="num">Interviews</th><th class="num">Offers</th><th>Interview rate</th></tr></thead>
            <tbody>
              ${sourceRows.map((r) => `
                <tr>
                  <td><strong>${esc(r.src)}</strong></td>
                  <td class="num">${r.applied}</td>
                  <td class="num">${r.interviews}</td>
                  <td class="num">${r.offers}</td>
                  <td><div class="rate-bar"><div class="progress"><span style="width:${Math.min(100, r.rate).toFixed(1)}%"></span></div><strong class="num">${pct(r.rate, 0)}</strong></div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyState('chart', 'No applications sent yet', 'Move a card to Applied to start measuring your sources.')}`;

    const followUps = jobs
      .filter((j) => isActive(j) && j.followUp)
      .sort((a, b) => a.followUp.localeCompare(b.followUp))
      .slice(0, 8);
    $('#ins-followups').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Follow-ups</h3>
          <div class="card-sub">Reminders for open applications</div>
        </div>
      </div>
      ${followUps.length ? `
        <ul class="feed">
          ${followUps.map((j) => `
            <li>
              <span class="feed-icon ${isDue(j) ? 'note' : 'stage'}">${icon('clock')}</span>
              <div style="flex: 1; min-width: 0;">
                <p><strong>${esc(j.company)}</strong> · ${esc(j.role)}</p>
                <div class="row" style="margin-top: 7px; gap: 6px;">
                  ${followUpChip(j)}
                  ${isDue(j) ? `
                    <button type="button" class="btn sm soft" data-action="followup-done" data-id="${esc(j.id)}">${icon('check')}Done</button>
                    <button type="button" class="btn sm" data-action="followup-snooze" data-id="${esc(j.id)}">Snooze 3 days</button>` : ''}
                </div>
              </div>
            </li>`).join('')}
        </ul>` : emptyState('check', 'No follow-ups scheduled', 'Set a follow-up date on any application to get reminders here.')}`;

    const upcoming = m.upcoming.slice(0, 8);
    $('#ins-interviews').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Upcoming interviews</h3>
          <div class="card-sub">Add any of them to Google Calendar in one click</div>
        </div>
      </div>
      ${upcoming.length ? `<ul class="iv-list">${upcoming.map(({ job, iv }) => interviewItem(job, iv)).join('')}</ul>`
        : emptyState('calendar', 'No interviews scheduled', 'Log an interview from an application to see it here.')}`;
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const enabled = remindersOn();
    const supported = canNotify();
    const permission = supported ? Notification.permission : 'unsupported';
    let status;
    if (!supported) status = badge('Not supported in this browser', 'danger');
    else if (enabled && permission === 'granted') status = badge('On', 'success');
    else if (enabled) status = badge('Blocked in browser settings', 'warning');
    else status = badge('Off', '');

    $('#set-reminders').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Reminders</h3>
          <div class="card-sub">A notification when a follow-up is due or an interview is within two days</div>
        </div>
      </div>
      <div class="stack">
        <div class="setting-status">${status}<span class="muted small">Checked while Hireboard is open, every 30 minutes.</span></div>
        <div class="row">
          <button type="button" class="btn ${enabled ? '' : 'primary'}" data-action="toggle-reminders">${icon(enabled ? 'x' : 'bell')}${enabled ? 'Turn reminders off' : 'Turn reminders on'}</button>
          <button type="button" class="btn ghost" data-action="test-notification" ${enabled && permission === 'granted' ? '' : 'disabled'}>Send a test notification</button>
        </div>
      </div>`;

    const events = calendarEvents();
    $('#set-calendar').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Calendar</h3>
          <div class="card-sub">Follow-ups and upcoming interviews</div>
        </div>
      </div>
      <div class="stack">
        <p class="muted small" style="margin: 0;">Download one calendar file and open it in Google Calendar, Outlook or Apple Calendar. You can also add a single interview with one click from its card or its details.</p>
        <div class="mini-row">
          <div><strong>${num(events.length)} upcoming event${events.length === 1 ? '' : 's'}</strong><small>Open follow-ups and interviews not yet done</small></div>
          <button type="button" class="btn sm primary" data-action="export-ics" ${events.length ? '' : 'disabled'}>${icon('calendar')}Download .ics</button>
        </div>
      </div>`;

    $('#set-backup').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Backup & export</h3>
          <div class="card-sub">Your data stays in this browser until you export it</div>
        </div>
      </div>
      <div class="stack">
        <div class="mini-row">
          <div><strong>Export backup</strong><small>Everything as a JSON file, for restoring later</small></div>
          <button type="button" class="btn sm" data-action="export-json">${icon('download')}JSON</button>
        </div>
        <div class="mini-row">
          <div><strong>Import backup</strong><small>Replace the current applications with a backup file</small></div>
          <button type="button" class="btn sm" data-action="import-json">${icon('upload')}Import</button>
        </div>
        <div class="mini-row">
          <div><strong>Export spreadsheet</strong><small>All applications as CSV for Excel or Sheets</small></div>
          <button type="button" class="btn sm" data-action="export-csv">${icon('download')}CSV</button>
        </div>
      </div>`;

    $('#set-reset').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Start over</h3>
          <div class="card-sub">Restore the sample applications</div>
        </div>
      </div>
      <div class="mini-row">
        <div><strong>Restore demo data</strong><small>Replaces everything with the sample tracker</small></div>
        <button type="button" class="btn sm danger" data-action="reset-demo">${icon('refresh')}Reset</button>
      </div>`;
  }

  /* ---------- Application form ---------- */
  function openJobModal(existing = null) {
    const j = existing || {
      company: '', role: '', location: '', source: 'LinkedIn', status: 'new', salary: '', appliedDate: '',
      followUp: '', archiveReason: '', link: '', contactName: '', contactEmail: '', contactPhone: '', notes: '',
    };
    openModal({
      title: existing ? 'Edit application' : 'Add application',
      submitLabel: existing ? 'Save changes' : 'Add application',
      size: 'lg',
      body: [
        field('Company', input('company', j.company, 'required placeholder="e.g. Netflix"')),
        field('Role', input('role', j.role, 'required placeholder="e.g. Senior UI Engineer"')),
        field('Location', input('location', j.location, 'placeholder="City · Remote · Hybrid"')),
        field('Source', select('source', SOURCES, j.source)),
        field('Status', select('status', COLUMNS.map((c) => [c.id, c.label]), j.status)),
        field('Salary range', input('salary', j.salary, 'placeholder="e.g. $120k–$150k"')),
        field('Applied on', input('appliedDate', j.appliedDate, 'type="date"'), { hint: 'Filled in when the status moves past New' }),
        field('Follow up on', input('followUp', j.followUp, 'type="date"'), { hint: 'Shows a reminder on the card' }),
        field('Archive reason', select('archiveReason', [['', 'Not archived'], ...ARCHIVE_REASONS.map((r) => [r, r])], j.archiveReason)),
        field('Job posting link', input('link', j.link, 'type="url" placeholder="https://…"')),
        field('Contact name', input('contactName', j.contactName, 'placeholder="Recruiter or hiring manager"')),
        field('Contact email', input('contactEmail', j.contactEmail, 'type="email" placeholder="name@company.com"')),
        field('Contact phone', input('contactPhone', j.contactPhone, 'type="tel" placeholder="+1 …"')),
        field('Notes', textarea('notes', j.notes, 'placeholder="What stood out, questions to ask, salary notes…"'), { full: true }),
      ].join(''),
      onSubmit: (v) => {
        const company = v.company.trim();
        const role = v.role.trim();
        if (!company || !role) return 'Company and role are required.';
        const contactEmail = v.contactEmail.trim();
        if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return 'That contact email does not look right.';
        let link = v.link.trim();
        if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
        const status = v.status;
        const fields = {
          company,
          role,
          location: v.location.trim(),
          source: v.source,
          status,
          salary: v.salary.trim(),
          link,
          appliedDate: v.appliedDate || (status === 'new' ? '' : today()),
          followUp: v.followUp || '',
          archiveReason: status === 'archived' ? v.archiveReason : '',
          contactName: v.contactName.trim(),
          contactEmail,
          contactPhone: v.contactPhone.trim(),
          notes: v.notes.trim(),
          updatedAt: today(),
        };
        store.update((s) => {
          if (existing) {
            const job = s.jobs.find((x) => x.id === existing.id);
            const prevStatus = job.status;
            const prevFollow = job.followUp;
            Object.assign(job, fields);
            if (prevStatus !== fields.status) logTo(job, `Moved from ${statusName(prevStatus)} to ${statusName(fields.status)}`);
            if (prevFollow !== fields.followUp) logTo(job, fields.followUp ? `Follow-up set for ${fmtDate(fields.followUp)}` : 'Follow-up cleared');
            if (prevStatus === fields.status && prevFollow === fields.followUp) logTo(job, 'Details updated');
          } else {
            const job = normalizeJob({ ...fields, createdAt: today(), interviews: [], activity: [] });
            s.jobs.push(job);
            logTo(job, 'Added to the board');
          }
        });
        toast(existing ? 'Application updated' : 'Application added');
        render();
      },
    });
  }

  /* ---------- Application details (timeline, interviews, follow-up, contact) ---------- */
  function openJobDetail(id) {
    const paint = (body) => {
      const job = findJob(id);
      if (!job) return;
      const interviews = job.interviews.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const timeline = job.activity.slice().sort((a, b) => b.at.localeCompare(a.at));
      const active = isActive(job);
      const followGcal = job.followUp ? googleCalendarUrl({
        title: `Follow up: ${job.company} · ${job.role}`,
        date: job.followUp,
        details: `Check in on your application at ${job.company}.`,
      }) : '';
      const contact = job.contactName || job.contactEmail || job.contactPhone
        ? `
          <div class="mini-row">
            <div>
              <strong>${esc(job.contactName || 'Contact')}</strong>
              <small>${[job.contactEmail, job.contactPhone].filter(Boolean).map(esc).join(' · ')}</small>
            </div>
            <div class="row" style="gap: 6px;">
              ${job.contactEmail ? `<a class="icon-btn sm" href="mailto:${esc(job.contactEmail)}" aria-label="Email contact" title="Email">${icon('mail')}</a>` : ''}
              ${job.contactPhone ? `<a class="icon-btn sm" href="tel:${esc(job.contactPhone.replace(/\s+/g, ''))}" aria-label="Call contact" title="Call">${icon('phone')}</a>` : ''}
            </div>
          </div>`
        : '<p class="muted small" style="margin: 0;">No contact yet. Add one with Edit details.</p>';

      body.innerHTML = `
        <div class="full job-hero">
          ${avatar(job.company, 'lg')}
          <div><h3>${esc(job.company)}</h3><div class="muted">${esc(job.role)}</div></div>
          <div class="spacer"></div>
          <button type="button" class="btn sm" data-edit>${icon('edit')}Edit details</button>
        </div>

        <div class="full status-row">
          <span class="muted small">Status</span>
          <select class="input" data-status-select aria-label="Status">
            ${COLUMNS.map((c) => `<option value="${c.id}"${c.id === job.status ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
          ${statusBadge(job)}
        </div>

        <dl class="detail-grid full">
          <div><dt>Location</dt><dd>${esc(job.location || '—')}</dd></div>
          <div><dt>Source</dt><dd>${esc(job.source)}</dd></div>
          <div><dt>Salary</dt><dd>${esc(job.salary || '—')}</dd></div>
          <div><dt>Applied</dt><dd>${job.appliedDate ? `${esc(fmtDate(job.appliedDate))} · ${esc(relativeDays(job.appliedDate))}` : 'Not yet'}</dd></div>
          <div><dt>Posting</dt><dd>${job.link ? `<a class="job-link" href="${esc(job.link)}" target="_blank" rel="noopener noreferrer">Open posting</a>` : '—'}</dd></div>
          <div><dt>Archive reason</dt><dd>${esc(job.archiveReason || '—')}</dd></div>
        </dl>

        ${active ? `
          <div class="full panel">
            <div class="panel-head">
              <div><strong>Follow-up</strong><small>${job.followUp ? `Reminder for ${esc(fmtDate(job.followUp))}` : 'No reminder set yet'}</small></div>
              ${followUpChip(job)}
            </div>
            ${job.followUp ? `
              <div class="panel-row">
                <button type="button" class="btn sm soft" data-followup-done>${icon('check')}Mark done</button>
                <button type="button" class="btn sm" data-followup-snooze>${icon('clock')}Snooze 3 days</button>
                <a class="btn sm ghost" href="${esc(followGcal)}" target="_blank" rel="noopener noreferrer">${icon('calendar')}Add to Google Calendar</a>
              </div>` : `
              <div class="panel-row">
                <input class="input" type="date" id="fu-date" value="${addDays(today(), 7)}" aria-label="Follow-up date">
                <button type="button" class="btn sm primary" data-followup-set>Set follow-up</button>
              </div>`}
          </div>` : ''}

        <div class="modal-section-title">Contact</div>
        <div class="full">${contact}</div>

        <div class="modal-section-title">Interviews (${interviews.length})</div>
        <div class="full">
          ${interviews.length ? `<ul class="iv-list">${interviews.map((iv) => interviewItem(job, iv, { manage: true })).join('')}</ul>` : '<p class="muted small" style="margin: 0;">No interviews logged yet.</p>'}
        </div>
        <div class="full iv-form">
          <label class="field"><span>Date</span><input class="input" type="date" id="iv-date" value="${today()}"></label>
          <label class="field"><span>Time</span><input class="input" type="time" id="iv-time"></label>
          <label class="field"><span>Type</span>
            <select class="input" id="iv-type">${INTERVIEW_TYPES.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
          </label>
          <label class="field full"><span>Interviewer</span><input class="input" id="iv-who" placeholder="Name or role"></label>
          <label class="field full"><span>Notes</span><input class="input" id="iv-notes" placeholder="Topics covered, how it went, next steps"></label>
          <div class="full" style="display: flex; justify-content: flex-end;">
            <button type="button" class="btn primary" data-interview-add>${icon('plus')}Add interview</button>
          </div>
        </div>

        <div class="modal-section-title">Notes</div>
        <div class="full">
          ${job.notes ? `<div class="notes-block">${esc(job.notes)}</div>` : '<p class="muted small" style="margin: 0;">No notes yet. Add some with Edit details.</p>'}
        </div>

        <div class="modal-section-title">Activity</div>
        <div class="full row" style="flex-wrap: nowrap;">
          <input class="input" id="activity-note" placeholder="Add a note to the timeline…" aria-label="Note">
          <button type="button" class="btn sm" data-note-add>Add note</button>
        </div>
        <ol class="timeline full">
          ${timeline.map((a) => `<li><strong>${esc(a.text)}</strong><small>${esc(fmtStamp(a.at))}</small></li>`).join('') || '<li class="muted">No activity yet.</li>'}
        </ol>`;
    };

    openModal({
      title: 'Application details',
      size: 'lg',
      submitLabel: 'Done',
      body: '',
      footerLeft: '<button type="button" class="btn danger" data-extra="delete">Delete</button>',
      onMount: ({ form, close, body }) => {
        paint(body);
        form.querySelector('[data-extra="delete"]').addEventListener('click', () => { close(); deleteJob(id); });

        body.addEventListener('change', (e) => {
          const select = e.target.closest('[data-status-select]');
          if (select) {
            moveJob(id, select.value);
            paint(body);
          }
        });

        body.addEventListener('click', (e) => {
          const hit = (sel) => e.target.closest(sel);
          if (hit('[data-edit]')) { close(); openJobModal(findJob(id)); return; }
          if (hit('[data-followup-done]')) { followUpDone(id); paint(body); return; }
          if (hit('[data-followup-snooze]')) { snoozeFollowUp(id, 3); paint(body); return; }
          if (hit('[data-followup-set]')) {
            const date = body.querySelector('#fu-date').value;
            if (!date) { toast('Pick a date first.', 'warning'); return; }
            setFollowUp(id, date);
            paint(body);
            return;
          }
          if (hit('[data-interview-add]')) {
            const data = {
              date: body.querySelector('#iv-date').value,
              time: body.querySelector('#iv-time').value,
              type: body.querySelector('#iv-type').value,
              interviewer: body.querySelector('#iv-who').value.trim(),
              notes: body.querySelector('#iv-notes').value.trim(),
            };
            if (addInterview(id, data)) paint(body);
            return;
          }
          if (hit('[data-note-add]')) {
            const text = body.querySelector('#activity-note').value.trim();
            if (!text) { toast('Write a note first.', 'warning'); return; }
            addNote(id, text);
            paint(body);
            return;
          }
          const toggle = hit('[data-interview-toggle]');
          if (toggle) { toggleInterview(id, toggle.dataset.interviewToggle); paint(body); return; }
          const remove = hit('[data-interview-remove]');
          if (remove) { removeInterview(id, remove.dataset.interviewRemove); paint(body); }
        });
      },
      onSubmit: () => render(),
      onDismiss: () => render(),
    });
  }

  /* ---------- Backup & reset ---------- */
  function exportCsv() {
    downloadFile('hireboard-applications.csv', toCSV(db().jobs, [
      { key: 'company', label: 'Company' },
      { key: 'role', label: 'Role' },
      { label: 'Status', value: (j) => (j.status === 'archived' && j.archiveReason ? `Archived (${j.archiveReason})` : statusName(j.status)) },
      { key: 'appliedDate', label: 'Applied' },
      { key: 'followUp', label: 'Follow-up' },
      { key: 'location', label: 'Location' },
      { key: 'source', label: 'Source' },
      { key: 'salary', label: 'Salary' },
      { key: 'contactName', label: 'Contact' },
      { key: 'contactEmail', label: 'Contact email' },
      { key: 'link', label: 'Link' },
      { label: 'Interviews', value: (j) => j.interviews.length },
      { key: 'notes', label: 'Notes' },
    ]));
    toast('Applications exported');
  }

  function exportJson() {
    const payload = { app: 'hireboard', version: 2, exportedAt: new Date().toISOString(), jobs: db().jobs };
    downloadFile('hireboard-backup.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded');
  }

  function exportIcs() {
    const events = calendarEvents();
    if (!events.length) { toast('Nothing upcoming to export.', 'warning'); return; }
    downloadFile('hireboard-calendar.ics', calendarFile(events), 'text/calendar');
    toast(`Calendar file with ${events.length} event${events.length === 1 ? '' : 's'} downloaded`);
  }

  async function importFile(file) {
    try {
      const json = JSON.parse(await file.text());
      if (!json || !Array.isArray(json.jobs)) throw new Error('That file is not a Hireboard backup.');
      const ok = await confirmDialog({
        title: 'Replace your applications?',
        message: `This replaces the ${db().jobs.length} current applications with ${json.jobs.length} from the backup.`,
        confirmLabel: 'Import backup',
      });
      if (!ok) return;
      store.update((s) => { s.jobs = json.jobs.map(normalizeJob); });
      toast('Backup imported');
      render();
    } catch (err) {
      toast(err.message || 'Could not read that file.', 'error');
    }
  }

  async function resetDemo() {
    const ok = await confirmDialog({
      title: 'Restore demo data?',
      message: 'This replaces every application with the sample tracker.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    store.reset();
    toast('Demo data restored');
    render();
  }

  /* ---------- Rendering dispatch ---------- */
  function render() {
    renderSidebar();
    if (ui.view === 'board') renderBoard();
    if (ui.view === 'list') renderList();
    if (ui.view === 'insights') renderInsights();
    if (ui.view === 'settings') renderSettings();
  }

  /* ---------- Events ---------- */
  function handleAction(action, id) {
    switch (action) {
      case 'new-job': return openJobModal();
      case 'open-job': return openJobDetail(id);
      case 'edit-job': return openJobModal(findJob(id));
      case 'delete-job': return deleteJob(id);
      case 'followup-done': return followUpDone(id);
      case 'followup-snooze': return snoozeFollowUp(id, 3);
      case 'show-due':
        ui.boardFilter = 'due';
        if (ui.view !== 'board') location.hash = 'board';
        else renderBoard();
        return undefined;
      case 'export-csv': return exportCsv();
      case 'export-json': return exportJson();
      case 'export-ics': return exportIcs();
      case 'import-json': return $('#import-file').click();
      case 'toggle-reminders': return toggleReminders();
      case 'test-notification': return sendTestNotification();
      case 'reset-demo': return resetDemo();
      default: return undefined;
    }
  }

  document.addEventListener('click', (e) => {
    const boardFilter = e.target.closest('#board-filter [data-filter]');
    if (boardFilter) {
      ui.boardFilter = boardFilter.dataset.filter;
      renderBoard();
      return;
    }
    const listFilter = e.target.closest('#list-filter [data-filter]');
    if (listFilter) {
      ui.listFilter = listFilter.dataset.filter;
      renderList();
      return;
    }
    const action = e.target.closest('[data-action]');
    if (action) {
      handleAction(action.dataset.action, action.dataset.id);
      return;
    }
    const card = e.target.closest('.job-card');
    if (card) openJobDetail(card.dataset.job);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('job-card')) {
      openJobDetail(e.target.dataset.job);
      return;
    }
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.querySelector('.modal-backdrop')) return;
      e.preventDefault();
      openJobModal();
    }
  });

  /* Drag and drop between Kanban columns */
  const board = $('#board');
  let dragging = null;
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.job-card');
    if (!card) return;
    dragging = card.dataset.job;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging);
    card.classList.add('dragging');
  });
  board.addEventListener('dragend', (e) => {
    const card = e.target.closest('.job-card');
    if (card) card.classList.remove('dragging');
    $$('.column.drop-over').forEach((c) => c.classList.remove('drop-over'));
    dragging = null;
  });
  board.addEventListener('dragover', (e) => {
    const column = e.target.closest('.column');
    if (!column || !dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drop-over');
  });
  board.addEventListener('dragleave', (e) => {
    const column = e.target.closest('.column');
    if (column && !column.contains(e.relatedTarget)) column.classList.remove('drop-over');
  });
  board.addEventListener('drop', (e) => {
    const column = e.target.closest('.column');
    if (!column) return;
    e.preventDefault();
    column.classList.remove('drop-over');
    const id = e.dataTransfer.getData('text/plain') || dragging;
    if (id) moveJob(id, column.dataset.status);
  });

  /* ---------- Boot ---------- */
  initTheme({ button: $('[data-theme-toggle]') });
  initShell();

  $('#company-filter').addEventListener('change', (e) => {
    ui.company = e.target.value;
    renderBoard();
  });
  $('#sort-by').addEventListener('change', (e) => {
    ui.sort = e.target.value;
    render();
  });
  $('#list-source').addEventListener('change', (e) => {
    ui.listSource = e.target.value;
    renderList();
  });
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importFile(file);
  });

  const search = $('#global-search');
  search.addEventListener('input', (e) => {
    ui.query = e.target.value;
    if (ui.view === 'board' || ui.view === 'list') render();
    else router.go('list');
  });

  const router = initRouter(['board', 'list', 'insights', 'settings'], (view) => {
    ui.view = view;
    render();
  });

  checkReminders();
  setInterval(checkReminders, 30 * 60 * 1000);
});
