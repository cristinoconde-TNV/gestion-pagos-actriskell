import { AppConfigSetting, FeedbackRoleToggleMap, FeedbackSystemConfig, UserRole } from '../types';
import { normalizeUserRole } from './authRole';

export const FEEDBACK_CONFIG_KEY = 'feedback_system';

export const FEEDBACK_ROLE_ORDER: UserRole[] = [
  UserRole.Socio,
  UserRole.Alumno,
  UserRole.Monitor,
  UserRole.Hibrido,
  UserRole.Admin
];

export const DEFAULT_FEEDBACK_ROLE_TOGGLES: FeedbackRoleToggleMap = {
  [UserRole.Socio]: true,
  [UserRole.Alumno]: true,
  [UserRole.Monitor]: true,
  [UserRole.Hibrido]: true,
  [UserRole.Admin]: true
};

export function parseFeedbackSystemConfig(appConfigs: AppConfigSetting[]): FeedbackSystemConfig {
  const row = appConfigs.find(c => c.config_key === FEEDBACK_CONFIG_KEY);
  if (!row) {
    return {
      masterEnabled: true,
      roles: { ...DEFAULT_FEEDBACK_ROLE_TOGGLES }
    };
  }

  const roles: FeedbackRoleToggleMap = { ...DEFAULT_FEEDBACK_ROLE_TOGGLES };
  if (row.config_value) {
    try {
      const parsed = JSON.parse(row.config_value);
      if (parsed && typeof parsed === 'object' && parsed.roles && typeof parsed.roles === 'object') {
        const rawRoles = parsed.roles as Record<string, unknown>;
        const readToggle = (primaryKey: UserRole, ...legacyKeys: string[]): boolean => {
          if (rawRoles[primaryKey] !== undefined) return Boolean(rawRoles[primaryKey]);
          for (const key of legacyKeys) {
            if (rawRoles[key] !== undefined) return Boolean(rawRoles[key]);
          }
          return true;
        };

        roles[UserRole.Socio] = readToggle(UserRole.Socio, 'Socio', 'socio');
        roles[UserRole.Alumno] = readToggle(UserRole.Alumno, 'Alumno', 'alumno');
        roles[UserRole.Monitor] = readToggle(UserRole.Monitor, 'Monitor', 'monitor');
        roles[UserRole.Hibrido] = readToggle(UserRole.Hibrido, 'Híbrido', 'Hibrido', 'hibrido', 'teacher_student');
        roles[UserRole.Admin] = readToggle(UserRole.Admin, 'Admin');
      }
    } catch {
      // Fallback to defaults if config_value is invalid JSON
    }
  }

  return {
    masterEnabled: Boolean(row.is_active),
    roles
  };
}

export function serializeFeedbackRolesValue(roles: FeedbackRoleToggleMap): string {
  return JSON.stringify({ roles });
}

export function isFeedbackEnabledForRole(
  appConfigs: AppConfigSetting[],
  role: UserRole | string | '' | undefined
): boolean {
  if (!role) return false;
  const config = parseFeedbackSystemConfig(appConfigs);
  if (!config.masterEnabled) return false;
  const normalizedRole = normalizeUserRole(role);
  return config.roles[normalizedRole] ?? true;
}
