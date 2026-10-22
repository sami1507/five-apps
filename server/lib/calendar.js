'use strict';

const { addDays, pad } = require('./util');

/** Escapes text for an iCalendar property value (RFC 5545 section 3.3.11). */
function icsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets, as the standard requires. */
function fold(line) {
  const parts = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut -= 1;
    parts.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

const compact = (iso) => iso.replace(/-/g, '');
const compactTime = (time) => `${time.replace(':', '')}00`;

function endTime(time) {
  const [h, m] = time.split(':').map(Number);
  return `${pad((h + 1) % 24)}:${pad(m)}`;
}

/** All-day events when there is no time; otherwise a one-hour event starting at `time`. */
function eventRange(date, time) {
  if (time) {
    return {
      allDay: false,
      start: `${compact(date)}T${compactTime(time)}`,
      end: `${compact(date)}T${compactTime(endTime(time))}`,
    };
  }
  return { allDay: true, start: compact(date), end: compact(addDays(date, 1)) };
}

function utcStamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function eventLines(event, now) {
  const { allDay, start, end } = eventRange(event.date, event.time);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@hireboard`,
    `DTSTAMP:${utcStamp(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${icsText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
  lines.push('END:VEVENT');
  return lines;
}

/** Builds a complete VCALENDAR document from { id, title, date, time?, description?, location? } events. */
function buildCalendar(events, { now = new Date(), name = 'Hireboard' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hireboard//Job tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    ...events.flatMap((event) => eventLines(event, now)),
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

module.exports = { buildCalendar, icsText, fold, eventRange };
