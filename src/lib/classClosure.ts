import { Activity, AppConfigSetting, ClassClosedBy, ClassSession, Student } from '../types';
import {
  formatIsoDateLocal,
  getActivityMatchedDayScheduleMap,
  getScheduleDurationMinutesForDate,
  getScheduleEndMinutesForDate,
  parseIsoDateLocal
} from './absences';

export const CLASS_AUTO_CLOSE_CONFIG_KEY = 'class_auto_close_hours';
export const DEFAULT_AUTO_CLOSE_DELAY_HOURS = 24;
export const AUTO_CLOSE_DAY_PRESETS = [1, 2, 7, 15, 30] as const;
const MIN_REOPEN_GRACE_MS = 60 * 60 * 1000; // Al menos 1h tras reabrir para permitir edición

export interface ClassAutoCloseConfig {
  enabled: boolean;
  delayHours: number;
  existsInDb: boolean;
}

export interface OverdueScheduledSessionDraft {
  activityId: string;
  teacherId: string;
  date: string;
  durationMinutes: number;
}

export function parseClassAutoCloseConfig(appConfigs: AppConfigSetting[]): ClassAutoCloseConfig {
  const row = appConfigs.find(c => c.config_key === CLASS_AUTO_CLOSE_CONFIG_KEY);
  if (!row) {
    return {
      enabled: true,
      delayHours: DEFAULT_AUTO_CLOSE_DELAY_HOURS,
      existsInDb: false
    };
  }

  let parsedHours = DEFAULT_AUTO_CLOSE_DELAY_HOURS;
  const rawVal = (row.config_value ?? '').trim();
  if (rawVal) {
    const num = Number(rawVal);
    if (Number.isFinite(num) && num >= 0) {
      parsedHours = num;
    } else {
      try {
        const obj = JSON.parse(rawVal);
        const objHours = Number(obj?.delayHours ?? obj?.hours);
        if (Number.isFinite(objHours) && objHours >= 0) {
          parsedHours = objHours;
        }
      } catch {
        // Fallback to default hours
      }
    }
  }

  return {
    enabled: Boolean(row.is_active),
    delayHours: parsedHours,
    existsInDb: true
  };
}

export function getClassSessionEndDateTime(
  activity: Activity | undefined,
  sessionDate: string
): Date | null {
  const cleanDate = (sessionDate || '').trim().slice(0, 10);
  const parsed = parseIsoDateLocal(cleanDate);
  if (!parsed) return null;

  const endMinutes = getScheduleEndMinutesForDate(activity, cleanDate);
  if (endMinutes === null) {
    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      23,
      59,
      59,
      999
    );
  }

  const hours = Math.floor(endMinutes / 60);
  const minutes = endMinutes % 60;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), hours, minutes, 0, 0);
}

export function shouldAutoCloseSession(params: {
  session: ClassSession;
  activity?: Activity;
  delayHours: number;
  now?: Date;
}): boolean {
  const { session, activity, delayHours, now = new Date() } = params;
  if (session.isClosed) return false;
  if (session.id.startsWith('temp-ses-')) return false;

  const endDateTime = getClassSessionEndDateTime(activity, session.date);
  if (!endDateTime) return false;

  const delayMs = Math.max(0, delayHours) * 60 * 60 * 1000;
  let eligibleAtMs = endDateTime.getTime() + delayMs;

  if (session.reopenedAt) {
    const reopenedMs = Date.parse(session.reopenedAt);
    if (!Number.isNaN(reopenedMs)) {
      const graceMs = Math.max(delayMs, MIN_REOPEN_GRACE_MS);
      eligibleAtMs = Math.max(eligibleAtMs, reopenedMs + graceMs);
    }
  }

  return now.getTime() >= eligibleAtMs;
}

