import { AppConfigSetting } from '../types';

export const BIZUM_GENERAL_CONFIG_KEY = 'bizum_general';
export const DEFAULT_OFFICIAL_BIZUM_PHONE = '+34 612 345 678';

export interface OfficialBizumConfig {
  enabled: boolean;
  phone: string;
  isConfigured: boolean;
  existsInDb: boolean;
  description?: string;
}

export function parseOfficialBizumConfig(
  appConfigs: AppConfigSetting[]
): OfficialBizumConfig {
  const row = appConfigs.find(c => c.config_key === BIZUM_GENERAL_CONFIG_KEY);
  if (!row) {
    return {
      enabled: true,
      phone: DEFAULT_OFFICIAL_BIZUM_PHONE,
      isConfigured: true,
      existsInDb: false
    };
  }

  const raw = String(row.config_value || '').trim();
  let phone = raw;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.phone === 'string') {
        phone = parsed.phone.trim();
      }
    } catch {
      phone = raw;
    }
  }

  const enabled = Boolean(row.is_active);
  return {
    enabled,
    phone,
    isConfigured: enabled && phone.length > 0,
    existsInDb: true,
    description: row.description
  };
}
