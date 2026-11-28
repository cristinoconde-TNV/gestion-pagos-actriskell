import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  AppConfigSetting,
  AppLanguage,
  AuthUser,
  MemberType,
  OperationalRole,
  Teacher,
  UserRole
} from '../types';
import { ANNUAL_FEE_CONFIG_KEY } from '../lib/annualFee';
import { parseSessionInactivityConfig } from '../lib/inactivityConfig';
import {
  createIsolatedAuthClient,
  deriveIsSocioFromRow,
  normalizeOperationalRole,
  supabase
} from '../lib/supabase';
import {
  calculateUserAuthState,
  DEFAULT_BASE_USER_ROLE,
  deriveAccessFromRow,
  deriveOperationalRoleFromAssignments,
  extractGoogleProfileMetadata,
  generateCryptographicTempPassword,
  isPendingApprovalProfile,
  isPlaceholderProfileName,
  isProfileExplicitlyAuthorized,
  isRejectedProfile,
  isValidUserRole,
  MASTER_ADMIN_EMAIL,
  normalizeUserRole,
  resolveProfileAccessStatus,
  toCanonicalProfileRole
} from '../lib/authRole';
import { getMadridDateIso } from '../lib/date';
import { normalizePhoneForStorage } from '../lib/phone';
import { INITIAL_APP_CONFIGS } from '../data/initialData';
import {
  clearCachedAuthSession,
  disableBiometrics as disableBiometricsUtil,
  getStoredBiometricUser,
  isBiometricsSupported,
  StoredBiometricInfo
} from '../lib/biometrics';
import { normalizeAppLanguage, translate, TranslationKey } from '../lib/i18n';

export type AuthDenialKind = 'pending' | 'rejected' | 'deactivated' | 'unauthorized' | 'error';

export type OperationalRoleCategory =
  | 'admin_preserved'
  | 'teacher_student'
  | 'student'
  | 'teacher'
  | 'socio_puro'
  | 'baja';

export interface OperationalRoleOutcome {
  role: UserRole;
  operationalRole: OperationalRole;
  isSocio: boolean;
  access: boolean;
  active: boolean;
  status: 'active' | 'inactive';
  category: OperationalRoleCategory;
}

export const deriveOperationalRole = (
  hasActiveStudentAssignment: boolean,
  hasActiveTeacherAssignment: boolean
): OperationalRole => {
  if (hasActiveStudentAssignment && hasActiveTeacherAssignment) return 'hibrido';
  if (hasActiveStudentAssignment) return 'alumno';
  if (hasActiveTeacherAssignment) return 'profesor';
  return 'vacio';
};

export const computeOperationalRoleOutcome = ({
  currentRole,
  email,
  hasActiveStudentAssignment,
  hasActiveTeacherAssignment,
  isSocio,
  manualAccess
}: {
  currentRole?: string | null;
  email?: string | null;
  hasActiveStudentAssignment: boolean;
  hasActiveTeacherAssignment: boolean;
  isSocio: boolean;
  manualAccess?: boolean;
}): OperationalRoleOutcome => {
  const calculated = calculateUserAuthState({
    currentRole,
    email,
    hasActiveStudentAssignment,
    hasActiveTeacherAssignment,
    isSocio,
    manualAccess
  });

  const categoryMap: Record<typeof calculated.category, OperationalRoleCategory> = {
    admin: 'admin_preserved',
    hibrido: 'teacher_student',
    alumno: 'student',
    profesor: 'teacher',
    socio: 'socio_puro',
    baja: 'baja'
  };

  return {
    role: calculated.role,
    operationalRole: calculated.operationalRole,
    isSocio: calculated.isSocio,
    access: calculated.access,
    active: calculated.active,
    status: calculated.status,
    category: categoryMap[calculated.category]
  };
};

export const isDeactivatedAccount = ({
  email,
  profile,
  teacher,
  student
}: {
  email?: string | null;
  profile?: {
    access?: boolean | null;
    active?: boolean | null;
    role?: string | null;
    operational_role?: string | null;
    is_socio?: boolean | null;
    member_type?: string | null;
    end_date?: string | null;
    start_date?: string | null;
  } | null;
  teacher?: { active?: boolean | null } | null;
  student?: { status?: string | null } | null;
}): boolean => {
  const emailNorm = (email || '').toLowerCase().trim();
  if (emailNorm === MASTER_ADMIN_EMAIL) {
    return false;
  }

  if (profile) {
    if (!isProfileExplicitlyAuthorized(profile, emailNorm)) {
      return true;
    }
    if (profile.access === true || deriveIsSocioFromRow(profile)) {
      return false;
    }
  }

  const role: UserRole | undefined = profile?.role
    ? normalizeUserRole(profile.role)
    : teacher && student
    ? UserRole.Hibrido
    : teacher
    ? UserRole.Monitor
    : student
    ? UserRole.Alumno
    : undefined;

  if (role === UserRole.Alumno) {
    if (student && student.status === 'inactive') return true;
  } else if (role === UserRole.Socio) {
    const profileHasSocioAccess = Boolean(
      profile && deriveAccessFromRow(profile, emailNorm) && deriveIsSocioFromRow(profile)
    );
    if (!profileHasSocioAccess && student && student.status === 'inactive') return true;
  } else if (role === UserRole.Monitor) {
    if (teacher && teacher.active === false) return true;
  } else if (role === UserRole.Hibrido) {
    if (teacher && student) {
      if (teacher.active === false && student.status === 'inactive') return true;
    } else if (teacher && teacher.active === false) {
      return true;
    } else if (student && student.status === 'inactive') {
      return true;
    }
  }

  return false;
};

export const extractMissingProfileColumn = (error: any): string | null => {
  const msg = String(error?.message || '');
  const pgMatch = msg.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (pgMatch?.[1]) return pgMatch[1];
  const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];
  const genericMatch = msg.match(/column\s+([a-z0-9_]+)\s+does not exist/i);
  if (genericMatch?.[1]) return genericMatch[1];
  return null;
};

export const isMissingColumnError = (error: any): boolean => {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42703' || error?.code === 'PGRST204' || msg.includes('column');
};

