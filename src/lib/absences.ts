import { Activity, ClassSession, StudentAbsence } from '../types';

const DAY_RULES: Array<{ regex: RegExp; dayIndex: number }> = [
  { regex: /\b(domingos?|dom|sunday|sun)\b/i, dayIndex: 0 },
  { regex: /\b(lunes|luns|lun|monday|mon)\b/i, dayIndex: 1 },
  { regex: /\b(martes|mar|tuesday|tue)\b/i, dayIndex: 2 },
  { regex: /\b(mi[eé]rcoles|m[eé]rcores|mi[eé]|mie|wednesday|wed)\b/i, dayIndex: 3 },
  { regex: /\b(jueves|xoves|jue|thursday|thu)\b/i, dayIndex: 4 },
  { regex: /\b(viernes|venres|vie|friday|fri)\b/i, dayIndex: 5 },
  { regex: /\b(s[aá]bados?|sabados?|s[aá]b|sab|saturday|sat)\b/i, dayIndex: 6 }
];

export interface SessionDateOption {
  dateStr: string;
  dateLine: string;
  timeLine: string;
  isPast: boolean;
  isToday: boolean;
  isScheduled: boolean;
  hasRecordedSession: boolean;
  isClosed: boolean;
}

export function extractTimeRange(scheduleItem: string): string {
  const timeMatch = scheduleItem.match(
    /\d{1,2}:\d{2}(?:\s*(?:-|–|—|\ba\b)\s*\d{1,2}:\d{2})?/i
  );
  if (timeMatch) return timeMatch[0];
  return scheduleItem.trim();
}

