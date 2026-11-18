import { AppConfigSetting, FeedbackRoleToggleMap, FeedbackSystemConfig, UserRole } from '../types';

export const FEEDBACK_CONFIG_KEY = 'feedback_system';

export const FEEDBACK_ROLE_ORDER: UserRole[] = [
  'socio',
  'student',
  'teacher',
  'teacher_student',
  'admin'
];

export const DEFAULT_FEEDBACK_ROLE_TOGGLES: FeedbackRoleToggleMap = {
  socio: true,
  student: true,
  teacher: true,
  teacher_student: true,
  admin: true
};

export function parseFeedbackSystemConfig(appConfigs: AppConfigSetting[]): FeedbackSystemConfig {
  const row = appConfigs.find(c => c.config_key === FEEDBACK_CONFIG_KEY);
  if (!row) {
    return {
      masterEnabled: true,
      roles: { ...DEFAULT_FEEDBACK_ROLE_TOGGLES }
    };
  }

  let roles: FeedbackRoleToggleMap = { ...DEFAULT_FEEDBACK_ROLE_TOGGLES };
  if (row.config_value) {
    try {
      const parsed = JSON.parse(row.config_value);
      if (parsed && typeof parsed === 'object' && parsed.roles && typeof parsed.roles === 'object') {
        roles = {
          socio: parsed.roles.socio !== undefined ? Boolean(parsed.roles.socio) : true,
          student: parsed.roles.student !== undefined ? Boolean(parsed.roles.student) : true,
          teacher: parsed.roles.teacher !== undefined ? Boolean(parsed.roles.teacher) : true,
          teacher_student:
            parsed.roles.teacher_student !== undefined ? Boolean(parsed.roles.teacher_student) : true,
          admin: parsed.roles.admin !== undefined ? Boolean(parsed.roles.admin) : true
        };
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
  role: UserRole | '' | undefined
): boolean {
  if (!role) return false;
  const config = parseFeedbackSystemConfig(appConfigs);
  if (!config.masterEnabled) return false;
  return config.roles[role] ?? true;
}
