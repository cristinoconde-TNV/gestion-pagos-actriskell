import { AppConfigSetting, AuthUser } from '../types';

export const SESSION_INACTIVITY_CONFIG_KEY = 'session_inactivity_minutes';
export const LOGIN_INACTIVITY_CONFIG_KEY = 'login_inactivity_months';

export const DEFAULT_SESSION_INACTIVITY_MINUTES = 30;
export const DEFAULT_LOGIN_INACTIVITY_MONTHS = 6;

export const SESSION_INACTIVITY_MINUTE_PRESETS = [5, 15, 30, 60, 120] as const;
export const LOGIN_INACTIVITY_MONTH_PRESETS = [1, 3, 6, 9, 12] as const;

export interface SessionInactivityConfig {
  enabled: boolean;
  minutes: number;
  existsInDb: boolean;
}

export interface LoginInactivityConfig {
  enabled: boolean;
  months: number;
  existsInDb: boolean;
}

export interface LoginInactivityEvaluation {
  isInactiveCandidate: boolean;
  hasRecordedLogin: boolean;
  referenceDateIso?: string;
  referenceDateMs?: number;
  monthsElapsed: number;
  daysElapsed: number;
}

const parsePositiveIntegerConfig = (
  rawValue: string | undefined,
  fallback: number,
  objectKeys: string[]
): number => {
  const raw = (rawValue ?? '').trim();
  if (!raw) return fallback;

  const num = Number(raw.replace(',', '.'));
  if (Number.isFinite(num) && num >= 1) {
    return Math.max(1, Math.round(num));
  }

  try {
    const obj = JSON.parse(raw);
    for (const key of objectKeys) {
      const candidate = Number(obj?.[key]);
      if (Number.isFinite(candidate) && candidate >= 1) {
        return Math.max(1, Math.round(candidate));
      }
    }
  } catch {
    // Ignore malformed JSON and keep fallback
  }

  return fallback;
};

export function parseSessionInactivityConfig(
  appConfigs: AppConfigSetting[]
): SessionInactivityConfig {
  const row = appConfigs.find(c => c.config_key === SESSION_INACTIVITY_CONFIG_KEY);
  if (!row) {
    return {
      enabled: false,
      minutes: DEFAULT_SESSION_INACTIVITY_MINUTES,
      existsInDb: false
    };
  }

  return {
    enabled: Boolean(row.is_active),
    minutes: parsePositiveIntegerConfig(row.config_value, DEFAULT_SESSION_INACTIVITY_MINUTES, [
      'minutes',
      'timeoutMinutes'
    ]),
    existsInDb: true
  };
}

export function parseLoginInactivityConfig(
  appConfigs: AppConfigSetting[]
): LoginInactivityConfig {
  const row = appConfigs.find(c => c.config_key === LOGIN_INACTIVITY_CONFIG_KEY);
  if (!row) {
    return {
      enabled: false,
      months: DEFAULT_LOGIN_INACTIVITY_MONTHS,
      existsInDb: false
    };
  }

  return {
    enabled: Boolean(row.is_active),
    months: parsePositiveIntegerConfig(row.config_value, DEFAULT_LOGIN_INACTIVITY_MONTHS, [
      'months',
      'inactivityMonths'
    ]),
    existsInDb: true
  };
}

const parseDateMs = (raw?: string | null): number | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Normalize bare YYYY-MM-DD to local midnight so timezone offsets don't shift by a day
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const localDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(localDate.getTime()) ? null : localDate.getTime();
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

export function evaluateProfileLoginInactivity(
  profile: AuthUser,
  config: LoginInactivityConfig,
  now: Date = new Date()
): LoginInactivityEvaluation {
  const hasRecordedLogin = Boolean(profile.lastLogin && parseDateMs(profile.lastLogin) !== null);
  const referenceDateIso = profile.lastLogin || profile.startDate || profile.createdAt;
  const referenceDateMs = parseDateMs(referenceDateIso) ?? undefined;

  if (!config.enabled || config.months <= 0 || referenceDateMs === undefined) {
    return {
      isInactiveCandidate: false,
      hasRecordedLogin,
      referenceDateIso,
      referenceDateMs,
      monthsElapsed: 0,
      daysElapsed: 0
    };
  }

  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - config.months);

  const nowMs = now.getTime();
  const diffMs = Math.max(0, nowMs - referenceDateMs);
  const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const refDate = new Date(referenceDateMs);
  let monthsElapsed =
    (now.getFullYear() - refDate.getFullYear()) * 12 + (now.getMonth() - refDate.getMonth());
  if (now.getDate() < refDate.getDate()) {
    monthsElapsed -= 1;
  }
  monthsElapsed = Math.max(0, monthsElapsed);

  return {
    isInactiveCandidate: referenceDateMs <= cutoff.getTime(),
    hasRecordedLogin,
    referenceDateIso,
    referenceDateMs,
    monthsElapsed,
    daysElapsed
  };
}
