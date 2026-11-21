import { AppConfigSetting, AuthUser, UserRole } from '../types';

export const ANNUAL_FEE_CONFIG_KEY = 'socio_annual_fee';
export const DEFAULT_ANNUAL_FEE_AMOUNT = 20;

export interface SocioAnnualFeeConfig {
  enabled: boolean;
  defaultAmount: number;
}

export function parseSocioAnnualFeeConfig(
  appConfigs: AppConfigSetting[]
): SocioAnnualFeeConfig {
  const row = appConfigs.find(c => c.config_key === ANNUAL_FEE_CONFIG_KEY);
  if (!row) {
    return {
      enabled: true,
      defaultAmount: DEFAULT_ANNUAL_FEE_AMOUNT
    };
  }

  let parsedAmount = DEFAULT_ANNUAL_FEE_AMOUNT;
  const raw = String(row.config_value || '').trim();
  if (raw) {
    const asNumber = Number(raw.replace(',', '.'));
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      parsedAmount = Math.round(asNumber * 100) / 100;
    } else {
      try {
        const obj = JSON.parse(raw);
        const candidate = Number(obj?.amount ?? obj?.defaultAmount);
        if (Number.isFinite(candidate) && candidate >= 0) {
          parsedAmount = Math.round(candidate * 100) / 100;
        }
      } catch {
        // Keep default amount
      }
    }
  }

  return {
    enabled: Boolean(row.is_active),
    defaultAmount: parsedAmount
  };
}

/**
 * Determina si un perfil corresponde a un usuario "Socio" sujeto a cuota anual.
 * Excluye explícitamente usuarios marcados como "No socio" (alumno_no_socio / monitor_no_socio),
 * cuentas inactivas/de baja y cuentas puramente Administradoras.
 */
export function isProfileEligibleForSocioAnnualFee(
  profile: AuthUser,
  strictSocioRoleOnly = false
): boolean {
  if (!profile) return false;
  if (profile.access === false || profile.active === false) return false;
  if (profile.role === UserRole.Admin) return false;

  if (strictSocioRoleOnly) {
    return profile.role === UserRole.Socio;
  }

  if (
    profile.memberType === 'alumno_no_socio' ||
    profile.memberType === 'monitor_no_socio'
  ) {
    return false;
  }

  return profile.role === UserRole.Socio || profile.isSocio === true;
}