export function formatIsoDateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseIsoDateLocal(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const date = new Date(y, m, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function getActivityMatchedDayScheduleMap(activity: Activity | undefined): Map<number, string> {
  const matchedDayToSchedule = new Map<number, string>();
  if (!activity?.schedule) return matchedDayToSchedule;
  for (const item of activity.schedule) {
    for (const rule of DAY_RULES) {
      if (rule.regex.test(item) && !matchedDayToSchedule.has(rule.dayIndex)) {
        matchedDayToSchedule.set(rule.dayIndex, item);
      }
    }
  }
  return matchedDayToSchedule;
}

export function isDateInActivitySchedule(
  activity: Activity | undefined,
  sessionDate: string
): boolean {
  if (!activity) return false;
  const parsed = parseIsoDateLocal(sessionDate);
  if (!parsed) return false;
  const dayMap = getActivityMatchedDayScheduleMap(activity);
  return dayMap.has(parsed.getDay());
}

export function getActivitySessionDates(params: {
  activity: Activity;
  startDateCandidates: Array<string | undefined>;
  recordedSessions: Array<{ date: string; isClosed?: boolean }>;
  dayNamesShort: string[];
  todayStr: string;
  pastDays?: number;
  futureDays?: number;
}): SessionDateOption[] {
  const {
    activity,
    startDateCandidates,
    recordedSessions,
    dayNamesShort,
    todayStr,
    pastDays = 30,
    futureDays = 28
  } = params;

  const matchedDayToSchedule = getActivityMatchedDayScheduleMap(activity);
  const recordedDatesSet = new Set(
    recordedSessions.map(s => (s.date || '').slice(0, 10)).filter(Boolean)
  );
  const closedDatesSet = new Set(
    recordedSessions
      .filter(s => Boolean(s.isClosed))
      .map(s => (s.date || '').slice(0, 10))
      .filter(Boolean)
  );

  const todayDate = parseIsoDateLocal(todayStr) || new Date();
  const minAllowedPast = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate() - 365
  );
  const defaultStart = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate() - pastDays
  );

  const validCandidateDates = startDateCandidates
    .map(s => (s ? parseIsoDateLocal(s) : null))
    .filter((d): d is Date => d !== null)
    .filter(d => d <= todayDate);

  let startDate = defaultStart;
  if (validCandidateDates.length > 0) {
    validCandidateDates.sort((a, b) => a.getTime() - b.getTime());
    startDate = validCandidateDates[0];
  }
  if (startDate < minAllowedPast) {
    startDate = minAllowedPast;
  }

  const endDate = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate() + futureDays
  );

  const optionByDate = new Map<string, SessionDateOption>();

  if (matchedDayToSchedule.size > 0) {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    while (cursor <= endDate) {
      const dayIdx = cursor.getDay();
      const sched = matchedDayToSchedule.get(dayIdx);
      if (sched) {
        const dateStr = formatIsoDateLocal(cursor);
        const dd = String(cursor.getDate()).padStart(2, '0');
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dayShort = dayNamesShort[dayIdx] || '';
        optionByDate.set(dateStr, {
          dateStr,
          dateLine: dayShort ? `${dd}/${mm} · ${dayShort}` : `${dd}/${mm}`,
          timeLine: extractTimeRange(sched),
          isPast: dateStr < todayStr,
          isToday: dateStr === todayStr,
          isScheduled: true,
          hasRecordedSession: recordedDatesSet.has(dateStr),
          isClosed: closedDatesSet.has(dateStr)
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const sess of recordedSessions) {
    const cleanDate = (sess.date || '').slice(0, 10);
    const parsed = parseIsoDateLocal(cleanDate);
    if (!parsed || parsed < minAllowedPast || parsed > endDate) continue;
    if (!optionByDate.has(cleanDate)) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dayIdx = parsed.getDay();
      const dayShort = dayNamesShort[dayIdx] || '';
      const sched = matchedDayToSchedule.get(dayIdx) || activity.schedule[0] || '';
      optionByDate.set(cleanDate, {
        dateStr: cleanDate,
        dateLine: dayShort ? `${dd}/${mm} · ${dayShort}` : `${dd}/${mm}`,
        timeLine: sched ? extractTimeRange(sched) : activity.room || '',
        isPast: cleanDate < todayStr,
        isToday: cleanDate === todayStr,
        isScheduled: matchedDayToSchedule.has(dayIdx),
        hasRecordedSession: true,
        isClosed: closedDatesSet.has(cleanDate)
      });
    }
  }

  return Array.from(optionByDate.values()).sort((a, b) =>
    a.dateStr.localeCompare(b.dateStr)
  );
}

export function findNearestUpcomingClassDate(
  options: SessionDateOption[],
  todayStr: string
): string {
  const upcoming = options.find(opt => opt.dateStr >= todayStr);
  if (upcoming) return upcoming.dateStr;
  if (options.length > 0) return options[options.length - 1].dateStr;
  return todayStr;
}

export function findSessionForActivityDate(
  sessions: ClassSession[],
  activityId?: string | null,
  sessionDate?: string | null
): ClassSession | undefined {
  if (!activityId || !sessionDate) return undefined;
  return sessions.find(
    s => s.activityId === activityId && s.date?.slice(0, 10) === sessionDate.slice(0, 10)
  );
}

export function isClassSessionClosed(
  sessions: ClassSession[],
  activityId?: string | null,
  sessionDate?: string | null
): boolean {
  const session = findSessionForActivityDate(sessions, activityId, sessionDate);
  return Boolean(session?.isClosed);
}

export function getScheduleEndMinutesForDate(
  activity: Activity | undefined,
  sessionDate: string
): number | null {
  if (!activity || !activity.schedule || activity.schedule.length === 0) return null;
  const parsed = parseIsoDateLocal(sessionDate);
  if (!parsed) return null;
  const dayIndex = parsed.getDay();

  const matchingSchedules = activity.schedule.filter(item =>
    DAY_RULES.some(rule => rule.dayIndex === dayIndex && rule.regex.test(item))
  );
  const candidates = matchingSchedules.length > 0 ? matchingSchedules : activity.schedule;

  let latestEndMinutes: number | null = null;
  for (const entry of candidates) {
    const rangeMatch = entry.match(/(\d{1,2}):(\d{2})\s*(?:-|–|—|\ba\b)\s*(\d{1,2}):(\d{2})/i);
    if (rangeMatch) {
      const endMin = Number(rangeMatch[3]) * 60 + Number(rangeMatch[4]);
      if (latestEndMinutes === null || endMin > latestEndMinutes) {
        latestEndMinutes = endMin;
      }
      continue;
    }
    const singleMatch = entry.match(/(\d{1,2}):(\d{2})/);
    if (singleMatch) {
      const startMin = Number(singleMatch[1]) * 60 + Number(singleMatch[2]);
      const estimatedEndMin = startMin + 75;
      if (latestEndMinutes === null || estimatedEndMin > latestEndMinutes) {
        latestEndMinutes = estimatedEndMin;
      }
    }
  }

  return latestEndMinutes;
}

export function getScheduleDurationMinutesForDate(
  activity: Activity | undefined,
  sessionDate: string
): number {
  if (!activity || !activity.schedule || activity.schedule.length === 0) return 75;
  const parsed = parseIsoDateLocal(sessionDate);
  if (!parsed) return 75;
  const dayIndex = parsed.getDay();

  const matchingSchedules = activity.schedule.filter(item =>
    DAY_RULES.some(rule => rule.dayIndex === dayIndex && rule.regex.test(item))
  );
  const candidates = matchingSchedules.length > 0 ? matchingSchedules : activity.schedule;

  for (const entry of candidates) {
    const rangeMatch = entry.match(/(\d{1,2}):(\d{2})\s*(?:-|–|—|\ba\b)\s*(\d{1,2}):(\d{2})/i);
    if (rangeMatch) {
      const startMin = Number(rangeMatch[1]) * 60 + Number(rangeMatch[2]);
      const endMin = Number(rangeMatch[3]) * 60 + Number(rangeMatch[4]);
      const diff = endMin - startMin;
      if (diff >= 15 && diff <= 480) {
        return diff;
      }
    }
  }

  return 75;
}

export function isClassSessionPast(
  activity: Activity | undefined,
  sessionDate: string,
  now: Date = new Date()
): boolean {
  const cleanDate = (sessionDate || '').trim().slice(0, 10);
  if (!cleanDate) return false;
  const todayStr = formatIsoDateLocal(now);

  if (cleanDate < todayStr) return true;
  if (cleanDate > todayStr) return false;

  // For today's date, check if the scheduled class time has already passed
  const endMinutes = getScheduleEndMinutesForDate(activity, cleanDate);
  if (endMinutes === null) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= endMinutes;
}

export function isClassSessionClosedOrPast(params: {
  activity?: Activity;
  activityId?: string;
  sessionDate: string;
  sessions: ClassSession[];
  now?: Date;
}): boolean {
  const targetActivityId = params.activity?.id || params.activityId;
  if (isClassSessionClosed(params.sessions, targetActivityId, params.sessionDate)) {
    return true;
  }
  return isClassSessionPast(params.activity, params.sessionDate, params.now);
}

export function canStudentCancelAbsence(
  absence: Pick<StudentAbsence, 'activityId' | 'sessionDate' | 'status'>,
  sessions: ClassSession[]
): boolean {
  if (absence.status !== 'reported' && absence.status !== 'pending') {
    return false;
  }
  return !isClassSessionClosed(sessions, absence.activityId, absence.sessionDate);
}