export function getOverdueUnrecordedScheduledSessions(params: {
  activities: Activity[];
  sessions: ClassSession[];
  students: Student[];
  delayHours: number;
  isAdminUser: boolean;
  effectiveTeacherId?: string;
  now?: Date;
  lookbackDays?: number;
}): OverdueScheduledSessionDraft[] {
  const {
    activities,
    sessions,
    students,
    delayHours,
    isAdminUser,
    effectiveTeacherId,
    now = new Date(),
    lookbackDays = 60
  } = params;

  const todayStr = formatIsoDateLocal(now);
  const todayDate =
    parseIsoDateLocal(todayStr) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minLookbackDate = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate() - Math.max(1, lookbackDays)
  );
  const delayMs = Math.max(0, delayHours) * 60 * 60 * 1000;
  const nowMs = now.getTime();

  const existingSessionKeys = new Set<string>();
  const recordedDatesByActivity = new Map<string, string[]>();
  for (const ses of sessions) {
    const cleanDate = (ses.date || '').trim().slice(0, 10);
    if (!ses.activityId || !cleanDate) continue;
    existingSessionKeys.add(`${ses.activityId}::${cleanDate}`);
    const list = recordedDatesByActivity.get(ses.activityId) || [];
    list.push(cleanDate);
    recordedDatesByActivity.set(ses.activityId, list);
  }

  const enrollmentDatesByActivity = new Map<string, string[]>();
  for (const st of students) {
    for (const enr of st.activities || []) {
      const cleanEnr = (enr.enrolledSince || '').trim().slice(0, 10);
      if (!enr.activityId || !cleanEnr) continue;
      const list = enrollmentDatesByActivity.get(enr.activityId) || [];
      list.push(cleanEnr);
      enrollmentDatesByActivity.set(enr.activityId, list);
    }
  }

  const drafts: OverdueScheduledSessionDraft[] = [];

  for (const activity of activities) {
    if (activity.active === false || activity.status === 'inactive' || activity.status === 'pending') {
      continue;
    }
    if (!activity.teacherId) continue;
    if (!isAdminUser && activity.teacherId !== effectiveTeacherId) continue;

    const dayMap = getActivityMatchedDayScheduleMap(activity);
    if (dayMap.size === 0) continue;

    const explicitStart = activity.startDate
      ? parseIsoDateLocal(activity.startDate.trim().slice(0, 10))
      : null;
    if (explicitStart && explicitStart > todayDate) continue;

    const candidateStrs: Array<string | undefined> = [
      activity.startDate?.slice(0, 10),
      activity.createdAt?.slice(0, 10),
      ...(recordedDatesByActivity.get(activity.id) || []),
      ...(enrollmentDatesByActivity.get(activity.id) || [])
    ];

    const validCandidateDates = candidateStrs
      .map(s => (s ? parseIsoDateLocal(s) : null))
      .filter((d): d is Date => d !== null && d <= todayDate)
      .sort((a, b) => a.getTime() - b.getTime());

    let startDate = validCandidateDates.length > 0 ? validCandidateDates[0] : minLookbackDate;
    if (explicitStart && startDate < explicitStart) {
      startDate = explicitStart;
    }
    if (startDate < minLookbackDate) {
      startDate = minLookbackDate;
    }

    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    while (cursor <= todayDate) {
      if (dayMap.has(cursor.getDay())) {
        const dateStr = formatIsoDateLocal(cursor);
        const key = `${activity.id}::${dateStr}`;
        if (!existingSessionKeys.has(key)) {
          const endDateTime = getClassSessionEndDateTime(activity, dateStr);
          if (endDateTime && nowMs >= endDateTime.getTime() + delayMs) {
            drafts.push({
              activityId: activity.id,
              teacherId: activity.teacherId,
              date: dateStr,
              durationMinutes: getScheduleDurationMinutesForDate(activity, dateStr)
            });
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return drafts;
}

export function normalizeClassClosedBy(raw?: string | null): ClassClosedBy | undefined {
  if (raw === 'profesor' || raw === 'automatica' || raw === 'administrador') {
    return raw;
  }
  return undefined;
}

