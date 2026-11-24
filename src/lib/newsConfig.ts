import { Activity, AppConfigSetting, NewsNote } from '../types';

export const NEWS_WORKSHOP_GRACE_CONFIG_KEY = 'news_finished_workshop_grace';
export const DEFAULT_NEWS_WORKSHOP_GRACE_HOURS = 48;
export const NEWS_GRACE_HOUR_PRESETS = [12, 24, 48, 72, 168] as const;

export type FinishedWorkshopNoteAction = 'delete' | 'mark_read';

export interface NewsFinishedWorkshopGraceConfig {
  enabled: boolean;
  graceHours: number;
  action: FinishedWorkshopNoteAction;
}

const LOCAL_ACTIVITY_ENDED_AT_KEY = 'triskell_activity_ended_at_map';

export function serializeNewsFinishedWorkshopGraceConfig(
  graceHours: number,
  action: FinishedWorkshopNoteAction
): string {
  const safeHours =
    Number.isFinite(graceHours) && graceHours >= 0
      ? Math.round(graceHours)
      : DEFAULT_NEWS_WORKSHOP_GRACE_HOURS;
  const safeAction: FinishedWorkshopNoteAction =
    action === 'mark_read' ? 'mark_read' : 'delete';
  return JSON.stringify({
    graceHours: safeHours,
    action: safeAction
  });
}

export function parseNewsFinishedWorkshopGraceConfig(
  appConfigs: AppConfigSetting[]
): NewsFinishedWorkshopGraceConfig {
  const row = appConfigs.find(c => c.config_key === NEWS_WORKSHOP_GRACE_CONFIG_KEY);
  if (!row) {
    return {
      enabled: true,
      graceHours: DEFAULT_NEWS_WORKSHOP_GRACE_HOURS,
      action: 'delete'
    };
  }

  let graceHours = DEFAULT_NEWS_WORKSHOP_GRACE_HOURS;
  let action: FinishedWorkshopNoteAction = 'delete';

  const raw = (row.config_value ?? '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0) {
        graceHours = Math.round(parsed);
      } else if (parsed && typeof parsed === 'object') {
        const parsedHours = Number((parsed as any).graceHours ?? (parsed as any).hours);
        if (Number.isFinite(parsedHours) && parsedHours >= 0) {
          graceHours = Math.round(parsedHours);
        }
        const parsedAction = (parsed as any).action;
        if (parsedAction === 'mark_read' || parsedAction === 'delete') {
          action = parsedAction;
        }
      }
    } catch {
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric >= 0) {
        graceHours = Math.round(numeric);
      }
    }
  }

  return {
    enabled: Boolean(row.is_active),
    graceHours,
    action
  };
}

export function isWorkshopFinalized(activity?: Activity | null): boolean {
  if (!activity) return false;
  return activity.active === false || activity.status === 'inactive' || Boolean(activity.endedAt);
}

export function getStoredActivityEndedAtMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVITY_ENDED_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setStoredActivityEndedAt(activityId: string, endedAtIso: string | null): void {
  if (typeof window === 'undefined' || !activityId) return;
  try {
    const current = getStoredActivityEndedAtMap();
    if (endedAtIso) {
      current[activityId] = endedAtIso;
    } else {
      delete current[activityId];
    }
    localStorage.setItem(LOCAL_ACTIVITY_ENDED_AT_KEY, JSON.stringify(current));
  } catch {
    // ignore storage quota errors
  }
}

export function resolveActivityEndedAtIso(
  activity?: Activity | null,
  fallbackMap?: Record<string, string>
): string | null {
  if (!activity || !isWorkshopFinalized(activity)) return null;
  if (activity.endedAt) return activity.endedAt;
  const map = fallbackMap ?? getStoredActivityEndedAtMap();
  return map[activity.id] || null;
}

export function parseFlexibleTimestampMs(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

export interface WorkshopNoteGraceEvaluation {
  isLinked: boolean;
  isWorkshopFinished: boolean;
  finalizedAtMs: number | null;
  expiresAtMs: number | null;
  remainingMs: number | null;
  isExpired: boolean;
}

export function evaluateWorkshopNoteGraceStatus(params: {
  note: NewsNote;
  activity?: Activity | null;
  config: NewsFinishedWorkshopGraceConfig;
  endedAtFallbackMap?: Record<string, string>;
  now?: Date;
}): WorkshopNoteGraceEvaluation {
  const { note, activity, config, endedAtFallbackMap, now = new Date() } = params;
  if (!note.activityId) {
    return {
      isLinked: false,
      isWorkshopFinished: false,
      finalizedAtMs: null,
      expiresAtMs: null,
      remainingMs: null,
      isExpired: false
    };
  }

  const finished = isWorkshopFinalized(activity);
  if (!finished) {
    return {
      isLinked: true,
      isWorkshopFinished: false,
      finalizedAtMs: null,
      expiresAtMs: null,
      remainingMs: null,
      isExpired: false
    };
  }

  const endedAtIso = resolveActivityEndedAtIso(activity, endedAtFallbackMap);
  const finalizedAtMs = parseFlexibleTimestampMs(endedAtIso);

  if (!config.enabled || finalizedAtMs === null) {
    return {
      isLinked: true,
      isWorkshopFinished: true,
      finalizedAtMs,
      expiresAtMs: null,
      remainingMs: null,
      isExpired: false
    };
  }

  const graceMs = Math.max(0, config.graceHours) * 3600 * 1000;
  const expiresAtMs = finalizedAtMs + graceMs;
  const remainingMs = expiresAtMs - now.getTime();

  return {
    isLinked: true,
    isWorkshopFinished: true,
    finalizedAtMs,
    expiresAtMs,
    remainingMs,
    isExpired: remainingMs <= 0
  };
}
