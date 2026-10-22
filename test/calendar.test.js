'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCalendar, icsText, fold, eventRange } = require('../server/lib/calendar');

const NOW = new Date('2026-10-16T08:00:00Z');

test('escapes commas, semicolons, backslashes and line breaks in text', () => {
  assert.equal(icsText('a,b;c\\d'), 'a\\,b\\;c\\\\d');
  assert.equal(icsText('line one\nline two'), 'line one\\nline two');
  assert.equal(icsText(undefined), '');
});

test('folds long lines at 75 octets and keeps multi-byte characters whole', () => {
  const long = `SUMMARY:${'é'.repeat(60)}`;
  const folded = fold(long).split('\r\n');
  assert.ok(folded.length > 1);
  folded.forEach((line, i) => {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line ${i} is too long`);
    if (i > 0) assert.ok(line.startsWith(' '), 'continuation lines start with a space');
  });
  assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(''), long);
});

test('all-day events use DATE values and end the day after', () => {
  const range = eventRange('2026-10-25', '');
  assert.equal(range.allDay, true);
  assert.equal(range.start, '20261025');
  assert.equal(range.end, '20261026');
});

test('timed events run for one hour from their start time', () => {
  const range = eventRange('2026-10-25', '14:30');
  assert.equal(range.allDay, false);
  assert.equal(range.start, '20261025T143000');
  assert.equal(range.end, '20261025T153000');
});

test('builds a complete calendar with stable UIDs and a UTC stamp', () => {
  const ics = buildCalendar([
    { id: 'followup-j1', title: 'Follow up: Netflix', date: '2026-10-20', description: 'Contact: Maya' },
    { id: 'interview-i1', title: 'Technical: Netflix', date: '2026-10-25', time: '14:00', location: 'Los Gatos, CA' },
  ], { now: NOW });

  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.equal(lines.at(-1), '');
  assert.ok(lines.includes('UID:followup-j1@hireboard'));
  assert.ok(lines.includes('DTSTAMP:20261016T080000Z'));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261020'));
  assert.ok(lines.includes('DTSTART:20261025T140000'));
  assert.ok(lines.includes('LOCATION:Los Gatos, CA'.replace(',', '\\,')));
  assert.equal(lines.filter((l) => l === 'BEGIN:VEVENT').length, 2);
  assert.equal(lines.filter((l) => l === 'END:VEVENT').length, 2);
});

test('an empty calendar is still a valid calendar file', () => {
  const ics = buildCalendar([], { now: NOW });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
});
