'use strict';

const { S } = require('../schema');
const { buildCalendar } = require('../lib/calendar');
const { dayKey, daysBetween } = require('../lib/util');

const STATUSES = ['new', 'applied', 'interview', 'accepted', 'archived'];
const ACTIVE = ['new', 'applied', 'interview'];
const SOURCES = ['LinkedIn', 'Referral', 'Company website', 'Job board', 'Recruiter', 'Event', 'Other'];
const ARCHIVE_REASONS = ['', 'Rejected', 'Withdrawn', 'Ghosted', 'Closed'];

const interview = S.record({
  id: S.id,
  date: S.date,
  time: S.time,
  type: S.text(1, 40),
  interviewer: S.text(0, 120),
  notes: S.text(0, 1000),
  done: S.boolean,
});

const activity = S.record({
  id: S.id,
  at: S.datetime,
  text: S.text(1, 500),
});

const job = S.record({
  id: S.id,
  company: S.text(1, 120),
  role: S.text(0, 160),
  location: S.text(0, 160),
  source: S.enum(SOURCES),
  salary: S.text(0, 80),
  link: S.text(0, 500),
  status: S.enum(STATUSES),
  archiveReason: S.enum(ARCHIVE_REASONS),
  appliedDate: S.date,
  followUp: S.date,
  notes: S.text(0, 4000),
  contactName: S.text(0, 120),
  contactEmail: S.email,
  contactPhone: S.text(0, 40),
  interviews: S.list(interview, 100),
  activity: S.list(activity, 500),
  createdAt: S.date,
  updatedAt: S.date,
});

/** Days until a follow-up is due: negative when overdue. Null for closed applications. */
function followUpIn(job, today) {
  if (!ACTIVE.includes(job.status) || !job.followUp) return null;
  return daysBetween(today, job.followUp);
}

function upcomingInterviews(jobs, today) {
  return jobs
    .flatMap((j) => j.interviews.filter((iv) => !iv.done && iv.date >= today).map((iv) => ({ job: j, iv })))
    .sort((a, b) => (a.iv.date + a.iv.time).localeCompare(b.iv.date + b.iv.time));
}

module.exports = {
  key: 'job-tracker',
  name: 'Hireboard',
  description: 'Job application tracker with interviews, follow-up reminders, activity history and calendar export.',
  schema: {
    collections: {
      jobs: S.list(job, 5000),
    },
    settings: {},
  },

  invariants(doc) {
    const problems = [];
    doc.jobs.forEach((j, i) => {
      j.interviews.forEach((iv, k) => {
        if (!iv.date) problems.push({ path: `jobs[${i}].interviews[${k}].date`, message: 'is required' });
      });
    });
    return problems;
  },

  summary(doc, now) {
    const today = dayKey(now);
    const active = doc.jobs.filter((j) => ACTIVE.includes(j.status));
    const applied = doc.jobs.filter((j) => j.appliedDate);
    const interviewed = applied.filter((j) => j.interviews.length || j.status === 'interview' || j.status === 'accepted');
    const responded = applied.filter((j) => interviewed.includes(j) || (j.status === 'archived' && j.archiveReason === 'Rejected'));
    const due = active.filter((j) => {
      const days = followUpIn(j, today);
      return days !== null && days <= 3;
    });
    const upcoming = upcomingInterviews(doc.jobs, today);
    return {
      asOf: today,
      applications: doc.jobs.length,
      active: active.length,
      applied: applied.length,
      offers: doc.jobs.filter((j) => j.status === 'accepted').length,
      followUpsDue: due.length,
      overdueFollowUps: active.filter((j) => (followUpIn(j, today) ?? 0) < 0).length,
      upcomingInterviews: upcoming.length,
      interviewRate: applied.length ? Math.round((interviewed.length / applied.length) * 1000) / 10 : 0,
      responseRate: applied.length ? Math.round((responded.length / applied.length) * 1000) / 10 : 0,
    };
  },

  routes: {
    /** Calendar feed: follow-ups of active applications and interviews not yet completed. */
    'calendar.ics': (doc, { now }) => {
      const today = dayKey(now);
      const followUps = doc.jobs
        .filter((j) => ACTIVE.includes(j.status) && j.followUp)
        .map((j) => ({
          id: `followup-${j.id}`,
          title: `Follow up: ${j.company} · ${j.role}`,
          date: j.followUp,
          description: j.contactName ? `Contact: ${j.contactName}` : 'Check in on your application.',
        }));
      const interviews = upcomingInterviews(doc.jobs, today).map(({ job: j, iv }) => ({
        id: `interview-${iv.id}`,
        title: `${iv.type}: ${j.company} · ${j.role}`,
        date: iv.date,
        time: iv.time,
        description: [iv.interviewer && `Interviewer: ${iv.interviewer}`, iv.notes].filter(Boolean).join('\n'),
        location: j.location,
      }));
      return {
        contentType: 'text/calendar; charset=utf-8',
        filename: 'hireboard-calendar.ics',
        body: buildCalendar([...followUps, ...interviews], { now, name: 'Hireboard applications' }),
      };
    },
  },

};
