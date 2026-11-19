import { Activity, AppConfigSetting, ClassClosedBy, ClassSession } from '../types';
import { getScheduleEndMinutesForDate, parseIsoDateLocal } from './absences';

export const CLASS_AUTO_CLOSE_CONFIG_KEY = 'class_auto_close_hours';
export const DEFAULT_AUTO_CLOSE_DELAY_HOURS = 24;
const MIN_REOPEN_GRACE_MS = 60 * 60 * 1000; // Al menos 1h tras reabrir para permitir edición

export interface ClassAutoCloseConfig {
  enabled: boolean;
  delayHours: number;
  existsInDb: boolean;
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

export function normalizeClassClosedBy(raw?: string | null): ClassClosedBy | undefined {
  if (raw === 'profesor' || raw === 'automatica' || raw === 'administrador') {
    return raw;
  }
  return undefined;
}
