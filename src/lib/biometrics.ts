/**
 * Biometrics Helper for Triskell
 * Client-only biometric login without server-side WebAuthn verification is disabled.
 */

import { AppLanguage } from '../types';
import { translate } from './i18n';

const BIOMETRICS_STORAGE_KEY = 'triskell_biometrics_credentials';
const BIOMETRIC_SESSION_KEY = 'triskell_cached_auth_session';

export interface StoredBiometricInfo {
  credentialId: string;
  email: string;
  name: string;
  role: string;
  enabledAt: string;
}

export const clearCachedAuthSession = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BIOMETRIC_SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
};

// Disabled until server-side WebAuthn challenge verification and token issuance exist
export const isBiometricsSupported = async (): Promise<boolean> => {
  return false;
};

// Purge any legacy client-side biometric metadata and return null
export const getStoredBiometricUser = (): StoredBiometricInfo | null => {
  if (typeof window === 'undefined') return null;
  try {
    localStorage.removeItem(BIOMETRICS_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  return null;
};

export const registerBiometricCredential = async (
  _userId: string,
  _email: string,
  _name: string,
  _role: string,
  lang: AppLanguage = 'es'
): Promise<boolean> => {
  throw new Error(translate(lang, 'biometrics.notSupported'));
};

export const authenticateWithBiometrics = async (
  lang: AppLanguage = 'es'
): Promise<StoredBiometricInfo | null> => {
  disableBiometrics();
  throw new Error(translate(lang, 'biometrics.browserNotSupported'));
};

export const disableBiometrics = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BIOMETRICS_STORAGE_KEY);
    localStorage.removeItem(BIOMETRIC_SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
};