export interface AuthContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  setCurrentRoleState: React.Dispatch<React.SetStateAction<UserRole>>;
  currentTeacherId: string;
  setCurrentTeacherId: React.Dispatch<React.SetStateAction<string>>;
  currentStudentId: string;
  setCurrentStudentId: React.Dispatch<React.SetStateAction<string>>;

  currentUser: AuthUser | null;
  currentUserRef: React.MutableRefObject<AuthUser | null>;
  setCurrentUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  isStrictAdminSession: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  isPasswordRecoveryMode: boolean;
  setIsPasswordRecoveryMode: (recovery: boolean) => void;
  logout: () => Promise<void>;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;

  isDarkMode: boolean;
  toggleDarkMode: () => void;

  language: AppLanguage;
  setUserLanguage: (lang: AppLanguage) => Promise<{ success: boolean; error?: string }>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;

  isAuthReady: boolean;
  isAuthLoading: boolean;
  isLoadingDb: boolean;
  setIsLoadingDb: React.Dispatch<React.SetStateAction<boolean>>;
  dbSyncVersion: number;
  bumpDbSyncVersion: () => void;
  dbError: string | null;
  setDbError: React.Dispatch<React.SetStateAction<string | null>>;
  authDenialKind: AuthDenialKind | null;
  setAuthDenialKind: React.Dispatch<React.SetStateAction<AuthDenialKind | null>>;
  clearDbError: () => void;
  resolveAuthDenial: (
    profileRow: any,
    userEmail: string,
    forcePending?: boolean
  ) => { kind: Exclude<AuthDenialKind, 'error'>; message: string };
  handleSupabaseError: (contextMsg: string, error: any, attemptedRole?: string) => string;

  refreshFromSupabase: () => Promise<void>;
  registerRefreshHandler: (handler: () => Promise<void>) => () => void;

  profiles: AuthUser[];
  setProfiles: React.Dispatch<React.SetStateAction<AuthUser[]>>;
  updateProfileWithColumnFallback: (
    userId: string,
    fullPayload: Record<string, any>
  ) => Promise<any>;
  upsertProfileWithColumnFallback: (
    fullPayload: Record<string, any>
  ) => Promise<{ error: any; payload: Record<string, any> }>;
  recordStatusHistoryCycle: (params: {
    entityType: 'student' | 'teacher' | 'profile';
    entityId: string;
    status: 'active' | 'inactive' | 'trial' | 'pending_validation';
    startDate: string;
    endDate?: string;
    notes?: string;
  }) => Promise<void>;

  createUserByAdmin: (params: {
    email: string;
    fullName: string;
    role: UserRole;
    access?: boolean;
    password?: string;
    teacherId?: string;
    studentId?: string;
    memberNumber?: string;
    memberType?: MemberType;
    isSocio?: boolean;
    startDate?: string;
    endDate?: string;
    createTeacherProfile?: boolean;
    createStudentProfile?: boolean;
    teacherProfileData?: Partial<Omit<Teacher, 'id'>>;
  }) => Promise<{ success: boolean; error?: string; tempPassword?: string; teacherId?: string }>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  updateUserProfileByAdmin: (
    userId: string,
    updates: {
      name?: string;
      role?: UserRole;
      access?: boolean;
      teacherId?: string | null;
      studentId?: string | null;
      memberNumber?: string | null;
      memberType?: MemberType | null;
      isSocio?: boolean;
      startDate?: string | null;
      endDate?: string | null;
      active?: boolean;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  toggleUserSocioMembership: (
    targets: {
      profileId?: string;
      studentId?: string;
      teacherId?: string;
      email?: string;
    },
    isSocio: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  toggleUserAccessStatus: (
    userId: string,
    access: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  saveUserPermissionDrafts: (
    drafts: Array<{
      userId: string;
      isSocio: boolean;
      role: UserRole | '';
      access: boolean;
    }>
  ) => Promise<{ success: boolean; updatedCount: number; error?: string }>;
  deleteUserAccess: (userId: string) => Promise<void>;
  promoteOrUpdateMemberRole: (
    targetRole: UserRole.Socio | UserRole.Alumno | UserRole.Monitor | UserRole.Hibrido
  ) => Promise<{ success: boolean; error?: string }>;
  updateUserAvatar: (avatarUrl: string | null) => Promise<{ success: boolean; error?: string }>;
  reevaluateUserOperationalRole: (targets: {
    profileId?: string;
    studentId?: string;
    teacherId?: string;
    email?: string;
    manualAccess?: boolean;
  }) => Promise<{
    updatedProfiles: number;
    results: Array<{
      profileId: string;
      role: UserRole;
      operationalRole: OperationalRole;
      isSocio: boolean;
      access: boolean;
      active: boolean;
      status: 'active' | 'inactive';
      category: OperationalRoleCategory;
    }>;
  }>;

  appConfigs: AppConfigSetting[];
  rawAppConfigs: AppConfigSetting[];
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigSetting[]>>;
  updateAppConfig: (
    config_key: string,
    config_value: string,
    is_active: boolean,
    description?: string
  ) => Promise<void>;
  addAppConfig: (config: AppConfigSetting) => Promise<void>;
  deleteAppConfig: (config_key: string) => Promise<void>;

  isBiometricsSupported: boolean;
  hasBiometricsEnabled: boolean;
  biometricUser: StoredBiometricInfo | null;
  enableBiometrics: () => Promise<boolean>;
  disableBiometrics: () => void;
  unlockWithBiometrics: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const currentUserRef = useRef<AuthUser | null>(null);
  currentUserRef.current = currentUser;
  const lastAuthDenialErrorRef = useRef<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);

  const [currentRole, setCurrentRoleState] = useState<UserRole>(UserRole.Admin);
  const [currentTeacherId, setCurrentTeacherId] = useState<string>('');
  const [currentStudentId, setCurrentStudentId] = useState<string>('');

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('triskell_theme') === 'dark';
  });

  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      return normalizeAppLanguage(localStorage.getItem('triskell_language'));
    } catch {
      return 'es';
    }
  });
  const languageRef = useRef<AppLanguage>(language);
  languageRef.current = language;
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(languageRef.current, key, vars),
    []
  );

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbSyncVersion, setDbSyncVersion] = useState(0);
  const bumpDbSyncVersion = useCallback(() => setDbSyncVersion(v => v + 1), []);
  const [dbError, setDbError] = useState<string | null>(null);
  const [authDenialKind, setAuthDenialKind] = useState<AuthDenialKind | null>(null);

  const [profiles, setProfiles] = useState<AuthUser[]>([]);

  const [appConfigs, setAppConfigs] = useState<AppConfigSetting[]>(() => {
    try {
      const local = localStorage.getItem('triskell_app_configs');
      const parsed: AppConfigSetting[] = local ? JSON.parse(local) : INITIAL_APP_CONFIGS;
      return parsed.filter(c => c.config_key !== 'google_calendar');
    } catch {
      return INITIAL_APP_CONFIGS;
    }
  });

  const isStrictAdminSession =
    currentUser?.role === UserRole.Admin && currentRole === UserRole.Admin;

  const exposedAppConfigs = useMemo(() => {
    if (isStrictAdminSession) return appConfigs;
    return appConfigs.filter(c => c.config_key !== ANNUAL_FEE_CONFIG_KEY);
  }, [appConfigs, isStrictAdminSession]);

  const [isBiometricsSupportedState, setIsBiometricsSupportedState] = useState(false);
  const [biometricUserState, setBiometricUserState] = useState<StoredBiometricInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    isBiometricsSupported()
      .then(supported => {
        if (!mounted) return;
        setIsBiometricsSupportedState(supported);
        setBiometricUserState(getStoredBiometricUser());
      })
      .catch(err => {
        console.warn('Error checking biometrics support:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const clearDbError = useCallback(() => {
    setDbError(null);
    setAuthDenialKind(null);
  }, []);

  const resolveAuthDenial = useCallback(
    (
      profileRow: any,
      userEmail: string,
      forcePending = false
    ): { kind: Exclude<AuthDenialKind, 'error'>; message: string } => {
      if (forcePending || (profileRow && isPendingApprovalProfile(profileRow))) {
        return {
          kind: 'pending',
          message: t('appContext.accountPendingApproval', { email: userEmail })
        };
      }
      if (profileRow && isRejectedProfile(profileRow, userEmail)) {
        return {
          kind: 'rejected',
          message: t('appContext.accountRejected', { email: userEmail })
        };
      }
      if (profileRow) {
        return {
          kind: 'deactivated',
          message: t('appContext.accountDeactivated', { email: userEmail })
        };
      }
      return {
        kind: 'unauthorized',
        message: t('appContext.accessDenied', { email: userEmail })
      };
    },
    [t]
  );

  const formatSupabaseErrorMessage = useCallback(
    (contextMsg: string, error: any, attemptedRole?: string) => {
      const rawMsg = error?.message || t('appContext.supabaseCommError');
      if (
        rawMsg.includes('profiles_role_check') ||
        (error?.code === '23514' && Boolean(attemptedRole))
      ) {
        return t('appContext.profileRoleCheckError', {
          role: attemptedRole || '?'
        });
      }
      if (
        error?.code === '42501' ||
        rawMsg.includes('permission denied') ||
        rawMsg.includes('row-level security')
      ) {
        return t('appContext.rlsDenied', { action: contextMsg.toLowerCase() });
      }
      return rawMsg;
    },
    [t]
  );

  const handleSupabaseError = useCallback(
    (contextMsg: string, error: any, attemptedRole?: string) => {
      console.error(`[Supabase Error] ${contextMsg}:`, error);
      const msg = formatSupabaseErrorMessage(contextMsg, error, attemptedRole);
      setAuthDenialKind('error');
      setDbError(msg);
      return msg;
    },
    [formatSupabaseErrorMessage]
  );

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('triskell_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('triskell_theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem('triskell_language', language);
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }, [language]);

  const refreshHandlerRef = useRef<() => Promise<void>>(async () => {});
  const registerRefreshHandler = useCallback((handler: () => Promise<void>) => {
    refreshHandlerRef.current = handler;
    return () => {
      if (refreshHandlerRef.current === handler) {
        refreshHandlerRef.current = async () => {};
      }
    };
  }, []);

  const refreshFromSupabase = useCallback(async () => {
    await refreshHandlerRef.current();
  }, []);

  const updateProfileWithColumnFallback = useCallback(
    async (userId: string, fullPayload: Record<string, any>) => {
      const stripKeys = (obj: Record<string, any>, keys: string[]) => {
        const clone = { ...obj };
        for (const key of keys) delete clone[key];
        return clone;
      };

      let candidate = { ...fullPayload };
      let res = await supabase.from('profiles').update(candidate).eq('id', userId);

      for (let attempt = 0; attempt < 8 && res.error && isMissingColumnError(res.error); attempt++) {
        const missingCol = extractMissingProfileColumn(res.error);
        if (missingCol && missingCol in candidate) {
          candidate = stripKeys(candidate, [missingCol]);
        } else {
          break;
        }
        if (Object.keys(candidate).length === 0) break;
        res = await supabase.from('profiles').update(candidate).eq('id', userId);
      }

      const fallbackSteps: string[][] = [
        ['last_login_at'],
        ['access_status'],
        ['access_status', 'last_login_at'],
        ['access_status', 'approval_status'],
        ['access_status', 'approval_status', 'language'],
        ['access_status', 'approval_status', 'language', 'access'],
        ['access_status', 'approval_status', 'language', 'access', 'operational_role'],
        ['access_status', 'approval_status', 'language', 'access', 'operational_role', 'is_socio'],
        [
          'access_status',
          'approval_status',
          'language',
          'access',
          'operational_role',
          'is_socio',
          'active'
        ]
      ];

      for (const keysToStrip of fallbackSteps) {
        if (!res.error || !isMissingColumnError(res.error)) {
          break;
        }
        const nextCandidate = stripKeys(candidate, keysToStrip);
        if (Object.keys(nextCandidate).length === 0) break;
        res = await supabase.from('profiles').update(nextCandidate).eq('id', userId);
      }

      return res;
    },
    []
  );

  const upsertProfileWithColumnFallback = useCallback(
    async (fullPayload: Record<string, any>) => {
      const stripKeys = (obj: Record<string, any>, keys: string[]) => {
        const clone = { ...obj };
        for (const key of keys) delete clone[key];
        return clone;
      };

      let candidate = { ...fullPayload };
      let res = await supabase.from('profiles').upsert(candidate, { onConflict: 'id' });

      for (let attempt = 0; attempt < 8 && res.error && isMissingColumnError(res.error); attempt++) {
        const missingCol = extractMissingProfileColumn(res.error);
        if (missingCol && missingCol in candidate) {
          candidate = stripKeys(candidate, [missingCol]);
        } else {
          break;
        }
        if (Object.keys(candidate).length === 0) break;
        res = await supabase.from('profiles').upsert(candidate, { onConflict: 'id' });
      }

      const fallbackSteps: string[][] = [
        ['last_login_at'],
        ['access_status'],
        ['access_status', 'last_login_at'],
        ['access_status', 'approval_status'],
        ['access_status', 'approval_status', 'language'],
        ['access_status', 'approval_status', 'language', 'operational_role'],
        ['access_status', 'approval_status', 'language', 'operational_role', 'is_socio'],
        ['access_status', 'approval_status', 'language', 'operational_role', 'is_socio', 'access'],
        [
          'access_status',
          'approval_status',
          'language',
          'operational_role',
          'is_socio',
          'access',
          'active'
        ]
      ];

      for (const keysToStrip of fallbackSteps) {
        if (!res.error || !isMissingColumnError(res.error)) {
          break;
        }
        const nextCandidate = stripKeys(candidate, keysToStrip);
        if (Object.keys(nextCandidate).length === 0) break;
        res = await supabase.from('profiles').upsert(nextCandidate, { onConflict: 'id' });
      }

      return { error: res.error, payload: candidate };
    },
    []
  );

  const syncUserProfile = useCallback(
    async (userId: string, userEmail?: string, userMeta?: any, appMeta?: any): Promise<boolean> => {
      lastAuthDenialErrorRef.current = null;
      try {
        const { data: sessionCheckData } = await supabase.auth.getSession();
        const verifiedSession = sessionCheckData?.session;
        if (
          !userEmail ||
          !verifiedSession?.access_token ||
          !verifiedSession.user ||
          verifiedSession.user.id !== userId
        ) {
          await supabase.auth.signOut();
          clearCachedAuthSession();
          setCurrentUser(null);
          setCurrentTeacherId('');
          setCurrentStudentId('');
          return false;
        }

        const emailNormalized = (verifiedSession.user.email || userEmail).toLowerCase().trim();
        const isMasterAdmin = emailNormalized === MASTER_ADMIN_EMAIL;
        const isGoogleProvider =
          appMeta?.provider === 'google' ||
          (Array.isArray(appMeta?.providers) && appMeta.providers.includes('google')) ||
          Boolean(userMeta?.iss?.includes('google'));
        const googleMeta = extractGoogleProfileMetadata(userMeta, emailNormalized);
        const preferredLanguage = normalizeAppLanguage(
          userMeta?.language ||
            (() => {
              try {
                return localStorage.getItem('triskell_language');
              } catch {
                return null;
              }
            })()
        );

        const [profileByUidRes, profileByEmailRes, teacherMatchRes, studentMatchRes] =
          await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
            supabase.from('profiles').select('*').ilike('email', emailNormalized).maybeSingle(),
            supabase
              .from('teachers')
              .select('id, name, email, avatar_url, active, status, is_socio, member_type, end_date')
              .ilike('email', emailNormalized)
              .maybeSingle(),
            supabase
              .from('students')
              .select('id, name, email, status, validation_status, is_socio, member_type, end_date, profile_id')
              .ilike('email', emailNormalized)
              .maybeSingle()
          ]);

        if (profileByUidRes.error) {
          console.warn('[TRISKELL AUTH] Error consultando perfil por ID:', profileByUidRes.error.message);
        }
        if (profileByEmailRes.error) {
          console.warn(
            '[TRISKELL AUTH] Error consultando perfil por email:',
            profileByEmailRes.error.message
          );
        }

        const profileByUid = profileByUidRes.data;
        const profileByEmail = profileByEmailRes.data;
        let resolvedProfile = profileByUid || profileByEmail;
        let createdPendingGoogleProfile = false;
        let teacherMatch = teacherMatchRes.data;
        let studentMatch = studentMatchRes.data;

        if (!isMasterAdmin && isGoogleProvider) {
          const todayStr = getMadridDateIso();
          if (!profileByUid && !profileByEmail) {
            const pendingPayload: Record<string, any> = {
              id: userId,
              email: emailNormalized,
              full_name:
                googleMeta.fullName ||
                emailNormalized.split('@')[0] ||
                t('appContext.fallbackUser'),
              avatar_url: googleMeta.avatarUrl,
              role: DEFAULT_BASE_USER_ROLE,
              access: false,
              active: false,
              access_status: 'pending',
              approval_status: 'pending',
              is_socio: false,
              operational_role: 'vacio',
              start_date: todayStr,
              end_date: null,
              language: preferredLanguage
            };
            const upsertRes = await upsertProfileWithColumnFallback(pendingPayload);
            if (!upsertRes.error) {
              createdPendingGoogleProfile = true;
              resolvedProfile = {
                ...pendingPayload,
                ...upsertRes.payload
              };
            } else {
              console.warn(
                '[TRISKELL AUTH] No se pudo crear el perfil pendiente de Google:',
                upsertRes.error.message
              );
            }
          } else if (profileByUid) {
            const currentProfEmail = (profileByUid.email || '').trim().toLowerCase();
            const needsNameRepair = Boolean(
              googleMeta.fullName && isPlaceholderProfileName(profileByUid.full_name)
            );
            const needsEmailRepair = !currentProfEmail || currentProfEmail !== emailNormalized;
            const needsAvatarRepair = Boolean(googleMeta.avatarUrl && !profileByUid.avatar_url);
            const isPendingRow = isPendingApprovalProfile(profileByUid);
            const needsPendingStatusRepair =
              isPendingRow && !resolveProfileAccessStatus(profileByUid);

            if (
              needsNameRepair ||
              needsEmailRepair ||
              needsAvatarRepair ||
              needsPendingStatusRepair
            ) {
              const repairPayload: Record<string, any> = {};
              if (needsNameRepair) repairPayload.full_name = googleMeta.fullName;
              if (needsEmailRepair) repairPayload.email = emailNormalized;
              if (needsAvatarRepair) repairPayload.avatar_url = googleMeta.avatarUrl;
              if (needsPendingStatusRepair) {
                repairPayload.access_status = 'pending';
                repairPayload.approval_status = 'pending';
              }
              const repairRes = await updateProfileWithColumnFallback(userId, repairPayload);
              if (!repairRes.error) {
                resolvedProfile = {
                  ...profileByUid,
                  ...repairPayload
                };
              } else {
                console.warn(
                  '[TRISKELL AUTH] No se pudieron sincronizar metadatos del perfil Google:',
                  repairRes.error.message
                );
              }
            }
          }
        }

        if (!teacherMatch && resolvedProfile?.teacher_id) {
          const linkedTeacherRes = await supabase
            .from('teachers')
            .select('id, name, email, avatar_url, active, status, is_socio, member_type, end_date')
            .eq('id', resolvedProfile.teacher_id)
            .maybeSingle();
          teacherMatch = linkedTeacherRes.data;
        }
        if (!studentMatch && resolvedProfile?.student_id) {
          const linkedStudentRes = await supabase
            .from('students')
            .select('id, name, email, status, validation_status, is_socio, member_type, end_date, profile_id')
            .eq('id', resolvedProfile.student_id)
            .maybeSingle();
          studentMatch = linkedStudentRes.data;
        }

        const hasExplicitActiveAccess = isProfileExplicitlyAuthorized(
          resolvedProfile,
          emailNormalized
        );

        if (!isMasterAdmin && !hasExplicitActiveAccess) {
          if (import.meta.env.DEV) {
            console.warn('[TRISKELL AUTH] Acceso no autorizado o pendiente de aprobación');
          }
          await supabase.auth.signOut();
          clearCachedAuthSession();
          setCurrentUser(null);
          setCurrentRoleState(UserRole.Socio);
          setCurrentTeacherId('');
          setCurrentStudentId('');
          const denial = resolveAuthDenial(
            resolvedProfile,
            userEmail,
            createdPendingGoogleProfile
          );
          lastAuthDenialErrorRef.current = denial.message;
          setAuthDenialKind(denial.kind);
          setDbError(denial.message);
          return false;
        }

        if (
          isDeactivatedAccount({
            email: emailNormalized,
            profile: resolvedProfile,
            teacher: teacherMatch,
            student: studentMatch
          })
        ) {
          if (import.meta.env.DEV) {
            console.warn('[TRISKELL AUTH] Acceso denegado (usuario de baja/pendiente)');
          }
          await supabase.auth.signOut();
          clearCachedAuthSession();
          setCurrentUser(null);
          setCurrentRoleState(UserRole.Socio);
          setCurrentTeacherId('');
          setCurrentStudentId('');
          const denial = resolveAuthDenial(resolvedProfile, userEmail);
          lastAuthDenialErrorRef.current = denial.message;
          setAuthDenialKind(denial.kind);
          setDbError(denial.message);
          return false;
        }

        const resolvedIsSocio = resolvedProfile
          ? deriveIsSocioFromRow(resolvedProfile)
          : studentMatch
          ? deriveIsSocioFromRow(studentMatch)
          : teacherMatch
          ? deriveIsSocioFromRow(teacherMatch)
          : true;

        const calculatedAuth = calculateUserAuthState({
          currentRole: isMasterAdmin
            ? UserRole.Admin
            : isValidUserRole(resolvedProfile?.role)
            ? normalizeUserRole(resolvedProfile?.role)
            : undefined,
          email: emailNormalized,
          hasActiveStudentAssignment: Boolean(studentMatch && studentMatch.status !== 'inactive'),
          hasActiveTeacherAssignment: Boolean(teacherMatch && teacherMatch.active !== false),
          isSocio: resolvedIsSocio,
          manualAccess: isMasterAdmin ? true : hasExplicitActiveAccess,
          preserveExplicitRoleOnCreation: Boolean(
            resolvedProfile?.role && isValidUserRole(resolvedProfile.role)
          )
        });

        const role: UserRole = toCanonicalProfileRole(
          isMasterAdmin ? UserRole.Admin : resolvedProfile?.role || calculatedAuth.role,
          UserRole.Socio
        );
        const access = isMasterAdmin ? true : hasExplicitActiveAccess;

        const existingFullName =
          resolvedProfile?.full_name && !isPlaceholderProfileName(resolvedProfile.full_name)
            ? resolvedProfile.full_name.trim()
            : '';
        const fullName =
          existingFullName ||
          teacherMatch?.name ||
          studentMatch?.name ||
          googleMeta.fullName ||
          emailNormalized.split('@')[0] ||
          t('appContext.fallbackUser');
        const avatarUrl =
          resolvedProfile?.avatar_url ||
          teacherMatch?.avatar_url ||
          googleMeta.avatarUrl ||
          undefined;
        const teacherId = resolvedProfile?.teacher_id || teacherMatch?.id || undefined;
        const studentId = resolvedProfile?.student_id || studentMatch?.id || undefined;
        const userLanguage = normalizeAppLanguage(resolvedProfile?.language || preferredLanguage);
        const loginNowIso = new Date().toISOString();

        try {
          let upsertErr: { code?: string; message: string } | null = null;
          if (profileByUid) {
            const safeMetaPayload = isMasterAdmin
              ? {
                  email: emailNormalized,
                  full_name: fullName,
                  avatar_url: avatarUrl || null,
                  role: UserRole.Admin,
                  access: true,
                  active: true,
                  access_status: 'approved',
                  approval_status: 'approved',
                  teacher_id: teacherId || null,
                  student_id: studentId || null,
                  last_login_at: loginNowIso
                }
              : {
                  ...(!profileByUid.email ||
                  profileByUid.email.trim().toLowerCase() !== emailNormalized
                    ? { email: emailNormalized }
                    : {}),
                  full_name: fullName,
                  avatar_url: avatarUrl || null,
                  last_login_at: loginNowIso
                };

            const extPayload = { ...safeMetaPayload, language: userLanguage };
            const res = await updateProfileWithColumnFallback(userId, extPayload);
            upsertErr = res.error;
          } else if (isMasterAdmin) {
            const masterUpsert = {
              id: userId,
              email: emailNormalized,
              full_name: fullName,
              avatar_url: avatarUrl || null,
              role: UserRole.Admin,
              teacher_id: teacherId || null,
              student_id: studentId || null,
              language: userLanguage,
              access: true,
              active: true,
              access_status: 'approved',
              approval_status: 'approved',
              last_login_at: loginNowIso
            };
            const res = await upsertProfileWithColumnFallback(masterUpsert);
            upsertErr = res.error;
          }
          if (upsertErr) {
            console.warn('profiles sync warning:', upsertErr.message);
          }
        } catch (upsertEx) {
          console.warn('profiles sync exception:', upsertEx);
        }

        const resolvedOpRole = resolvedProfile?.operational_role
          ? normalizeOperationalRole(resolvedProfile.operational_role)
          : normalizeOperationalRole(role);

        const authUserObj: AuthUser = {
          id: userId,
          email: emailNormalized,
          name: fullName,
          photoURL: avatarUrl,
          role,
          access,
          operationalRole: resolvedOpRole,
          isSocio: resolvedIsSocio,
          language: userLanguage,
          teacherId: teacherId,
          studentId: studentId,
          memberNumber: resolvedProfile?.member_number || undefined,
          memberType:
            (resolvedProfile?.member_type as MemberType) ||
            (resolvedIsSocio ? 'socio' : 'alumno_no_socio'),
          startDate:
            resolvedProfile?.start_date ||
            (typeof resolvedProfile?.created_at === 'string'
              ? resolvedProfile.created_at.split('T')[0]
              : undefined),
          endDate: resolvedProfile?.end_date || undefined,
          active: access,
          provider: isGoogleProvider ? 'google' : 'email',
          lastLogin: loginNowIso
        };

        setAuthDenialKind(null);
        setDbError(null);
        setCurrentUser(authUserObj);
        setCurrentRoleState(role);
        setLanguageState(userLanguage);
        if (teacherId) setCurrentTeacherId(teacherId);
        if (studentId) setCurrentStudentId(studentId);

        clearCachedAuthSession();
        try {
          localStorage.setItem('triskell_last_activity_at', String(Date.now()));
        } catch {
          // Ignorar si localStorage no está disponible
        }

        return true;
      } catch (e: any) {
        console.error('Error synchronizing user profile:', e);
        handleSupabaseError(t('appContext.actions.syncUserProfile'), e);
        return false;
      }
    },
    [
      handleSupabaseError,
      resolveAuthDenial,
      t,
      updateProfileWithColumnFallback,
      upsertProfileWithColumnFallback
    ]
  );

  useEffect(() => {
    let mounted = true;
    let initialHandled = false;

    const initAuth = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const oauthError = searchParams.get('error') || hashParams.get('error');
        const oauthErrorDesc =
          searchParams.get('error_description') || hashParams.get('error_description');

        if (oauthError) {
          clearCachedAuthSession();
          setCurrentUser(null);
          await supabase.auth.signOut().catch(() => undefined);
          const cleanUrl =
            window.location.pathname +
            (window.location.search.includes('error=') ? '' : window.location.search);
          window.history.replaceState({}, document.title, cleanUrl || '/');
          const lowerDesc = (oauthErrorDesc || '').toLowerCase();
          if (
            lowerDesc.includes('pending') ||
            lowerDesc.includes('pendiente') ||
            lowerDesc.includes('pendente') ||
            lowerDesc.includes('approval') ||
            lowerDesc.includes('aprobaci')
          ) {
            setAuthDenialKind('pending');
            setDbError(t('appContext.accountPendingApproval', { email: 'Google' }));
          } else {
            setAuthDenialKind('unauthorized');
            setDbError(
              oauthErrorDesc && !lowerDesc.includes('database error saving new user')
                ? oauthErrorDesc
                : t('appContext.unauthorizedEmail', { email: 'Google' })
            );
          }
          return;
        }

        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth session verification timeout')), 8000)
        );
        const {
          data: { session },
          error
        } = await Promise.race([sessionPromise, timeoutPromise]);

        if (!mounted) return;
        if (error) {
          console.warn('Error checking initial Supabase session:', error.message);
        }

        if (session?.user && session.access_token) {
          initialHandled = true;
          await syncUserProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata,
            session.user.app_metadata
          );
        } else {
          clearCachedAuthSession();
          disableBiometricsUtil();
          setBiometricUserState(null);
          setCurrentUser(null);
        }
      } catch (err: any) {
        console.warn('Initial auth verification fallback:', err?.message || err);
      } finally {
        if (mounted) {
          setIsAuthReady(true);
          setIsAuthLoading(false);
        }
      }
    };

    void initAuth();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      try {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecoveryMode(true);
          setIsAuthModalOpen(true);
        }

        if (event === 'INITIAL_SESSION') {
          if (session?.user && !initialHandled) {
            initialHandled = true;
            await syncUserProfile(
              session.user.id,
              session.user.email,
              session.user.user_metadata,
              session.user.app_metadata
            );
          }
          return;
        }

        if (session?.user) {
          await syncUserProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata,
            session.user.app_metadata
          );
        } else if (event === 'SIGNED_OUT') {
          clearCachedAuthSession();
          setCurrentUser(null);
        }
      } catch (err: any) {
        console.error('Error handling auth state change:', err);
      } finally {
        if (mounted) {
          setIsAuthReady(true);
          setIsAuthLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncUserProfile, t]);

  const lastFocusRefreshRef = useRef<number>(0);

  useEffect(() => {
    if (!isAuthReady) return;

    if (!currentUser) {
      setIsLoadingDb(false);
      return;
    }

    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 1500) return;
      lastFocusRefreshRef.current = now;
      void refreshFromSupabase();
    };

    lastFocusRefreshRef.current = Date.now();
    void refreshFromSupabase();

    const handleWindowFocus = () => {
      triggerRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerRefresh();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const channel = supabase
      .channel('triskell_db_realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        triggerRefresh();
      })
      .subscribe();

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [isAuthReady, currentUser?.id, refreshFromSupabase]);

  const setCurrentRole = useCallback(
    (newRole: UserRole) => {
      const normalizedNext = normalizeUserRole(newRole);
      if (!currentUser || currentUser.id.startsWith('demo-') || currentUser.id.startsWith('usr-')) {
        setCurrentRoleState(normalizedNext);
        return;
      }

      if (currentUser.role === UserRole.Admin) {
        const adminAllowedPerspectives: UserRole[] = [
          UserRole.Admin,
          UserRole.Monitor,
          UserRole.Alumno,
          UserRole.Hibrido
        ];
        setCurrentRoleState(
          adminAllowedPerspectives.includes(normalizedNext) ? normalizedNext : UserRole.Admin
        );
        return;
      }

      if (currentUser.role === UserRole.Hibrido) {
        const hybridAllowedPerspectives: UserRole[] = [
          UserRole.Hibrido,
          UserRole.Monitor,
          UserRole.Alumno
        ];
        setCurrentRoleState(
          hybridAllowedPerspectives.includes(normalizedNext) ? normalizedNext : UserRole.Hibrido
        );
        return;
      }

      setCurrentRoleState(currentUser.role);
    },
    [currentUser]
  );

  const setUserLanguage = useCallback(
    async (newLang: AppLanguage): Promise<{ success: boolean; error?: string }> => {
      const normalized = normalizeAppLanguage(newLang);
      setLanguageState(normalized);
      document.documentElement.lang = normalized;

      try {
        localStorage.setItem('triskell_language', normalized);
      } catch {
        // Ignorar si localStorage no está disponible
      }

      if (currentUser) {
        setCurrentUser(prev => (prev ? { ...prev, language: normalized } : prev));
        setProfiles(prev =>
          prev.map(p => (p.id === currentUser.id ? { ...p, language: normalized } : p))
        );

        if (!currentUser.id.startsWith('usr-') && !currentUser.id.startsWith('demo-')) {
          try {
            const { error } = await supabase
              .from('profiles')
              .update({ language: normalized })
              .eq('id', currentUser.id);
            if (error) {
              if (error.code === '42703' || error.message?.includes('column')) {
                return {
                  success: false,
                  error: 'missing_language_column'
                };
              }
              return { success: false, error: error.message };
            }
          } catch (err: any) {
            return { success: false, error: err?.message || t('appContext.saveLanguageError') };
          }
        }
      }

      return { success: true };
    },
    [currentUser, t]
  );

  const loginWithGoogle = async () => {
    clearDbError();
    clearCachedAuthSession();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (error) {
        clearCachedAuthSession();
        setCurrentUser(null);
        handleSupabaseError(t('appContext.actions.googleLogin'), error);
      }
    } catch (e: any) {
      clearCachedAuthSession();
      setCurrentUser(null);
      handleSupabaseError(t('appContext.actions.googleLogin'), e);
    }
  };

  const loginWithEmail = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    lastAuthDenialErrorRef.current = null;
    try {
      const emailNorm = email.toLowerCase().trim();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password: pass
      });

      if (error) {
        handleSupabaseError(t('appContext.actions.emailLogin'), error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        const synced = await syncUserProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata,
          data.user.app_metadata
        );
        if (!synced) {
          return {
            success: false,
            error: lastAuthDenialErrorRef.current || t('appContext.accessDenied', { email })
          };
        }
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || t('appContext.authError') };
    }
  };

  const changePassword = async (
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const trimmed = newPassword.trim();
      if (trimmed.length < 6) {
        return {
          success: false,
          error: t('appContext.passwordMinLength')
        };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return {
          success: false,
          error: t('appContext.noActiveSupabaseSession')
        };
      }

      const { error } = await supabase.auth.updateUser({ password: trimmed });
      if (error) {
        handleSupabaseError(t('appContext.actions.changePassword'), error);
        return { success: false, error: error.message };
      }

      setIsPasswordRecoveryMode(false);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || t('appContext.passwordUpdateError') };
    }
  };

  const requestPasswordReset = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const emailNorm = email.trim().toLowerCase();
      if (!emailNorm) {
        return { success: false, error: t('appContext.enterEmail') };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        redirectTo: window.location.origin
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || t('appContext.recoveryEmailError') };
    }
  };

  const logout = useCallback(async () => {
    try {
      clearCachedAuthSession();
      try {
        localStorage.removeItem('triskell_last_activity_at');
      } catch {
        // Ignorar si localStorage no está disponible
      }
      setIsPasswordRecoveryMode(false);
      await supabase.auth.signOut();
      setCurrentUser(null);
    } catch (e) {
      console.error('Error logging out:', e);
    }
  }, []);

  const sessionInactivityCfg = useMemo(
    () => parseSessionInactivityConfig(appConfigs),
    [appConfigs]
  );
  const lastUserActivityMsRef = useRef<number>(Date.now());
  const isClosingInactivityRef = useRef(false);

  useEffect(() => {
    if (!currentUser || !currentUser.access) {
      isClosingInactivityRef.current = false;
      return;
    }
    if (!sessionInactivityCfg.enabled || sessionInactivityCfg.minutes <= 0) {
      return;
    }

    const timeoutMs = sessionInactivityCfg.minutes * 60 * 1000;
    const STORAGE_KEY = 'triskell_last_activity_at';
    const initialNow = Date.now();
    lastUserActivityMsRef.current = initialNow;
    try {
      localStorage.setItem(STORAGE_KEY, String(initialNow));
    } catch {
      // Ignorar si localStorage no está disponible
    }

    let lastRecordedActivityMs = initialNow;
    const markActivity = () => {
      if (isClosingInactivityRef.current) return;
      const now = Date.now();
      if (now - lastRecordedActivityMs < 5000) return;
      lastRecordedActivityMs = now;
      lastUserActivityMsRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // Ignorar si localStorage no está disponible
      }
    };

    const checkInactivity = () => {
      if (isClosingInactivityRef.current) return;
      let latestActivityMs = lastUserActivityMsRef.current;
      try {
        const storedRaw = localStorage.getItem(STORAGE_KEY);
        if (storedRaw) {
          const parsed = Number(storedRaw);
          if (Number.isFinite(parsed) && parsed > latestActivityMs) {
            latestActivityMs = parsed;
            lastUserActivityMsRef.current = parsed;
          }
        }
      } catch {
        // Ignorar si localStorage no está disponible
      }

      if (Date.now() - latestActivityMs >= timeoutMs) {
        isClosingInactivityRef.current = true;
        const configuredMinutes = sessionInactivityCfg.minutes;
        void (async () => {
          await logout();
          setAuthDenialKind(null);
          setDbError(t('appContext.sessionExpiredInactivity', { minutes: configuredMinutes }));
          isClosingInactivityRef.current = false;
        })();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'scroll',
      'click',
      'pointerdown'
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, markActivity, { passive: true });
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };
    window.addEventListener('focus', checkInactivity);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const intervalId = window.setInterval(checkInactivity, 10000);

    return () => {
      for (const evt of activityEvents) {
        window.removeEventListener(evt, markActivity);
      }
      window.removeEventListener('focus', checkInactivity);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.clearInterval(intervalId);
    };
  }, [
    currentUser?.id,
    currentUser?.access,
    sessionInactivityCfg.enabled,
    sessionInactivityCfg.minutes,
    logout,
    t
  ]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  const updateAppConfig = async (
    config_key: string,
    config_value: string,
    is_active: boolean,
    description?: string
  ) => {
    const nowIso = new Date().toISOString();
    setAppConfigs(prev => {
      const exists = prev.some(c => c.config_key === config_key);
      const updated = exists
        ? prev.map(c =>
            c.config_key === config_key
              ? {
                  ...c,
                  config_value,
                  is_active,
                  ...(description !== undefined ? { description } : {}),
                  updated_at: nowIso
                }
              : c
          )
        : [
            ...prev,
            {
              config_key,
              config_value,
              is_active,
              description,
              updated_at: nowIso
            }
          ];
      localStorage.setItem('triskell_app_configs', JSON.stringify(updated));
      return updated;
    });

    try {
      const payload: Record<string, unknown> = {
        config_key,
        config_value,
        is_active,
        updated_at: nowIso
      };
      if (description !== undefined) {
        payload.description = description;
      }

      const { error } = await supabase
        .from('app_config')
        .upsert(payload, { onConflict: 'config_key' });
      if (error) {
        console.warn('Could not persist to Supabase app_config:', error.message);
      } else {
        await refreshFromSupabase();
      }
    } catch (e) {
      console.warn('app_config persistence error:', e);
    }
  };

  const addAppConfig = async (config: AppConfigSetting) => {
    const nowIso = new Date().toISOString();
    setAppConfigs(prev => {
      const filtered = prev.filter(c => c.config_key !== config.config_key);
      const updated = [...filtered, { ...config, updated_at: nowIso }];
      localStorage.setItem('triskell_app_configs', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('app_config').upsert(
        {
          config_key: config.config_key,
          config_value: config.config_value,
          is_active: config.is_active,
          description: config.description,
          updated_at: nowIso
        },
        { onConflict: 'config_key' }
      );
      if (!error) {
        await refreshFromSupabase();
      }
    } catch (e) {
      console.warn('app_config upsert error:', e);
    }
  };

  const deleteAppConfig = async (config_key: string) => {
    setAppConfigs(prev => {
      const updated = prev.filter(c => c.config_key !== config_key);
      localStorage.setItem('triskell_app_configs', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('app_config').delete().eq('config_key', config_key);
      if (!error) {
        await refreshFromSupabase();
      }
    } catch (e) {
      console.warn('app_config delete error:', e);
    }
  };

  const enableBiometrics = async (): Promise<boolean> => {
    throw new Error(translate(languageRef.current, 'biometrics.notSupported'));
  };

  const disableBiometrics = () => {
    disableBiometricsUtil();
    setBiometricUserState(null);
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    clearCachedAuthSession();
    disableBiometricsUtil();
    setBiometricUserState(null);
    throw new Error(translate(languageRef.current, 'biometrics.browserNotSupported'));
  };

  const recordStatusHistoryCycle = useCallback(
    async (params: {
      entityType: 'student' | 'teacher' | 'profile';
      entityId: string;
      status: 'active' | 'inactive' | 'trial' | 'pending_validation';
      startDate: string;
      endDate?: string;
      notes?: string;
    }) => {
      try {
        const cleanStart = params.startDate || getMadridDateIso();
        const { data: openPrevious } = await supabase
          .from('member_status_history')
          .select('id')
          .eq('entity_type', params.entityType)
          .eq('entity_id', params.entityId)
          .is('end_date', null)
          .limit(1)
          .maybeSingle();

        if (openPrevious?.id) {
          await supabase
            .from('member_status_history')
            .update({ end_date: cleanStart })
            .eq('id', openPrevious.id);
        }

        const payload = {
          entity_type: params.entityType,
          entity_id: params.entityId,
          status: params.status,
          start_date: cleanStart,
          end_date: params.endDate || null,
          notes: params.notes || null,
          changed_by: currentUser?.id || null
        };
        await supabase.from('member_status_history').insert([payload]);
      } catch (e) {
        console.warn('recordStatusHistoryCycle fallback (tabla no migrada o RLS):', e);
      }
    },
    [currentUser?.id]
  );

  const reevaluateUserOperationalRole: AuthContextType['reevaluateUserOperationalRole'] =
    useCallback(
      async targets => {
        const results: Array<{
          profileId: string;
          role: UserRole;
          operationalRole: OperationalRole;
          isSocio: boolean;
          access: boolean;
          active: boolean;
          status: 'active' | 'inactive';
          category: OperationalRoleCategory;
        }> = [];

        try {
          const [profRes, tcRes, stRes, enrRes, actRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('id, email, full_name, role, operational_role, is_socio, member_type, access, active, student_id, teacher_id, end_date'),
            supabase
              .from('teachers')
              .select('id, email, active, status, is_socio, member_type'),
            supabase
              .from('students')
              .select('id, profile_id, email, status, validation_status, is_socio, member_type'),
            supabase
              .from('student_enrollments')
              .select('id, student_id, activity_id, active, status, deleted_at'),
            supabase
              .from('activities')
              .select('id, teacher_id, active, status')
          ]);

          if (profRes.error || !profRes.data) {
            return { updatedProfiles: 0, results };
          }

          const allProfiles = profRes.data as any[];
          const allTeachers = (tcRes.data || []) as any[];
          const allStudents = (stRes.data || []) as any[];
          const allEnrollments = (enrRes.data || []) as any[];
          const allActivities = (actRes.data || []) as any[];

          const activeActivityIds = new Set<string>(
            allActivities
              .filter(
                a =>
                  a.active !== false &&
                  a.status !== 'pending' &&
                  a.status !== 'pending_validation' &&
                  a.status !== 'inactive'
              )
              .map(a => a.id)
          );

          const targetStudentRow = targets.studentId
            ? allStudents.find(s => s.id === targets.studentId)
            : undefined;
          const targetTeacherRow = targets.teacherId
            ? allTeachers.find(tc => tc.id === targets.teacherId)
            : undefined;
          const targetEmails = new Set<string>(
            [targets.email, targetStudentRow?.email, targetTeacherRow?.email]
              .filter((e): e is string => Boolean(e && String(e).trim()))
              .map(e => String(e).toLowerCase().trim())
          );

          const matchedProfiles = new Map<string, any>();
          for (const p of allProfiles) {
            const pEmail = (p.email || '').toLowerCase().trim();
            const isDirectMatch =
              (targets.profileId && p.id === targets.profileId) ||
              (targets.studentId &&
                (p.student_id === targets.studentId ||
                  (targetStudentRow?.profile_id && p.id === targetStudentRow.profile_id))) ||
              (targets.teacherId && p.teacher_id === targets.teacherId) ||
              (pEmail && targetEmails.has(pEmail));

            if (isDirectMatch) {
              matchedProfiles.set(p.id, p);
            }
          }

          if (matchedProfiles.size === 0) {
            return { updatedProfiles: 0, results };
          }

          const todayStr = getMadridDateIso();
          let updatedProfiles = 0;

          for (const prof of matchedProfiles.values()) {
            const profEmail = (prof.email || '').toLowerCase().trim();
            const linkedStudent = allStudents.find(
              s =>
                (prof.student_id && s.id === prof.student_id) ||
                s.profile_id === prof.id ||
                (profEmail && (s.email || '').toLowerCase().trim() === profEmail)
            );
            const linkedTeacher = allTeachers.find(
              tc =>
                (prof.teacher_id && tc.id === prof.teacher_id) ||
                (profEmail && (tc.email || '').toLowerCase().trim() === profEmail)
            );

            const hasActiveStudentAssignment = Boolean(
              linkedStudent &&
                linkedStudent.status !== 'inactive' &&
                linkedStudent.status !== 'pending_validation' &&
                linkedStudent.status !== 'pending' &&
                linkedStudent.validation_status !== 'pending' &&
                allEnrollments.some(
                  e =>
                    e.student_id === linkedStudent.id &&
                    e.active !== false &&
                    !e.deleted_at &&
                    e.status !== 'pending' &&
                    e.status !== 'pending_enrollment' &&
                    e.status !== 'pending_validation' &&
                    e.status !== 'rejected' &&
                    e.status !== 'inactive' &&
                    activeActivityIds.has(e.activity_id)
                )
            );

            const hasActiveTeacherAssignment = Boolean(
              linkedTeacher &&
                linkedTeacher.active !== false &&
                linkedTeacher.status !== 'pending' &&
                linkedTeacher.status !== 'pending_validation' &&
                linkedTeacher.status !== 'inactive' &&
                allActivities.some(
                  a =>
                    a.teacher_id === linkedTeacher.id &&
                    a.active !== false &&
                    a.status !== 'pending' &&
                    a.status !== 'pending_validation' &&
                    a.status !== 'inactive'
                )
            );

            const hasExplicitProfSocio = typeof prof.is_socio === 'boolean';
            const hasExplicitStudentSocio = typeof linkedStudent?.is_socio === 'boolean';
            const hasExplicitTeacherSocio = typeof linkedTeacher?.is_socio === 'boolean';
            let isSocio: boolean;
            if (hasExplicitProfSocio) {
              isSocio = prof.is_socio;
            } else if (hasExplicitStudentSocio || hasExplicitTeacherSocio) {
              isSocio = Boolean(
                (hasExplicitStudentSocio && linkedStudent.is_socio) ||
                  (hasExplicitTeacherSocio && linkedTeacher.is_socio)
              );
            } else {
              const pType = prof.member_type as MemberType | null | undefined;
              const sType = linkedStudent?.member_type as MemberType | null | undefined;
              const tType = linkedTeacher?.member_type as MemberType | null | undefined;
              isSocio = !(
                pType === 'alumno_no_socio' ||
                pType === 'monitor_no_socio' ||
                (sType === 'alumno_no_socio' && tType !== 'socio') ||
                (tType === 'monitor_no_socio' && sType !== 'socio')
              );
            }

            const outcome = computeOperationalRoleOutcome({
              currentRole: prof.role,
              email: prof.email,
              hasActiveStudentAssignment,
              hasActiveTeacherAssignment,
              isSocio,
              manualAccess: targets.manualAccess
            });

            results.push({
              profileId: prof.id,
              role: outcome.role,
              operationalRole: outcome.operationalRole,
              isSocio: outcome.isSocio,
              access: outcome.access,
              active: outcome.active,
              status: outcome.status,
              category: outcome.category
            });

            const prevRole = isValidUserRole(prof.role) ? normalizeUserRole(prof.role) : undefined;
            const prevOpRole = prof.operational_role
              ? normalizeOperationalRole(prof.operational_role)
              : undefined;
            const prevIsSocio = typeof prof.is_socio === 'boolean' ? prof.is_socio : undefined;
            const prevAccess = deriveAccessFromRow(prof, prof.email);

            if (outcome.category === 'admin_preserved') {
              if (
                prevRole !== UserRole.Admin ||
                prevOpRole !== outcome.operationalRole ||
                prevIsSocio !== outcome.isSocio ||
                prevAccess !== outcome.access
              ) {
                const adminPayload = {
                  role: UserRole.Admin,
                  operational_role: outcome.operationalRole,
                  is_socio: outcome.isSocio,
                  access: outcome.access,
                  active: outcome.active
                };
                const adminSyncRes = await supabase
                  .from('profiles')
                  .update(adminPayload)
                  .eq('id', prof.id);
                if (
                  adminSyncRes.error &&
                  (adminSyncRes.error.code === '42703' ||
                    adminSyncRes.error.message?.includes('column'))
                ) {
                  const { access: _ignoredAccess, ...legacyAdmin } = adminPayload;
                  await supabase.from('profiles').update(legacyAdmin).eq('id', prof.id);
                }
                setProfiles(prev =>
                  prev.map(item =>
                    item.id === prof.id
                      ? {
                          ...item,
                          role: UserRole.Admin,
                          operationalRole: outcome.operationalRole,
                          isSocio: outcome.isSocio,
                          access: outcome.access,
                          active: outcome.active
                        }
                      : item
                  )
                );
              }
              continue;
            }

            const needsProfileUpdate =
              outcome.role !== prevRole ||
              outcome.operationalRole !== prevOpRole ||
              outcome.isSocio !== prevIsSocio ||
              outcome.access !== prevAccess ||
              (outcome.access && Boolean(prof.end_date));

            if (needsProfileUpdate) {
              const canonicalOutcomeRole = toCanonicalProfileRole(outcome.role, UserRole.Socio);
              const fullPayloadWithAccess: Record<string, any> = {
                role: canonicalOutcomeRole,
                operational_role: outcome.operationalRole,
                is_socio: outcome.isSocio,
                access: outcome.access,
                active: outcome.active,
                end_date: outcome.access ? null : todayStr
              };
              const withoutAccessPayload: Record<string, any> = {
                role: canonicalOutcomeRole,
                operational_role: outcome.operationalRole,
                is_socio: outcome.isSocio,
                active: outcome.active,
                end_date: outcome.access ? null : todayStr
              };
              const legacyPayload: Record<string, any> = {
                role: canonicalOutcomeRole,
                active: outcome.active,
                end_date: outcome.access ? null : todayStr
              };

              const isCallerAdmin = currentUserRef.current?.role === UserRole.Admin;
              let updateRes: { error: any } = { error: null };

              if (!isCallerAdmin) {
                try {
                  await supabase.rpc('reevaluate_user_operational_role', {
                    p_profile_id: prof.id
                  });
                } catch {
                  // Best-effort RPC sync cuando quien dispara la baja es alumno o monitor
                }
              } else {
                updateRes = await supabase
                  .from('profiles')
                  .update(fullPayloadWithAccess)
                  .eq('id', prof.id);
              }

              if (updateRes.error) {
                const code = updateRes.error.code;
                const msg = updateRes.error.message || '';
                if (
                  code === '42501' ||
                  code === 'P0001' ||
                  msg.toLowerCase().includes('row-level security') ||
                  msg.toLowerCase().includes('administración')
                ) {
                  try {
                    await supabase.rpc('reevaluate_user_operational_role', {
                      p_profile_id: prof.id
                    });
                  } catch {
                    // Best-effort RPC fallback
                  }
                } else if (code === '42703' || msg.includes('column')) {
                  updateRes = await supabase
                    .from('profiles')
                    .update(withoutAccessPayload)
                    .eq('id', prof.id);
                  if (
                    updateRes.error &&
                    (updateRes.error.code === '42703' ||
                      updateRes.error.message?.includes('column'))
                  ) {
                    updateRes = await supabase
                      .from('profiles')
                      .update(legacyPayload)
                      .eq('id', prof.id);
                  }
                  if (
                    updateRes.error &&
                    (updateRes.error.code === '42703' ||
                      updateRes.error.message?.includes('column'))
                  ) {
                    const { active: _ignoredActive, ...withoutActive } = legacyPayload;
                    updateRes = await supabase
                      .from('profiles')
                      .update(withoutActive)
                      .eq('id', prof.id);
                  }
                  if (
                    updateRes.error &&
                    (updateRes.error.code === '23502' ||
                      updateRes.error.code === '23514' ||
                      updateRes.error.message?.includes('profiles_role_check'))
                  ) {
                    await supabase
                      .from('profiles')
                      .update({ end_date: outcome.access ? null : todayStr })
                      .eq('id', prof.id);
                  }
                } else if (
                  code === '23502' ||
                  code === '23514' ||
                  msg.includes('profiles_role_check')
                ) {
                  const noRolePayload = {
                    active: outcome.active,
                    end_date: outcome.access ? null : todayStr
                  };
                  const retryNoRole = await supabase
                    .from('profiles')
                    .update(noRolePayload)
                    .eq('id', prof.id);
                  if (
                    retryNoRole.error &&
                    (retryNoRole.error.code === '42703' ||
                      retryNoRole.error.message?.includes('column'))
                  ) {
                    await supabase
                      .from('profiles')
                      .update({ end_date: outcome.access ? null : todayStr })
                      .eq('id', prof.id);
                  }
                }
              }

              if (outcome.category === 'baja') {
                if (linkedStudent && linkedStudent.status !== 'inactive') {
                  const stUpdate = { status: 'inactive', end_date: todayStr };
                  const stRes = await supabase
                    .from('students')
                    .update(stUpdate)
                    .eq('id', linkedStudent.id);
                  if (
                    stRes.error &&
                    (stRes.error.code === '42703' || stRes.error.message?.includes('column'))
                  ) {
                    await supabase
                      .from('students')
                      .update({ status: 'inactive' })
                      .eq('id', linkedStudent.id);
                  }
                }
                if (linkedTeacher && linkedTeacher.active !== false) {
                  const tcUpdate = { active: false, end_date: todayStr };
                  const tcRes = await supabase
                    .from('teachers')
                    .update(tcUpdate)
                    .eq('id', linkedTeacher.id);
                  if (
                    tcRes.error &&
                    (tcRes.error.code === '42703' || tcRes.error.message?.includes('column'))
                  ) {
                    await supabase
                      .from('teachers')
                      .update({ active: false })
                      .eq('id', linkedTeacher.id);
                  }
                }
              } else if (
                outcome.category === 'socio_puro' &&
                linkedStudent &&
                linkedStudent.status === 'inactive'
              ) {
                const stRestore = { status: 'active', end_date: null };
                const stRes = await supabase
                  .from('students')
                  .update(stRestore)
                  .eq('id', linkedStudent.id);
                if (
                  stRes.error &&
                  (stRes.error.code === '42703' || stRes.error.message?.includes('column'))
                ) {
                  await supabase
                    .from('students')
                    .update({ status: 'active' })
                    .eq('id', linkedStudent.id);
                }
              }

              const historyNote =
                outcome.category === 'baja'
                  ? t('appContext.notes.roleReevaluatedBaja')
                  : outcome.category === 'socio_puro'
                  ? t('appContext.notes.roleReevaluatedSocio')
                  : t('appContext.notes.roleReevaluatedChanged', { role: outcome.role });

              await recordStatusHistoryCycle({
                entityType: 'profile',
                entityId: prof.id,
                status: outcome.status,
                startDate: todayStr,
                endDate: outcome.access ? undefined : todayStr,
                notes: historyNote
              });

              updatedProfiles += 1;
            }

            setProfiles(prev =>
              prev.map(item =>
                item.id === prof.id
                  ? {
                      ...item,
                      role: outcome.role,
                      operationalRole: outcome.operationalRole,
                      isSocio: outcome.isSocio,
                      access: outcome.access,
                      active: outcome.active,
                      endDate: outcome.access ? undefined : todayStr
                    }
                  : item
              )
            );

            if (currentUserRef.current?.id === prof.id) {
              if (!outcome.access) {
                clearCachedAuthSession();
                void supabase.auth.signOut();
                setCurrentUser(null);
                setDbError(t('appContext.accountDeactivated', { email: prof.email }));
              } else {
                const nextRole = outcome.role;
                setCurrentUser(prev =>
                  prev
                    ? {
                        ...prev,
                        role: nextRole,
                        operationalRole: outcome.operationalRole,
                        isSocio: outcome.isSocio,
                        access: true,
                        active: true,
                        endDate: undefined
                      }
                    : prev
                );
                setCurrentRoleState(nextRole);
              }
            }
          }

          return { updatedProfiles, results };
        } catch (err) {
          console.warn('Error reevaluating operational role:', err);
          return { updatedProfiles: 0, results };
        }
      },
      [recordStatusHistoryCycle, t]
    );

  const createUserByAdmin: AuthContextType['createUserByAdmin'] = async params => {
    clearDbError();
    try {
      const emailNorm = params.email.toLowerCase().trim();
      const fullNameClean = params.fullName.trim();
      const tempPassword = (params.password || generateCryptographicTempPassword(16)).trim();
      const todayStr = getMadridDateIso();
      const effectiveStartDate = params.startDate || todayStr;
      const requestedRole = toCanonicalProfileRole(params.role, UserRole.Socio);
      const effectiveIsSocio =
        params.isSocio !== undefined
          ? params.isSocio
          : params.memberType !== 'alumno_no_socio' && params.memberType !== 'monitor_no_socio';
      const effectiveMemberType: MemberType =
        params.memberType ||
        (effectiveIsSocio
          ? 'socio'
          : requestedRole === UserRole.Monitor || requestedRole === UserRole.Hibrido
          ? 'monitor_no_socio'
          : 'alumno_no_socio');

      const authOutcome = calculateUserAuthState({
        currentRole: requestedRole,
        email: emailNorm,
        hasActiveStudentAssignment: Boolean(params.studentId),
        hasActiveTeacherAssignment: Boolean(params.teacherId),
        isSocio: effectiveIsSocio,
        manualAccess: params.access ?? true,
        preserveExplicitRoleOnCreation: true
      });
      const resolvedRole = toCanonicalProfileRole(authOutcome.role, UserRole.Socio);
      const resolvedAccess = authOutcome.access;
      const initialOpRole = authOutcome.operationalRole;

      if (!emailNorm || !emailNorm.includes('@')) {
        return { success: false, error: t('appContext.invalidEmail') };
      }
      if (tempPassword.length < 6) {
        return { success: false, error: t('appContext.passwordAuthMinLength') };
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.access_token) {
        return {
          success: false,
          error: t('appContext.adminSessionRequired')
        };
      }

      const isolatedAuth = createIsolatedAuthClient();
      const { data: authData, error: authError } = await isolatedAuth.auth.signUp({
        email: emailNorm,
        password: tempPassword,
        options: {
          data: {
            full_name: fullNameClean,
            role: resolvedRole
          }
        }
      });

      if (authError) {
        const msg = authError.message || t('appContext.authError');
        const msgLower = msg.toLowerCase();
        if (msgLower.includes('signups not allowed')) {
          return {
            success: false,
            error: t('appContext.authSignupsDisabled')
          };
        }
        if (msgLower.includes('database error saving new user')) {
          return {
            success: false,
            error: t('appContext.authDbTriggerError', { role: resolvedRole })
          };
        }
        return { success: false, error: t('appContext.authErrorPrefix', { msg }) };
      }

      const newAuthUserId = authData?.user?.id;
      if (!newAuthUserId) {
        return {
          success: false,
          error: t('appContext.authNoUserId')
        };
      }

      if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {
        return {
          success: false,
          error: t('appContext.authEmailAlreadyExists', { email: emailNorm })
        };
      }

      let linkedTeacherId = params.teacherId || null;
      let linkedStudentId = params.studentId || null;
      const normalizedTeacherPhone = normalizePhoneForStorage(params.teacherProfileData?.phone);

      if (
        (resolvedRole === UserRole.Monitor || resolvedRole === UserRole.Hibrido) &&
        params.createTeacherProfile &&
        !linkedTeacherId
      ) {
        const { data: existingTeacher, error: findTeacherErr } = await supabase
          .from('teachers')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();

        if (findTeacherErr) {
          return {
            success: false,
            error: t('appContext.authTeacherLookupError', { msg: findTeacherErr.message })
          };
        }

        if (existingTeacher?.id) {
          linkedTeacherId = existingTeacher.id;
        } else {
          const td = params.teacherProfileData;
          const isTeacherActive = (td?.active ?? true) && resolvedAccess;
          const baseTeacherInsert = {
            name: fullNameClean,
            email: emailNorm,
            phone: normalizedTeacherPhone,
            payment_scheme: td?.paymentScheme ?? 'per_class',
            rate_per_class: td?.ratePerClass ?? 25,
            fixed_monthly_rate: td?.fixedMonthlyRate ?? 0,
            revenue_share_percent: td?.revenueSharePercent ?? 60,
            preferred_payment_method: td?.preferredPaymentMethod ?? 'cash',
            collection_type: td?.collectionType ?? 'personal',
            bank_account: td?.bankAccount || null,
            active: isTeacherActive,
            notes: td?.notes || null
          };
          const extTeacherNoSocioCol = {
            ...baseTeacherInsert,
            member_number: params.memberNumber || null,
            member_type: effectiveMemberType,
            start_date: effectiveStartDate,
            end_date: isTeacherActive ? params.endDate || null : params.endDate || todayStr
          };
          const extTeacherInsert = {
            ...extTeacherNoSocioCol,
            is_socio: effectiveIsSocio
          };
          let teacherInsertRes = await supabase
            .from('teachers')
            .insert([extTeacherInsert])
            .select('id')
            .single();

          if (
            teacherInsertRes.error &&
            (teacherInsertRes.error.code === '42703' ||
              teacherInsertRes.error.message?.includes('column'))
          ) {
            teacherInsertRes = await supabase
              .from('teachers')
              .insert([extTeacherNoSocioCol])
              .select('id')
              .single();
            if (
              teacherInsertRes.error &&
              (teacherInsertRes.error.code === '42703' ||
                teacherInsertRes.error.message?.includes('column'))
            ) {
              teacherInsertRes = await supabase
                .from('teachers')
                .insert([baseTeacherInsert])
                .select('id')
                .single();
            }
          }

          if (teacherInsertRes.error) {
            return {
              success: false,
              error: t('appContext.authTeacherCreateError', {
                userId: newAuthUserId,
                msg: teacherInsertRes.error.message
              })
            };
          }
          const createdTeacherId = String(teacherInsertRes.data.id);
          linkedTeacherId = createdTeacherId;
          await recordStatusHistoryCycle({
            entityType: 'teacher',
            entityId: createdTeacherId,
            status: isTeacherActive ? 'active' : 'inactive',
            startDate: effectiveStartDate,
            endDate: isTeacherActive ? params.endDate : params.endDate || todayStr,
            notes: t('appContext.notes.teacherCreated')
          });
        }
      }

      if (
        (resolvedRole === UserRole.Alumno ||
          resolvedRole === UserRole.Hibrido ||
          resolvedRole === UserRole.Socio) &&
        params.createStudentProfile &&
        !linkedStudentId
      ) {
        const { data: existingStudent, error: findStudentErr } = await supabase
          .from('students')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();

        if (findStudentErr) {
          return {
            success: false,
            error: t('appContext.authStudentLookupError', { msg: findStudentErr.message })
          };
        }

        if (existingStudent?.id) {
          linkedStudentId = existingStudent.id;
        } else {
          const baseStudentInsert = {
            name: fullNameClean,
            email: emailNorm,
            phone: normalizedTeacherPhone,
            status: resolvedAccess ? 'active' : 'inactive',
            registered_at: effectiveStartDate
          };
          const extStudentNoSocioCol = {
            ...baseStudentInsert,
            member_number: params.memberNumber || null,
            member_type: effectiveMemberType,
            start_date: effectiveStartDate,
            end_date: resolvedAccess ? params.endDate || null : params.endDate || todayStr
          };
          const extStudentInsert = {
            ...extStudentNoSocioCol,
            is_socio: effectiveIsSocio
          };
          let studentInsertRes = await supabase
            .from('students')
            .insert([extStudentInsert])
            .select('id')
            .single();

          if (
            studentInsertRes.error &&
            (studentInsertRes.error.code === '42703' ||
              studentInsertRes.error.message?.includes('column'))
          ) {
            studentInsertRes = await supabase
              .from('students')
              .insert([extStudentNoSocioCol])
              .select('id')
              .single();
            if (
              studentInsertRes.error &&
              (studentInsertRes.error.code === '42703' ||
                studentInsertRes.error.message?.includes('column'))
            ) {
              studentInsertRes = await supabase
                .from('students')
                .insert([baseStudentInsert])
                .select('id')
                .single();
            }
          }

          if (studentInsertRes.error) {
            return {
              success: false,
              error: t('appContext.authStudentCreateError', {
                userId: newAuthUserId,
                msg: studentInsertRes.error.message
              })
            };
          }
          linkedStudentId = studentInsertRes.data.id;
        }
      }

      const { data: createdProfileRow } = await supabase
        .from('profiles')
        .select('id, role, teacher_id, student_id')
        .eq('id', newAuthUserId)
        .maybeSingle();

      const sameRoleAndLinks =
        Boolean(createdProfileRow) &&
        createdProfileRow?.role === resolvedRole &&
        (createdProfileRow?.teacher_id || null) === (linkedTeacherId || null) &&
        (createdProfileRow?.student_id || null) === (linkedStudentId || null);

      let profileError: { code?: string; message?: string } | null = null;
      const effectiveEndDate = params.endDate || null;
      const initialApprovalStatus = resolvedAccess ? 'approved' : 'pending';

      if (sameRoleAndLinks) {
        const metaUpdatePayload: Record<string, any> = {
          full_name: fullNameClean,
          member_number: params.memberNumber || null,
          member_type: effectiveMemberType,
          start_date: effectiveStartDate,
          end_date: effectiveEndDate,
          is_socio: effectiveIsSocio,
          operational_role: initialOpRole,
          active: resolvedAccess,
          access: resolvedAccess,
          access_status: initialApprovalStatus,
          approval_status: initialApprovalStatus
        };
        const metaRes = await updateProfileWithColumnFallback(newAuthUserId, metaUpdatePayload);
        profileError = metaRes.error;
      } else {
        const fullProfilePayload: Record<string, any> = {
          email: emailNorm,
          full_name: fullNameClean,
          role: toCanonicalProfileRole(resolvedRole, UserRole.Socio),
          teacher_id: linkedTeacherId,
          student_id: linkedStudentId,
          member_number: params.memberNumber || null,
          member_type: effectiveMemberType,
          start_date: effectiveStartDate,
          end_date: effectiveEndDate,
          is_socio: effectiveIsSocio,
          operational_role: initialOpRole,
          active: resolvedAccess,
          access: resolvedAccess,
          access_status: initialApprovalStatus,
          approval_status: initialApprovalStatus
        };

        const profileRes = createdProfileRow
          ? await updateProfileWithColumnFallback(newAuthUserId, fullProfilePayload)
          : await upsertProfileWithColumnFallback({ id: newAuthUserId, ...fullProfilePayload });
        profileError = profileRes.error;
      }

      if (profileError) {
        const pErrMsg = profileError.message || '';
        if (profileError.code === '23514' || pErrMsg.includes('profiles_role_check')) {
          return {
            success: false,
            error: t('appContext.authProfileRoleCheck', { userId: newAuthUserId, role: resolvedRole })
          };
        }
        if (pErrMsg.toLowerCase().includes('solo la administración')) {
          return {
            success: false,
            error: t('appContext.authProfileTriggerBlock', { userId: newAuthUserId, msg: pErrMsg })
          };
        }
        return {
          success: false,
          error: t('appContext.authProfileLinkError', { userId: newAuthUserId, msg: pErrMsg })
        };
      }

      if (resolvedRole !== UserRole.Admin && (params.studentId || params.teacherId)) {
        await reevaluateUserOperationalRole({
          profileId: newAuthUserId,
          manualAccess: params.access
        });
      }
      await refreshFromSupabase();
      return { success: true, tempPassword, teacherId: linkedTeacherId || undefined };
    } catch (err: any) {
      console.error('Error creating user by administrator:', err);
      return { success: false, error: err.message || t('appContext.unexpectedUserCreateError') };
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    clearDbError();
    const canonicalRole = toCanonicalProfileRole(newRole, UserRole.Socio);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: canonicalRole })
        .eq('id', userId);

      if (error) {
        handleSupabaseError(t('appContext.actions.updateUserRole'), error, canonicalRole);
        return;
      }

      setProfiles(prev =>
        prev.map(p => (p.id === userId ? { ...p, role: canonicalRole } : p))
      );
      if (currentUserRef.current?.id === userId) {
        setCurrentUser(prev => (prev ? { ...prev, role: canonicalRole } : prev));
        setCurrentRoleState(canonicalRole);
      }
      await refreshFromSupabase();
    } catch (e: any) {
      handleSupabaseError(t('appContext.actions.updateRole'), e, canonicalRole);
    }
  };

  const updateUserProfileByAdmin: AuthContextType['updateUserProfileByAdmin'] = async (
    userId,
    updates
  ) => {
    clearDbError();
    try {
      const targetProfile = profiles.find(p => p.id === userId);
      const isMaster = (targetProfile?.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL;
      const baseDbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) baseDbUpdates.full_name = updates.name.trim();
      const normalizedRoleUpdate = isMaster
        ? UserRole.Admin
        : updates.role !== undefined
        ? toCanonicalProfileRole(updates.role, UserRole.Socio)
        : undefined;
      if (normalizedRoleUpdate !== undefined) baseDbUpdates.role = normalizedRoleUpdate;
      if (updates.teacherId !== undefined) baseDbUpdates.teacher_id = updates.teacherId || null;
      if (updates.studentId !== undefined) baseDbUpdates.student_id = updates.studentId || null;

      let derivedIsSocio: boolean | undefined = updates.isSocio;
      let resolvedMemberType: MemberType | null | undefined = updates.memberType;

      if (updates.isSocio !== undefined) {
        if (updates.memberType === undefined) {
          const effRole = normalizedRoleUpdate ?? targetProfile?.role;
          resolvedMemberType = updates.isSocio
            ? 'socio'
            : effRole === UserRole.Monitor
            ? 'monitor_no_socio'
            : 'alumno_no_socio';
        }
      } else if (updates.memberType !== undefined) {
        derivedIsSocio =
          updates.memberType !== 'alumno_no_socio' && updates.memberType !== 'monitor_no_socio';
      }

      const explicitAccess = isMaster
        ? true
        : updates.access !== undefined
        ? updates.access
        : updates.active !== undefined
        ? updates.active
        : undefined;

      const todayStr = getMadridDateIso();
      const fullDbUpdates: Record<string, any> = { ...baseDbUpdates };
      if (updates.memberNumber !== undefined) {
        fullDbUpdates.member_number = updates.memberNumber || null;
      }
      if (resolvedMemberType !== undefined) fullDbUpdates.member_type = resolvedMemberType || null;
      if (derivedIsSocio !== undefined) fullDbUpdates.is_socio = derivedIsSocio;
      if (updates.startDate !== undefined) fullDbUpdates.start_date = updates.startDate || null;
      if (updates.endDate !== undefined) {
        fullDbUpdates.end_date = isMaster ? null : updates.endDate || null;
      } else if (explicitAccess !== undefined) {
        fullDbUpdates.end_date = explicitAccess ? null : todayStr;
      }
      if (explicitAccess !== undefined) {
        fullDbUpdates.active = explicitAccess;
        fullDbUpdates.access = explicitAccess;
        fullDbUpdates.access_status = explicitAccess ? 'approved' : 'rejected';
        fullDbUpdates.approval_status = explicitAccess ? 'approved' : 'rejected';
      }

      if (Object.keys(fullDbUpdates).length === 0) return { success: true };

      const { error: updateError } = await updateProfileWithColumnFallback(userId, fullDbUpdates);

      if (updateError) {
        const formattedErr = handleSupabaseError(
          t('appContext.actions.updateUser'),
          updateError,
          normalizedRoleUpdate
        );
        return { success: false, error: formattedErr };
      }

      if (derivedIsSocio !== undefined || updates.memberNumber !== undefined) {
        const effStudentId =
          updates.studentId !== undefined ? updates.studentId : targetProfile?.studentId;
        const effTeacherId =
          updates.teacherId !== undefined ? updates.teacherId : targetProfile?.teacherId;
        if (effStudentId) {
          const studentSyncPayload: Record<string, any> = {};
          if (derivedIsSocio !== undefined) {
            studentSyncPayload.is_socio = derivedIsSocio;
            studentSyncPayload.member_type = derivedIsSocio ? 'socio' : 'alumno_no_socio';
          }
          if (updates.memberNumber !== undefined) {
            studentSyncPayload.member_number = updates.memberNumber || null;
          }
          const sRes = await supabase
            .from('students')
            .update(studentSyncPayload)
            .eq('id', effStudentId);
          if (
            sRes.error &&
            (sRes.error.code === '42703' || sRes.error.message?.includes('column'))
          ) {
            const { is_socio: _dropIsSocio, ...fallbackStudentPayload } = studentSyncPayload;
            if (Object.keys(fallbackStudentPayload).length > 0) {
              await supabase
                .from('students')
                .update(fallbackStudentPayload)
                .eq('id', effStudentId);
            }
          }
        }
        if (effTeacherId) {
          const teacherSyncPayload: Record<string, any> = {};
          if (derivedIsSocio !== undefined) {
            teacherSyncPayload.is_socio = derivedIsSocio;
            teacherSyncPayload.member_type = derivedIsSocio ? 'socio' : 'monitor_no_socio';
          }
          if (updates.memberNumber !== undefined) {
            teacherSyncPayload.member_number = updates.memberNumber || null;
          }
          const tRes = await supabase
            .from('teachers')
            .update(teacherSyncPayload)
            .eq('id', effTeacherId);
          if (
            tRes.error &&
            (tRes.error.code === '42703' || tRes.error.message?.includes('column'))
          ) {
            const { is_socio: _dropIsSocio, ...fallbackTeacherPayload } = teacherSyncPayload;
            if (Object.keys(fallbackTeacherPayload).length > 0) {
              await supabase
                .from('teachers')
                .update(fallbackTeacherPayload)
                .eq('id', effTeacherId);
            }
          }
        }
      }

      const resolvedEndDate =
        updates.endDate !== undefined
          ? updates.endDate || undefined
          : explicitAccess !== undefined
          ? explicitAccess
            ? undefined
            : todayStr
          : undefined;

      setProfiles(prev =>
        prev.map(p =>
          p.id === userId
            ? {
                ...p,
                ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
                ...(normalizedRoleUpdate !== undefined
                  ? { role: normalizedRoleUpdate, hasExplicitRole: true }
                  : {}),
                ...(updates.teacherId !== undefined
                  ? { teacherId: updates.teacherId || undefined }
                  : {}),
                ...(updates.studentId !== undefined
                  ? { studentId: updates.studentId || undefined }
                  : {}),
                ...(updates.memberNumber !== undefined
                  ? { memberNumber: updates.memberNumber || undefined }
                  : {}),
                ...(resolvedMemberType !== undefined
                  ? { memberType: resolvedMemberType || undefined }
                  : {}),
                ...(derivedIsSocio !== undefined ? { isSocio: derivedIsSocio } : {}),
                ...(updates.startDate !== undefined
                  ? { startDate: updates.startDate || undefined }
                  : {}),
                ...(updates.endDate !== undefined || explicitAccess !== undefined
                  ? { endDate: resolvedEndDate }
                  : {}),
                ...(explicitAccess !== undefined
                  ? {
                      access: explicitAccess,
                      active: explicitAccess,
                      accessStatus: explicitAccess ? 'approved' : 'rejected',
                      approvalStatus: explicitAccess ? 'approved' : 'rejected'
                    }
                  : {})
              }
            : p
        )
      );

      if (userId === currentUserRef.current?.id) {
        setCurrentUser(prev =>
          prev
            ? {
                ...prev,
                ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
                ...(normalizedRoleUpdate !== undefined ? { role: normalizedRoleUpdate } : {}),
                ...(updates.teacherId !== undefined
                  ? { teacherId: updates.teacherId || undefined }
                  : {}),
                ...(updates.studentId !== undefined
                  ? { studentId: updates.studentId || undefined }
                  : {}),
                ...(updates.memberNumber !== undefined
                  ? { memberNumber: updates.memberNumber || undefined }
                  : {}),
                ...(derivedIsSocio !== undefined ? { isSocio: derivedIsSocio } : {})
              }
            : prev
        );
        if (normalizedRoleUpdate !== undefined) {
          setCurrentRoleState(normalizedRoleUpdate);
        }
      }

      if (
        (updates.teacherId !== undefined || updates.studentId !== undefined) &&
        explicitAccess === undefined
      ) {
        await reevaluateUserOperationalRole({
          profileId: userId,
          manualAccess: explicitAccess
        });
      }

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || t('appContext.updateUserError');
      handleSupabaseError(t('appContext.actions.updateUser'), e);
      return { success: false, error: msg };
    }
  };

  const promoteOrUpdateMemberRole: AuthContextType['promoteOrUpdateMemberRole'] = async targetRole => {
    clearDbError();
    try {
      if (!currentUser) {
        return { success: false, error: t('appContext.loginToUpdateRole') };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return {
          success: false,
          error: t('appContext.sessionInactiveRelogin')
        };
      }

      const canonicalTargetRole = toCanonicalProfileRole(targetRole, UserRole.Socio);
      const emailNorm = (currentUser.email || '').trim().toLowerCase();
      const todayStr = getMadridDateIso();
      let nextStudentId = currentUser.studentId || currentStudentId || undefined;
      let nextTeacherId = currentUser.teacherId || currentTeacherId || undefined;

      if (
        (canonicalTargetRole === UserRole.Alumno || canonicalTargetRole === UserRole.Hibrido) &&
        !nextStudentId
      ) {
        const { data: existingByProfile } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', currentUser.id)
          .maybeSingle();
        let resolvedExistingStudentId = existingByProfile?.id;
        if (!resolvedExistingStudentId && emailNorm) {
          const { data: existingByEmail } = await supabase
            .from('students')
            .select('id')
            .ilike('email', emailNorm)
            .maybeSingle();
          resolvedExistingStudentId = existingByEmail?.id;
        }
        if (resolvedExistingStudentId) {
          nextStudentId = resolvedExistingStudentId;
        } else {
          const basePayload = {
            name: currentUser.name || t('appContext.fallbackMember'),
            email: emailNorm || null,
            status: 'active',
            registered_at: todayStr
          };
          const extPayload = {
            ...basePayload,
            profile_id: currentUser.id,
            member_type: 'socio',
            start_date: todayStr
          };
          let stRes = await supabase.from('students').insert([extPayload]).select('id').single();
          if (
            stRes.error &&
            (stRes.error.code === '42703' || stRes.error.message?.includes('column'))
          ) {
            stRes = await supabase.from('students').insert([basePayload]).select('id').single();
          }
          if (stRes.data?.id) nextStudentId = stRes.data.id;
        }
      }

      if (
        (canonicalTargetRole === UserRole.Monitor || canonicalTargetRole === UserRole.Hibrido) &&
        !nextTeacherId
      ) {
        let resolvedExistingTeacherId: string | undefined;
        if (emailNorm) {
          const { data: existingByEmail } = await supabase
            .from('teachers')
            .select('id')
            .ilike('email', emailNorm)
            .maybeSingle();
          resolvedExistingTeacherId = existingByEmail?.id;
        }
        if (resolvedExistingTeacherId) {
          nextTeacherId = resolvedExistingTeacherId;
        } else {
          const basePayload = {
            name: currentUser.name || t('appContext.fallbackTeacher'),
            email: emailNorm || null,
            payment_scheme: 'per_class',
            rate_per_class: 25,
            fixed_monthly_rate: 0,
            revenue_share_percent: 60,
            preferred_payment_method: 'cash',
            collection_type: 'personal',
            active: true
          };
          const extPayload = {
            ...basePayload,
            member_type: 'socio',
            start_date: todayStr
          };
          let tcRes = await supabase.from('teachers').insert([extPayload]).select('id').single();
          if (
            tcRes.error &&
            (tcRes.error.code === '42703' || tcRes.error.message?.includes('column'))
          ) {
            tcRes = await supabase.from('teachers').insert([basePayload]).select('id').single();
          }
          if (tcRes.data?.id) nextTeacherId = tcRes.data.id;
        }
      }

      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          role: canonicalTargetRole,
          ...(nextStudentId ? { student_id: nextStudentId } : {}),
          ...(nextTeacherId ? { teacher_id: nextTeacherId } : {})
        })
        .eq('id', currentUser.id);

      if (profErr) {
        const formattedErr = handleSupabaseError(
          t('appContext.actions.updateParticipationRole'),
          profErr,
          canonicalTargetRole
        );
        return { success: false, error: formattedErr };
      }

      setCurrentUser(prev =>
        prev
          ? {
              ...prev,
              role: canonicalTargetRole,
              studentId: nextStudentId || prev.studentId,
              teacherId: nextTeacherId || prev.teacherId
            }
          : prev
      );
      setCurrentRoleState(canonicalTargetRole);
      if (nextStudentId) setCurrentStudentId(nextStudentId);
      if (nextTeacherId) setCurrentTeacherId(nextTeacherId);

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || t('appContext.roleUpdateFailed') };
    }
  };

  const toggleUserAccessStatus = async (
    userId: string,
    access: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const targetProfile = profiles.find(p => p.id === userId);
      if (!access && targetProfile?.email?.toLowerCase().trim() === MASTER_ADMIN_EMAIL) {
        return {
          success: false,
          error: t('appContext.accountDeactivated', { email: targetProfile.email })
        };
      }

      const todayStr = getMadridDateIso();
      const nextApprovalStatus: 'approved' | 'rejected' = access ? 'approved' : 'rejected';
      const fullPayloadWithApproval: Record<string, any> = {
        access,
        active: access,
        end_date: access ? null : todayStr,
        access_status: nextApprovalStatus,
        approval_status: nextApprovalStatus
      };
      const { error } = await updateProfileWithColumnFallback(userId, fullPayloadWithApproval);

      if (error) {
        handleSupabaseError(
          access
            ? t('appContext.actions.reactivateUserAccess')
            : t('appContext.actions.revokeUserAccess'),
          error
        );
        return { success: false, error: error.message };
      }

      await recordStatusHistoryCycle({
        entityType: 'profile',
        entityId: userId,
        status: access ? 'active' : 'inactive',
        startDate: todayStr,
        endDate: access ? undefined : todayStr,
        notes: access
          ? t('appContext.actions.reactivateUserAccess')
          : t('appContext.actions.revokeUserAccess')
      });

      setProfiles(prev =>
        prev.map(p =>
          p.id === userId
            ? {
                ...p,
                access,
                active: access,
                accessStatus: nextApprovalStatus,
                approvalStatus: nextApprovalStatus,
                endDate: access ? undefined : todayStr
              }
            : p
        )
      );

      if (!access && currentUser?.id === userId) {
        clearCachedAuthSession();
        void supabase.auth.signOut();
        setCurrentUser(null);
      }

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || t('appContext.updateUserError');
      handleSupabaseError(
        access
          ? t('appContext.actions.reactivateUserAccess')
          : t('appContext.actions.revokeAccess'),
        e
      );
      return { success: false, error: msg };
    }
  };

  const saveUserPermissionDrafts: AuthContextType['saveUserPermissionDrafts'] = async drafts => {
    clearDbError();
    if (!drafts || drafts.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    try {
      const [studentsRes, teachersRes, enrollmentsRes, activitiesRes] = await Promise.all([
        supabase.from('students').select('id, email, profile_id, status, validation_status'),
        supabase.from('teachers').select('id, email, active, status'),
        supabase
          .from('student_enrollments')
          .select('student_id, activity_id, active, status, deleted_at'),
        supabase.from('activities').select('id, teacher_id, active, status')
      ]);

      const allStudents = (studentsRes.data || []) as any[];
      const allTeachers = (teachersRes.data || []) as any[];
      const allEnrollments = (enrollmentsRes.data || []) as any[];
      const allActivities = (activitiesRes.data || []) as any[];
      const activeActivityIds = new Set<string>(
        allActivities
          .filter(a => a.active !== false && a.status !== 'pending' && a.status !== 'inactive')
          .map(a => a.id)
      );

      const todayStr = getMadridDateIso();
      let updatedCount = 0;

      for (const draft of drafts) {
        const targetProfile = profiles.find(p => p.id === draft.userId);
        const emailNorm = (targetProfile?.email || '').toLowerCase().trim();
        const isMaster = emailNorm === MASTER_ADMIN_EMAIL;

        const linkedStudent = allStudents.find(
          s =>
            (targetProfile?.studentId && s.id === targetProfile.studentId) ||
            s.profile_id === draft.userId ||
            (emailNorm && (s.email || '').toLowerCase().trim() === emailNorm)
        );
        const linkedTeacher = allTeachers.find(
          tc =>
            (targetProfile?.teacherId && tc.id === targetProfile.teacherId) ||
            (emailNorm && (tc.email || '').toLowerCase().trim() === emailNorm)
        );

        const hasActiveStudentAssignment = Boolean(
          linkedStudent &&
            linkedStudent.status !== 'inactive' &&
            linkedStudent.status !== 'pending_validation' &&
            linkedStudent.validation_status !== 'pending' &&
            allEnrollments.some(
              e =>
                e.student_id === linkedStudent.id &&
                e.active !== false &&
                !e.deleted_at &&
                e.status !== 'pending' &&
                e.status !== 'inactive' &&
                e.status !== 'rejected' &&
                activeActivityIds.has(e.activity_id)
            )
        );
        const hasActiveTeacherAssignment = Boolean(
          linkedTeacher &&
            linkedTeacher.active !== false &&
            linkedTeacher.status !== 'pending' &&
            linkedTeacher.status !== 'pending_validation' &&
            linkedTeacher.status !== 'inactive' &&
            allActivities.some(
              a =>
                a.teacher_id === linkedTeacher.id &&
                a.active !== false &&
                a.status !== 'pending' &&
                a.status !== 'inactive'
            )
        );

        const nextRole: UserRole = isMaster
          ? UserRole.Admin
          : toCanonicalProfileRole(
              draft.role || targetProfile?.role,
              draft.isSocio ? DEFAULT_BASE_USER_ROLE : UserRole.Alumno
            );
        const nextAccess = isMaster
          ? true
          : draft.userId === currentUser?.id
          ? true
          : Boolean(draft.access);
        const nextIsSocio = Boolean(draft.isSocio);
        const nextMemberType: MemberType = nextIsSocio
          ? 'socio'
          : nextRole === UserRole.Monitor || nextRole === UserRole.Hibrido
          ? 'monitor_no_socio'
          : 'alumno_no_socio';
        const nextOpRole = targetProfile
          ? deriveOperationalRoleFromAssignments(
              hasActiveStudentAssignment,
              hasActiveTeacherAssignment
            )
          : 'vacio';
        const nextApprovalStatus: 'pending' | 'approved' | 'rejected' = nextAccess
          ? 'approved'
          : targetProfile?.accessStatus === 'pending' || targetProfile?.approvalStatus === 'pending'
          ? 'pending'
          : 'rejected';

        const payload: Record<string, any> = {
          role: nextRole,
          is_socio: nextIsSocio,
          member_type: nextMemberType,
          access: nextAccess,
          active: nextAccess,
          operational_role: nextOpRole,
          end_date: nextAccess ? null : todayStr,
          access_status: nextApprovalStatus,
          approval_status: nextApprovalStatus
        };

        const { error } = await updateProfileWithColumnFallback(draft.userId, payload);
        if (error) {
          const formattedErr = handleSupabaseError(
            t('appContext.actions.updateUser'),
            error,
            nextRole
          );
          return { success: false, updatedCount, error: formattedErr };
        }

        const linkedStudentId = targetProfile?.studentId || linkedStudent?.id;
        const linkedTeacherId = targetProfile?.teacherId || linkedTeacher?.id;

        if (linkedStudentId) {
          const stMemberType: MemberType = nextIsSocio ? 'socio' : 'alumno_no_socio';
          const sRes = await supabase
            .from('students')
            .update({ is_socio: nextIsSocio, member_type: stMemberType })
            .eq('id', linkedStudentId);
          if (
            sRes.error &&
            (sRes.error.code === '42703' || sRes.error.message?.includes('column'))
          ) {
            await supabase
              .from('students')
              .update({ member_type: stMemberType })
              .eq('id', linkedStudentId);
          }
        }

        if (linkedTeacherId) {
          const tcMemberType: MemberType = nextIsSocio ? 'socio' : 'monitor_no_socio';
          const tRes = await supabase
            .from('teachers')
            .update({ is_socio: nextIsSocio, member_type: tcMemberType })
            .eq('id', linkedTeacherId);
          if (
            tRes.error &&
            (tRes.error.code === '42703' || tRes.error.message?.includes('column'))
          ) {
            await supabase
              .from('teachers')
              .update({ member_type: tcMemberType })
              .eq('id', linkedTeacherId);
          }
        }

        const prevAccess = targetProfile ? deriveAccessFromRow(targetProfile, emailNorm) : undefined;
        if (prevAccess !== undefined && prevAccess !== nextAccess) {
          await recordStatusHistoryCycle({
            entityType: 'profile',
            entityId: draft.userId,
            status: nextAccess ? 'active' : 'inactive',
            startDate: todayStr,
            endDate: nextAccess ? undefined : todayStr,
            notes: nextAccess
              ? t('appContext.actions.reactivateUserAccess')
              : t('appContext.actions.revokeUserAccess')
          });
        }

        setProfiles(prev =>
          prev.map(p =>
            p.id === draft.userId
              ? {
                  ...p,
                  role: nextRole,
                  hasExplicitRole: true,
                  isSocio: nextIsSocio,
                  memberType: nextMemberType,
                  operationalRole: nextOpRole,
                  access: nextAccess,
                  active: nextAccess,
                  accessStatus: nextApprovalStatus,
                  approvalStatus: nextApprovalStatus,
                  endDate: nextAccess ? undefined : todayStr
                }
              : p
          )
        );

        if (currentUserRef.current?.id === draft.userId) {
          setCurrentUser(prev =>
            prev
              ? {
                  ...prev,
                  role: nextRole,
                  isSocio: nextIsSocio,
                  memberType: nextMemberType,
                  operationalRole: nextOpRole,
                  access: nextAccess,
                  active: nextAccess,
                  accessStatus: nextApprovalStatus,
                  approvalStatus: nextApprovalStatus,
                  endDate: nextAccess ? undefined : todayStr
                }
              : prev
          );
          setCurrentRoleState(nextRole);
        }

        updatedCount += 1;
      }

      await refreshFromSupabase();
      return { success: true, updatedCount };
    } catch (e: any) {
      const msg = e?.message || t('appContext.updateUserError');
      handleSupabaseError(t('appContext.actions.updateUser'), e);
      return { success: false, updatedCount: 0, error: msg };
    }
  };

  const deleteUserAccess = async (userId: string) => {
    await toggleUserAccessStatus(userId, false);
  };

  const toggleUserSocioMembership: AuthContextType['toggleUserSocioMembership'] = async (
    targets,
    isSocio
  ) => {
    clearDbError();
    try {
      const targetEmailNorm = targets.email?.toLowerCase().trim();
      const matchedProfile = profiles.find(
        p =>
          (targets.profileId && p.id === targets.profileId) ||
          (targets.studentId && p.studentId === targets.studentId) ||
          (targets.teacherId && p.teacherId === targets.teacherId) ||
          (targetEmailNorm && p.email.toLowerCase().trim() === targetEmailNorm)
      );
      const effectiveProfileId = targets.profileId || matchedProfile?.id;
      const effectiveEmailNorm = targetEmailNorm || matchedProfile?.email?.toLowerCase().trim();

      let effectiveStudentId = targets.studentId || matchedProfile?.studentId;
      if (!effectiveStudentId && (effectiveProfileId || effectiveEmailNorm)) {
        const studentLookup = effectiveProfileId
          ? await supabase
              .from('students')
              .select('id')
              .eq('profile_id', effectiveProfileId)
              .maybeSingle()
          : { data: null };
        effectiveStudentId = studentLookup.data?.id;
        if (!effectiveStudentId && effectiveEmailNorm) {
          const emailStudentLookup = await supabase
            .from('students')
            .select('id')
            .ilike('email', effectiveEmailNorm)
            .maybeSingle();
          effectiveStudentId = emailStudentLookup.data?.id;
        }
      }

      let effectiveTeacherId = targets.teacherId || matchedProfile?.teacherId;
      if (!effectiveTeacherId && effectiveEmailNorm) {
        const emailTeacherLookup = await supabase
          .from('teachers')
          .select('id')
          .ilike('email', effectiveEmailNorm)
          .maybeSingle();
        effectiveTeacherId = emailTeacherLookup.data?.id;
      }

      const nextStudentMemberType: MemberType = isSocio ? 'socio' : 'alumno_no_socio';
      const nextTeacherMemberType: MemberType = isSocio ? 'socio' : 'monitor_no_socio';
      const nextProfileMemberType: MemberType = isSocio
        ? 'socio'
        : matchedProfile?.role === UserRole.Monitor || (effectiveTeacherId && !effectiveStudentId)
        ? 'monitor_no_socio'
        : 'alumno_no_socio';

      if (effectiveProfileId) {
        let pRes = await supabase
          .from('profiles')
          .update({ is_socio: isSocio, member_type: nextProfileMemberType })
          .eq('id', effectiveProfileId);
        if (pRes.error && (pRes.error.code === '42703' || pRes.error.message?.includes('column'))) {
          pRes = await supabase
            .from('profiles')
            .update({ member_type: nextProfileMemberType })
            .eq('id', effectiveProfileId);
        }
        if (pRes.error) {
          handleSupabaseError(t('appContext.actions.updateUser'), pRes.error);
          return { success: false, error: pRes.error.message };
        }
      }

      if (effectiveStudentId) {
        const sRes = await supabase
          .from('students')
          .update({ is_socio: isSocio, member_type: nextStudentMemberType })
          .eq('id', effectiveStudentId);
        if (sRes.error && (sRes.error.code === '42703' || sRes.error.message?.includes('column'))) {
          await supabase
            .from('students')
            .update({ member_type: nextStudentMemberType })
            .eq('id', effectiveStudentId);
        }
      }

      if (effectiveTeacherId) {
        const tRes = await supabase
          .from('teachers')
          .update({ is_socio: isSocio, member_type: nextTeacherMemberType })
          .eq('id', effectiveTeacherId);
        if (tRes.error && (tRes.error.code === '42703' || tRes.error.message?.includes('column'))) {
          await supabase
            .from('teachers')
            .update({ member_type: nextTeacherMemberType })
            .eq('id', effectiveTeacherId);
        }
      }

      await reevaluateUserOperationalRole({
        profileId: effectiveProfileId,
        studentId: effectiveStudentId,
        teacherId: effectiveTeacherId,
        email: effectiveEmailNorm
      });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.updateUserError');
      handleSupabaseError(t('appContext.actions.updateUser'), err);
      return { success: false, error: msg };
    }
  };

  const updateUserAvatar: AuthContextType['updateUserAvatar'] = async avatarUrl => {
    clearDbError();
    const nextAvatar = avatarUrl ? avatarUrl.trim() : null;
    if (!currentUser) {
      return { success: false, error: t('appContext.requestEnrollmentSessionRequired') };
    }

    const isRealUserId =
      Boolean(currentUser.id) &&
      !currentUser.id.startsWith('usr-') &&
      !currentUser.id.startsWith('demo-') &&
      !currentUser.id.startsWith('cached-');

    if (isRealUserId) {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: nextAvatar })
        .eq('id', currentUser.id);
      if (error) {
        handleSupabaseError(t('appContext.actions.updateAvatar'), error);
        return { success: false, error: error.message };
      }

      let linkedTeacherId = currentUser.teacherId;
      if (!linkedTeacherId && currentUser.email) {
        const { data: teacherMatch } = await supabase
          .from('teachers')
          .select('id')
          .ilike('email', currentUser.email.trim().toLowerCase())
          .maybeSingle();
        linkedTeacherId = teacherMatch?.id;
      }

      if (linkedTeacherId) {
        await supabase
          .from('teachers')
          .update({ avatar_url: nextAvatar })
          .eq('id', linkedTeacherId);
      }
    }

    try {
      const storageKey = `triskell_user_avatar_${
        currentUser.id || currentUser.email || currentRole
      }`;
      if (nextAvatar) {
        localStorage.setItem(storageKey, nextAvatar);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignorar si localStorage no está disponible
    }

    setCurrentUser(prev =>
      prev ? { ...prev, photoURL: nextAvatar || undefined } : prev
    );
    setProfiles(prev =>
      prev.map(p =>
        p.id === currentUser.id ? { ...p, photoURL: nextAvatar || undefined } : p
      )
    );

    if (isRealUserId) {
      void refreshFromSupabase();
    }

    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        setCurrentRoleState,
        currentTeacherId,
        setCurrentTeacherId,
        currentStudentId,
        setCurrentStudentId,
        currentUser,
        currentUserRef,
        setCurrentUser,
        isStrictAdminSession,
        loginWithGoogle,
        loginWithEmail,
        changePassword,
        requestPasswordReset,
        isPasswordRecoveryMode,
        setIsPasswordRecoveryMode,
        logout,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isDarkMode,
        toggleDarkMode,
        language,
        setUserLanguage,
        t,
        isAuthReady,
        isAuthLoading,
        isLoadingDb,
        setIsLoadingDb,
        dbSyncVersion,
        bumpDbSyncVersion,
        dbError,
        setDbError,
        authDenialKind,
        setAuthDenialKind,
        clearDbError,
        resolveAuthDenial,
        handleSupabaseError,
        refreshFromSupabase,
        registerRefreshHandler,
        profiles,
        setProfiles,
        updateProfileWithColumnFallback,
        upsertProfileWithColumnFallback,
        recordStatusHistoryCycle,
        createUserByAdmin,
        updateUserRole,
        updateUserProfileByAdmin,
        toggleUserSocioMembership,
        toggleUserAccessStatus,
        saveUserPermissionDrafts,
        deleteUserAccess,
        promoteOrUpdateMemberRole,
        updateUserAvatar,
        reevaluateUserOperationalRole,
        appConfigs: exposedAppConfigs,
        rawAppConfigs: appConfigs,
        setAppConfigs,
        updateAppConfig,
        addAppConfig,
        deleteAppConfig,
        isBiometricsSupported: isBiometricsSupportedState,
        hasBiometricsEnabled: Boolean(biometricUserState),
        biometricUser: biometricUserState,
        enableBiometrics,
        disableBiometrics,
        unlockWithBiometrics
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
