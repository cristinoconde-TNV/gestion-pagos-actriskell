import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Teacher,
  Activity,
  Student,
  PaymentRecord,
  TeacherPayout,
  CenterExpense,
  ClassSession,
  UserRole,
  PaymentMethod,
  PaymentStatus,
  AuthUser,
  AppConfigSetting,
  NewsNote,
  MemberType,
  MemberStatusHistoryEntry,
  AppLanguage,
  StudentAbsence,
  OperationalRole,
  ClassClosedBy,
  MembershipWithdrawalRequest,
  MemberAnnualFee,
  StudentPaymentMessage,
  PaymentPaidToType
} from '../types';
import {
  getOverdueUnrecordedScheduledSessions,
  parseClassAutoCloseConfig,
  shouldAutoCloseSession
} from '../lib/classClosure';
import {
  ANNUAL_FEE_CONFIG_KEY,
  DEFAULT_ANNUAL_FEE_AMOUNT,
  isProfileEligibleForSocioAnnualFee,
  parseSocioAnnualFeeConfig
} from '../lib/annualFee';
import { parseSessionInactivityConfig } from '../lib/inactivityConfig';
import {
  evaluateWorkshopNoteGraceStatus,
  getStoredActivityEndedAtMap,
  isNewsNoteExpiredByDate,
  isWorkshopFinalized,
  parseNewsFinishedWorkshopGraceConfig,
  setStoredActivityEndedAt
} from '../lib/newsConfig';
import {
  supabase,
  createIsolatedAuthClient,
  deriveIsSocioFromRow,
  normalizeOperationalRole,
  mapDbTeacherToTeacher,
  mapTeacherToDb,
  mapDbActivityToActivity,
  mapActivityToDb,
  mapDbStudentToStudent,
  mapDbAbsenceToAbsence,
  mapDbHistoryToHistory,
  mapDbPaymentToPayment,
  mapPaymentToDb,
  mapDbSessionToSession,
  mapDbExpenseToExpense,
  mapExpenseToDb,
  mapDbPayoutToPayout,
  mapPayoutToDb,
  mapDbWithdrawalRequestToRequest,
  mapDbMemberAnnualFeeToFee,
  mapDbStudentPaymentMessageToMessage
} from '../lib/supabase';
import {
  MASTER_ADMIN_EMAIL,
  DEFAULT_BASE_USER_ROLE,
  normalizeUserRole,
  toCanonicalProfileRole,
  isValidUserRole,
  deriveAccessFromRow,
  deriveOperationalRoleFromAssignments,
  isProfileExplicitlyAuthorized,
  isPendingApprovalProfile,
  isRejectedProfile,
  resolveProfileAccessStatus,
  isPlaceholderProfileName,
  extractGoogleProfileMetadata,
  ProfileAccessStatus,
  calculateUserAuthState
} from '../lib/authRole';
import {
  isClassSessionClosed,
  isClassSessionClosedOrPast
} from '../lib/absences';
import {
  INITIAL_TEACHERS,
  INITIAL_ACTIVITIES,
  INITIAL_STUDENTS,
  INITIAL_PAYMENTS,
  INITIAL_EXPENSES,
  INITIAL_SESSIONS,
  INITIAL_PAYOUTS,
  INITIAL_APP_CONFIGS,
  INITIAL_NEWS_NOTES
} from '../data/initialData';
import {
  isBiometricsSupported,
  getStoredBiometricUser,
  cacheAuthSession,
  getCachedAuthSession,
  clearCachedAuthSession,
  registerBiometricCredential,
  authenticateWithBiometrics,
  disableBiometrics as disableBiometricsUtil,
  StoredBiometricInfo
} from '../lib/biometrics';
import { normalizeAppLanguage, translate, TranslationKey } from '../lib/i18n';


export interface TeacherFinancialSummary {
  teacher: Teacher;
  classesCount: number;
  studentsCount: number;
  grossActivityRevenue: number;
  calculatedDue: number;
  collectedInHand: number;
  alreadySettled: number;
  balanceToPay: number;
  status: 'settled' | 'pending' | 'surplus';
}

interface AppContextType {
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  goToPrevPeriod: () => void;
  goToNextPeriod: () => void;
  goToCurrentPeriod: () => void;

  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  currentTeacherId: string;
  setCurrentTeacherId: (id: string) => void;
  currentStudentId: string;
  setCurrentStudentId: (id: string) => void;

  currentUser: AuthUser | null;
  setCurrentUser: (user: AuthUser | null) => void;
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

  // Estado de base de datos en tiempo real y verificación inicial de sesión
  isAuthLoading: boolean;
  isLoadingDb: boolean;
  dbError: string | null;
  authDenialKind: 'pending' | 'rejected' | 'deactivated' | 'unauthorized' | 'error' | null;
  clearDbError: () => void;
  refreshFromSupabase: () => Promise<void>;
  seedInitialDataToSupabase: () => Promise<void>;

  // Gestión de Usuarios y Accesos (Exclusivo Administrador)
  profiles: AuthUser[];
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
  approvePendingUserAccess: (
    userId: string,
    overrides?: { role?: UserRole | ''; isSocio?: boolean }
  ) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  rejectOrBlockUserAccess: (
    userId: string
  ) => Promise<{ success: boolean; error?: string }>;
  deleteUserAccess: (userId: string) => Promise<void>;
  promoteOrUpdateMemberRole: (
    targetRole: UserRole.Socio | UserRole.Alumno | UserRole.Monitor | UserRole.Hibrido
  ) => Promise<{ success: boolean; error?: string }>;

  teachers: Teacher[];
  activities: Activity[];
  students: Student[];
  studentAbsences: StudentAbsence[];
  reportStudentAbsence: (params: {
    studentId: string;
    activityId: string;
    sessionDate: string;
    reason?: string;
    asRequest?: boolean;
    initialStatus?: 'reported' | 'approved';
  }) => Promise<{ success: boolean; status?: 'reported' | 'pending' | 'approved'; error?: string }>;
  cancelStudentAbsence: (absenceId: string) => Promise<{ success: boolean; error?: string }>;
  respondToStudentAbsenceRequest: (
    absenceId: string,
    approve: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  memberStatusHistory: MemberStatusHistoryEntry[];
  addStatusHistoryEntry: (
    entry: Omit<MemberStatusHistoryEntry, 'id' | 'changedAt'>
  ) => Promise<{ success: boolean; error?: string }>;
  deleteStatusHistoryEntry: (id: string) => Promise<{ success: boolean; error?: string }>;
  payments: PaymentRecord[];
  expenses: CenterExpense[];
  sessions: ClassSession[];
  payouts: TeacherPayout[];

  // Acciones en tiempo real
  recordPayment: (payment: Omit<PaymentRecord, 'id' | 'receiptNumber'> & { id?: string }) => Promise<PaymentRecord | null>;
  updatePayment: (id: string, updates: Partial<PaymentRecord>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  markPaymentPaid: (id: string, method?: PaymentMethod) => Promise<void>;

  // Cuota anual de socios (Exclusivo Administrador)
  memberAnnualFees: MemberAnnualFee[];
  memberAnnualFeesTableMissing: boolean;
  // Mensajes de alumnos sobre cuotas hacia el profesor
  studentPaymentMessages: StudentPaymentMessage[];
  studentPaymentMessagesTableMissing: boolean;
  sendStudentPaymentMessage: (params: {
    paymentId: string;
    studentId: string;
    studentName?: string;
    activityId: string;
    activityName?: string;
    teacherId?: string;
    teacherName?: string;
    periodMonth: string;
    receiptNumber?: string;
    amount?: number;
    reportedPaid: boolean;
    paidToType?: PaymentPaidToType;
    paidToName?: string;
    paymentMethod?: PaymentMethod;
    message: string;
  }) => Promise<{ success: boolean; error?: string; data?: StudentPaymentMessage }>;
  cancelStudentPaymentMessage: (messageId: string) => Promise<{ success: boolean; error?: string }>;
  evaluateStudentPaymentMessage: (params: {
    messageId: string;
    status: 'approved' | 'rejected';
    teacherEvaluation?: string;
    markPaymentAsPaid?: boolean;
    paymentMethod?: PaymentMethod;
    collectedByTeacher?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  upsertMemberAnnualFee: (params: {
    id?: string;
    profileId: string;
    memberName: string;
    memberEmail: string;
    memberNumber?: string;
    feeYear: number;
    amount: number;
    paidAmount: number;
    status: PaymentStatus;
    paymentMethod: PaymentMethod;
    paymentDate?: string;
    receiptNumber?: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string; fee?: MemberAnnualFee }>;
  generateAnnualFeesForYear: (params: {
    feeYear: number;
    amount?: number;
    strictSocioRoleOnly?: boolean;
  }) => Promise<{ success: boolean; createdCount: number; error?: string }>;
  deleteMemberAnnualFee: (id: string) => Promise<{ success: boolean; error?: string }>;

  addStudent: (student: Omit<Student, 'id' | 'registeredAt'>) => Promise<{ success: boolean; error?: string }>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<{ success: boolean; error?: string }>;
  deleteStudent: (id: string) => Promise<void>;
  enrollStudentInActivity: (studentId: string, activityId: string, customPrice?: number) => Promise<{ success: boolean; error?: string }>;
  updateStudentEnrollment: (params: {
    studentId: string;
    activityId: string;
    newActivityId?: string;
    customPrice?: number | null;
    billingMode?: 'monthly' | 'per_class';
    enrolledSince?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  unenrollStudentFromActivity: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  requestActivityEnrollment: (activityId: string, studentId?: string) => Promise<{ success: boolean; error?: string; studentId?: string }>;
  cancelActivityEnrollmentRequest: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  confirmActivityEnrollment: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  rejectActivityEnrollment: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  requestActivityUnenrollment: (
    studentId: string,
    activityId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  cancelActivityUnenrollmentRequest: (
    studentId: string,
    activityId: string
  ) => Promise<{ success: boolean; error?: string }>;
  approveActivityUnenrollment: (
    studentId: string,
    activityId: string,
    checks: { debtsChecked: boolean; materialsChecked: boolean; notes?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  rejectActivityUnenrollment: (
    studentId: string,
    activityId: string,
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  membershipWithdrawalRequests: MembershipWithdrawalRequest[];
  requestAssociationWithdrawal: (
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  cancelAssociationWithdrawalRequest: (
    requestId: string
  ) => Promise<{ success: boolean; error?: string }>;
  approveAssociationWithdrawal: (
    requestId: string,
    checks: { debtsChecked: boolean; materialsChecked: boolean; notes?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  rejectAssociationWithdrawal: (
    requestId: string,
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  enrollUserFromProfile: (params: {
    profile: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      studentId?: string;
      teacherId?: string;
    };
    activityId: string;
    customPrice?: number;
  }) => Promise<{ success: boolean; error?: string }>;
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
      category: 'admin_preserved' | 'teacher_student' | 'student' | 'teacher' | 'socio_puro' | 'baja';
    }>;
  }>;
  quickCreateAndEnrollStudent: (params: {
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    activityId: string;
    customPrice?: number;
  }) => Promise<{ success: boolean; studentId?: string; error?: string }>;
  validatePendingStudent: (studentId: string, approve: boolean) => Promise<{ success: boolean; error?: string }>;

  addTeacher: (teacher: Omit<Teacher, 'id'>) => Promise<{ success: boolean; error?: string; teacherId?: string }>;
  updateTeacher: (id: string, updates: Partial<Teacher>) => Promise<{ success: boolean; error?: string }>;
  deleteTeacher: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateTeacherAvatar: (teacherId: string, avatarUrl: string) => Promise<void>;
  updateUserAvatar: (avatarUrl: string | null) => Promise<{ success: boolean; error?: string }>;

  addActivity: (activity: Omit<Activity, 'id'>) => Promise<void>;
  updateActivity: (id: string, updates: Partial<Activity>) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  addExpense: (expense: Omit<CenterExpense, 'id'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  addClassSession: (session: Omit<ClassSession, 'id'>) => Promise<void>;
  deleteClassSession: (id: string) => Promise<void>;
  closeClassSession: (params: {
    sessionId?: string;
    activityId: string;
    teacherId: string;
    date: string;
    closedBy: ClassClosedBy;
    attendeesCount?: number;
    durationMinutes?: number;
    topic?: string;
    attendanceRecords?: ClassSession['attendanceRecords'];
  }) => Promise<{ success: boolean; error?: string }>;
  reopenClassSession: (params: {
    sessionId?: string;
    activityId: string;
    teacherId: string;
    date: string;
    reason: string;
    reopenedBy: 'profesor' | 'administrador';
  }) => Promise<{ success: boolean; error?: string }>;
  upsertSessionAttendance: (params: {
    activityId: string;
    teacherId: string;
    date: string;
    studentId: string;
    studentName: string;
    attendance: 'present' | 'absent' | 'partial';
    durationMinutes?: number;
    topic?: string;
    paid?: boolean;
    paidAmount?: number;
    paymentMethod?: PaymentMethod;
    paymentId?: string;
    enrolledStudents?: Array<{ id: string; name: string }>;
  }) => Promise<{ success: boolean; error?: string }>;
  recordClassPayment: (params: {
    studentId: string;
    activityId: string;
    amount: number;
    isPartial?: boolean;
    status?: PaymentStatus;
    paymentMethod?: PaymentMethod;
    date?: string;
    notes?: string;
  }) => Promise<PaymentRecord | null>;

  settleTeacherPayout: (
    teacherId: string,
    periodMonth: string,
    amountToPay: number,
    method: PaymentMethod,
    notes?: string
  ) => Promise<void>;

  resetToInitialData: () => Promise<void>;
  exportToCSV: (type: 'payments' | 'students' | 'expenses' | 'teachers') => void;

  // Cálculos automáticos del período
  periodPayments: PaymentRecord[];
  totalIncomeCollected: number;
  totalIncomePending: number;
  totalExpenses: number;
  teacherSummaries: TeacherFinancialSummary[];
  totalTeacherCosts: number;
  netMonthlyBalance: number;

  // Configuración Global ('app_config')
  appConfigs: AppConfigSetting[];
  updateAppConfig: (
    config_key: string,
    config_value: string,
    is_active: boolean,
    description?: string
  ) => Promise<void>;
  addAppConfig: (config: AppConfigSetting) => Promise<void>;
  deleteAppConfig: (config_key: string) => Promise<void>;

  // Últimas notas / Comunicados
  newsNotes: NewsNote[];
  readNewsNoteIds: string[];
  addNewsNote: (note: Omit<NewsNote, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateNewsNote: (
    id: string,
    updates: {
      title: string;
      content: string;
      category: 'aviso' | 'taller' | 'noticia' | 'general';
      pinned?: boolean;
      activityId?: string;
      activityName?: string;
      expiresAt?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  deleteNewsNote: (id: string) => Promise<{ success: boolean; error?: string }>;
  restoreNewsNote: (id: string) => Promise<{ success: boolean; error?: string }>;
  permanentlyDeleteNewsNote: (id: string) => Promise<{ success: boolean; error?: string }>;
  markNewsNoteRead: (noteId: string, isRead?: boolean) => Promise<void>;

  // Biometría y Sesión en Caché
  isBiometricsSupported: boolean;
  hasBiometricsEnabled: boolean;
  biometricUser: StoredBiometricInfo | null;
  enableBiometrics: () => Promise<boolean>;
  disableBiometrics: () => void;
  unlockWithBiometrics: () => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

const isDeactivatedAccount = ({
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

type AuthDenialKind = 'pending' | 'rejected' | 'deactivated' | 'unauthorized' | 'error';

const extractMissingProfileColumn = (error: any): string | null => {
  const msg = String(error?.message || '');
  const pgMatch = msg.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (pgMatch?.[1]) return pgMatch[1];
  const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];
  const genericMatch = msg.match(/column\s+([a-z0-9_]+)\s+does not exist/i);
  if (genericMatch?.[1]) return genericMatch[1];
  return null;
};

const isMissingColumnError = (error: any): boolean => {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42703' || error?.code === 'PGRST204' || msg.includes('column');
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Estado de usuario y autenticación con Supabase Auth
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const currentUserRef = useRef<AuthUser | null>(null);
  currentUserRef.current = currentUser;
  const lastAuthDenialErrorRef = useRef<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);

  // Estados de navegación y roles
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-11');
  const [currentRole, setCurrentRoleState] = useState<UserRole>(UserRole.Admin);
  const [currentTeacherId, setCurrentTeacherId] = useState<string>('');
  const [currentStudentId, setCurrentStudentId] = useState<string>('');

  // Modo oscuro
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('triskell_theme') === 'dark';
  });

  // Idioma de la interfaz por usuario ('es' | 'gl' | 'en')
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

  // Estado de verificación inicial de Auth y de conexión/errores de Supabase
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbSyncVersion, setDbSyncVersion] = useState(0);
  const [dbError, setDbError] = useState<string | null>(null);
  const [authDenialKind, setAuthDenialKind] = useState<AuthDenialKind | null>(null);

  // Colecciones sincronizadas en tiempo real con Supabase
  const [profiles, setProfiles] = useState<AuthUser[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentAbsences, setStudentAbsences] = useState<StudentAbsence[]>([]);
  const [membershipWithdrawalRequests, setMembershipWithdrawalRequests] = useState<
    MembershipWithdrawalRequest[]
  >([]);
  const [memberStatusHistory, setMemberStatusHistory] = useState<MemberStatusHistoryEntry[]>([]);
  const refreshSeqRef = useRef(0);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const paymentsRef = useRef<PaymentRecord[]>([]);
  paymentsRef.current = payments;
  const tempPaymentIdMapRef = useRef<Record<string, string>>({});
  const pendingPaymentInsertMapRef = useRef<Record<string, Promise<PaymentRecord | null>>>({});
  const [expenses, setExpenses] = useState<CenterExpense[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [payouts, setPayouts] = useState<TeacherPayout[]>([]);
  const [memberAnnualFees, setMemberAnnualFees] = useState<MemberAnnualFee[]>([]);
  const [memberAnnualFeesTableMissing, setMemberAnnualFeesTableMissing] = useState(false);
  const [studentPaymentMessages, setStudentPaymentMessages] = useState<StudentPaymentMessage[]>([]);
  const [studentPaymentMessagesTableMissing, setStudentPaymentMessagesTableMissing] = useState(false);

  // Configuración Global ('app_config')
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

  useEffect(() => {
    if (!isStrictAdminSession) {
      setMemberAnnualFees([]);
      setMemberAnnualFeesTableMissing(false);
    }
  }, [isStrictAdminSession]);

  const exposedAppConfigs = useMemo(() => {
    if (isStrictAdminSession) return appConfigs;
    return appConfigs.filter(c => c.config_key !== ANNUAL_FEE_CONFIG_KEY);
  }, [appConfigs, isStrictAdminSession]);

  // Últimas notas / Comunicados
  const [newsNotes, setNewsNotes] = useState<NewsNote[]>(() => {
    try {
      const local = localStorage.getItem('triskell_news_notes');
      return local ? JSON.parse(local) : INITIAL_NEWS_NOTES;
    } catch {
      return INITIAL_NEWS_NOTES;
    }
  });
  const [readNewsNoteIds, setReadNewsNoteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser?.id) {
      setReadNewsNoteIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`triskell_news_reads_${currentUser.id}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setReadNewsNoteIds(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
    } catch {
      setReadNewsNoteIds([]);
    }
  }, [currentUser?.id]);

  // Biometría
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

  // Sincronizar dark mode con clase en elemento HTML
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('triskell_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('triskell_theme', 'light');
    }
  }, [isDarkMode]);

  // Sincronizar idioma con atributo <html lang> y localStorage
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem('triskell_language', language);
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }, [language]);

  // Carga completa de datos desde Supabase
  const refreshFromSupabase = useCallback(async () => {
    const requestSeq = ++refreshSeqRef.current;
    try {
      setIsLoadingDb(true);

      // 1. Cargar Usuarios / Perfiles Autorizados
      const profilesRes = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (requestSeq !== refreshSeqRef.current) return;
      if (!profilesRes.error && profilesRes.data) {
        setProfiles(
          profilesRes.data.map(p => {
            const access = deriveAccessFromRow(p, p.email);
            const isSocio = deriveIsSocioFromRow(p);
            const hasExplicitRole = isValidUserRole(p.role);
            const normalizedRole = hasExplicitRole
              ? normalizeUserRole(p.role)
              : isSocio
              ? UserRole.Socio
              : UserRole.Alumno;
            const operationalRole = p.operational_role
              ? normalizeOperationalRole(p.operational_role)
              : normalizeOperationalRole(normalizedRole);
            const resolvedStatus = resolveProfileAccessStatus(p);
            const approvalStatus: ProfileAccessStatus = resolvedStatus
              ? resolvedStatus
              : access && hasExplicitRole
              ? 'approved'
              : !access && !p.end_date
              ? 'pending'
              : 'rejected';
            return {
              id: p.id,
              email: p.email,
              name: p.full_name || p.email || '',
              role: normalizedRole,
              hasExplicitRole,
              accessStatus: resolvedStatus ?? approvalStatus,
              approvalStatus,
              access,
              operationalRole,
              isSocio,
              language: p.language ? normalizeAppLanguage(p.language) : 'es',
              photoURL: p.avatar_url || undefined,
              teacherId: p.teacher_id || undefined,
              studentId: p.student_id || undefined,
              memberNumber: p.member_number || undefined,
              memberType: (p.member_type as MemberType) || (isSocio ? 'socio' : 'alumno_no_socio'),
              startDate:
                p.start_date ||
                (typeof p.created_at === 'string' ? p.created_at.split('T')[0] : undefined),
              endDate: p.end_date || undefined,
              active: access,
              provider: 'email',
              lastLogin: p.last_login_at || p.last_login || undefined,
              createdAt: p.created_at
            };
          })
        );
      }

      // 2. Cargar Monitores
      const teachersRes = await supabase.from('teachers').select('*').order('name');
      if (requestSeq !== refreshSeqRef.current) return;
      if (teachersRes.error) {
        handleSupabaseError(t('appContext.actions.loadTeachers'), teachersRes.error);
      } else {
        const loadedTeachers = (teachersRes.data || []).map(mapDbTeacherToTeacher);
        setTeachers(loadedTeachers);
        if (loadedTeachers.length > 0) {
          setCurrentTeacherId(prev => prev || loadedTeachers[0].id);
        }
      }

      // 3. Cargar Talleres / Actividades
      const activitiesRes = await supabase.from('activities').select('*').order('name');
      if (requestSeq !== refreshSeqRef.current) return;
      if (activitiesRes.error) {
        handleSupabaseError(t('appContext.actions.loadActivities'), activitiesRes.error);
      } else {
        const loadedActivities = (activitiesRes.data || []).map(mapDbActivityToActivity);
        const fallbackEndedMap = getStoredActivityEndedAtMap();
        const nowIsoForEnded = new Date().toISOString();
        for (const act of loadedActivities) {
          if (isWorkshopFinalized(act)) {
            if (act.endedAt) {
              if (fallbackEndedMap[act.id] !== act.endedAt) {
                setStoredActivityEndedAt(act.id, act.endedAt);
              }
            } else if (!fallbackEndedMap[act.id]) {
              setStoredActivityEndedAt(act.id, nowIsoForEnded);
            }
          } else if (fallbackEndedMap[act.id]) {
            setStoredActivityEndedAt(act.id, null);
          }
        }
        setActivities(loadedActivities);
      }

      // 4. Cargar Alumnos y Matrículas
      const [studentsRes, enrollmentsRes] = await Promise.all([
        supabase.from('students').select('*').order('name'),
        supabase.from('student_enrollments').select('*')
      ]);
      if (requestSeq !== refreshSeqRef.current) return;

      if (studentsRes.error) {
        handleSupabaseError(t('appContext.actions.loadStudents'), studentsRes.error);
      } else {
        const hasEnrollmentsError = Boolean(enrollmentsRes.error);
        const enrollments = enrollmentsRes.data || [];
        const loadedProfileRows = profilesRes.data || [];
        const loadedTeacherRows = teachersRes.data || [];
        setStudents(prev => {
          const prevById = new Map(prev.map(s => [s.id, s]));
          return (studentsRes.data || []).map(row => {
            const mapped = mapDbStudentToStudent(row, enrollments);
            const emailNorm = (mapped.email || '').toLowerCase().trim();
            const linkedProfile = loadedProfileRows.find(
              (p: any) =>
                (row.profile_id && p.id === row.profile_id) ||
                p.student_id === row.id ||
                (emailNorm && (p.email || '').toLowerCase().trim() === emailNorm)
            );
            const profileEmailNorm = (linkedProfile?.email || '').toLowerCase().trim();
            const lookupEmailNorm = emailNorm || profileEmailNorm;
            const linkedTeacher = loadedTeacherRows.find(
              (tc: any) =>
                (linkedProfile?.teacher_id && tc.id === linkedProfile.teacher_id) ||
                (row.profile_id && tc.profile_id === row.profile_id) ||
                (lookupEmailNorm && (tc.email || '').toLowerCase().trim() === lookupEmailNorm)
            );
            const enrichedMapped = {
              ...mapped,
              email: mapped.email || linkedProfile?.email || linkedTeacher?.email || '',
              phone: mapped.phone || linkedTeacher?.phone || ''
            };
            if (hasEnrollmentsError) {
              const existing = prevById.get(row.id);
              if (existing) {
                return {
                  ...enrichedMapped,
                  activities: existing.activities,
                  pendingEnrollments: existing.pendingEnrollments,
                  inactiveEnrollments: existing.inactiveEnrollments
                };
              }
            }
            return enrichedMapped;
          });
        });
        const firstStudentId = studentsRes.data?.[0]?.id;
        if (firstStudentId) {
          setCurrentStudentId(prev => prev || firstStudentId);
        }
      }

      // Verificar en tiempo real si el usuario autenticado actual ha sido dado de baja
      const activeUser = currentUserRef.current;
      if (activeUser && activeUser.email.toLowerCase().trim() !== 'cristino.conde@actriskell.org') {
        const activeEmail = activeUser.email.toLowerCase().trim();
        const freshProfile = (profilesRes.data || []).find(
          (p: any) => p.id === activeUser.id || (p.email || '').toLowerCase().trim() === activeEmail
        );
        const freshTeacher = (teachersRes.data || []).find(
          (tc: any) =>
            (freshProfile?.teacher_id && tc.id === freshProfile.teacher_id) ||
            (activeUser.teacherId && tc.id === activeUser.teacherId) ||
            (tc.email || '').toLowerCase().trim() === activeEmail
        );
        const freshStudent = (studentsRes.data || []).find(
          (st: any) =>
            (freshProfile?.student_id && st.id === freshProfile.student_id) ||
            (activeUser.studentId && st.id === activeUser.studentId) ||
            (st.email || '').toLowerCase().trim() === activeEmail
        );
        const isCurrentDeactivated = isDeactivatedAccount({
          email: activeEmail,
          profile: freshProfile,
          teacher: freshTeacher,
          student: freshStudent
        });
        const hasMissingOrUnauthorizedProfile =
          !profilesRes.error &&
          activeEmail !== MASTER_ADMIN_EMAIL &&
          !activeUser.id.startsWith('demo-') &&
          !activeUser.id.startsWith('usr-') &&
          (!freshProfile || !isProfileExplicitlyAuthorized(freshProfile, activeEmail));

        if (isCurrentDeactivated || hasMissingOrUnauthorizedProfile) {
          console.warn(`[TRISKELL AUTH] Sesión revocada: usuario no autorizado o de baja (${activeEmail})`);
          clearCachedAuthSession();
          void supabase.auth.signOut();
          setCurrentUser(null);
          const denial = resolveAuthDenial(freshProfile, activeUser.email);
          setAuthDenialKind(denial.kind);
          setDbError(denial.message);
          return;
        }

        if (freshProfile) {
          const resolvedRole: UserRole = isValidUserRole(freshProfile.role)
            ? normalizeUserRole(freshProfile.role)
            : activeUser.role;
          const resolvedAccess = deriveAccessFromRow(freshProfile, activeEmail);
          const resolvedStudentId = freshProfile.student_id || activeUser.studentId;
          const resolvedTeacherId = freshProfile.teacher_id || activeUser.teacherId;
          const resolvedIsSocio = deriveIsSocioFromRow(freshProfile);
          const resolvedOpRole = freshProfile.operational_role
            ? normalizeOperationalRole(freshProfile.operational_role)
            : normalizeOperationalRole(resolvedRole);

          if (
            resolvedRole !== activeUser.role ||
            resolvedAccess !== activeUser.access ||
            resolvedStudentId !== activeUser.studentId ||
            resolvedTeacherId !== activeUser.teacherId ||
            resolvedIsSocio !== activeUser.isSocio ||
            resolvedOpRole !== activeUser.operationalRole
          ) {
            setCurrentUser(prev =>
              prev
                ? {
                    ...prev,
                    role: resolvedRole,
                    access: resolvedAccess,
                    active: resolvedAccess,
                    operationalRole: resolvedOpRole,
                    isSocio: resolvedIsSocio,
                    studentId: resolvedStudentId,
                    teacherId: resolvedTeacherId
                  }
                : prev
            );
            if (resolvedRole !== activeUser.role) {
              setCurrentRoleState(resolvedRole);
            }
          }
        }
      }

      // 5. Cargar Pagos y Recibos
      const paymentsRes = await supabase
        .from('payments')
        .select('*, students(name), activities(name)')
        .order('created_at', { ascending: false });
      if (requestSeq !== refreshSeqRef.current) return;

      if (paymentsRes.error) {
        handleSupabaseError(t('appContext.actions.loadPayments'), paymentsRes.error);
      } else {
        const loadedPayments = (paymentsRes.data || []).map(row => mapDbPaymentToPayment(row));
        setPayments(loadedPayments);
      }

      // 6. Cargar Gastos del Centro
      const expensesRes = await supabase
        .from('center_expenses')
        .select('*')
        .order('date', { ascending: false });
      if (requestSeq !== refreshSeqRef.current) return;

      if (expensesRes.error) {
        handleSupabaseError(t('appContext.actions.loadExpenses'), expensesRes.error);
      } else {
        const loadedExpenses = (expensesRes.data || []).map(mapDbExpenseToExpense);
        setExpenses(loadedExpenses);
      }

      // 7. Cargar Sesiones y Asistencias
      const [sessionsRes, attendancesRes] = await Promise.all([
        supabase.from('class_sessions').select('*').order('date', { ascending: false }),
        supabase.from('session_attendances').select('*, students(name)')
      ]);
      if (requestSeq !== refreshSeqRef.current) return;

      if (sessionsRes.error) {
        handleSupabaseError(t('appContext.actions.loadSessions'), sessionsRes.error);
      } else {
        const attendances = attendancesRes.data || [];
        const loadedSessions = (sessionsRes.data || []).map(row => mapDbSessionToSession(row, attendances));
        setSessions(loadedSessions);
      }

      // 8. Cargar Liquidaciones de Monitores
      const payoutsRes = await supabase
        .from('teacher_payouts')
        .select('*')
        .order('period_month', { ascending: false });
      if (requestSeq !== refreshSeqRef.current) return;

      if (payoutsRes.error) {
        handleSupabaseError(t('appContext.actions.loadPayouts'), payoutsRes.error);
      } else {
        const loadedPayouts = (payoutsRes.data || []).map(mapDbPayoutToPayout);
        setPayouts(loadedPayouts);
      }

      const freshActiveProfileForAdminCheck = activeUser
        ? (profilesRes.data || []).find(
            (p: any) =>
              p.id === activeUser.id ||
              (p.email || '').toLowerCase().trim() === activeUser.email.toLowerCase().trim()
          )
        : null;
      const isCallerStrictlyAdmin = Boolean(
        activeUser &&
          (freshActiveProfileForAdminCheck && isValidUserRole(freshActiveProfileForAdminCheck.role)
            ? normalizeUserRole(freshActiveProfileForAdminCheck.role)
            : activeUser.role) === UserRole.Admin
      );

      // 9. Cargar Configuración Global ('app_config')
      try {
        const configRes = await supabase.from('app_config').select('*');
        if (requestSeq !== refreshSeqRef.current) return;
        if (!configRes.error && configRes.data && configRes.data.length > 0) {
          const loadedConfigs: AppConfigSetting[] = configRes.data
            .filter(
              (c: any) =>
                c.config_key !== 'google_calendar' &&
                (isCallerStrictlyAdmin || c.config_key !== ANNUAL_FEE_CONFIG_KEY)
            )
            .map((c: any) => ({
              id: c.id,
              config_key: c.config_key,
              config_value: c.config_value,
              is_active: Boolean(c.is_active),
              description: c.description,
              updated_at: c.updated_at
            }));
          setAppConfigs(loadedConfigs);
          localStorage.setItem('triskell_app_configs', JSON.stringify(loadedConfigs));
        }
      } catch (e) {
        console.warn('app_config fetch error:', e);
      }

      // 10. Cargar Últimas notas / Comunicados y lecturas por usuario
      try {
        const notesRes = await supabase.from('news_notes').select('*').order('date', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (!notesRes.error && notesRes.data) {
          const loadedNotes: NewsNote[] = notesRes.data
            .map((n: any) => ({
              id: n.id,
              title: n.title,
              content: n.content,
              date: n.date,
              category: n.category || 'general',
              author: n.author,
              pinned: Boolean(n.pinned),
              activityId: n.activity_id || undefined,
              activityName: n.activity_name || undefined,
              expiresAt:
                typeof n.expires_at === 'string' && n.expires_at
                  ? n.expires_at.slice(0, 10)
                  : undefined,
              isDeleted: Boolean(n.is_deleted || n.deleted_at),
              deletedAt: n.deleted_at || undefined,
              deletedBy: n.deleted_by || undefined
            }))
            .filter(
              (n: NewsNote) =>
                isCallerStrictlyAdmin ||
                (!n.isDeleted && !n.deletedAt && !isNewsNoteExpiredByDate(n.expiresAt))
            );
          setNewsNotes(loadedNotes);
          localStorage.setItem('triskell_news_notes', JSON.stringify(loadedNotes));
        }
      } catch (e) {
        console.warn('news_notes fetch error:', e);
      }

      if (activeUser?.id) {
        try {
          const readsRes = await supabase
            .from('news_note_reads')
            .select('note_id')
            .eq('user_id', activeUser.id);
          if (requestSeq !== refreshSeqRef.current) return;
          if (!readsRes.error && readsRes.data) {
            const dbReadIds = Array.from(
              new Set(
                readsRes.data
                  .map((r: any) => (typeof r.note_id === 'string' ? r.note_id : ''))
                  .filter(Boolean)
              )
            );
            setReadNewsNoteIds(dbReadIds);
            localStorage.setItem(`triskell_news_reads_${activeUser.id}`, JSON.stringify(dbReadIds));
          }
        } catch (e) {
          console.warn('news_note_reads fetch error:', e);
        }
      }

      // 11. Cargar Historial de Estados de Socios / Alumnos / Monitores
      try {
        const historyRes = await supabase
          .from('member_status_history')
          .select('*')
          .order('start_date', { ascending: false })
          .order('changed_at', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (!historyRes.error && historyRes.data) {
          setMemberStatusHistory(historyRes.data.map(mapDbHistoryToHistory));
        }
      } catch (e) {
        console.warn('member_status_history fetch error:', e);
      }

      // 12. Cargar Avisos de Ausencia de Alumnos
      try {
        const absencesRes = await supabase
          .from('student_absences')
          .select('*')
          .neq('status', 'cancelled')
          .order('session_date', { ascending: true });
        if (requestSeq !== refreshSeqRef.current) return;
        if (!absencesRes.error && absencesRes.data) {
          setStudentAbsences(absencesRes.data.map(mapDbAbsenceToAbsence));
        }
      } catch (e) {
        console.warn('student_absences fetch error:', e);
      }

      // 13. Cargar Solicitudes de Baja de la Asociación
      try {
        const withdrawalRes = await supabase
          .from('membership_withdrawal_requests')
          .select('*')
          .order('created_at', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (withdrawalRes.error) {
          console.warn('membership_withdrawal_requests fetch error:', withdrawalRes.error);
          if (isCallerStrictlyAdmin) {
            const errMsgLower = (withdrawalRes.error.message || '').toLowerCase();
            const isRlsOrPerm =
              withdrawalRes.error.code === '42501' ||
              errMsgLower.includes('permission denied') ||
              errMsgLower.includes('row-level security');
            const isMissingTable =
              !isRlsOrPerm &&
              (withdrawalRes.error.code === '42P01' ||
                withdrawalRes.error.code === 'PGRST205' ||
                errMsgLower.includes('does not exist') ||
                errMsgLower.includes('could not find the table'));
            if (isMissingTable) {
              setDbError(t('appContext.withdrawalTableMissing'));
            } else {
              handleSupabaseError(
                t('appContext.actions.loadAssociationWithdrawals'),
                withdrawalRes.error
              );
            }
          }
        } else if (withdrawalRes.data) {
          setMembershipWithdrawalRequests(
            withdrawalRes.data.map(mapDbWithdrawalRequestToRequest)
          );
        }
      } catch (e: any) {
        console.warn('membership_withdrawal_requests fetch error:', e);
        if (isCallerStrictlyAdmin) {
          handleSupabaseError(t('appContext.actions.loadAssociationWithdrawals'), e);
        }
      }

      // 14. Cargar Cuotas Anuales de Socios (Exclusivo Administrador)
      if (isCallerStrictlyAdmin) {
        try {
          const annualFeesRes = await supabase
            .from('member_annual_fees')
            .select('*')
            .order('fee_year', { ascending: false })
            .order('member_name', { ascending: true });
          if (requestSeq !== refreshSeqRef.current) return;
          if (annualFeesRes.error) {
            if (
              annualFeesRes.error.code === '42P01' ||
              annualFeesRes.error.code === 'PGRST205' ||
              annualFeesRes.error.message?.toLowerCase().includes('member_annual_fees')
            ) {
              setMemberAnnualFeesTableMissing(true);
              setMemberAnnualFees([]);
            } else {
              setMemberAnnualFeesTableMissing(false);
              console.warn('member_annual_fees fetch error:', annualFeesRes.error);
            }
          } else {
            setMemberAnnualFeesTableMissing(false);
            setMemberAnnualFees((annualFeesRes.data || []).map(mapDbMemberAnnualFeeToFee));
          }
        } catch (e) {
          console.warn('member_annual_fees fetch error:', e);
        }
      } else {
        setMemberAnnualFees([]);
        setMemberAnnualFeesTableMissing(false);
      }

      // 15. Cargar Mensajes de Alumnos sobre Cuotas
      try {
        const payMsgsRes = await supabase
          .from('student_payment_messages')
          .select('*')
          .order('created_at', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (payMsgsRes.error) {
          if (
            payMsgsRes.error.code === '42P01' ||
            payMsgsRes.error.code === 'PGRST205' ||
            payMsgsRes.error.message?.toLowerCase().includes('student_payment_messages')
          ) {
            setStudentPaymentMessagesTableMissing(true);
            setStudentPaymentMessages([]);
          } else {
            setStudentPaymentMessagesTableMissing(false);
            console.warn('student_payment_messages fetch error:', payMsgsRes.error);
          }
        } else {
          setStudentPaymentMessagesTableMissing(false);
          setStudentPaymentMessages((payMsgsRes.data || []).map(mapDbStudentPaymentMessageToMessage));
        }
      } catch (e) {
        console.warn('student_payment_messages fetch error:', e);
      }

      if (requestSeq === refreshSeqRef.current) {
        setDbSyncVersion(v => v + 1);
      }
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.generalSync'), err);
    } finally {
      if (requestSeq === refreshSeqRef.current) {
        setIsLoadingDb(false);
      }
    }
  }, [handleSupabaseError, resolveAuthDenial, t]);

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
        ['access_status', 'approval_status', 'language', 'access', 'operational_role', 'is_socio', 'active']
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
        ['access_status', 'approval_status', 'language', 'operational_role', 'is_socio', 'access', 'active']
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

  // Cargar perfil del usuario desde Supabase auth.users y public.profiles con control estricto de autorización (Whitelisting y estado activo)
  const syncUserProfile = useCallback(async (userId: string, userEmail?: string, userMeta?: any, appMeta?: any): Promise<boolean> => {
    lastAuthDenialErrorRef.current = null;
    try {
      if (!userEmail) {
        await supabase.auth.signOut();
        clearCachedAuthSession();
        setCurrentUser(null);
        setCurrentTeacherId('');
        setCurrentStudentId('');
        return false;
      }

      const emailNormalized = userEmail.toLowerCase().trim();
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

      // 1-2. Consultar en paralelo perfil por ID/email, profesor y alumno vinculados
      const [profileByUidRes, profileByEmailRes, teacherMatchRes, studentMatchRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('profiles').select('*').ilike('email', emailNormalized).maybeSingle(),
        supabase.from('teachers').select('*').ilike('email', emailNormalized).maybeSingle(),
        supabase.from('students').select('*').ilike('email', emailNormalized).maybeSingle()
      ]);

      if (profileByUidRes.error) {
        console.warn('[TRISKELL AUTH] Error consultando perfil por ID:', profileByUidRes.error.message);
      }
      if (profileByEmailRes.error) {
        console.warn('[TRISKELL AUTH] Error consultando perfil por email:', profileByEmailRes.error.message);
      }

      const profileByUid = profileByUidRes.data;
      const profileByEmail = profileByEmailRes.data;
      let resolvedProfile = profileByUid || profileByEmail;
      let createdPendingGoogleProfile = false;
      let teacherMatch = teacherMatchRes.data;
      let studentMatch = studentMatchRes.data;

      // Para registros/inicios con Google OAuth:
      // - Si aún no existe fila en profiles, crearla en estado 'pending' usando nombre real de Google y el email exacto autenticado.
      // - Si existe fila por auth.uid() con nombre placeholder (p. ej. "aaa"/vacío) o email desfasado, reparar únicamente esos campos sin alterar roles ni permisos.
      if (!isMasterAdmin && isGoogleProvider) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (!profileByUid && !profileByEmail) {
          const pendingPayload: Record<string, any> = {
            id: userId,
            email: emailNormalized,
            full_name: googleMeta.fullName || emailNormalized.split('@')[0] || t('appContext.fallbackUser'),
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
            console.warn('[TRISKELL AUTH] No se pudo crear el perfil pendiente de Google:', upsertRes.error.message);
          }
        } else if (profileByUid) {
          const currentProfEmail = (profileByUid.email || '').trim().toLowerCase();
          const needsNameRepair = Boolean(
            googleMeta.fullName && isPlaceholderProfileName(profileByUid.full_name)
          );
          const needsEmailRepair = !currentProfEmail || currentProfEmail !== emailNormalized;
          const needsAvatarRepair = Boolean(googleMeta.avatarUrl && !profileByUid.avatar_url);
          const isPendingRow = isPendingApprovalProfile(profileByUid);
          const needsPendingStatusRepair = isPendingRow && !resolveProfileAccessStatus(profileByUid);

          if (needsNameRepair || needsEmailRepair || needsAvatarRepair || needsPendingStatusRepair) {
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
              console.warn('[TRISKELL AUTH] No se pudieron sincronizar metadatos del perfil Google:', repairRes.error.message);
            }
          }
        }
      }

      // Resolver vínculos explícitos por ID si el correo del perfil difiere del de teacher/student
      if (!teacherMatch && resolvedProfile?.teacher_id) {
        const linkedTeacherRes = await supabase
          .from('teachers')
          .select('*')
          .eq('id', resolvedProfile.teacher_id)
          .maybeSingle();
        teacherMatch = linkedTeacherRes.data;
      }
      if (!studentMatch && resolvedProfile?.student_id) {
        const linkedStudentRes = await supabase
          .from('students')
          .select('*')
          .eq('id', resolvedProfile.student_id)
          .maybeSingle();
        studentMatch = linkedStudentRes.data;
      }

      // Lista blanca estricta: solo MASTER_ADMIN_EMAIL o un perfil previamente creado y autorizado activo por Admin
      const hasExplicitActiveAccess = isProfileExplicitlyAuthorized(resolvedProfile, emailNormalized);

      if (!isMasterAdmin && !hasExplicitActiveAccess) {
        console.warn(`[TRISKELL AUTH] Acceso no autorizado o pendiente de aprobación para correo: ${emailNormalized}`);
        await supabase.auth.signOut();
        clearCachedAuthSession();
        setCurrentUser(null);
        setCurrentRoleState(UserRole.Socio);
        setCurrentTeacherId('');
        setCurrentStudentId('');
        const denial = resolveAuthDenial(resolvedProfile, userEmail, createdPendingGoogleProfile);
        lastAuthDenialErrorRef.current = denial.message;
        setAuthDenialKind(denial.kind);
        setDbError(denial.message);
        return false;
      }

      // Comprobar si el usuario está dado de baja (soft delete: active = false, end_date vencida o ficha inactiva)
      if (
        isDeactivatedAccount({
          email: emailNormalized,
          profile: resolvedProfile,
          teacher: teacherMatch,
          student: studentMatch
        })
      ) {
        console.warn(`[TRISKELL AUTH] Acceso denegado (usuario de baja/pendiente): ${emailNormalized}`);
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

      // Determinar rol mediante función centralizada (respetando la autorización explícita de profiles)
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
        preserveExplicitRoleOnCreation: Boolean(resolvedProfile?.role && isValidUserRole(resolvedProfile.role))
      });

      const role: UserRole = toCanonicalProfileRole(
        isMasterAdmin
          ? UserRole.Admin
          : resolvedProfile?.role || calculatedAuth.role,
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
      const avatarUrl = resolvedProfile?.avatar_url || teacherMatch?.avatar_url || googleMeta.avatarUrl || undefined;
      const teacherId = resolvedProfile?.teacher_id || teacherMatch?.id || undefined;
      const studentId = resolvedProfile?.student_id || studentMatch?.id || undefined;

      const userLanguage = normalizeAppLanguage(resolvedProfile?.language || preferredLanguage);

      const loginNowIso = new Date().toISOString();

      // Sincronizar solo metadatos no privilegiados en public.profiles (nunca auto-crear/auto-autorizar perfiles no-admin)
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
                ...((!profileByUid.email || profileByUid.email.trim().toLowerCase() !== emailNormalized)
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
        memberType: (resolvedProfile?.member_type as MemberType) || (resolvedIsSocio ? 'socio' : 'alumno_no_socio'),
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

      // Guardar en caché local para desbloqueo rápido / biométrico y reiniciar reloj de actividad
      cacheAuthSession({
        email: emailNormalized,
        name: fullName,
        role,
        access,
        isSocio: resolvedIsSocio,
        language: userLanguage,
        userId: userId,
        timestamp: Date.now()
      });
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
  }, [
    handleSupabaseError,
    resolveAuthDenial,
    t,
    updateProfileWithColumnFallback,
    upsertProfileWithColumnFallback
  ]);

  // Suscripción al estado de Auth de Supabase: esperar verificación antes de consultar tablas protegidas
  useEffect(() => {
    let mounted = true;
    let initialHandled = false;

    const initAuth = async () => {
      try {
        // Detectar error de redirección OAuth (p.ej., rechazo por lista blanca en trigger de auth.users)
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const oauthError = searchParams.get('error') || hashParams.get('error');
        const oauthErrorDesc =
          searchParams.get('error_description') || hashParams.get('error_description');

        if (oauthError) {
          clearCachedAuthSession();
          setCurrentUser(null);
          await supabase.auth.signOut().catch(() => undefined);
          const cleanUrl = window.location.pathname + (window.location.search.includes('error=') ? '' : window.location.search);
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
        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);

        if (!mounted) return;
        if (error) {
          console.warn('Error checking initial Supabase session:', error.message);
        }

        if (session?.user) {
          initialHandled = true;
          await syncUserProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata,
            session.user.app_metadata
          );
        } else {
          // Verificar si hay sesión recordada en caché o biometría
          const cached = getCachedAuthSession();
          const storedBio = getStoredBiometricUser();

          // Si hay sesión recordada y NO tiene biometría obligatoria, validar en Supabase y restaurar
          if (cached && !storedBio) {
            const cachedEmailNorm = cached.email.toLowerCase().trim();
            if (cachedEmailNorm !== MASTER_ADMIN_EMAIL) {
              try {
                const [profCheck, tcCheck, stCheck] = await Promise.all([
                  supabase.from('profiles').select('*').ilike('email', cachedEmailNorm).maybeSingle(),
                  supabase.from('teachers').select('*').ilike('email', cachedEmailNorm).maybeSingle(),
                  supabase.from('students').select('*').ilike('email', cachedEmailNorm).maybeSingle()
                ]);
                let linkedTeacher = tcCheck.data;
                let linkedStudent = stCheck.data;
                if (!linkedTeacher && profCheck.data?.teacher_id) {
                  const res = await supabase.from('teachers').select('*').eq('id', profCheck.data.teacher_id).maybeSingle();
                  linkedTeacher = res.data;
                }
                if (!linkedStudent && profCheck.data?.student_id) {
                  const res = await supabase.from('students').select('*').eq('id', profCheck.data.student_id).maybeSingle();
                  linkedStudent = res.data;
                }
                const allQueriesOk = !profCheck.error && !tcCheck.error && !stCheck.error;
                const isAuthorizedProfile = isProfileExplicitlyAuthorized(profCheck.data, cachedEmailNorm);
                if (
                  (allQueriesOk && !isAuthorizedProfile) ||
                  isDeactivatedAccount({
                    email: cachedEmailNorm,
                    profile: profCheck.data,
                    teacher: linkedTeacher,
                    student: linkedStudent
                  })
                ) {
                  clearCachedAuthSession();
                  setCurrentUser(null);
                  const denial = resolveAuthDenial(profCheck.data, cached.email);
                  setAuthDenialKind(denial.kind);
                  setDbError(denial.message);
                  return;
                }
              } catch {
                // Si no hay conectividad en arranque, refreshFromSupabase revalidará al conectar
              }
            }

            const cachedLang = normalizeAppLanguage(cached.language);
            const cachedRole = normalizeUserRole(cached.role, UserRole.Alumno);
            const cachedAccess = cached.access !== false;
            const cachedIsSocio = cached.isSocio !== false;
            setCurrentUser({
              id: cached.userId || 'cached-usr',
              email: cached.email,
              name: cached.name,
              role: cachedRole,
              access: cachedAccess,
              isSocio: cachedIsSocio,
              language: cachedLang,
              active: cachedAccess,
              provider: 'email',
              lastLogin: new Date(cached.timestamp).toISOString()
            });
            setCurrentRoleState(cachedRole);
            setLanguageState(cachedLang);
          }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
  }, [syncUserProfile]);

  // Cargar datos solo tras verificar el estado de Auth, recargar automáticamente al cambiar usuario/foco y suscribirse a tiempo real (sin setInterval)
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

  // Cambiar perspectiva de vista en UI (Admin / Híbrido o acceso demo) sin sobrescribir profiles.role en Supabase
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

  // Función para cambiar el idioma del usuario y persistirlo en profiles / localStorage
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

        const cached = getCachedAuthSession();
        if (cached && (!cached.userId || cached.userId === currentUser.id)) {
          cacheAuthSession({
            ...cached,
            language: normalized
          });
        }

        if (
          !currentUser.id.startsWith('usr-') &&
          !currentUser.id.startsWith('demo-') &&
          !currentUser.id.startsWith('cached-')
        ) {
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

  // Inicio de sesión con Google OAuth mediante Supabase (sujeto a lista blanca estricta)
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

  // Inicio de sesión con Email y Contraseña mediante Supabase
  const loginWithEmail = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
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

  // Cambio de contraseña para el usuario autenticado en Supabase Auth
  const changePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
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

  // Solicitar enlace de restablecimiento / cambio de contraseña por correo
  const requestPasswordReset = async (email: string): Promise<{ success: boolean; error?: string }> => {
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

  // Cierre de sesión en Supabase
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

  // Cierre automático de la sesión actual por inactividad (configurable en app_config en minutos)
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
          setDbError(
            t('appContext.sessionExpiredInactivity', { minutes: configuredMinutes })
          );
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
  }, [currentUser?.id, currentUser?.access, sessionInactivityCfg.enabled, sessionInactivityCfg.minutes, logout, t]);

  // Configuración Global ('app_config')
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

  // Últimas notas / Comunicados
  const addNewsNote = async (
    note: Omit<NewsNote, 'id'>
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const isWorkshopNote = note.category === 'taller';
    const safeActivityId = isWorkshopNote && note.activityId ? note.activityId : undefined;
    const safeActivityName = isWorkshopNote && note.activityName ? note.activityName : undefined;
    const safeExpiresAt = note.expiresAt?.trim() ? note.expiresAt.trim().slice(0, 10) : undefined;

    const tempId = `note-${Date.now()}`;
    const optimisticNote: NewsNote = {
      ...note,
      id: tempId,
      activityId: safeActivityId,
      activityName: safeActivityName,
      expiresAt: safeExpiresAt,
      isDeleted: false
    };

    const isColumnError = (err: { code?: string; message?: string } | null) =>
      Boolean(
        err &&
          (err.code === '42703' ||
            err.code === 'PGRST204' ||
            err.message?.toLowerCase().includes('column'))
      );

    const extractMissingColumn = (msg?: string): string | null => {
      if (!msg) return null;
      const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i);
      if (pgrstMatch?.[1]) return pgrstMatch[1];
      const pgMatch = msg.match(/column "([^"]+)" of relation/i);
      if (pgMatch?.[1]) return pgMatch[1];
      return null;
    };

    const optionalExtendedColumns = new Set([
      'activity_id',
      'activity_name',
      'expires_at',
      'is_deleted',
      'deleted_at',
      'deleted_by',
      'author',
      'pinned'
    ]);

    const payload: Record<string, any> = {
      id: tempId,
      title: optimisticNote.title,
      content: optimisticNote.content,
      date: optimisticNote.date,
      category: optimisticNote.category,
      author: optimisticNote.author || null,
      pinned: Boolean(optimisticNote.pinned),
      activity_id: optimisticNote.activityId || null,
      activity_name: optimisticNote.activityName || null,
      expires_at: optimisticNote.expiresAt || null,
      is_deleted: false
    };

    try {
      let insertedRow: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < 9; attempt++) {
        const res = await supabase.from('news_notes').insert([payload]).select('*').single();
        if (!res.error) {
          insertedRow = res.data;
          lastError = null;
          break;
        }
        lastError = res.error;

        if (res.error.code === '22P02' && 'id' in payload) {
          delete payload.id;
          continue;
        }

        if (isColumnError(res.error)) {
          const missingCol = extractMissingColumn(res.error.message);
          if (missingCol && missingCol in payload) {
            delete payload[missingCol];
            continue;
          }
          let strippedAny = false;
          for (const optCol of [
            'activity_id',
            'activity_name',
            'expires_at',
            'is_deleted',
            'author',
            'pinned'
          ]) {
            if (optCol in payload && optionalExtendedColumns.has(optCol)) {
              delete payload[optCol];
              strippedAny = true;
            }
          }
          if (strippedAny) continue;
        }

        break;
      }

      if (lastError) {
        const msg = handleSupabaseError(t('appContext.actions.createNewsNote'), lastError);
        return { success: false, error: msg };
      }

      const savedNote: NewsNote = insertedRow
        ? {
            id: insertedRow.id,
            title: insertedRow.title,
            content: insertedRow.content,
            date: insertedRow.date,
            category: insertedRow.category || optimisticNote.category || 'general',
            author: insertedRow.author ?? optimisticNote.author,
            pinned:
              insertedRow.pinned !== undefined
                ? Boolean(insertedRow.pinned)
                : Boolean(optimisticNote.pinned),
            activityId: isWorkshopNote
              ? insertedRow.activity_id || optimisticNote.activityId || undefined
              : undefined,
            activityName: isWorkshopNote
              ? insertedRow.activity_name || optimisticNote.activityName || undefined
              : undefined,
            expiresAt:
              typeof insertedRow.expires_at === 'string' && insertedRow.expires_at
                ? insertedRow.expires_at.slice(0, 10)
                : optimisticNote.expiresAt,
            isDeleted: Boolean(insertedRow.is_deleted || insertedRow.deleted_at),
            deletedAt: insertedRow.deleted_at || undefined,
            deletedBy: insertedRow.deleted_by || undefined
          }
        : optimisticNote;

      setNewsNotes(prev => {
        const updated = [savedNote, ...prev.filter(n => n.id !== savedNote.id)];
        localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
        return updated;
      });

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      const msg = handleSupabaseError(t('appContext.actions.createNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const updateNewsNote = async (
    id: string,
    updates: {
      title: string;
      content: string;
      category: 'aviso' | 'taller' | 'noticia' | 'general';
      pinned?: boolean;
      activityId?: string;
      activityName?: string;
      expiresAt?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    if (!isStrictAdminSession) {
      return { success: false, error: t('appContext.actions.updateNewsNote') };
    }

    const isWorkshopNote = updates.category === 'taller';
    const safeActivityId = isWorkshopNote && updates.activityId ? updates.activityId : undefined;
    const safeActivityName = isWorkshopNote && updates.activityName ? updates.activityName : undefined;
    const safeExpiresAt = updates.expiresAt?.trim() ? updates.expiresAt.trim().slice(0, 10) : undefined;

    const previousNotes = newsNotes;
    setNewsNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              title: updates.title,
              content: updates.content,
              category: updates.category,
              pinned: Boolean(updates.pinned),
              activityId: safeActivityId,
              activityName: safeActivityName,
              expiresAt: safeExpiresAt
            }
          : n
      );
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    const isColumnError = (err: { code?: string; message?: string } | null) =>
      Boolean(
        err &&
          (err.code === '42703' ||
            err.code === 'PGRST204' ||
            err.message?.toLowerCase().includes('column'))
      );

    const extractMissingColumn = (msg?: string): string | null => {
      if (!msg) return null;
      const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i);
      if (pgrstMatch?.[1]) return pgrstMatch[1];
      const pgMatch = msg.match(/column "([^"]+)" of relation/i);
      if (pgMatch?.[1]) return pgMatch[1];
      return null;
    };

    const optionalExtendedColumns = new Set([
      'expires_at',
      'activity_id',
      'activity_name',
      'pinned'
    ]);

    const payload: Record<string, any> = {
      title: updates.title,
      content: updates.content,
      category: updates.category,
      pinned: Boolean(updates.pinned),
      activity_id: safeActivityId || null,
      activity_name: safeActivityName || null,
      expires_at: safeExpiresAt || null
    };

    try {
      let updatedRow: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await supabase
          .from('news_notes')
          .update(payload)
          .eq('id', id)
          .select('*')
          .single();
        if (!res.error) {
          updatedRow = res.data;
          lastError = null;
          break;
        }
        lastError = res.error;

        if (isColumnError(res.error)) {
          const missingCol = extractMissingColumn(res.error.message);
          if (missingCol && missingCol in payload) {
            delete payload[missingCol];
            continue;
          }
          let strippedAny = false;
          for (const optCol of ['expires_at', 'activity_id', 'activity_name', 'pinned']) {
            if (optCol in payload && optionalExtendedColumns.has(optCol)) {
              delete payload[optCol];
              strippedAny = true;
            }
          }
          if (strippedAny) continue;
        }

        break;
      }

      if (lastError) {
        setNewsNotes(previousNotes);
        localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
        const msg = handleSupabaseError(t('appContext.actions.updateNewsNote'), lastError);
        return { success: false, error: msg };
      }

      if (updatedRow) {
        setNewsNotes(prev => {
          const updated = prev.map(n =>
            n.id === id
              ? {
                  ...n,
                  title: updatedRow.title ?? updates.title,
                  content: updatedRow.content ?? updates.content,
                  category: updatedRow.category || updates.category,
                  pinned:
                    updatedRow.pinned !== undefined
                      ? Boolean(updatedRow.pinned)
                      : Boolean(updates.pinned),
                  activityId: isWorkshopNote
                    ? updatedRow.activity_id || safeActivityId || undefined
                    : undefined,
                  activityName: isWorkshopNote
                    ? updatedRow.activity_name || safeActivityName || undefined
                    : undefined,
                  expiresAt:
                    typeof updatedRow.expires_at === 'string' && updatedRow.expires_at
                      ? updatedRow.expires_at.slice(0, 10)
                      : safeExpiresAt
                }
              : n
          );
          localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
          return updated;
        });
      }

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.updateNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const deleteNewsNote = async (id: string): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const nowIso = new Date().toISOString();
    const actor = currentUser?.email || currentUser?.name || 'admin';
    const previousNotes = newsNotes;

    setNewsNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              isDeleted: true,
              deletedAt: nowIso,
              deletedBy: actor
            }
          : n
      );
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase
        .from('news_notes')
        .update({
          is_deleted: true,
          deleted_at: nowIso,
          deleted_by: actor
        })
        .eq('id', id);
      if (!error) {
        await refreshFromSupabase();
        return { success: true };
      }
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), error);
      return { success: false, error: msg };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const restoreNewsNote = async (id: string): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const previousNotes = newsNotes;
    const target = newsNotes.find(n => n.id === id);
    const shouldClearExpiredDate = Boolean(target && isNewsNoteExpiredByDate(target.expiresAt));

    setNewsNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              isDeleted: false,
              deletedAt: undefined,
              deletedBy: undefined,
              ...(shouldClearExpiredDate ? { expiresAt: undefined } : {})
            }
          : n
      );
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const updatePayload: Record<string, any> = {
        is_deleted: false,
        deleted_at: null,
        deleted_by: null
      };
      if (shouldClearExpiredDate) {
        updatePayload.expires_at = null;
      }

      let { error } = await supabase.from('news_notes').update(updatePayload).eq('id', id);
      if (
        error &&
        shouldClearExpiredDate &&
        (error.code === '42703' ||
          error.code === 'PGRST204' ||
          error.message?.toLowerCase().includes('expires_at'))
      ) {
        delete updatePayload.expires_at;
        ({ error } = await supabase.from('news_notes').update(updatePayload).eq('id', id));
      }

      if (!error) {
        await refreshFromSupabase();
        return { success: true };
      }
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.restoreNewsNote'), error);
      return { success: false, error: msg };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.restoreNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const permanentlyDeleteNewsNote = async (
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const previousNotes = newsNotes;
    setNewsNotes(prev => {
      const updated = prev.filter(n => n.id !== id);
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('news_notes').delete().eq('id', id);
      if (!error) {
        await refreshFromSupabase();
        return { success: true };
      }
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), error);
      return { success: false, error: msg };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const markNewsNoteRead = async (noteId: string, isRead: boolean = true) => {
    if (!currentUser?.id) return;
    const uid = currentUser.id;
    setReadNewsNoteIds(prev => {
      const nextSet = new Set(prev);
      if (isRead) {
        nextSet.add(noteId);
      } else {
        nextSet.delete(noteId);
      }
      const nextArr = Array.from(nextSet);
      try {
        localStorage.setItem(`triskell_news_reads_${uid}`, JSON.stringify(nextArr));
      } catch {
        // ignore storage quota errors
      }
      return nextArr;
    });

    try {
      if (isRead) {
        const { error } = await supabase
          .from('news_note_reads')
          .upsert(
            {
              note_id: noteId,
              user_id: uid,
              read_at: new Date().toISOString()
            },
            { onConflict: 'note_id,user_id' }
          );
        if (error) {
          console.warn('news_note_reads upsert error:', error.message);
        }
      } else {
        const { error } = await supabase
          .from('news_note_reads')
          .delete()
          .eq('note_id', noteId)
          .eq('user_id', uid);
        if (error) {
          console.warn('news_note_reads delete error:', error.message);
        }
      }
    } catch (e) {
      console.warn('news_note_reads mutation error:', e);
    }
  };

  // Biometría
  const enableBiometrics = async (): Promise<boolean> => {
    if (!currentUser) throw new Error(t('appContext.biometricsRequireLogin'));
    const ok = await registerBiometricCredential(
      currentUser.id,
      currentUser.email,
      currentUser.name,
      currentUser.role,
      languageRef.current
    );
    if (ok) {
      setBiometricUserState(getStoredBiometricUser());
    }
    return ok;
  };

  const disableBiometrics = () => {
    disableBiometricsUtil();
    setBiometricUserState(null);
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    try {
      const user = await authenticateWithBiometrics(languageRef.current);
      if (user) {
        const emailNorm = user.email.toLowerCase().trim();
        let resolvedRole: UserRole = normalizeUserRole(user.role, UserRole.Alumno);
        let resolvedName = user.name;
        let resolvedId = user.credentialId;
        let resolvedAccess = true;
        let resolvedIsSocio = true;

        if (emailNorm !== MASTER_ADMIN_EMAIL) {
          const [profRes, tcRes, stRes] = await Promise.all([
            supabase.from('profiles').select('*').ilike('email', emailNorm).maybeSingle(),
            supabase.from('teachers').select('*').ilike('email', emailNorm).maybeSingle(),
            supabase.from('students').select('*').ilike('email', emailNorm).maybeSingle()
          ]);
          let linkedTeacher = tcRes.data;
          let linkedStudent = stRes.data;
          if (!linkedTeacher && profRes.data?.teacher_id) {
            const r = await supabase.from('teachers').select('*').eq('id', profRes.data.teacher_id).maybeSingle();
            linkedTeacher = r.data;
          }
          if (!linkedStudent && profRes.data?.student_id) {
            const r = await supabase.from('students').select('*').eq('id', profRes.data.student_id).maybeSingle();
            linkedStudent = r.data;
          }
          const allOk = !profRes.error && !tcRes.error && !stRes.error;
          const isAuthorizedProfile = isProfileExplicitlyAuthorized(profRes.data, emailNorm);
          if (
            (allOk && !isAuthorizedProfile) ||
            isDeactivatedAccount({
              email: emailNorm,
              profile: profRes.data,
              teacher: linkedTeacher,
              student: linkedStudent
            })
          ) {
            clearCachedAuthSession();
            await supabase.auth.signOut().catch(() => undefined);
            setCurrentUser(null);
            const denial = resolveAuthDenial(profRes.data, user.email);
            setAuthDenialKind(denial.kind);
            setDbError(denial.message);
            throw new Error(denial.message);
          }
          if (profRes.data) {
            resolvedId = profRes.data.id || resolvedId;
            resolvedName = profRes.data.full_name || resolvedName;
            resolvedRole = normalizeUserRole(profRes.data.role, resolvedRole);
            resolvedAccess = deriveAccessFromRow(profRes.data, emailNorm);
            resolvedIsSocio = deriveIsSocioFromRow(profRes.data);
          }
        } else {
          resolvedRole = UserRole.Admin;
        }

        const authUserObj: AuthUser = {
          id: resolvedId,
          email: user.email,
          name: resolvedName,
          role: resolvedRole,
          access: resolvedAccess,
          isSocio: resolvedIsSocio,
          active: resolvedAccess,
          lastLogin: new Date().toISOString()
        };
        setCurrentUser(authUserObj);
        setCurrentRoleState(resolvedRole);

        cacheAuthSession({
          email: user.email,
          name: resolvedName,
          role: resolvedRole,
          access: resolvedAccess,
          isSocio: resolvedIsSocio,
          userId: resolvedId,
          timestamp: Date.now()
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error unlocking with biometrics:', err);
      throw err;
    }
  };


  // ==============================================================================
  // GESTIÓN EXCLUSIVA DE USUARIOS POR EL ADMINISTRADOR (auth.users + profiles)
  // ==============================================================================

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
        const cleanStart = params.startDate || new Date().toISOString().split('T')[0];
        // Cerrar ciclo abierto anterior si pasa a otro estado
        const openPrevious = memberStatusHistory.find(
          h => h.entityType === params.entityType && h.entityId === params.entityId && !h.endDate
        );
        if (openPrevious && openPrevious.id) {
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
    [memberStatusHistory, currentUser?.id]
  );

  const addStatusHistoryEntry: AppContextType['addStatusHistoryEntry'] = async entry => {
    clearDbError();
    try {
      const payload = {
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        status: entry.status,
        member_type: entry.memberType || null,
        start_date: entry.startDate,
        end_date: entry.endDate || null,
        notes: entry.notes || null,
        changed_by: entry.changedBy || currentUser?.id || null
      };
      const { data, error } = await supabase
        .from('member_status_history')
        .insert([payload])
        .select('*')
        .single();
      if (error) {
        if (error.code === '42P01') {
          return {
            success: false,
            error: t('appContext.historyTableMissing')
          };
        }
        handleSupabaseError(t('appContext.actions.addHistoryCycle'), error);
        return { success: false, error: error.message };
      }
      if (data) {
        setMemberStatusHistory(prev => [mapDbHistoryToHistory(data), ...prev]);
      }
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || t('appContext.historyAddError') };
    }
  };

  const deleteStatusHistoryEntry: AppContextType['deleteStatusHistoryEntry'] = async id => {
    clearDbError();
    try {
      const { error } = await supabase.from('member_status_history').delete().eq('id', id);
      if (error) {
        handleSupabaseError(t('appContext.actions.deleteHistoryEntry'), error);
        return { success: false, error: error.message };
      }
      setMemberStatusHistory(prev => prev.filter(h => h.id !== id));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || t('appContext.historyDeleteError') };
    }
  };

  const createUserByAdmin: AppContextType['createUserByAdmin'] = async (params) => {
    clearDbError();
    try {
      const emailNorm = params.email.toLowerCase().trim();
      const fullNameClean = params.fullName.trim();
      const tempPassword = (params.password || `Triskell${Math.floor(1000 + Math.random() * 9000)}!`).trim();
      const todayStr = new Date().toISOString().split('T')[0];
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

      // 0. Verificar sesión JWT real del Administrador para evitar fallos RLS posteriores
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.access_token) {
        return {
          success: false,
          error: t('appContext.adminSessionRequired')
        };
      }

      // 1. Crear PRIMERO en auth.users con cliente aislado (no pisa la sesión del Admin)
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

      // En Supabase, si el email ya existe y Confirm Email está activo, devuelve identities = []
      if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {
        return {
          success: false,
          error: t('appContext.authEmailAlreadyExists', { email: emailNorm })
        };
      }

      let linkedTeacherId = params.teacherId || null;
      let linkedStudentId = params.studentId || null;

      // 2. Si se solicitó crear ficha de monitor automática (o reutilizar por email)
      if ((resolvedRole === UserRole.Monitor || resolvedRole === UserRole.Hibrido) && params.createTeacherProfile && !linkedTeacherId) {
        const { data: existingTeacher, error: findTeacherErr } = await supabase
          .from('teachers')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();

        if (findTeacherErr) {
          return { success: false, error: t('appContext.authTeacherLookupError', { msg: findTeacherErr.message }) };
        }

        if (existingTeacher?.id) {
          linkedTeacherId = existingTeacher.id;
        } else {
          const td = params.teacherProfileData;
          const isTeacherActive = (td?.active ?? true) && resolvedAccess;
          const baseTeacherInsert = {
            name: fullNameClean,
            email: emailNorm,
            phone: td?.phone ?? '',
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
            end_date: isTeacherActive ? (params.endDate || null) : (params.endDate || todayStr)
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
            (teacherInsertRes.error.code === '42703' || teacherInsertRes.error.message?.includes('column'))
          ) {
            teacherInsertRes = await supabase
              .from('teachers')
              .insert([extTeacherNoSocioCol])
              .select('id')
              .single();
            if (
              teacherInsertRes.error &&
              (teacherInsertRes.error.code === '42703' || teacherInsertRes.error.message?.includes('column'))
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

      // 3. Si se solicitó crear ficha de alumno/socio automática (o reutilizar por email)
      if (
        (resolvedRole === UserRole.Alumno || resolvedRole === UserRole.Hibrido || resolvedRole === UserRole.Socio) &&
        params.createStudentProfile &&
        !linkedStudentId
      ) {
        const { data: existingStudent, error: findStudentErr } = await supabase
          .from('students')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();

        if (findStudentErr) {
          return { success: false, error: t('appContext.authStudentLookupError', { msg: findStudentErr.message }) };
        }

        if (existingStudent?.id) {
          linkedStudentId = existingStudent.id;
        } else {
          const baseStudentInsert = {
            name: fullNameClean,
            email: emailNorm,
            phone: params.teacherProfileData?.phone ?? '',
            status: resolvedAccess ? 'active' : 'inactive',
            registered_at: effectiveStartDate
          };
          const extStudentNoSocioCol = {
            ...baseStudentInsert,
            member_number: params.memberNumber || null,
            member_type: effectiveMemberType,
            start_date: effectiveStartDate,
            end_date: resolvedAccess ? (params.endDate || null) : (params.endDate || todayStr)
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
            (studentInsertRes.error.code === '42703' || studentInsertRes.error.message?.includes('column'))
          ) {
            studentInsertRes = await supabase
              .from('students')
              .insert([extStudentNoSocioCol])
              .select('id')
              .single();
            if (
              studentInsertRes.error &&
              (studentInsertRes.error.code === '42703' || studentInsertRes.error.message?.includes('column'))
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

      // 4. Registrar o actualizar en public.profiles con el ID exacto de auth.users
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

  const updateUserProfileByAdmin: AppContextType['updateUserProfileByAdmin'] = async (
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

      const todayStr = new Date().toISOString().split('T')[0];
      const fullDbUpdates: Record<string, any> = { ...baseDbUpdates };
      if (updates.memberNumber !== undefined) fullDbUpdates.member_number = updates.memberNumber || null;
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
          if (sRes.error && (sRes.error.code === '42703' || sRes.error.message?.includes('column'))) {
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
          if (tRes.error && (tRes.error.code === '42703' || tRes.error.message?.includes('column'))) {
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

  const promoteOrUpdateMemberRole: AppContextType['promoteOrUpdateMemberRole'] = async targetRole => {
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
      const todayStr = new Date().toISOString().split('T')[0];
      let nextStudentId = currentUser.studentId || currentStudentId || undefined;
      let nextTeacherId = currentUser.teacherId || currentTeacherId || undefined;

      // Garantizar ficha de alumno si pasa a Alumno o Híbrido
      if ((canonicalTargetRole === UserRole.Alumno || canonicalTargetRole === UserRole.Hibrido) && !nextStudentId) {
        const localStudent = students.find(
          s => s.profileId === currentUser.id || (emailNorm && s.email.trim().toLowerCase() === emailNorm)
        );
        if (localStudent) {
          nextStudentId = localStudent.id;
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
          if (stRes.error && (stRes.error.code === '42703' || stRes.error.message?.includes('column'))) {
            stRes = await supabase.from('students').insert([basePayload]).select('id').single();
          }
          if (stRes.data?.id) nextStudentId = stRes.data.id;
        }
      }

      // Garantizar ficha de monitor si pasa a Monitor o Híbrido
      if ((canonicalTargetRole === UserRole.Monitor || canonicalTargetRole === UserRole.Hibrido) && !nextTeacherId) {
        const localTeacher = teachers.find(
          teacherItem => emailNorm && teacherItem.email.trim().toLowerCase() === emailNorm
        );
        if (localTeacher) {
          nextTeacherId = localTeacher.id;
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
          if (tcRes.error && (tcRes.error.code === '42703' || tcRes.error.message?.includes('column'))) {
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

  // Baja lógica (soft delete) y reactivación de usuarios en public.profiles (sin borrar registros de BD)
  const toggleUserAccessStatus = async (
    userId: string,
    access: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const targetProfile = profiles.find(p => p.id === userId);
      if (
        !access &&
        targetProfile?.email?.toLowerCase().trim() === MASTER_ADMIN_EMAIL
      ) {
        return {
          success: false,
          error: t('appContext.accountDeactivated', { email: targetProfile.email })
        };
      }

      const todayStr = new Date().toISOString().split('T')[0];
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

  const deriveLiveOperationalRoleForProfile = useCallback(
    (targetProfile: AuthUser | undefined, emailNorm?: string): OperationalRole => {
      if (!targetProfile) return 'vacio';
      const resolvedEmail = (emailNorm || targetProfile.email || '').toLowerCase().trim();
      const linkedStudent = students.find(
        s =>
          (targetProfile.studentId && s.id === targetProfile.studentId) ||
          s.profileId === targetProfile.id ||
          (resolvedEmail && s.email.toLowerCase().trim() === resolvedEmail)
      );
      const linkedTeacher = teachers.find(
        tc =>
          (targetProfile.teacherId && tc.id === targetProfile.teacherId) ||
          (resolvedEmail && tc.email.toLowerCase().trim() === resolvedEmail)
      );
      const activeActIds = new Set(
        activities
          .filter(a => a.active !== false && a.status !== 'pending' && a.status !== 'inactive')
          .map(a => a.id)
      );
      const hasActiveStudentAssignment = Boolean(
        linkedStudent &&
          linkedStudent.status !== 'inactive' &&
          linkedStudent.status !== 'pending_validation' &&
          linkedStudent.validationStatus !== 'pending' &&
          linkedStudent.activities.some(
            e =>
              e.active !== false &&
              !e.deletedAt &&
              e.status !== 'pending' &&
              e.status !== 'inactive' &&
              e.status !== 'rejected' &&
              activeActIds.has(e.activityId)
          )
      );
      const hasActiveTeacherAssignment = Boolean(
        linkedTeacher &&
          linkedTeacher.active !== false &&
          linkedTeacher.status !== 'pending' &&
          linkedTeacher.status !== 'pending_validation' &&
          linkedTeacher.status !== 'inactive' &&
          activities.some(
            a =>
              a.teacherId === linkedTeacher.id &&
              a.active !== false &&
              a.status !== 'pending' &&
              a.status !== 'inactive'
          )
      );
      return deriveOperationalRoleFromAssignments(
        hasActiveStudentAssignment,
        hasActiveTeacherAssignment
      );
    },
    [students, teachers, activities]
  );

  const saveUserPermissionDrafts: AppContextType['saveUserPermissionDrafts'] = async drafts => {
    clearDbError();
    if (!drafts || drafts.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let updatedCount = 0;

      for (const draft of drafts) {
        const targetProfile = profiles.find(p => p.id === draft.userId);
        const emailNorm = (targetProfile?.email || '').toLowerCase().trim();
        const isMaster = emailNorm === MASTER_ADMIN_EMAIL;

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
        const nextOpRole = deriveLiveOperationalRoleForProfile(targetProfile, emailNorm);
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

        const linkedStudentId =
          targetProfile?.studentId ||
          students.find(
            s =>
              s.profileId === draft.userId ||
              (emailNorm && s.email.toLowerCase().trim() === emailNorm)
          )?.id;
        const linkedTeacherId =
          targetProfile?.teacherId ||
          teachers.find(tc => emailNorm && tc.email.toLowerCase().trim() === emailNorm)?.id;

        if (linkedStudentId) {
          const stMemberType: MemberType = nextIsSocio ? 'socio' : 'alumno_no_socio';
          const sRes = await supabase
            .from('students')
            .update({ is_socio: nextIsSocio, member_type: stMemberType })
            .eq('id', linkedStudentId);
          if (sRes.error && (sRes.error.code === '42703' || sRes.error.message?.includes('column'))) {
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
          if (tRes.error && (tRes.error.code === '42703' || tRes.error.message?.includes('column'))) {
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

  const approvePendingUserAccess: AppContextType['approvePendingUserAccess'] = async (
    userId,
    overrides
  ) => {
    clearDbError();
    try {
      const targetProfile = profiles.find(p => p.id === userId);
      const emailNorm = (targetProfile?.email || '').toLowerCase().trim();
      const todayStr = new Date().toISOString().split('T')[0];

      const nextIsSocio =
        overrides?.isSocio !== undefined
          ? Boolean(overrides.isSocio)
          : targetProfile?.isSocio !== undefined
          ? targetProfile.isSocio
          : true;

      const hasOverrideRole = Boolean(overrides?.role && isValidUserRole(overrides.role));
      const hasPersistedRole = Boolean(
        targetProfile?.hasExplicitRole && isValidUserRole(targetProfile?.role)
      );
      const nextRole: UserRole = hasOverrideRole
        ? toCanonicalProfileRole(overrides?.role, DEFAULT_BASE_USER_ROLE)
        : hasPersistedRole
        ? toCanonicalProfileRole(targetProfile?.role, DEFAULT_BASE_USER_ROLE)
        : DEFAULT_BASE_USER_ROLE;

      const nextMemberType: MemberType = nextIsSocio
        ? 'socio'
        : nextRole === UserRole.Monitor || nextRole === UserRole.Hibrido
        ? 'monitor_no_socio'
        : 'alumno_no_socio';
      const nextOpRole = deriveLiveOperationalRoleForProfile(targetProfile, emailNorm);

      const payload: Record<string, any> = {
        role: nextRole,
        is_socio: nextIsSocio,
        member_type: nextMemberType,
        operational_role: nextOpRole,
        access: true,
        active: true,
        end_date: null,
        access_status: 'approved',
        approval_status: 'approved'
      };

      const { error } = await updateProfileWithColumnFallback(userId, payload);
      if (error) {
        const formattedErr = handleSupabaseError(
          t('appContext.actions.reactivateUserAccess'),
          error,
          nextRole
        );
        return { success: false, error: formattedErr };
      }

      const linkedStudentId =
        targetProfile?.studentId ||
        students.find(
          s =>
            s.profileId === userId ||
            (emailNorm && s.email.toLowerCase().trim() === emailNorm)
        )?.id;
      const linkedTeacherId =
        targetProfile?.teacherId ||
        teachers.find(tc => emailNorm && tc.email.toLowerCase().trim() === emailNorm)?.id;

      if (linkedStudentId) {
        const stMemberType: MemberType = nextIsSocio ? 'socio' : 'alumno_no_socio';
        const sRes = await supabase
          .from('students')
          .update({ is_socio: nextIsSocio, member_type: stMemberType })
          .eq('id', linkedStudentId);
        if (sRes.error && (sRes.error.code === '42703' || sRes.error.message?.includes('column'))) {
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
        if (tRes.error && (tRes.error.code === '42703' || tRes.error.message?.includes('column'))) {
          await supabase
            .from('teachers')
            .update({ member_type: tcMemberType })
            .eq('id', linkedTeacherId);
        }
      }

      await recordStatusHistoryCycle({
        entityType: 'profile',
        entityId: userId,
        status: 'active',
        startDate: todayStr,
        notes: t('appContext.actions.reactivateUserAccess')
      });

      setProfiles(prev =>
        prev.map(p =>
          p.id === userId
            ? {
                ...p,
                role: nextRole,
                hasExplicitRole: true,
                isSocio: nextIsSocio,
                memberType: nextMemberType,
                operationalRole: nextOpRole,
                access: true,
                active: true,
                accessStatus: 'approved',
                approvalStatus: 'approved',
                endDate: undefined
              }
            : p
        )
      );

      await refreshFromSupabase();
      return { success: true, role: nextRole };
    } catch (e: any) {
      const msg = e?.message || t('appContext.updateUserError');
      handleSupabaseError(t('appContext.actions.reactivateUserAccess'), e);
      return { success: false, error: msg };
    }
  };

  const rejectOrBlockUserAccess: AppContextType['rejectOrBlockUserAccess'] = async userId => {
    clearDbError();
    try {
      const targetProfile = profiles.find(p => p.id === userId);
      const emailNorm = (targetProfile?.email || '').toLowerCase().trim();
      if (emailNorm === MASTER_ADMIN_EMAIL || userId === currentUserRef.current?.id) {
        return {
          success: false,
          error: t('appContext.accountDeactivated', { email: targetProfile?.email || '' })
        };
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const payload: Record<string, any> = {
        access: false,
        active: false,
        end_date: todayStr,
        access_status: 'rejected',
        approval_status: 'rejected'
      };

      const { error } = await updateProfileWithColumnFallback(userId, payload);
      if (error) {
        handleSupabaseError(t('appContext.actions.revokeUserAccess'), error);
        return { success: false, error: error.message };
      }

      await recordStatusHistoryCycle({
        entityType: 'profile',
        entityId: userId,
        status: 'inactive',
        startDate: todayStr,
        endDate: todayStr,
        notes: t('appContext.actions.revokeUserAccess')
      });

      setProfiles(prev =>
        prev.map(p =>
          p.id === userId
            ? {
                ...p,
                access: false,
                active: false,
                accessStatus: 'rejected',
                approvalStatus: 'rejected',
                endDate: todayStr
              }
            : p
        )
      );

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || t('appContext.updateUserError');
      handleSupabaseError(t('appContext.actions.revokeUserAccess'), e);
      return { success: false, error: msg };
    }
  };

  // Mantiene compatibilidad realizando baja lógica (soft delete) sin eliminar de la BD
  const deleteUserAccess = async (userId: string) => {
    await toggleUserAccessStatus(userId, false);
  };

  // Reevaluación automática del rol operativo, `access` y `isSocio` mediante función centralizada
  const reevaluateUserOperationalRole: AppContextType['reevaluateUserOperationalRole'] = useCallback(
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
          supabase.from('profiles').select('*'),
          supabase.from('teachers').select('*'),
          supabase.from('students').select('*'),
          supabase.from('student_enrollments').select('*'),
          supabase.from('activities').select('*')
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
          [
            targets.email,
            targetStudentRow?.email,
            targetTeacherRow?.email
          ]
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

        const todayStr = new Date().toISOString().split('T')[0];
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
                (adminSyncRes.error.code === '42703' || adminSyncRes.error.message?.includes('column'))
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
                  // Best-effort RPC fallback cuando RLS o trigger de seguridad restringe UPDATE directo en profiles
                }
              } else if (code === '42703' || msg.includes('column')) {
                updateRes = await supabase
                  .from('profiles')
                  .update(withoutAccessPayload)
                  .eq('id', prof.id);
                if (
                  updateRes.error &&
                  (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
                ) {
                  updateRes = await supabase
                    .from('profiles')
                    .update(legacyPayload)
                    .eq('id', prof.id);
                }
                if (
                  updateRes.error &&
                  (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
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
                  (retryNoRole.error.code === '42703' || retryNoRole.error.message?.includes('column'))
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
                let stRes = await supabase
                  .from('students')
                  .update(stUpdate)
                  .eq('id', linkedStudent.id);
                if (stRes.error && (stRes.error.code === '42703' || stRes.error.message?.includes('column'))) {
                  await supabase
                    .from('students')
                    .update({ status: 'inactive' })
                    .eq('id', linkedStudent.id);
                }
              }
              if (linkedTeacher && linkedTeacher.active !== false) {
                const tcUpdate = { active: false, end_date: todayStr };
                let tcRes = await supabase
                  .from('teachers')
                  .update(tcUpdate)
                  .eq('id', linkedTeacher.id);
                if (tcRes.error && (tcRes.error.code === '42703' || tcRes.error.message?.includes('column'))) {
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
              if (stRes.error && (stRes.error.code === '42703' || stRes.error.message?.includes('column'))) {
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

  const toggleUserSocioMembership: AppContextType['toggleUserSocioMembership'] = async (
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
      const effectiveStudentId =
        targets.studentId ||
        matchedProfile?.studentId ||
        students.find(
          s =>
            (effectiveProfileId && s.profileId === effectiveProfileId) ||
            (effectiveEmailNorm && s.email.toLowerCase().trim() === effectiveEmailNorm)
        )?.id;
      const effectiveTeacherId =
        targets.teacherId ||
        matchedProfile?.teacherId ||
        teachers.find(
          tc => effectiveEmailNorm && tc.email.toLowerCase().trim() === effectiveEmailNorm
        )?.id;

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

  // Navegación de Períodos Mensuales
  const goToPrevPeriod = () => {
    const [year, month] = selectedPeriod.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const newY = prevDate.getFullYear();
    const newM = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedPeriod(`${newY}-${newM}`);
  };

  const goToNextPeriod = () => {
    const [year, month] = selectedPeriod.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const newY = nextDate.getFullYear();
    const newM = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedPeriod(`${newY}-${newM}`);
  };

  const goToCurrentPeriod = () => {
    setSelectedPeriod('2026-11');
  };

  // Toggle Dark Mode
  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  // ==============================================================================
  // OPERACIONES CRUD EN TIEMPO REAL CON SUPABASE
  // ==============================================================================

  // Monitores
  const addTeacher: AppContextType['addTeacher'] = async teacher => {
    clearDbError();
    const todayStr = new Date().toISOString().split('T')[0];
    const resolvedIsSocio =
      teacher.isSocio !== undefined
        ? teacher.isSocio
        : teacher.memberType !== 'monitor_no_socio' && teacher.memberType !== 'alumno_no_socio';
    const resolvedMemberType: MemberType =
      teacher.memberType || (resolvedIsSocio ? 'socio' : 'monitor_no_socio');
    const teacherWithDefaults: Omit<Teacher, 'id'> = {
      ...teacher,
      isSocio: resolvedIsSocio,
      memberType: resolvedMemberType,
      startDate: teacher.startDate || todayStr,
      endDate: teacher.active ? teacher.endDate : teacher.endDate || todayStr
    };
    const dbPayload = mapTeacherToDb(teacherWithDefaults);
    let insertRes = await supabase.from('teachers').insert([dbPayload]).select().single();

    if (
      insertRes.error &&
      (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
    ) {
      const { is_socio: _s0, ...withoutSocio } = dbPayload;
      insertRes = await supabase.from('teachers').insert([withoutSocio]).select().single();
      if (
        insertRes.error &&
        (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
      ) {
        const {
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...legacyPayload
        } = withoutSocio;
        insertRes = await supabase.from('teachers').insert([legacyPayload]).select().single();
      }
    }

    if (insertRes.error) {
      handleSupabaseError(t('appContext.actions.createTeacher'), insertRes.error);
      return { success: false, error: insertRes.error.message };
    }
    let createdTeacherId: string | undefined;
    if (insertRes.data) {
      const newTeacher = mapDbTeacherToTeacher(insertRes.data);
      createdTeacherId = newTeacher.id;
      setTeachers(prev => [...prev, newTeacher]);
      await recordStatusHistoryCycle({
        entityType: 'teacher',
        entityId: newTeacher.id,
        status: newTeacher.active ? 'active' : 'inactive',
        startDate: newTeacher.startDate || todayStr,
        endDate: newTeacher.endDate,
        notes: t('appContext.notes.teacherCreated')
      });
      if (newTeacher.email) {
        await reevaluateUserOperationalRole({ teacherId: newTeacher.id, email: newTeacher.email });
      }
    }
    await refreshFromSupabase();
    return { success: true, teacherId: createdTeacherId };
  };

  const updateTeacher: AppContextType['updateTeacher'] = async (id, updates) => {
    clearDbError();
    const current = teachers.find(teacherItem => teacherItem.id === id);
    if (!current) {
      return { success: false, error: t('appContext.teacherNotFound') };
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const resolvedIsSocio =
      updates.isSocio !== undefined
        ? updates.isSocio
        : updates.memberType !== undefined
        ? updates.memberType !== 'monitor_no_socio' && updates.memberType !== 'alumno_no_socio'
        : current.isSocio ??
          (current.memberType !== 'monitor_no_socio' && current.memberType !== 'alumno_no_socio');
    const resolvedMemberType: MemberType =
      updates.memberType !== undefined
        ? updates.memberType
        : updates.isSocio !== undefined
        ? updates.isSocio
          ? 'socio'
          : 'monitor_no_socio'
        : current.memberType || (resolvedIsSocio ? 'socio' : 'monitor_no_socio');

    const merged: Teacher = {
      ...current,
      ...updates,
      isSocio: resolvedIsSocio,
      memberType: resolvedMemberType
    };
    if (updates.active !== undefined && updates.active !== current.active) {
      if (!updates.active && !merged.endDate) {
        merged.endDate = todayStr;
      } else if (updates.active && updates.endDate === undefined) {
        merged.endDate = undefined;
      }
    }

    const dbPayload = mapTeacherToDb(merged);
    let updateRes = await supabase.from('teachers').update(dbPayload).eq('id', id).select('*');

    if (
      updateRes.error &&
      (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
    ) {
      const { is_socio: _s0, ...withoutSocio } = dbPayload;
      updateRes = await supabase.from('teachers').update(withoutSocio).eq('id', id).select('*');
      if (
        updateRes.error &&
        (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
      ) {
        const {
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...legacyPayload
        } = withoutSocio;
        updateRes = await supabase.from('teachers').update(legacyPayload).eq('id', id).select('*');
      }
    }

    if (updateRes.error) {
      handleSupabaseError(t('appContext.actions.updateTeacher'), updateRes.error);
      return { success: false, error: updateRes.error.message };
    }

    if (updates.active !== undefined && updates.active !== current.active) {
      await recordStatusHistoryCycle({
        entityType: 'teacher',
        entityId: id,
        status: merged.active ? 'active' : 'inactive',
        startDate: todayStr,
        endDate: merged.active ? undefined : merged.endDate || todayStr,
        notes: merged.active
          ? t('appContext.notes.teacherReactivated')
          : t('appContext.notes.teacherDeactivated')
      });
    }

    if (
      updates.isSocio !== undefined ||
      updates.memberType !== undefined
    ) {
      const emailNorm = (merged.email || current.email)?.toLowerCase().trim();
      const linkedProfs = profiles.filter(
        p => p.teacherId === id || (emailNorm && p.email.toLowerCase().trim() === emailNorm)
      );
      for (const prof of linkedProfs) {
        const pRes = await supabase
          .from('profiles')
          .update({ is_socio: resolvedIsSocio, member_type: resolvedMemberType })
          .eq('id', prof.id);
        if (pRes.error && (pRes.error.code === '42703' || pRes.error.message?.includes('column'))) {
          await supabase
            .from('profiles')
            .update({ member_type: resolvedMemberType })
            .eq('id', prof.id);
        }
      }
    }

    setTeachers(prev => prev.map(teacherItem => (teacherItem.id === id ? merged : teacherItem)));
    if (
      (updates.active !== undefined && updates.active !== current.active) ||
      (updates.memberType !== undefined && updates.memberType !== current.memberType) ||
      updates.isSocio !== undefined ||
      (updates.email !== undefined && updates.email !== current.email)
    ) {
      await reevaluateUserOperationalRole({ teacherId: id, email: merged.email });
    }
    await refreshFromSupabase();
    return { success: true };
  };

  const deleteTeacher: AppContextType['deleteTeacher'] = async id => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const authErr = new Error(t('appContext.deleteTeacherSessionRequired'));
        handleSupabaseError(t('appContext.actions.deleteTeacher'), authErr);
        return { success: false, error: authErr.message };
      }

      const targetTeacher = teachers.find(tc => tc.id === id);
      const affectedProfileIds = profiles
        .filter(
          p =>
            p.teacherId === id ||
            (targetTeacher?.email &&
              p.email.toLowerCase().trim() === targetTeacher.email.toLowerCase().trim())
        )
        .map(p => p.id);

      // 1. Desvincular referencias opcionales que puedan bloquear por FK ON DELETE RESTRICT/NO ACTION
      await Promise.allSettled([
        supabase.from('profiles').update({ teacher_id: null }).eq('teacher_id', id),
        supabase.from('payments').update({ collected_by_teacher_id: null }).eq('collected_by_teacher_id', id),
        supabase.from('activities').update({ teacher_id: null }).eq('teacher_id', id),
        supabase.from('class_sessions').update({ teacher_id: null }).eq('teacher_id', id),
        supabase.from('teacher_payouts').update({ teacher_id: null }).eq('teacher_id', id),
        supabase.from('member_status_history').delete().eq('entity_type', 'teacher').eq('entity_id', id)
      ]);

      // 2. Eliminar registro en teachers solicitando fila borrada para detectar bloqueo RLS o FK
      const { data: deletedRows, error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        let friendlyMsg = error.message;
        if (error.code === '23503') {
          friendlyMsg = t('appContext.deleteTeacherFkRestricted');
        }
        const errObj = new Error(friendlyMsg);
        handleSupabaseError(t('appContext.actions.deleteTeacher'), errObj);
        return { success: false, error: friendlyMsg };
      }

      if (!deletedRows || deletedRows.length === 0) {
        const { data: stillExists } = await supabase
          .from('teachers')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        const rlsMsg = stillExists
          ? t('appContext.deleteTeacherRlsZero')
          : t('appContext.deleteTeacherNotFound');
        const rlsErr = new Error(rlsMsg);
        handleSupabaseError(t('appContext.actions.deleteTeacher'), rlsErr);
        return { success: false, error: rlsMsg };
      }

      setTeachers(prev => prev.filter(teacherItem => teacherItem.id !== id));
      for (const profId of affectedProfileIds) {
        await reevaluateUserOperationalRole({ profileId: profId });
      }
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.deleteTeacherError');
      handleSupabaseError(t('appContext.actions.deleteTeacher'), err);
      return { success: false, error: msg };
    }
  };

  const updateTeacherAvatar = async (teacherId: string, avatarUrl: string) => {
    await updateTeacher(teacherId, { avatarUrl, avatar: avatarUrl });
  };

  const updateUserAvatar: AppContextType['updateUserAvatar'] = async avatarUrl => {
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
    }

    const linkedTeacher = teachers.find(
      tc =>
        (currentUser.teacherId && tc.id === currentUser.teacherId) ||
        (currentUser.email &&
          tc.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
    );
    if (linkedTeacher) {
      if (isRealUserId) {
        await supabase
          .from('teachers')
          .update({ avatar_url: nextAvatar })
          .eq('id', linkedTeacher.id);
      }
      setTeachers(prev =>
        prev.map(tc =>
          tc.id === linkedTeacher.id
            ? { ...tc, avatar: nextAvatar || '', avatarUrl: nextAvatar || '' }
            : tc
        )
      );
    }

    try {
      const storageKey = `triskell_user_avatar_${currentUser.id || currentUser.email || currentRole}`;
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

    return { success: true };
  };

  // Talleres / Actividades
  const addActivity = async (activity: Omit<Activity, 'id'>) => {
    clearDbError();
    const dbPayload = mapActivityToDb(activity);
    const { data, error } = await supabase.from('activities').insert([dbPayload]).select().single();
    if (error) {
      handleSupabaseError(t('appContext.actions.createActivity'), error);
      return;
    }
    if (data) {
      const newAct = mapDbActivityToActivity(data);
      setActivities(prev => [...prev, newAct]);
      if (newAct.teacherId && newAct.active !== false) {
        await reevaluateUserOperationalRole({ teacherId: newAct.teacherId });
      }
    }
    await refreshFromSupabase();
  };

  const updateActivity = async (id: string, updates: Partial<Activity>) => {
    clearDbError();
    const current = activities.find(a => a.id === id);
    if (!current) return;
    const prevTeacherId = current.teacherId;
    const prevActive = current.active;
    const nowIso = new Date().toISOString();
    const nextActive =
      updates.active !== undefined
        ? updates.active
        : updates.status === 'inactive'
        ? false
        : updates.status === 'active'
        ? true
        : current.active;
    const nextStatus =
      updates.status !== undefined
        ? updates.status
        : nextActive === false
        ? 'inactive'
        : 'active';
    const nextEndedAt =
      nextActive === false || nextStatus === 'inactive'
        ? updates.endedAt || current.endedAt || nowIso
        : undefined;

    const merged: Activity = {
      ...current,
      ...updates,
      active: nextActive,
      status: nextStatus,
      endedAt: nextEndedAt
    };

    if (nextActive === false || nextStatus === 'inactive') {
      setStoredActivityEndedAt(id, nextEndedAt || nowIso);
    } else {
      setStoredActivityEndedAt(id, null);
    }

    const basePayload = mapActivityToDb(merged);
    const extendedPayload = {
      ...basePayload,
      status: nextStatus,
      ended_at: nextEndedAt || null
    };
    let { error } = await supabase.from('activities').update(extendedPayload).eq('id', id);
    if (
      error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message?.toLowerCase().includes('column'))
    ) {
      const fallbackRes = await supabase.from('activities').update(basePayload).eq('id', id);
      error = fallbackRes.error;
    }
    if (error) {
      handleSupabaseError(t('appContext.actions.updateActivity'), error);
      return;
    }
    setActivities(prev => prev.map(a => (a.id === id ? merged : a)));

    if (merged.teacherId !== prevTeacherId) {
      if (prevTeacherId) {
        await reevaluateUserOperationalRole({ teacherId: prevTeacherId });
      }
      if (merged.teacherId) {
        await reevaluateUserOperationalRole({ teacherId: merged.teacherId });
      }
    } else if (merged.active !== prevActive && merged.teacherId) {
      await reevaluateUserOperationalRole({ teacherId: merged.teacherId });
    }

    if (merged.active !== prevActive) {
      const enrolledStudents = students.filter(s =>
        s.activities.some(e => e.activityId === id)
      );
      for (const st of enrolledStudents) {
        await reevaluateUserOperationalRole({ studentId: st.id, email: st.email });
      }
    }

    await refreshFromSupabase();
  };

  const deleteActivity = async (id: string) => {
    clearDbError();
    const targetAct = activities.find(a => a.id === id);
    const affectedStudents = students.filter(
      s =>
        s.activities.some(e => e.activityId === id) ||
        (s.pendingEnrollments || []).some(e => e.activityId === id)
    );

    await supabase.from('student_enrollments').delete().eq('activity_id', id);

    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteActivity'), error);
      return;
    }
    setActivities(prev => prev.filter(a => a.id !== id));
    setStudents(prev =>
      prev.map(s => ({
        ...s,
        activities: s.activities.filter(e => e.activityId !== id),
        pendingEnrollments: (s.pendingEnrollments || []).filter(e => e.activityId !== id)
      }))
    );

    if (targetAct?.teacherId) {
      await reevaluateUserOperationalRole({ teacherId: targetAct.teacherId });
    }
    for (const st of affectedStudents) {
      await reevaluateUserOperationalRole({ studentId: st.id, email: st.email });
    }

    await refreshFromSupabase();
  };

  // Alumnos y Matrículas
  const upsertEnrollmentRow = async (
    studentId: string,
    activityId: string,
    customPrice?: number,
    billingMode?: 'monthly' | 'per_class',
    enrolledSince?: string,
    status: 'active' | 'pending' | 'rejected' = 'active',
    extraFields?: Record<string, any>
  ): Promise<{ data?: any; error: any }> => {
    const act = activities.find(a => a.id === activityId);
    const basePayload = {
      student_id: studentId,
      activity_id: activityId,
      custom_price: customPrice !== undefined ? customPrice : null,
      billing_mode: billingMode || act?.billingMode || 'monthly',
      enrolled_since: enrolledSince || new Date().toISOString().split('T')[0]
    };
    const activePayload = { ...basePayload, active: status !== 'rejected' };
    const reactivatedCleanup =
      status !== 'rejected'
        ? {
            deleted_at: null,
            ended_at: null,
            drop_requested_at: null,
            drop_reason: null
          }
        : {};
    const fullPayload = {
      ...activePayload,
      status,
      ...reactivatedCleanup,
      ...(extraFields || {})
    };

    const tryUpsert = async (payload: Record<string, any>) => {
      const res = await supabase
        .from('student_enrollments')
        .upsert(payload, { onConflict: 'student_id,activity_id' })
        .select('*');

      if (
        res.error &&
        (res.error.code === '42P10' || res.error.message?.includes('no unique or exclusion constraint'))
      ) {
        const { data: existing } = await supabase
          .from('student_enrollments')
          .select('id')
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .maybeSingle();

        if (existing?.id) {
          return await supabase
            .from('student_enrollments')
            .update(payload)
            .eq('id', existing.id)
            .select('*');
        }
        return await supabase.from('student_enrollments').insert([payload]).select('*');
      }
      return res;
    };

    let res = await tryUpsert(fullPayload);
    if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
      res = await tryUpsert({ ...activePayload, status, ...(extraFields || {}) });
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await tryUpsert({ ...activePayload, status });
      }
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        if (status === 'pending') {
          return {
            error: new Error(t('appContext.missingEnrollmentStatusColumn'))
          };
        }
        res = await tryUpsert(activePayload);
        if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
          res = await tryUpsert(basePayload);
        }
      }
    }
    return res;
  };

  // Baja lógica (soft delete) reutilizable para inscripciones en talleres
  const softDeleteEnrollmentRow = async (
    studentId: string,
    activityId: string,
    options?: { targetStatus?: 'inactive' | 'rejected'; extraAudit?: Record<string, any> }
  ): Promise<{ data: any[] | null; error: any }> => {
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const desiredStatus = options?.targetStatus || 'inactive';

    const runUpdate = async (payload: Record<string, any>) =>
      await supabase
        .from('student_enrollments')
        .update(payload)
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('id');

    const fullPayload = {
      active: false,
      status: desiredStatus,
      deleted_at: nowIso,
      ended_at: todayStr,
      ...(options?.extraAudit || {})
    };

    let res = await runUpdate(fullPayload);

    if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
      res = await runUpdate({ active: false, status: desiredStatus });
    }

    if (
      res.error &&
      desiredStatus === 'inactive' &&
      (res.error.code === '23514' || res.error.message?.includes('status'))
    ) {
      res = await runUpdate({
        active: false,
        status: 'rejected',
        deleted_at: nowIso,
        ended_at: todayStr
      });
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await runUpdate({ active: false, status: 'rejected' });
      }
    }

    if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
      res = await runUpdate({ active: false });
    }

    return { data: res.data, error: res.error };
  };

  const addStudent = async (
    student: Omit<Student, 'id' | 'registeredAt'>
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const todayStr = new Date().toISOString().split('T')[0];
    const effectiveStartDate = student.startDate || todayStr;
    const isPending = student.status === 'pending_validation';
    const resolvedIsSocio =
      student.isSocio !== undefined
        ? student.isSocio
        : student.memberType !== 'alumno_no_socio' && student.memberType !== 'monitor_no_socio';
    const resolvedMemberType: MemberType =
      student.memberType || (resolvedIsSocio ? 'socio' : 'alumno_no_socio');

    const baseStudentDb: Record<string, any> = {
      name: student.name,
      email: student.email || null,
      phone: student.phone || null,
      status: student.status,
      registered_at: effectiveStartDate,
      notes: student.notes || null
    };
    const extendedNoSocioDb: Record<string, any> = {
      ...baseStudentDb,
      validation_status: isPending ? 'pending' : student.status === 'inactive' ? 'rejected' : 'validated',
      registered_by: currentUser?.id || null,
      member_number: student.memberNumber || null,
      member_type: resolvedMemberType,
      start_date: effectiveStartDate,
      end_date: student.endDate || (student.status === 'inactive' ? todayStr : null)
    };
    const extendedStudentDb: Record<string, any> = {
      ...extendedNoSocioDb,
      is_socio: resolvedIsSocio
    };

    let insertRes = await supabase
      .from('students')
      .insert([extendedStudentDb])
      .select()
      .single();

    if (
      insertRes.error &&
      (insertRes.error.code === '42703' ||
        insertRes.error.code === '23503' ||
        insertRes.error.code === '22P02' ||
        insertRes.error.message?.includes('column'))
    ) {
      insertRes = await supabase
        .from('students')
        .insert([extendedNoSocioDb])
        .select()
        .single();
      if (
        insertRes.error &&
        (insertRes.error.code === '42703' ||
          insertRes.error.code === '23503' ||
          insertRes.error.code === '22P02' ||
          insertRes.error.message?.includes('column'))
      ) {
        insertRes = await supabase
          .from('students')
          .insert([baseStudentDb])
          .select()
          .single();
      }
    }

    if (
      insertRes.error &&
      isPending &&
      (insertRes.error.message?.includes('students_status_check') || insertRes.error.code === '23514')
    ) {
      const markedNotes = baseStudentDb.notes?.includes('[Pendiente validación]')
        ? baseStudentDb.notes
        : `[Pendiente validación] ${baseStudentDb.notes || ''}`.trim();
      insertRes = await supabase
        .from('students')
        .insert([{ ...baseStudentDb, status: 'trial', notes: markedNotes }])
        .select()
        .single();
    }

    if (insertRes.error) {
      handleSupabaseError(t('appContext.actions.createStudent'), insertRes.error);
      return { success: false, error: insertRes.error.message };
    }

    const newStudentRow = insertRes.data;
    if (newStudentRow) {
      await recordStatusHistoryCycle({
        entityType: 'student',
        entityId: newStudentRow.id,
        status: student.status,
        startDate: effectiveStartDate,
        endDate: student.endDate || (student.status === 'inactive' ? todayStr : undefined),
        notes: t('appContext.notes.studentCreated')
      });

      if (student.activities && student.activities.length > 0) {
        for (const act of student.activities) {
          await upsertEnrollmentRow(
            newStudentRow.id,
            act.activityId,
            act.customPrice,
            act.billingMode,
            act.enrolledSince
          );
        }
      }
      if (student.email) {
        await reevaluateUserOperationalRole({
          studentId: newStudentRow.id,
          email: student.email
        });
      }
      await refreshFromSupabase();
    }
    return { success: true };
  };

  const updateStudent = async (
    id: string,
    updates: Partial<Student>
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const todayStr = new Date().toISOString().split('T')[0];
    const existingStudent = students.find(s => s.id === id);
    const studentDb: Record<string, any> = {};

    let resolvedIsSocio: boolean | undefined = updates.isSocio;
    let resolvedMemberType: MemberType | undefined = updates.memberType;
    if (updates.isSocio !== undefined && updates.memberType === undefined) {
      resolvedMemberType = updates.isSocio ? 'socio' : 'alumno_no_socio';
    } else if (updates.memberType !== undefined && updates.isSocio === undefined) {
      resolvedIsSocio =
        updates.memberType !== 'alumno_no_socio' && updates.memberType !== 'monitor_no_socio';
    }

    if (updates.name !== undefined) studentDb.name = updates.name;
    if (updates.email !== undefined) studentDb.email = updates.email || null;
    if (updates.phone !== undefined) studentDb.phone = updates.phone || null;
    if (updates.memberNumber !== undefined) studentDb.member_number = updates.memberNumber || null;
    if (resolvedMemberType !== undefined) studentDb.member_type = resolvedMemberType || 'socio';
    if (resolvedIsSocio !== undefined) studentDb.is_socio = resolvedIsSocio;
    if (updates.startDate !== undefined) studentDb.start_date = updates.startDate || null;
    if (updates.endDate !== undefined) studentDb.end_date = updates.endDate || null;

    if (updates.status !== undefined) {
      studentDb.status = updates.status;
      if (updates.status === 'pending_validation') {
        studentDb.validation_status = 'pending';
      } else if (updates.status === 'inactive') {
        studentDb.validation_status = 'rejected';
        if (updates.endDate === undefined && !existingStudent?.endDate) {
          studentDb.end_date = todayStr;
        }
      } else {
        studentDb.validation_status = 'validated';
        if (updates.endDate === undefined && existingStudent?.status === 'inactive') {
          studentDb.end_date = null;
        }
      }
    }

    if (updates.notes !== undefined) {
      const rawNotes = updates.notes || '';
      if (updates.status && updates.status !== 'pending_validation') {
        const cleaned = rawNotes.replace(/\[Pendiente validación\]\s*/g, '').trim();
        studentDb.notes = cleaned || null;
      } else {
        studentDb.notes = rawNotes || null;
      }
    } else if (
      updates.status &&
      updates.status !== 'pending_validation' &&
      existingStudent?.notes?.includes('[Pendiente validación]')
    ) {
      const cleaned = existingStudent.notes.replace(/\[Pendiente validación\]\s*/g, '').trim();
      studentDb.notes = cleaned || null;
    }

    let updatedRow: any = null;
    if (Object.keys(studentDb).length > 0) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const authErr = new Error(t('appContext.updateStudentSessionRequired'));
        handleSupabaseError(t('appContext.actions.updateStudent'), authErr);
        return { success: false, error: authErr.message };
      }

      let res = await supabase
        .from('students')
        .update(studentDb)
        .eq('id', id)
        .select('*');

      if (
        res.error &&
        (res.error.code === '42703' || res.error.message?.includes('column'))
      ) {
        const { is_socio: _s0, ...withoutSocioDb } = studentDb;
        res = await supabase
          .from('students')
          .update(withoutSocioDb)
          .eq('id', id)
          .select('*');

        if (
          res.error &&
          (res.error.code === '42703' || res.error.message?.includes('column'))
        ) {
          const {
            validation_status: _ignored,
            member_number: _m1,
            member_type: _m2,
            start_date: _m3,
            end_date: _m4,
            ...fallbackDb
          } = withoutSocioDb;
          if (Object.keys(fallbackDb).length > 0) {
            res = await supabase
              .from('students')
              .update(fallbackDb)
              .eq('id', id)
              .select('*');
          } else {
            res = await supabase.from('students').select('*').eq('id', id);
          }
        }
      }

      if (
        res.error &&
        updates.status === 'pending_validation' &&
        (res.error.message?.includes('students_status_check') || res.error.code === '23514')
      ) {
        const baseNotes = (studentDb.notes ?? existingStudent?.notes ?? '') as string;
        const markedNotes = baseNotes.includes('[Pendiente validación]')
          ? baseNotes
          : `[Pendiente validación] ${baseNotes}`.trim();
        const {
          validation_status: _ignored,
          is_socio: _s0,
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...rest
        } = studentDb;
        res = await supabase
          .from('students')
          .update({ ...rest, status: 'trial', notes: markedNotes })
          .eq('id', id)
          .select('*');
      }

      if (res.error) {
        handleSupabaseError(t('appContext.actions.updateStudent'), res.error);
        return { success: false, error: res.error.message };
      }

      if (!res.data || res.data.length === 0) {
        const { data: existingRow } = await supabase
          .from('students')
          .select('id')
          .eq('id', id)
          .maybeSingle();

        const rlsErr = new Error(
          existingRow
            ? t('appContext.updateStudentRlsZero')
            : t('appContext.updateStudentNotFound')
        );
        handleSupabaseError(t('appContext.actions.updateStudent'), rlsErr);
        return { success: false, error: rlsErr.message };
      }

      updatedRow = res.data[0];
    }

    if (updates.status !== undefined && existingStudent && updates.status !== existingStudent.status) {
      await recordStatusHistoryCycle({
        entityType: 'student',
        entityId: id,
        status: updates.status,
        startDate: updates.startDate || todayStr,
        endDate: updates.status === 'inactive' ? updates.endDate || todayStr : undefined,
        notes:
          updates.status === 'active' && existingStudent.status === 'inactive'
            ? t('appContext.notes.studentReinstated')
            : updates.status === 'inactive'
            ? t('appContext.notes.studentDeactivated')
            : t('appContext.notes.studentStatusChanged', { status: updates.status })
      });
    }

    if (resolvedIsSocio !== undefined || resolvedMemberType !== undefined) {
      const studentEmailNorm = (updates.email ?? existingStudent?.email)?.toLowerCase().trim();
      const matchingProfiles = profiles.filter(
        p =>
          p.studentId === id ||
          (existingStudent?.profileId && p.id === existingStudent.profileId) ||
          (studentEmailNorm && p.email.toLowerCase().trim() === studentEmailNorm)
      );
      for (const prof of matchingProfiles) {
        const profPayload: Record<string, any> = {};
        if (resolvedIsSocio !== undefined) profPayload.is_socio = resolvedIsSocio;
        if (resolvedMemberType !== undefined) profPayload.member_type = resolvedMemberType;
        const pRes = await supabase.from('profiles').update(profPayload).eq('id', prof.id);
        if (
          pRes.error &&
          (pRes.error.code === '42703' || pRes.error.message?.includes('column')) &&
          resolvedMemberType !== undefined
        ) {
          await supabase
            .from('profiles')
            .update({ member_type: resolvedMemberType })
            .eq('id', prof.id);
        }
      }
    }

    if (updates.activities) {
      const desiredIds = new Set(updates.activities.map(a => a.activityId));
      const previousIds = (existingStudent?.activities || []).map(a => a.activityId);
      const removedIds = previousIds.filter(actId => !desiredIds.has(actId));

      for (const act of updates.activities) {
        const { error: upsertErr } = await upsertEnrollmentRow(
          id,
          act.activityId,
          act.customPrice,
          act.billingMode,
          act.enrolledSince
        );
        if (upsertErr) {
          handleSupabaseError(t('appContext.actions.updateEnrollment'), upsertErr);
          return { success: false, error: upsertErr.message };
        }
      }

      for (const removedActId of removedIds) {
        const { data: softRows, error: softErr } = await softDeleteEnrollmentRow(id, removedActId, {
          targetStatus: 'inactive'
        });

        if (softErr || !softRows || softRows.length === 0) {
          handleSupabaseError(
            t('appContext.actions.removeEnrollment'),
            softErr || new Error(t('appContext.unenrollRlsDenied'))
          );
          return { success: false, error: (softErr || new Error(t('appContext.unenrollRlsDenied'))).message };
        }
      }
    }

    if (updatedRow) {
      setStudents(prev =>
        prev.map(s => {
          if (s.id !== id) return s;
          const mapped = mapDbStudentToStudent(updatedRow, []);
          return {
            ...mapped,
            activities: updates.activities ?? s.activities
          };
        })
      );
    }

    if (
      updates.activities !== undefined ||
      updates.memberType !== undefined ||
      updates.isSocio !== undefined ||
      updates.status !== undefined ||
      (updates.email !== undefined && updates.email !== existingStudent?.email)
    ) {
      await reevaluateUserOperationalRole({
        studentId: id,
        email: updates.email ?? existingStudent?.email
      });
    }

    await refreshFromSupabase();
    return { success: true };
  };

  const deleteStudent = async (id: string) => {
    clearDbError();
    const targetStudent = students.find(s => s.id === id);
    const affectedProfileIds = profiles
      .filter(
        p =>
          p.studentId === id ||
          (targetStudent?.profileId && p.id === targetStudent.profileId) ||
          (targetStudent?.email &&
            p.email.toLowerCase().trim() === targetStudent.email.toLowerCase().trim())
      )
      .map(p => p.id);

    await supabase.from('profiles').update({ student_id: null }).eq('student_id', id);

    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteStudent'), error);
      return;
    }
    setStudents(prev => prev.filter(s => s.id !== id));
    for (const profId of affectedProfileIds) {
      await reevaluateUserOperationalRole({ profileId: profId });
    }
    await refreshFromSupabase();
  };

  const enrollStudentInActivity = async (
    studentId: string,
    activityId: string,
    customPrice?: number
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const existingStudent = students.find(s => s.id === studentId);
    if (existingStudent && existingStudent.status === 'inactive') {
      const reactivateRes = await supabase
        .from('students')
        .update({ status: 'active', end_date: null })
        .eq('id', studentId);
      if (reactivateRes.error && (reactivateRes.error.code === '42703' || reactivateRes.error.message?.includes('column'))) {
        await supabase.from('students').update({ status: 'active' }).eq('id', studentId);
      }
    }

    const { error } = await upsertEnrollmentRow(studentId, activityId, customPrice);

    if (error) {
      handleSupabaseError(t('appContext.actions.enrollStudent'), error);
      return { success: false, error: error.message };
    }
    await reevaluateUserOperationalRole({ studentId, email: existingStudent?.email });
    await refreshFromSupabase();
    return { success: true };
  };

  const updateStudentEnrollment: AppContextType['updateStudentEnrollment'] = async ({
    studentId,
    activityId,
    newActivityId,
    customPrice,
    billingMode,
    enrolledSince
  }) => {
    clearDbError();
    try {
      const existingStudent = students.find(s => s.id === studentId);
      const targetActivityId = newActivityId && newActivityId !== activityId ? newActivityId : activityId;
      const isChangingActivity = targetActivityId !== activityId;

      if (isChangingActivity) {
        const alreadyActiveInTarget = existingStudent?.activities.some(
          a => a.activityId === targetActivityId && a.active !== false && a.status !== 'inactive'
        );
        if (alreadyActiveInTarget) {
          return {
            success: false,
            error: t('appContext.enrollmentAlreadyActiveInTarget')
          };
        }

        const { error: softErr } = await softDeleteEnrollmentRow(studentId, activityId, {
          targetStatus: 'inactive'
        });
        if (softErr) {
          handleSupabaseError(t('appContext.actions.updateEnrollment'), softErr);
          return { success: false, error: softErr.message };
        }
      }

      if (existingStudent && existingStudent.status === 'inactive') {
        const reactivateRes = await supabase
          .from('students')
          .update({ status: 'active', end_date: null })
          .eq('id', studentId);
        if (
          reactivateRes.error &&
          (reactivateRes.error.code === '42703' || reactivateRes.error.message?.includes('column'))
        ) {
          await supabase.from('students').update({ status: 'active' }).eq('id', studentId);
        }
      }

      const existingEnr =
        existingStudent?.activities.find(a => a.activityId === activityId) ||
        existingStudent?.pendingEnrollments?.find(a => a.activityId === activityId) ||
        existingStudent?.inactiveEnrollments?.find(a => a.activityId === activityId);
      const isPendingEnr = Boolean(
        existingStudent?.pendingEnrollments?.some(a => a.activityId === activityId)
      );

      const resolvedCustomPrice =
        customPrice === null
          ? undefined
          : customPrice !== undefined
          ? customPrice
          : existingEnr?.customPrice;
      const resolvedBillingMode =
        billingMode ||
        existingEnr?.billingMode ||
        activities.find(a => a.id === targetActivityId)?.billingMode ||
        'monthly';
      const resolvedEnrolledSince =
        enrolledSince || existingEnr?.enrolledSince || new Date().toISOString().split('T')[0];

      const { error } = await upsertEnrollmentRow(
        studentId,
        targetActivityId,
        resolvedCustomPrice,
        resolvedBillingMode,
        resolvedEnrolledSince,
        isPendingEnr ? 'pending' : 'active'
      );

      if (error) {
        handleSupabaseError(t('appContext.actions.updateEnrollment'), error);
        return { success: false, error: error.message };
      }

      await reevaluateUserOperationalRole({ studentId, email: existingStudent?.email });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.updateEnrollment');
      handleSupabaseError(t('appContext.actions.updateEnrollment'), err);
      return { success: false, error: msg };
    }
  };

  const unenrollStudentFromActivity = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const targetStudent = students.find(s => s.id === studentId);
      const { data: softRows, error: softErr } = await softDeleteEnrollmentRow(
        studentId,
        activityId,
        { targetStatus: 'inactive' }
      );

      let removed = !softErr && Array.isArray(softRows) && softRows.length > 0;

      if (!removed) {
        // Fallback: RPC SECURITY DEFINER si el propio alumno se da de baja bajo RLS estricto
        const activeUser = currentUserRef.current;
        const isSelfUnenroll = Boolean(
          activeUser &&
            (activeUser.studentId === studentId ||
              targetStudent?.profileId === activeUser.id ||
              (targetStudent?.email &&
                targetStudent.email.trim().toLowerCase() ===
                  activeUser.email.trim().toLowerCase()))
        );

        let rpcErr: any = null;
        if (isSelfUnenroll) {
          const rpcRes = await supabase.rpc('self_unenroll_from_activity', {
            p_activity_id: activityId
          });
          if (!rpcRes.error && rpcRes.data?.success !== false) {
            removed = true;
          } else if (rpcRes.error) {
            rpcErr = rpcRes.error;
          } else if (rpcRes.data?.error) {
            rpcErr = new Error(rpcRes.data.error);
          }
        }

        if (!removed) {
          const finalErr =
            rpcErr ||
            softErr ||
            new Error(t('appContext.unenrollRlsDenied'));
          handleSupabaseError(t('appContext.actions.unenrollStudent'), finalErr);
          return { success: false, error: finalErr.message };
        }
      }

      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      setStudents(prev =>
        prev.map(s => {
          if (s.id !== studentId) return s;
          const removedEnr = s.activities.find(a => a.activityId === activityId);
          const nextInactive = removedEnr
            ? [
                ...(s.inactiveEnrollments || []).filter(e => e.activityId !== activityId),
                {
                  ...removedEnr,
                  active: false,
                  status: 'inactive' as const,
                  deletedAt: nowIso,
                  endedAt: todayStr
                }
              ]
            : s.inactiveEnrollments;
          return {
            ...s,
            activities: s.activities.filter(a => a.activityId !== activityId),
            pendingEnrollments: (s.pendingEnrollments || []).filter(
              a => a.activityId !== activityId
            ),
            inactiveEnrollments: nextInactive
          };
        })
      );
      await reevaluateUserOperationalRole({ studentId, email: targetStudent?.email });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.unenrollError');
      handleSupabaseError(t('appContext.actions.unenrollStudent'), err);
      return { success: false, error: msg };
    }
  };

  const resolveStudentIdForCurrentUser = async (
    explicitStudentId?: string
  ): Promise<{ studentId?: string; error?: string }> => {
    if (explicitStudentId) {
      return { studentId: explicitStudentId };
    }
    if (!currentUser) {
      return {
        error: t('appContext.requestEnrollmentLoginRequired')
      };
    }

    const emailNorm = (currentUser.email || '').trim().toLowerCase();
    const matchedLocal = students.find(
      s =>
        (currentUser.studentId && s.id === currentUser.studentId) ||
        s.profileId === currentUser.id ||
        (emailNorm && s.email.trim().toLowerCase() === emailNorm)
    );
    if (matchedLocal) {
      return { studentId: matchedLocal.id };
    }

    if (currentUser.studentId) {
      return { studentId: currentUser.studentId };
    }

    const { data: existingByProfile } = await supabase
      .from('students')
      .select('id')
      .eq('profile_id', currentUser.id)
      .maybeSingle();
    if (existingByProfile?.id) {
      setCurrentStudentId(existingByProfile.id);
      return { studentId: existingByProfile.id };
    }

    if (emailNorm) {
      const { data: existingByEmail } = await supabase
        .from('students')
        .select('id')
        .ilike('email', emailNorm)
        .maybeSingle();
      if (existingByEmail?.id) {
        setCurrentStudentId(existingByEmail.id);
        return { studentId: existingByEmail.id };
      }
    }

    // Crear ficha automática de alumno vinculada al perfil si no existía
    const baseStudent = {
      name: currentUser.name || emailNorm.split('@')[0] || t('appContext.fallbackStudent'),
      email: emailNorm || null,
      phone: '',
      status: 'active',
      notes: t('appContext.notes.autoStudentOnRequest')
    };
    const extStudent = {
      ...baseStudent,
      profile_id: currentUser.id,
      validation_status: 'validated',
      registered_by: currentUser.id
    };

    let insertRes = await supabase.from('students').insert([extStudent]).select().single();
    if (
      insertRes.error &&
      (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
    ) {
      insertRes = await supabase.from('students').insert([baseStudent]).select().single();
    }

    if (insertRes.error || !insertRes.data) {
      return {
        error:
          insertRes.error?.message ||
          t('appContext.createStudentRlsError')
      };
    }

    const newStudentId = insertRes.data.id as string;
    const mappedNewStudent = mapDbStudentToStudent(insertRes.data, []);
    setStudents(prev => (prev.some(s => s.id === newStudentId) ? prev : [...prev, mappedNewStudent]));
    setCurrentStudentId(newStudentId);
    setCurrentUser(prev => (prev ? { ...prev, studentId: newStudentId } : prev));
    try {
      await supabase
        .from('profiles')
        .update({ student_id: newStudentId })
        .eq('id', currentUser.id);
    } catch {
      // Best-effort
    }

    return { studentId: newStudentId };
  };

  const requestActivityEnrollment = async (
    activityId: string,
    explicitStudentId?: string
  ): Promise<{ success: boolean; error?: string; studentId?: string }> => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.requestEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const { studentId: resolvedStudentId, error: resolveErr } =
        await resolveStudentIdForCurrentUser(explicitStudentId);
      if (!resolvedStudentId) {
        const msg = resolveErr || t('appContext.identifyStudentError');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const today = new Date().toISOString().split('T')[0];
      const act = activities.find(a => a.id === activityId);

      const { data: upsertData, error } = await upsertEnrollmentRow(
        resolvedStudentId,
        activityId,
        undefined,
        act?.billingMode || 'monthly',
        today,
        'pending',
        { requested_by: sessionData.session.user.id }
      );

      if (error) {
        handleSupabaseError(t('appContext.actions.requestEnrollment'), error);
        return { success: false, error: error.message };
      }

      if (!Array.isArray(upsertData) || upsertData.length === 0) {
        const rlsMsg = t('appContext.requestEnrollmentRlsZero');
        setDbError(rlsMsg);
        return { success: false, error: rlsMsg };
      }

      setStudents(prev =>
        prev.map(s => {
          if (s.id !== resolvedStudentId) return s;
          const existingPending = s.pendingEnrollments || [];
          if (existingPending.some(e => e.activityId === activityId)) return s;
          return {
            ...s,
            pendingEnrollments: [
              ...existingPending,
              {
                id: upsertData[0]?.id,
                activityId,
                enrolledSince: today,
                billingMode: act?.billingMode || 'monthly',
                status: 'pending',
                requestedBy: sessionData.session.user.id
              }
            ]
          };
        })
      );

      void refreshFromSupabase();
      return { success: true, studentId: resolvedStudentId };
    } catch (err: any) {
      const msg = err?.message || t('appContext.requestEnrollmentError');
      handleSupabaseError(t('appContext.actions.requestEnrollment'), err);
      return { success: false, error: msg };
    }
  };

  const cancelActivityEnrollmentRequest = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.cancelEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const { data: softRows, error: softErr } = await softDeleteEnrollmentRow(
        studentId,
        activityId,
        { targetStatus: 'rejected' }
      );

      if (softErr || !Array.isArray(softRows) || softRows.length === 0) {
        const finalErr = softErr || new Error(t('appContext.cancelEnrollmentRlsZero'));
        handleSupabaseError(t('appContext.actions.cancelEnrollmentRequest'), finalErr);
        return { success: false, error: finalErr.message };
      }

      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      setStudents(prev =>
        prev.map(s => {
          if (s.id !== studentId) return s;
          const cancelledReq = (s.pendingEnrollments || []).find(
            e => e.activityId === activityId
          );
          return {
            ...s,
            pendingEnrollments: (s.pendingEnrollments || []).filter(
              e => e.activityId !== activityId
            ),
            inactiveEnrollments: cancelledReq
              ? [
                  ...(s.inactiveEnrollments || []).filter(e => e.activityId !== activityId),
                  {
                    ...cancelledReq,
                    active: false,
                    status: 'rejected' as const,
                    deletedAt: nowIso,
                    endedAt: todayStr
                  }
                ]
              : s.inactiveEnrollments
          };
        })
      );
      const targetStudent = students.find(s => s.id === studentId);
      await reevaluateUserOperationalRole({ studentId, email: targetStudent?.email });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.cancelEnrollmentError');
      handleSupabaseError(t('appContext.actions.cancelEnrollmentRequest'), err);
      return { success: false, error: msg };
    }
  };

  const confirmActivityEnrollment = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.confirmEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const nowIso = new Date().toISOString();
      let updateRes = await supabase
        .from('student_enrollments')
        .update({
          status: 'active',
          active: true,
          confirmed_by: sessionData.session.user.id,
          confirmed_at: nowIso
        })
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('*');

      if (
        updateRes.error &&
        (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
      ) {
        updateRes = await supabase
          .from('student_enrollments')
          .update({ status: 'active', active: true })
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .select('*');

        if (
          updateRes.error &&
          (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
        ) {
          updateRes = await supabase
            .from('student_enrollments')
            .update({ active: true })
            .eq('student_id', studentId)
            .eq('activity_id', activityId)
            .select('*');
        }
      }

      if (updateRes.error) {
        handleSupabaseError(t('appContext.actions.confirmEnrollment'), updateRes.error);
        return { success: false, error: updateRes.error.message };
      }

      let confirmedRow = Array.isArray(updateRes.data) ? updateRes.data[0] : null;
      if (!confirmedRow) {
        const upsertRes = await upsertEnrollmentRow(studentId, activityId);
        if (upsertRes.error) {
          handleSupabaseError(t('appContext.actions.confirmEnrollment'), upsertRes.error);
          return { success: false, error: upsertRes.error.message };
        }
        confirmedRow = Array.isArray(upsertRes.data) ? upsertRes.data[0] : null;
      }

      if (!confirmedRow) {
        const rlsMsg = t('appContext.confirmEnrollmentRlsZero');
        setDbError(rlsMsg);
        return { success: false, error: rlsMsg };
      }

      const act = activities.find(a => a.id === activityId);
      const targetStudentObj = students.find(s => s.id === studentId);
      if (targetStudentObj && targetStudentObj.status === 'inactive') {
        const stReactivate = await supabase
          .from('students')
          .update({ status: 'active', end_date: null })
          .eq('id', studentId);
        if (stReactivate.error && (stReactivate.error.code === '42703' || stReactivate.error.message?.includes('column'))) {
          await supabase.from('students').update({ status: 'active' }).eq('id', studentId);
        }
      }

      setStudents(prev =>
        prev.map(s => {
          if (s.id !== studentId) return s;
          const pendingItem = (s.pendingEnrollments || []).find(e => e.activityId === activityId);
          const alreadyActive = s.activities.some(e => e.activityId === activityId);
          const newEntry = {
            id: confirmedRow.id || pendingItem?.id,
            activityId,
            customPrice: pendingItem?.customPrice,
            enrolledSince:
              confirmedRow.enrolled_since ||
              pendingItem?.enrolledSince ||
              new Date().toISOString().split('T')[0],
            billingMode: (confirmedRow.billing_mode ||
              pendingItem?.billingMode ||
              act?.billingMode ||
              'monthly') as 'monthly' | 'per_class',
            status: 'active' as const
          };
          return {
            ...s,
            status: s.status === 'inactive' ? 'active' : s.status,
            activities: alreadyActive
              ? s.activities.map(e => (e.activityId === activityId ? newEntry : e))
              : [...s.activities, newEntry],
            pendingEnrollments: (s.pendingEnrollments || []).filter(
              e => e.activityId !== activityId
            )
          };
        })
      );

      await reevaluateUserOperationalRole({
        studentId,
        email: targetStudentObj?.email
      });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.confirmEnrollmentError');
      handleSupabaseError(t('appContext.actions.confirmEnrollment'), err);
      return { success: false, error: msg };
    }
  };

  const rejectActivityEnrollment = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    return await cancelActivityEnrollmentRequest(studentId, activityId);
  };

  const requestActivityUnenrollment: AppContextType['requestActivityUnenrollment'] = async (
    studentId,
    activityId,
    reason
  ) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.requestEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const nowIso = new Date().toISOString();
      const trimmedReason = reason?.trim() || null;

      let res = await supabase
        .from('student_enrollments')
        .update({
          status: 'pending_unenroll',
          drop_requested_at: nowIso,
          drop_reason: trimmedReason
        })
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('id');

      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await supabase
          .from('student_enrollments')
          .update({ status: 'pending_unenroll' })
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .select('id');
      }

      let updated = !res.error && Array.isArray(res.data) && res.data.length > 0;
      let rpcErr: any = null;

      if (!updated) {
        const rpcRes = await supabase.rpc('request_activity_unenrollment', {
          p_activity_id: activityId,
          p_reason: trimmedReason
        });
        if (!rpcRes.error && rpcRes.data?.success !== false) {
          updated = true;
        } else if (rpcRes.error) {
          rpcErr = rpcRes.error;
        } else if (rpcRes.data?.error) {
          rpcErr = new Error(rpcRes.data.error);
        }
      }

      if (!updated) {
        const finalErr = res.error || rpcErr || new Error(t('appContext.requestEnrollmentRlsZero'));
        handleSupabaseError(t('appContext.actions.requestUnenrollment'), finalErr);
        return { success: false, error: finalErr.message };
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? {
                ...s,
                activities: s.activities.map(a =>
                  a.activityId === activityId
                    ? {
                        ...a,
                        status: 'pending_unenroll' as const,
                        dropRequestedAt: nowIso,
                        dropReason: trimmedReason || undefined
                      }
                    : a
                )
              }
            : s
        )
      );

      void refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.requestUnenrollment');
      handleSupabaseError(t('appContext.actions.requestUnenrollment'), err);
      return { success: false, error: msg };
    }
  };

  const cancelActivityUnenrollmentRequest: AppContextType['cancelActivityUnenrollmentRequest'] = async (
    studentId,
    activityId
  ) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.cancelEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      let res = await supabase
        .from('student_enrollments')
        .update({
          status: 'active',
          drop_requested_at: null,
          drop_reason: null
        })
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('id');

      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await supabase
          .from('student_enrollments')
          .update({ status: 'active' })
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .select('id');
      }

      let reverted = !res.error && Array.isArray(res.data) && res.data.length > 0;
      let rpcErr: any = null;

      if (!reverted) {
        const rpcRes = await supabase.rpc('cancel_activity_unenrollment_request', {
          p_activity_id: activityId
        });
        if (!rpcRes.error && rpcRes.data?.success !== false) {
          reverted = true;
        } else if (rpcRes.error) {
          rpcErr = rpcRes.error;
        } else if (rpcRes.data?.error) {
          rpcErr = new Error(rpcRes.data.error);
        }
      }

      if (!reverted) {
        const finalErr = res.error || rpcErr || new Error(t('appContext.cancelEnrollmentRlsZero'));
        handleSupabaseError(t('appContext.actions.cancelUnenrollmentRequest'), finalErr);
        return { success: false, error: finalErr.message };
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? {
                ...s,
                activities: s.activities.map(a =>
                  a.activityId === activityId
                    ? {
                        ...a,
                        status: 'active' as const,
                        dropRequestedAt: undefined,
                        dropReason: undefined
                      }
                    : a
                )
              }
            : s
        )
      );

      void refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.cancelEnrollmentError');
      handleSupabaseError(t('appContext.actions.cancelUnenrollmentRequest'), err);
      return { success: false, error: msg };
    }
  };

  const approveActivityUnenrollment: AppContextType['approveActivityUnenrollment'] = async (
    studentId,
    activityId,
    checks
  ) => {
    clearDbError();
    try {
      if (!checks?.debtsChecked || !checks?.materialsChecked) {
        return { success: false, error: t('teacherPortal.workshopsSection.dropApproveError') };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.confirmEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const trimmedNotes = checks.notes?.trim() || null;

      // Soft delete con auditoría de revisión de deudas/materiales
      const { data: softRows, error: softErr } = await softDeleteEnrollmentRow(
        studentId,
        activityId,
        {
          targetStatus: 'inactive',
          extraAudit: {
            drop_debts_checked: true,
            drop_materials_checked: true,
            drop_resolved_by: sessionData.session.user.id,
            drop_resolved_at: nowIso,
            drop_resolution_notes: trimmedNotes
          }
        }
      );

      if (!softErr && Array.isArray(softRows) && softRows.length > 0) {
        const targetStudent = students.find(s => s.id === studentId);
        setStudents(prev =>
          prev.map(s => {
            if (s.id !== studentId) return s;
            const removedEnr = s.activities.find(a => a.activityId === activityId);
            return {
              ...s,
              activities: s.activities.filter(a => a.activityId !== activityId),
              pendingEnrollments: (s.pendingEnrollments || []).filter(
                a => a.activityId !== activityId
              ),
              inactiveEnrollments: removedEnr
                ? [
                    ...(s.inactiveEnrollments || []).filter(e => e.activityId !== activityId),
                    {
                      ...removedEnr,
                      active: false,
                      status: 'inactive' as const,
                      deletedAt: nowIso,
                      endedAt: todayStr
                    }
                  ]
                : s.inactiveEnrollments
            };
          })
        );
        await reevaluateUserOperationalRole({ studentId, email: targetStudent?.email });
        await refreshFromSupabase();
        return { success: true };
      }

      // RPC moderation fallback si RLS bloquea UPDATE directo
      const rpcRes = await supabase.rpc('moderate_activity_unenrollment', {
        p_student_id: studentId,
        p_activity_id: activityId,
        p_approve: true,
        p_debts_checked: Boolean(checks.debtsChecked),
        p_materials_checked: Boolean(checks.materialsChecked),
        p_notes: trimmedNotes
      });

      if (!rpcRes.error && rpcRes.data?.success !== false) {
        const targetStudent = students.find(s => s.id === studentId);
        setStudents(prev =>
          prev.map(s => {
            if (s.id !== studentId) return s;
            const removedEnr = s.activities.find(a => a.activityId === activityId);
            return {
              ...s,
              activities: s.activities.filter(a => a.activityId !== activityId),
              pendingEnrollments: (s.pendingEnrollments || []).filter(
                a => a.activityId !== activityId
              ),
              inactiveEnrollments: removedEnr
                ? [
                    ...(s.inactiveEnrollments || []).filter(e => e.activityId !== activityId),
                    {
                      ...removedEnr,
                      active: false,
                      status: 'inactive' as const,
                      deletedAt: nowIso,
                      endedAt: todayStr
                    }
                  ]
                : s.inactiveEnrollments
            };
          })
        );
        await reevaluateUserOperationalRole({ studentId, email: targetStudent?.email });
        await refreshFromSupabase();
        return { success: true };
      }

      const finalErr =
        rpcRes.error ||
        (rpcRes.data?.error ? new Error(rpcRes.data.error) : null) ||
        softErr ||
        new Error(t('appContext.unenrollRlsDenied'));
      handleSupabaseError(t('appContext.actions.moderateUnenrollment'), finalErr);
      return { success: false, error: finalErr.message };
    } catch (err: any) {
      const msg = err?.message || t('appContext.unenrollError');
      handleSupabaseError(t('appContext.actions.moderateUnenrollment'), err);
      return { success: false, error: msg };
    }
  };

  const rejectActivityUnenrollment: AppContextType['rejectActivityUnenrollment'] = async (
    studentId,
    activityId,
    notes
  ) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.confirmEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const nowIso = new Date().toISOString();
      const trimmedNotes = notes?.trim() || null;

      let res = await supabase
        .from('student_enrollments')
        .update({
          status: 'active',
          drop_requested_at: null,
          drop_reason: null,
          drop_debts_checked: false,
          drop_materials_checked: false,
          drop_resolved_by: sessionData.session.user.id,
          drop_resolved_at: nowIso,
          drop_resolution_notes: trimmedNotes
        })
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('id');

      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await supabase
          .from('student_enrollments')
          .update({ status: 'active', drop_requested_at: null, drop_reason: null })
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .select('id');

        if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
          res = await supabase
            .from('student_enrollments')
            .update({ status: 'active' })
            .eq('student_id', studentId)
            .eq('activity_id', activityId)
            .select('id');
        }
      }

      let rejected = !res.error && Array.isArray(res.data) && res.data.length > 0;
      let rpcErr: any = null;

      if (!rejected) {
        const rpcRes = await supabase.rpc('moderate_activity_unenrollment', {
          p_student_id: studentId,
          p_activity_id: activityId,
          p_approve: false,
          p_debts_checked: false,
          p_materials_checked: false,
          p_notes: trimmedNotes
        });
        if (!rpcRes.error && rpcRes.data?.success !== false) {
          rejected = true;
        } else if (rpcRes.error) {
          rpcErr = rpcRes.error;
        } else if (rpcRes.data?.error) {
          rpcErr = new Error(rpcRes.data.error);
        }
      }

      if (!rejected) {
        const finalErr = res.error || rpcErr || new Error(t('appContext.confirmEnrollmentRlsZero'));
        handleSupabaseError(t('appContext.actions.moderateUnenrollment'), finalErr);
        return { success: false, error: finalErr.message };
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? {
                ...s,
                activities: s.activities.map(a =>
                  a.activityId === activityId
                    ? {
                        ...a,
                        status: 'active' as const,
                        dropRequestedAt: undefined,
                        dropReason: undefined
                      }
                    : a
                )
              }
            : s
        )
      );

      const targetStudent = students.find(s => s.id === studentId);
      await reevaluateUserOperationalRole({ studentId, email: targetStudent?.email });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.moderateUnenrollment');
      handleSupabaseError(t('appContext.actions.moderateUnenrollment'), err);
      return { success: false, error: msg };
    }
  };

  // Solicitudes de baja voluntaria de la asociación
  const requestAssociationWithdrawal: AppContextType['requestAssociationWithdrawal'] = async reason => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (!sessionUser || !currentUser) {
        const msg = t('appContext.withdrawalSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const emailNorm = (currentUser.email || sessionUser.email || '').toLowerCase().trim();
      if (!emailNorm || emailNorm === MASTER_ADMIN_EMAIL) {
        return { success: false, error: t('appContext.withdrawalMasterAdminProtected') };
      }

      const existingPending = membershipWithdrawalRequests.find(
        r =>
          r.status === 'pending' &&
          (r.profileId === currentUser.id ||
            r.userId === sessionUser.id ||
            r.userEmail.toLowerCase().trim() === emailNorm)
      );
      if (existingPending) {
        return { success: false, error: t('appContext.withdrawalAlreadyPending') };
      }

      const matchedProfile = profiles.find(
        p => p.id === currentUser.id || p.email.toLowerCase().trim() === emailNorm
      );
      const matchedStudent = students.find(
        s =>
          (currentUser.studentId && s.id === currentUser.studentId) ||
          s.profileId === currentUser.id ||
          s.email.toLowerCase().trim() === emailNorm
      );
      const matchedTeacher = teachers.find(
        tc =>
          (currentUser.teacherId && tc.id === currentUser.teacherId) ||
          tc.email.toLowerCase().trim() === emailNorm
      );

      const payload = {
        profile_id: matchedProfile?.id || currentUser.id,
        user_id: sessionUser.id,
        student_id: matchedStudent?.id || currentUser.studentId || null,
        teacher_id: matchedTeacher?.id || currentUser.teacherId || null,
        user_name: currentUser.name || emailNorm,
        user_email: emailNorm,
        user_role: normalizeUserRole(currentUser.role, UserRole.Socio),
        reason: reason?.trim() || null,
        status: 'pending'
      };

      const { data, error } = await supabase
        .from('membership_withdrawal_requests')
        .insert([payload])
        .select('*')
        .single();

      if (error) {
        if (error.code === '42P01') {
          const msg = t('appContext.withdrawalTableMissing');
          setDbError(msg);
          return { success: false, error: msg };
        }
        if (error.code === '23505') {
          return { success: false, error: t('appContext.withdrawalAlreadyPending') };
        }
        handleSupabaseError(t('appContext.actions.requestAssociationWithdrawal'), error);
        return { success: false, error: error.message };
      }

      if (data) {
        const mapped = mapDbWithdrawalRequestToRequest(data);
        setMembershipWithdrawalRequests(prev => [
          mapped,
          ...prev.filter(item => item.id !== mapped.id)
        ]);
      }

      void refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.requestAssociationWithdrawal');
      handleSupabaseError(t('appContext.actions.requestAssociationWithdrawal'), err);
      return { success: false, error: msg };
    }
  };

  const cancelAssociationWithdrawalRequest: AppContextType['cancelAssociationWithdrawalRequest'] = async requestId => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.withdrawalSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('membership_withdrawal_requests')
        .update({ status: 'cancelled', updated_at: nowIso })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('*');

      if (error) {
        handleSupabaseError(t('appContext.actions.cancelAssociationWithdrawal'), error);
        return { success: false, error: error.message };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return { success: false, error: t('appContext.withdrawalNotFoundOrProcessed') };
      }

      const mapped = mapDbWithdrawalRequestToRequest(data[0]);
      setMembershipWithdrawalRequests(prev =>
        prev.map(r => (r.id === requestId ? mapped : r))
      );
      void refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.cancelAssociationWithdrawal');
      handleSupabaseError(t('appContext.actions.cancelAssociationWithdrawal'), err);
      return { success: false, error: msg };
    }
  };

  const approveAssociationWithdrawal: AppContextType['approveAssociationWithdrawal'] = async (
    requestId,
    checks
  ) => {
    clearDbError();
    try {
      if (!checks?.debtsChecked || !checks?.materialsChecked) {
        return { success: false, error: t('appContext.withdrawalChecklistRequired') };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (!sessionUser) {
        const msg = t('appContext.withdrawalSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const targetRequest = membershipWithdrawalRequests.find(r => r.id === requestId);
      const targetEmailNorm = (targetRequest?.userEmail || '').toLowerCase().trim();
      if (targetEmailNorm === MASTER_ADMIN_EMAIL) {
        return { success: false, error: t('appContext.withdrawalMasterAdminProtected') };
      }

      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const trimmedNotes = checks.notes?.trim() || null;

      // 1. Intentar RPC atómica confirm_association_withdrawal si está desplegada en Supabase
      const rpcRes = await supabase.rpc('confirm_association_withdrawal', {
        p_request_id: requestId,
        p_debts_checked: true,
        p_materials_checked: true,
        p_notes: trimmedNotes
      });

      const isMissingRpc =
        Boolean(rpcRes.error) &&
        (rpcRes.error?.code === 'PGRST202' ||
          rpcRes.error?.code === '42883' ||
          rpcRes.error?.message?.toLowerCase().includes('does not exist') ||
          rpcRes.error?.message?.toLowerCase().includes('could not find the function'));

      if (!rpcRes.error && rpcRes.data?.success !== false) {
        setMembershipWithdrawalRequests(prev =>
          prev.map(r =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'approved',
                  debtsChecked: true,
                  materialsChecked: true,
                  resolutionNotes: trimmedNotes || undefined,
                  resolvedBy: sessionUser.id,
                  resolvedAt: nowIso,
                  updatedAt: nowIso
                }
              : r
          )
        );
        await refreshFromSupabase();
        return { success: true };
      }

      if (rpcRes.error && !isMissingRpc) {
        handleSupabaseError(t('appContext.actions.moderateAssociationWithdrawal'), rpcRes.error);
        return { success: false, error: rpcRes.error.message };
      }

      if (!rpcRes.error && rpcRes.data?.success === false) {
        const msg = rpcRes.data?.error || t('appContext.actions.moderateAssociationWithdrawal');
        setDbError(msg);
        return { success: false, error: msg };
      }

      // 2. Fallback cliente multi-tabla cuando la RPC aún no se ha ejecutado
      const { data: reqRows, error: reqUpdateErr } = await supabase
        .from('membership_withdrawal_requests')
        .update({
          status: 'approved',
          debts_checked: true,
          materials_checked: true,
          resolution_notes: trimmedNotes,
          resolved_by: sessionUser.id,
          resolved_at: nowIso,
          updated_at: nowIso
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('*');

      if (reqUpdateErr) {
        handleSupabaseError(t('appContext.actions.moderateAssociationWithdrawal'), reqUpdateErr);
        return { success: false, error: reqUpdateErr.message };
      }

      if (!Array.isArray(reqRows) || reqRows.length === 0) {
        return { success: false, error: t('appContext.withdrawalNotFoundOrProcessed') };
      }

      const freshReq = mapDbWithdrawalRequestToRequest(reqRows[0]);
      const emailNorm = freshReq.userEmail.toLowerCase().trim();
      const matchedProfile = profiles.find(
        p =>
          (freshReq.profileId && p.id === freshReq.profileId) ||
          (freshReq.userId && p.id === freshReq.userId) ||
          (emailNorm && p.email.toLowerCase().trim() === emailNorm)
      );
      const matchedStudent = students.find(
        s =>
          (freshReq.studentId && s.id === freshReq.studentId) ||
          (matchedProfile?.studentId && s.id === matchedProfile.studentId) ||
          (matchedProfile && s.profileId === matchedProfile.id) ||
          (emailNorm && s.email.toLowerCase().trim() === emailNorm)
      );
      const matchedTeacher = teachers.find(
        tc =>
          (freshReq.teacherId && tc.id === freshReq.teacherId) ||
          (matchedProfile?.teacherId && tc.id === matchedProfile.teacherId) ||
          (emailNorm && tc.email.toLowerCase().trim() === emailNorm)
      );

      const historyNote =
        trimmedNotes || t('appContext.notes.associationWithdrawalApproved');

      // Desactivar inscripciones activas y ficha de alumno vinculada
      if (matchedStudent) {
        const enrAuditPayload = {
          active: false,
          status: 'inactive',
          deleted_at: nowIso,
          ended_at: todayStr,
          drop_debts_checked: true,
          drop_materials_checked: true,
          drop_resolved_by: sessionUser.id,
          drop_resolved_at: nowIso,
          drop_resolution_notes: trimmedNotes
        };
        let enrRes = await supabase
          .from('student_enrollments')
          .update(enrAuditPayload)
          .eq('student_id', matchedStudent.id)
          .neq('status', 'inactive');
        if (
          enrRes.error &&
          (enrRes.error.code === '42703' || enrRes.error.message?.includes('column'))
        ) {
          enrRes = await supabase
            .from('student_enrollments')
            .update({ active: false, status: 'inactive' })
            .eq('student_id', matchedStudent.id)
            .neq('status', 'inactive');
          if (
            enrRes.error &&
            (enrRes.error.code === '42703' || enrRes.error.message?.includes('column'))
          ) {
            await supabase
              .from('student_enrollments')
              .update({ status: 'inactive' })
              .eq('student_id', matchedStudent.id);
          }
        }

        let stRes = await supabase
          .from('students')
          .update({
            status: 'inactive',
            is_socio: false,
            end_date: todayStr
          })
          .eq('id', matchedStudent.id);
        if (
          stRes.error &&
          (stRes.error.code === '42703' || stRes.error.message?.includes('column'))
        ) {
          stRes = await supabase
            .from('students')
            .update({ status: 'inactive', end_date: todayStr })
            .eq('id', matchedStudent.id);
          if (
            stRes.error &&
            (stRes.error.code === '42703' || stRes.error.message?.includes('column'))
          ) {
            await supabase
              .from('students')
              .update({ status: 'inactive' })
              .eq('id', matchedStudent.id);
          }
        }

        await recordStatusHistoryCycle({
          entityType: 'student',
          entityId: matchedStudent.id,
          status: 'inactive',
          startDate: todayStr,
          endDate: todayStr,
          notes: historyNote
        });
      }

      // Desactivar ficha de monitor vinculada
      if (matchedTeacher) {
        let tcRes = await supabase
          .from('teachers')
          .update({
            active: false,
            is_socio: false,
            end_date: todayStr
          })
          .eq('id', matchedTeacher.id);
        if (
          tcRes.error &&
          (tcRes.error.code === '42703' || tcRes.error.message?.includes('column'))
        ) {
          tcRes = await supabase
            .from('teachers')
            .update({ active: false, end_date: todayStr })
            .eq('id', matchedTeacher.id);
          if (
            tcRes.error &&
            (tcRes.error.code === '42703' || tcRes.error.message?.includes('column'))
          ) {
            await supabase
              .from('teachers')
              .update({ active: false })
              .eq('id', matchedTeacher.id);
          }
        }

        await recordStatusHistoryCycle({
          entityType: 'teacher',
          entityId: matchedTeacher.id,
          status: 'inactive',
          startDate: todayStr,
          endDate: todayStr,
          notes: historyNote
        });
      }

      // Revocar acceso y membresía de socio en public.profiles
      const targetProfileId = matchedProfile?.id || freshReq.profileId || freshReq.userId;
      if (targetProfileId && emailNorm !== MASTER_ADMIN_EMAIL) {
        let pRes = await supabase
          .from('profiles')
          .update({
            access: false,
            active: false,
            is_socio: false,
            operational_role: 'vacio',
            end_date: todayStr
          })
          .eq('id', targetProfileId);
        if (
          pRes.error &&
          (pRes.error.code === '42703' || pRes.error.message?.includes('column'))
        ) {
          pRes = await supabase
            .from('profiles')
            .update({
              access: false,
              active: false,
              end_date: todayStr
            })
            .eq('id', targetProfileId);
          if (
            pRes.error &&
            (pRes.error.code === '42703' || pRes.error.message?.includes('column'))
          ) {
            await supabase
              .from('profiles')
              .update({ active: false, end_date: todayStr })
              .eq('id', targetProfileId);
          }
        }

        await recordStatusHistoryCycle({
          entityType: 'profile',
          entityId: targetProfileId,
          status: 'inactive',
          startDate: todayStr,
          endDate: todayStr,
          notes: historyNote
        });
      }

      setMembershipWithdrawalRequests(prev =>
        prev.map(r => (r.id === requestId ? freshReq : r))
      );

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.moderateAssociationWithdrawal');
      handleSupabaseError(t('appContext.actions.moderateAssociationWithdrawal'), err);
      return { success: false, error: msg };
    }
  };

  const rejectAssociationWithdrawal: AppContextType['rejectAssociationWithdrawal'] = async (
    requestId,
    notes
  ) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (!sessionUser) {
        const msg = t('appContext.withdrawalSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const nowIso = new Date().toISOString();
      const trimmedNotes = notes?.trim() || null;

      const rpcRes = await supabase.rpc('reject_association_withdrawal', {
        p_request_id: requestId,
        p_notes: trimmedNotes
      });

      const isMissingRpc =
        Boolean(rpcRes.error) &&
        (rpcRes.error?.code === 'PGRST202' ||
          rpcRes.error?.code === '42883' ||
          rpcRes.error?.message?.toLowerCase().includes('does not exist') ||
          rpcRes.error?.message?.toLowerCase().includes('could not find the function'));

      if (!rpcRes.error && rpcRes.data?.success !== false) {
        setMembershipWithdrawalRequests(prev =>
          prev.map(r =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'rejected',
                  resolutionNotes: trimmedNotes || undefined,
                  resolvedBy: sessionUser.id,
                  resolvedAt: nowIso,
                  updatedAt: nowIso
                }
              : r
          )
        );
        await refreshFromSupabase();
        return { success: true };
      }

      if (rpcRes.error && !isMissingRpc) {
        handleSupabaseError(t('appContext.actions.moderateAssociationWithdrawal'), rpcRes.error);
        return { success: false, error: rpcRes.error.message };
      }

      const { data, error } = await supabase
        .from('membership_withdrawal_requests')
        .update({
          status: 'rejected',
          debts_checked: false,
          materials_checked: false,
          resolution_notes: trimmedNotes,
          resolved_by: sessionUser.id,
          resolved_at: nowIso,
          updated_at: nowIso
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('*');

      if (error) {
        handleSupabaseError(t('appContext.actions.moderateAssociationWithdrawal'), error);
        return { success: false, error: error.message };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return { success: false, error: t('appContext.withdrawalNotFoundOrProcessed') };
      }

      const mapped = mapDbWithdrawalRequestToRequest(data[0]);
      setMembershipWithdrawalRequests(prev =>
        prev.map(r => (r.id === requestId ? mapped : r))
      );
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.moderateAssociationWithdrawal');
      handleSupabaseError(t('appContext.actions.moderateAssociationWithdrawal'), err);
      return { success: false, error: msg };
    }
  };

  const enrollUserFromProfile: AppContextType['enrollUserFromProfile'] = async ({
    profile,
    activityId,
    customPrice
  }) => {
    clearDbError();
    try {
      const emailNorm = (profile.email || '').trim().toLowerCase();

      // 1. Resolver si ya existe ficha en `students` (por studentId, profileId o email)
      let resolvedStudent = students.find(
        s =>
          (profile.studentId && s.id === profile.studentId) ||
          s.profileId === profile.id ||
          (emailNorm && s.email.toLowerCase().trim() === emailNorm)
      );

      let resolvedStudentId = resolvedStudent?.id || profile.studentId;

      if (!resolvedStudentId && emailNorm) {
        const { data: existingByEmail } = await supabase
          .from('students')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();
        if (existingByEmail?.id) {
          resolvedStudentId = existingByEmail.id;
        }
      }

      // 2. Si es monitor/admin/socio de `profiles` sin ficha en `students`, crearla automáticamente
      if (!resolvedStudentId) {
        const todayStr = new Date().toISOString().split('T')[0];
        const basePayload = {
          name: profile.name,
          email: emailNorm || null,
          phone: null,
          status: 'active',
          registered_at: todayStr,
          notes:
            profile.role === UserRole.Monitor || profile.role === UserRole.Hibrido
              ? t('appContext.notes.teacherEnrolledAsStudent')
              : null
        };

        const extendedPayload = {
          ...basePayload,
          profile_id: profile.id,
          validation_status: 'validated',
          registered_by: currentUser?.id || null,
          member_type: 'socio',
          start_date: todayStr
        };

        let insertRes = await supabase
          .from('students')
          .insert([extendedPayload])
          .select()
          .single();

        if (
          insertRes.error &&
          (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
        ) {
          insertRes = await supabase
            .from('students')
            .insert([basePayload])
            .select()
            .single();
        }

        if (insertRes.error || !insertRes.data) {
          const msg = insertRes.error?.message || t('appContext.createStudentProfileError');
          handleSupabaseError(t('appContext.actions.linkUserAsStudent'), insertRes.error || new Error(msg));
          return { success: false, error: msg };
        }

        resolvedStudentId = insertRes.data.id;

        // 3. Vincular student_id en profiles (el rol lo recalcula reevaluateUserOperationalRole al aprobar la matrícula activa)
        try {
          await supabase.from('profiles').update({ student_id: resolvedStudentId }).eq('id', profile.id);
        } catch {
          // Best-effort: si RLS restringe editar profiles, el trigger SQL o admin lo sincroniza
        }
      } else {
        if (resolvedStudent && resolvedStudent.status === 'inactive') {
          const stReactivate = await supabase
            .from('students')
            .update({ status: 'active', end_date: null })
            .eq('id', resolvedStudentId!);
          if (stReactivate.error && (stReactivate.error.code === '42703' || stReactivate.error.message?.includes('column'))) {
            await supabase.from('students').update({ status: 'active' }).eq('id', resolvedStudentId!);
          }
        }
        const promoUpdates: Record<string, any> = {};
        if (!profile.studentId || profile.studentId !== resolvedStudentId) {
          promoUpdates.student_id = resolvedStudentId;
        }
        if (!resolvedStudent?.profileId) {
          try {
            await supabase.from('students').update({ profile_id: profile.id }).eq('id', resolvedStudentId);
          } catch {
            // Ignorar si la columna profile_id aún no existe
          }
        }
        if (Object.keys(promoUpdates).length > 0) {
          try {
            await supabase.from('profiles').update(promoUpdates).eq('id', profile.id);
          } catch {
            // Best-effort
          }
        }
      }

      // 4. Registrar la matrícula en student_enrollments
      const { error: enrollErr } = await upsertEnrollmentRow(resolvedStudentId!, activityId, customPrice);
      if (enrollErr) {
        handleSupabaseError(t('appContext.actions.registerUserEnrollment'), enrollErr);
        return { success: false, error: enrollErr.message };
      }

      await reevaluateUserOperationalRole({
        profileId: profile.id,
        studentId: resolvedStudentId
      });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.enrollExistingUser'), err);
      return { success: false, error: err?.message || t('appContext.enrollUserError') };
    }
  };

  const quickCreateAndEnrollStudent: AppContextType['quickCreateAndEnrollStudent'] = async ({
    name,
    email,
    phone,
    notes,
    activityId,
    customPrice
  }) => {
    clearDbError();
    try {
      const cleanName = name.trim();
      const cleanEmail = email?.trim().toLowerCase() || null;
      const cleanPhone = phone?.trim() || null;
      const cleanNotes = notes?.trim() || t('appContext.notes.quickCreatePending');
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Reutilizar ficha existente si ya coincide el correo (evita error por índice único en email)
      let targetStudentId: string | undefined;
      if (cleanEmail) {
        const localExisting = students.find(
          s => (s.email || '').trim().toLowerCase() === cleanEmail
        );
        if (localExisting) {
          targetStudentId = localExisting.id;
        } else {
          const { data: dbExisting } = await supabase
            .from('students')
            .select('id, status')
            .ilike('email', cleanEmail)
            .maybeSingle();
          if (dbExisting?.id) {
            targetStudentId = dbExisting.id;
          }
        }
      }

      let rlsBlockedDirect = false;

      if (!targetStudentId) {
        const basePendingPayload = {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          status: 'pending_validation',
          registered_at: todayStr,
          notes: cleanNotes
        };

        const extendedPendingPayload = {
          ...basePendingPayload,
          validation_status: 'pending',
          registered_by: currentUser?.id || null,
          member_type: 'socio',
          start_date: todayStr
        };

        let createRes = await supabase
          .from('students')
          .insert([extendedPendingPayload])
          .select()
          .single();

        if (
          createRes.error &&
          (createRes.error.code === '42703' ||
            createRes.error.code === '23503' ||
            createRes.error.code === '22P02' ||
            createRes.error.message?.includes('column'))
        ) {
          createRes = await supabase
            .from('students')
            .insert([basePendingPayload])
            .select()
            .single();
        }

        // Fallback si students_status_check aún no permite 'pending_validation': usar 'trial' + marcador pendiente
        if (
          createRes.error &&
          (createRes.error.message?.includes('students_status_check') || createRes.error.code === '23514')
        ) {
          const markedNotes = cleanNotes.includes('[Pendiente validación]')
            ? cleanNotes
            : `[Pendiente validación] ${cleanNotes}`;
          const fallbackTrialExtended = {
            ...extendedPendingPayload,
            status: 'trial',
            notes: markedNotes
          };
          createRes = await supabase
            .from('students')
            .insert([fallbackTrialExtended])
            .select()
            .single();

          if (
            createRes.error &&
            (createRes.error.code === '42703' ||
              createRes.error.code === '23503' ||
              createRes.error.code === '22P02' ||
              createRes.error.message?.includes('column'))
          ) {
            createRes = await supabase
              .from('students')
              .insert([{ ...basePendingPayload, status: 'trial', notes: markedNotes }])
              .select()
              .single();
          }
        }

        if (createRes.error || !createRes.data) {
          const msgLower = (createRes.error?.message || '').toLowerCase();
          if (createRes.error?.code === '42501' || msgLower.includes('row-level security')) {
            rlsBlockedDirect = true;
          } else {
            const rawMsg = createRes.error?.message || t('appContext.quickCreateProvisionalError');
            const friendlyMsg = rawMsg.includes('students_status_check')
              ? t('appContext.quickCreateStatusCheck')
              : rawMsg;
            handleSupabaseError(
              t('appContext.actions.quickCreatePending'),
              createRes.error || new Error(friendlyMsg)
            );
            return { success: false, error: friendlyMsg };
          }
        } else {
          targetStudentId = createRes.data.id;
        }
      }

      if (targetStudentId) {
        const { error: enrollErr } = await upsertEnrollmentRow(
          targetStudentId,
          activityId,
          customPrice
        );
        if (!enrollErr) {
          await refreshFromSupabase();
          return { success: true, studentId: targetStudentId };
        }
        const enrollMsgLower = (enrollErr?.message || '').toLowerCase();
        if (enrollErr?.code === '42501' || enrollMsgLower.includes('row-level security')) {
          rlsBlockedDirect = true;
        } else {
          handleSupabaseError(t('appContext.actions.enrollNewStudent'), enrollErr);
          await refreshFromSupabase();
          return { success: false, studentId: targetStudentId, error: enrollErr.message };
        }
      }

      // 2. Fallback RPC SECURITY DEFINER: crea ficha en students + matrícula en student_enrollments atómicamente
      if (rlsBlockedDirect) {
        const rpcRes = await supabase.rpc('quick_create_and_enroll_student', {
          p_name: cleanName,
          p_email: cleanEmail,
          p_phone: cleanPhone,
          p_notes: cleanNotes,
          p_activity_id: activityId,
          p_custom_price: customPrice !== undefined ? customPrice : null
        });
        if (!rpcRes.error && rpcRes.data?.success !== false && rpcRes.data?.student_id) {
          await refreshFromSupabase();
          return { success: true, studentId: String(rpcRes.data.student_id) };
        }
        const finalErr =
          rpcRes.error ||
          (rpcRes.data?.error ? new Error(rpcRes.data.error) : null) ||
          new Error(t('appContext.quickCreateProvisionalError'));
        handleSupabaseError(t('appContext.actions.quickCreateAndEnroll'), finalErr);
        return { success: false, error: finalErr.message };
      }

      return { success: false, error: t('appContext.quickCreateProvisionalError') };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.quickCreateAndEnroll'), err);
      return { success: false, error: err?.message || t('appContext.quickCreateUnexpectedError') };
    }
  };

  const syncStudentAbsenceWithSessions = async (params: {
    studentId: string;
    activityId: string;
    sessionDate: string;
    nextAttendance: 'present' | 'absent';
    onlyOpen: boolean;
  }) => {
    const cleanDate = params.sessionDate.slice(0, 10);
    const matchedStudent = students.find(s => s.id === params.studentId);
    const studentName = matchedStudent?.name || t('appContext.fallbackStudent');

    setSessions(prev =>
      prev.map(ses => {
        if (
          ses.activityId !== params.activityId ||
          ses.date?.slice(0, 10) !== cleanDate ||
          (params.onlyOpen && ses.isClosed)
        ) {
          return ses;
        }
        const prevRecords = ses.attendanceRecords || [];
        const hasRec = prevRecords.some(r => r.studentId === params.studentId);
        const nextRecords = hasRec
          ? prevRecords.map(r =>
              r.studentId === params.studentId
                ? { ...r, attendance: params.nextAttendance }
                : r
            )
          : [
              ...prevRecords,
              {
                studentId: params.studentId,
                studentName,
                attendance: params.nextAttendance,
                paid: false,
                paymentMethod: 'cash' as const
              }
            ];
        return {
          ...ses,
          attendanceRecords: nextRecords,
          attendeesCount: nextRecords.filter(r => r.attendance !== 'absent').length
        };
      })
    );

    try {
      const { data: matchingDbSessions } = await supabase
        .from('class_sessions')
        .select('id, is_closed')
        .eq('activity_id', params.activityId)
        .eq('date', cleanDate);

      if (!matchingDbSessions || matchingDbSessions.length === 0) return;

      for (const dbSession of matchingDbSessions) {
        if (params.onlyOpen && dbSession.is_closed) continue;

        const { data: existingAtt } = await supabase
          .from('session_attendances')
          .select('id')
          .eq('session_id', dbSession.id)
          .eq('student_id', params.studentId)
          .limit(1)
          .maybeSingle();

        if (existingAtt?.id) {
          await supabase
            .from('session_attendances')
            .update({ attendance: params.nextAttendance })
            .eq('id', existingAtt.id);
        } else if (params.nextAttendance === 'absent') {
          await supabase.from('session_attendances').insert([
            {
              session_id: dbSession.id,
              student_id: params.studentId,
              attendance: 'absent',
              paid: false,
              paid_amount: 0,
              payment_method: 'cash',
              payment_id: null
            }
          ]);
        }

        const { data: allSessionAtts } = await supabase
          .from('session_attendances')
          .select('attendance')
          .eq('session_id', dbSession.id);

        if (allSessionAtts) {
          const nextAttendeesCount = allSessionAtts.filter(r => r.attendance !== 'absent').length;
          await supabase
            .from('class_sessions')
            .update({ attendees_count: nextAttendeesCount })
            .eq('id', dbSession.id);
        }
      }
    } catch (syncErr) {
      console.warn('syncStudentAbsenceWithSessions non-fatal warning:', syncErr);
    }
  };

  // Avisos y solicitudes de ausencia de alumnos
  const reportStudentAbsence: AppContextType['reportStudentAbsence'] = async ({
    studentId,
    activityId,
    sessionDate,
    reason,
    asRequest,
    initialStatus
  }) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const msg = t('appContext.requestEnrollmentSessionRequired');
        setDbError(msg);
        return { success: false, error: msg };
      }

      const cleanSessionDate = sessionDate.slice(0, 10);
      const targetActivity = activities.find(a => a.id === activityId);
      const mustBeRequest =
        !initialStatus &&
        (Boolean(asRequest) ||
          isClassSessionClosedOrPast({
            activity: targetActivity,
            activityId,
            sessionDate: cleanSessionDate,
            sessions
          }));
      const targetStatus: 'reported' | 'pending' | 'approved' = initialStatus
        ? initialStatus
        : mustBeRequest
        ? 'pending'
        : 'reported';

      const trimmedReason = reason?.trim() || null;
      const nowIso = new Date().toISOString();
      const basePayload: Record<string, any> = {
        student_id: studentId,
        activity_id: activityId,
        session_date: cleanSessionDate,
        reason: trimmedReason,
        status: targetStatus,
        reported_by: sessionData.session.user.id
      };
      const fullPayload: Record<string, any> =
        targetStatus === 'approved'
          ? {
              ...basePayload,
              reviewed_by: sessionData.session.user.id,
              reviewed_at: nowIso
            }
          : basePayload;

      let res = await supabase
        .from('student_absences')
        .upsert(fullPayload, { onConflict: 'student_id,activity_id,session_date' })
        .select('*')
        .maybeSingle();

      if (
        res.error &&
        targetStatus === 'approved' &&
        (res.error.code === '42703' || res.error.message?.includes('column'))
      ) {
        res = await supabase
          .from('student_absences')
          .upsert(basePayload, { onConflict: 'student_id,activity_id,session_date' })
          .select('*')
          .maybeSingle();
      }

      if (
        res.error &&
        (res.error.code === '42P10' || res.error.message?.includes('no unique or exclusion constraint'))
      ) {
        const { data: existing } = await supabase
          .from('student_absences')
          .select('id')
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .eq('session_date', cleanSessionDate)
          .maybeSingle();

        const updatePayload: Record<string, any> =
          targetStatus === 'approved'
            ? {
                reason: trimmedReason,
                status: targetStatus,
                reported_by: sessionData.session.user.id,
                reviewed_by: sessionData.session.user.id,
                reviewed_at: nowIso
              }
            : {
                reason: trimmedReason,
                status: targetStatus,
                reported_by: sessionData.session.user.id
              };

        res = existing?.id
          ? await supabase
              .from('student_absences')
              .update(updatePayload)
              .eq('id', existing.id)
              .select('*')
              .maybeSingle()
          : await supabase.from('student_absences').insert([fullPayload]).select('*').maybeSingle();

        if (
          res.error &&
          targetStatus === 'approved' &&
          (res.error.code === '42703' || res.error.message?.includes('column'))
        ) {
          res = existing?.id
            ? await supabase
                .from('student_absences')
                .update({
                  reason: trimmedReason,
                  status: targetStatus,
                  reported_by: sessionData.session.user.id
                })
                .eq('id', existing.id)
                .select('*')
                .maybeSingle()
            : await supabase.from('student_absences').insert([basePayload]).select('*').maybeSingle();
        }
      }

      if (res.error) {
        handleSupabaseError(t('appContext.actions.reportAbsence'), res.error);
        return { success: false, error: res.error.message };
      }

      if (!res.data) {
        const rlsMsg = t('appContext.absenceReportRlsError');
        setDbError(rlsMsg);
        return { success: false, error: rlsMsg };
      }

      const mapped = mapDbAbsenceToAbsence(res.data);
      setStudentAbsences(prev => [
        ...prev.filter(
          a =>
            !(
              a.studentId === studentId &&
              a.activityId === activityId &&
              a.sessionDate?.slice(0, 10) === cleanSessionDate
            )
        ),
        mapped
      ]);

      if (targetStatus === 'reported' || targetStatus === 'approved') {
        await syncStudentAbsenceWithSessions({
          studentId,
          activityId,
          sessionDate: cleanSessionDate,
          nextAttendance: 'absent',
          onlyOpen: true
        });
      }

      await refreshFromSupabase();
      return { success: true, status: targetStatus };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.reportAbsence');
      handleSupabaseError(t('appContext.actions.reportAbsence'), err);
      return { success: false, error: msg };
    }
  };

  const cancelStudentAbsence: AppContextType['cancelStudentAbsence'] = async absenceId => {
    clearDbError();
    try {
      const targetAbsence = studentAbsences.find(a => a.id === absenceId);
      if (
        targetAbsence &&
        isClassSessionClosed(sessions, targetAbsence.activityId, targetAbsence.sessionDate)
      ) {
        const closedMsg = t('appContext.absenceClassClosedCannotCancel');
        setDbError(closedMsg);
        return { success: false, error: closedMsg };
      }

      const res = await supabase
        .from('student_absences')
        .update({ status: 'cancelled' })
        .eq('id', absenceId)
        .select('id');

      if (res.error) {
        handleSupabaseError(t('appContext.actions.cancelAbsence'), res.error);
        return { success: false, error: res.error.message };
      }

      if (!res.data || res.data.length === 0) {
        const rlsMsg = t('appContext.absenceConfirmRlsError');
        setDbError(rlsMsg);
        return { success: false, error: rlsMsg };
      }

      setStudentAbsences(prev => prev.filter(a => a.id !== absenceId));

      if (targetAbsence) {
        await syncStudentAbsenceWithSessions({
          studentId: targetAbsence.studentId,
          activityId: targetAbsence.activityId,
          sessionDate: targetAbsence.sessionDate,
          nextAttendance: 'present',
          onlyOpen: true
        });
      }

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.cancelAbsence');
      handleSupabaseError(t('appContext.actions.cancelAbsence'), err);
      return { success: false, error: msg };
    }
  };

  const respondToStudentAbsenceRequest: AppContextType['respondToStudentAbsenceRequest'] = async (
    absenceId,
    approve
  ) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reviewerId = sessionData?.session?.user?.id || null;
      const nextStatus: StudentAbsence['status'] = approve ? 'approved' : 'rejected';
      const nowIso = new Date().toISOString();

      let res = await supabase
        .from('student_absences')
        .update({
          status: nextStatus,
          reviewed_by: reviewerId,
          reviewed_at: nowIso
        })
        .eq('id', absenceId)
        .select('*')
        .maybeSingle();

      if (
        res.error &&
        (res.error.code === '42703' || res.error.message?.includes('column'))
      ) {
        res = await supabase
          .from('student_absences')
          .update({ status: nextStatus })
          .eq('id', absenceId)
          .select('*')
          .maybeSingle();
      }

      if (res.error) {
        handleSupabaseError(t('appContext.actions.respondAbsenceRequest'), res.error);
        return { success: false, error: res.error.message };
      }

      if (!res.data) {
        const rlsMsg = t('appContext.absenceConfirmRlsError');
        setDbError(rlsMsg);
        return { success: false, error: rlsMsg };
      }

      const mapped = mapDbAbsenceToAbsence(res.data);
      const targetAbsence =
        mapped || studentAbsences.find(a => a.id === absenceId);

      // Si se confirma la ausencia, marcar al alumno como 'absent' en session_attendances si existe la sesión
      if (approve && targetAbsence) {
        await syncStudentAbsenceWithSessions({
          studentId: targetAbsence.studentId,
          activityId: targetAbsence.activityId,
          sessionDate: targetAbsence.sessionDate,
          nextAttendance: 'absent',
          onlyOpen: false
        });
      }

      setStudentAbsences(prev => prev.map(a => (a.id === absenceId ? mapped : a)));

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.respondAbsenceRequest');
      handleSupabaseError(t('appContext.actions.respondAbsenceRequest'), err);
      return { success: false, error: msg };
    }
  };

  const sendStudentPaymentMessage: AppContextType['sendStudentPaymentMessage'] = async params => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData?.session?.user?.id || null;
      if (!authUserId) {
        const msg = t('appContext.paymentMessages.sessionRequired');
        return { success: false, error: msg };
      }

      const trimmedMessage = params.message.trim();
      if (!params.reportedPaid && !trimmedMessage) {
        return { success: false, error: t('appContext.paymentMessages.messageRequired') };
      }

      const payload: Record<string, any> = {
        payment_id: params.paymentId,
        student_id: params.studentId,
        student_name: params.studentName || null,
        activity_id: params.activityId,
        activity_name: params.activityName || null,
        teacher_id: params.teacherId || null,
        teacher_name: params.teacherName || null,
        period_month: params.periodMonth,
        receipt_number: params.receiptNumber || null,
        amount: params.amount !== undefined ? Number(params.amount) : null,
        reported_paid: Boolean(params.reportedPaid),
        paid_to_type: params.reportedPaid ? params.paidToType || 'teacher' : null,
        paid_to_name: params.reportedPaid ? params.paidToName?.trim() || null : null,
        payment_method: params.reportedPaid ? params.paymentMethod || 'cash' : null,
        message: trimmedMessage || t('appContext.paymentMessages.defaultPaidNote'),
        status: 'pending',
        created_by: authUserId
      };

      const { data, error } = await supabase
        .from('student_payment_messages')
        .insert([payload])
        .select('*')
        .single();

      if (error) {
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('student_payment_messages')
        ) {
          setStudentPaymentMessagesTableMissing(true);
          const missingMsg = t('appContext.paymentMessages.tableMissing');
          setDbError(missingMsg);
          return { success: false, error: missingMsg };
        }
        handleSupabaseError(t('appContext.actions.sendPaymentMessage'), error);
        return { success: false, error: error.message };
      }

      if (data) {
        const mapped = mapDbStudentPaymentMessageToMessage(data);
        setStudentPaymentMessagesTableMissing(false);
        setStudentPaymentMessages(prev => [mapped, ...prev.filter(m => m.id !== mapped.id)]);
        return { success: true, data: mapped };
      }

      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.sendPaymentMessage');
      handleSupabaseError(t('appContext.actions.sendPaymentMessage'), err);
      return { success: false, error: msg };
    }
  };

  const cancelStudentPaymentMessage: AppContextType['cancelStudentPaymentMessage'] = async messageId => {
    clearDbError();
    try {
      const { error } = await supabase
        .from('student_payment_messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        handleSupabaseError(t('appContext.actions.cancelPaymentMessage'), error);
        return { success: false, error: error.message };
      }

      setStudentPaymentMessages(prev => prev.filter(m => m.id !== messageId));
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.cancelPaymentMessage');
      handleSupabaseError(t('appContext.actions.cancelPaymentMessage'), err);
      return { success: false, error: msg };
    }
  };

  const evaluateStudentPaymentMessage: AppContextType['evaluateStudentPaymentMessage'] = async ({
    messageId,
    status,
    teacherEvaluation,
    markPaymentAsPaid,
    paymentMethod,
    collectedByTeacher
  }) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reviewerId = sessionData?.session?.user?.id || null;
      const nowIso = new Date().toISOString();
      const trimmedEvaluation = teacherEvaluation?.trim() || null;

      const targetMessage = studentPaymentMessages.find(m => m.id === messageId);

      const { data, error } = await supabase
        .from('student_payment_messages')
        .update({
          status,
          teacher_evaluation: trimmedEvaluation,
          evaluated_by: reviewerId,
          evaluated_at: nowIso,
          updated_at: nowIso
        })
        .eq('id', messageId)
        .select('*')
        .maybeSingle();

      if (error) {
        handleSupabaseError(t('appContext.actions.evaluatePaymentMessage'), error);
        return { success: false, error: error.message };
      }

      if (!data) {
        const rlsErr = t('appContext.paymentMessages.evaluateRlsZero');
        setDbError(rlsErr);
        return { success: false, error: rlsErr };
      }

      const mapped = mapDbStudentPaymentMessageToMessage(data);
      setStudentPaymentMessages(prev => prev.map(m => (m.id === messageId ? mapped : m)));

      if (status === 'approved' && markPaymentAsPaid) {
        const paymentId = mapped.paymentId || targetMessage?.paymentId;
        if (paymentId) {
          const existingPayment = paymentsRef.current.find(p => p.id === paymentId);
          if (!existingPayment || existingPayment.status !== 'paid') {
            const resolvedMethod =
              paymentMethod ||
              mapped.paymentMethod ||
              existingPayment?.paymentMethod ||
              'cash';
            const resolvedCollectedByTeacher =
              collectedByTeacher !== undefined
                ? collectedByTeacher
                : mapped.paidToType
                ? mapped.paidToType !== 'association'
                : existingPayment?.collectedByTeacher ?? true;
            const resolvedTeacherId = resolvedCollectedByTeacher
              ? mapped.teacherId ||
                existingPayment?.collectedByTeacherId ||
                activities.find(a => a.id === mapped.activityId)?.teacherId
              : undefined;

            await updatePayment(paymentId, {
              status: 'paid',
              paymentDate: new Date().toISOString().split('T')[0],
              paymentMethod: resolvedMethod,
              collectedByTeacher: resolvedCollectedByTeacher,
              collectedByTeacherId: resolvedTeacherId,
              ...(trimmedEvaluation
                ? {
                    notes: existingPayment?.notes
                      ? `${existingPayment.notes} · ${trimmedEvaluation}`
                      : trimmedEvaluation
                  }
                : {})
            });
          }
        }
      }

      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.evaluatePaymentMessage');
      handleSupabaseError(t('appContext.actions.evaluatePaymentMessage'), err);
      return { success: false, error: msg };
    }
  };

  const validatePendingStudent: AppContextType['validatePendingStudent'] = async (
    studentId,
    approve
  ) => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData?.session?.user?.id;
      if (!authUserId) {
        const authErr = new Error(t('appContext.validateSessionRequired'));
        handleSupabaseError(t('appContext.actions.validateMember'), authErr);
        return { success: false, error: authErr.message };
      }

      const targetStudent = students.find(s => s.id === studentId);
      const hadPendingMarker = Boolean(targetStudent?.notes?.includes('[Pendiente validación]'));
      const cleanedNotes = hadPendingMarker
        ? targetStudent!.notes!.replace(/\[Pendiente validación\]\s*/g, '').trim()
        : undefined;
      const targetStatus = approve ? 'active' : 'inactive';
      const targetValidationStatus = approve ? 'validated' : 'rejected';

      const baseUpdate: Record<string, any> = { status: targetStatus };
      if (hadPendingMarker) {
        baseUpdate.notes = cleanedNotes || null;
      }

      const validationUpdate: Record<string, any> = {
        ...baseUpdate,
        validation_status: targetValidationStatus
      };

      const fullUpdate: Record<string, any> = {
        ...validationUpdate,
        validated_at: new Date().toISOString(),
        validated_by: authUserId
      };

      let updateRes = await supabase
        .from('students')
        .update(fullUpdate)
        .eq('id', studentId)
        .select('*');

      // Fallback 1: si faltan validated_at / validated_by o hay error FK/UUID en validated_by, conservar validation_status
      if (
        updateRes.error &&
        (updateRes.error.code === '42703' ||
          updateRes.error.code === '23503' ||
          updateRes.error.code === '22P02' ||
          updateRes.error.message?.includes('column'))
      ) {
        updateRes = await supabase
          .from('students')
          .update(validationUpdate)
          .eq('id', studentId)
          .select('*');
      }

      // Fallback 2: si tampoco existe la columna validation_status aún, actualizar al menos status y notes
      if (
        updateRes.error &&
        (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
      ) {
        updateRes = await supabase
          .from('students')
          .update(baseUpdate)
          .eq('id', studentId)
          .select('*');
      }

      if (updateRes.error) {
        handleSupabaseError(t('appContext.actions.validateMember'), updateRes.error);
        return { success: false, error: updateRes.error.message };
      }

      if (!updateRes.data || updateRes.data.length === 0) {
        const { data: existingRow } = await supabase
          .from('students')
          .select('id')
          .eq('id', studentId)
          .maybeSingle();

        const rlsErr = new Error(
          existingRow
            ? t('appContext.validateRlsZero')
            : t('appContext.validateNotFound')
        );
        handleSupabaseError(t('appContext.actions.validateMember'), rlsErr);
        return { success: false, error: rlsErr.message };
      }

      const updatedRow = updateRes.data[0];
      const todayStr = new Date().toISOString().split('T')[0];
      await recordStatusHistoryCycle({
        entityType: 'student',
        entityId: studentId,
        status: targetStatus,
        startDate: targetStudent?.startDate || todayStr,
        endDate: approve ? undefined : todayStr,
        notes: approve ? t('appContext.notes.quickCreateApproved') : t('appContext.notes.quickCreateRejected')
      });

      setStudents(prev =>
        prev.map(s => {
          if (s.id !== studentId) return s;
          const mapped = mapDbStudentToStudent(updatedRow, []);
          return {
            ...mapped,
            activities: s.activities
          };
        })
      );

      await reevaluateUserOperationalRole({
        studentId,
        email: targetStudent?.email
      });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.validatePendingMember'), err);
      return { success: false, error: err?.message || t('appContext.validateError') };
    }
  };

  // Pagos y Recibos (con actualización optimista instantánea + sincronización Supabase segura ante toques rápidos)
  const commitPayments = (updater: (prev: PaymentRecord[]) => PaymentRecord[]) => {
    const next = updater(paymentsRef.current);
    paymentsRef.current = next;
    setPayments(next);
  };

  const resolveRealPaymentId = async (id: string): Promise<string> => {
    if (!id.startsWith('temp-pay-')) return id;
    if (tempPaymentIdMapRef.current[id]) return tempPaymentIdMapRef.current[id];
    const pendingInsert = pendingPaymentInsertMapRef.current[id];
    if (pendingInsert) {
      try {
        const created = await pendingInsert;
        if (created?.id) return created.id;
      } catch {
        // Ignorar
      }
    }
    return tempPaymentIdMapRef.current[id] || id;
  };

  const recordPayment = async (
    payment: Omit<PaymentRecord, 'id' | 'receiptNumber'> & { id?: string }
  ): Promise<PaymentRecord | null> => {
    clearDbError();
    const receiptNumber = `REC-${selectedPeriod.replace('-', '')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const student = students.find(s => s.id === payment.studentId);
    const activity = activities.find(a => a.id === payment.activityId);
    const effectiveDate =
      payment.paymentDate ||
      (payment.status === 'paid' || payment.status === 'partial'
        ? new Date().toISOString().split('T')[0]
        : undefined);
    const tempId = `temp-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const optimisticPayment: PaymentRecord = {
      id: tempId,
      receiptNumber,
      studentId: payment.studentId,
      studentName: student?.name || payment.studentName || t('appContext.fallbackStudent'),
      activityId: payment.activityId,
      activityName: activity?.name || payment.activityName || t('appContext.fallbackActivity'),
      periodMonth: payment.periodMonth || selectedPeriod,
      amount: payment.amount,
      paymentDate: effectiveDate,
      paymentMethod: payment.paymentMethod || 'cash',
      status: payment.status || 'paid',
      collectedByTeacher: payment.collectedByTeacher ?? true,
      collectedByTeacherId: payment.collectedByTeacherId || activity?.teacherId,
      notes: payment.notes || ''
    };

    commitPayments(prev => [optimisticPayment, ...prev]);

    const dbPayload = mapPaymentToDb(optimisticPayment);
    const insertPromise = (async (): Promise<PaymentRecord | null> => {
      const { data, error } = await supabase.from('payments').insert([dbPayload]).select().single();
      if (error) {
        commitPayments(prev => prev.filter(p => p.id !== tempId));
        const enhancedError = error.message?.includes('payments_status_check')
          ? new Error(t('appContext.paymentsStatusCheck'))
          : error;
        handleSupabaseError(t('appContext.actions.recordPayment'), enhancedError);
        return null;
      }

      if (data) {
        const createdPayment = mapDbPaymentToPayment(data, student?.name, activity?.name);
        tempPaymentIdMapRef.current[tempId] = createdPayment.id;
        commitPayments(prev =>
          prev.map(p => (p.id === tempId ? createdPayment : p))
        );
        return createdPayment;
      }
      return null;
    })();

    pendingPaymentInsertMapRef.current[tempId] = insertPromise;
    try {
      return await insertPromise;
    } finally {
      delete pendingPaymentInsertMapRef.current[tempId];
    }
  };

  const updatePayment = async (id: string, updates: Partial<PaymentRecord>) => {
    clearDbError();
    // Aplicar cambio optimista inmediato incluso si id es temporal
    const optimisticMatch = paymentsRef.current.find(p => p.id === id);
    if (optimisticMatch) {
      const optimisticMerged = { ...optimisticMatch, ...updates };
      commitPayments(prev => prev.map(p => (p.id === id ? optimisticMerged : p)));
    }

    const realId = await resolveRealPaymentId(id);
    if (realId.startsWith('temp-pay-')) {
      return;
    }

    let current =
      paymentsRef.current.find(p => p.id === realId) ||
      paymentsRef.current.find(p => p.id === id) ||
      optimisticMatch;

    if (!current) {
      const { data: row } = await supabase
        .from('payments')
        .select('*, students(name), activities(name)')
        .eq('id', realId)
        .maybeSingle();
      if (row) {
        current = mapDbPaymentToPayment(row);
      }
    }

    if (!current) return;

    const merged: PaymentRecord = { ...current, ...updates, id: realId };
    commitPayments(prev => {
      const exists = prev.some(p => p.id === realId || p.id === id);
      return exists
        ? prev.map(p => (p.id === realId || p.id === id ? merged : p))
        : [merged, ...prev];
    });

    const dbPayload = mapPaymentToDb(merged);
    const { error } = await supabase.from('payments').update(dbPayload).eq('id', realId);
    if (error) {
      commitPayments(prev => prev.map(p => (p.id === realId ? current! : p)));
      const enhancedError = error.message?.includes('payments_status_check')
        ? new Error(t('appContext.paymentsStatusCheck'))
        : error;
      handleSupabaseError(t('appContext.actions.updatePayment'), enhancedError);
      return;
    }
  };

  const deletePayment = async (id: string) => {
    clearDbError();
    const mappedId = tempPaymentIdMapRef.current[id];
    const previous =
      paymentsRef.current.find(p => p.id === id) ||
      (mappedId ? paymentsRef.current.find(p => p.id === mappedId) : undefined);

    commitPayments(prev => prev.filter(p => p.id !== id && p.id !== mappedId));

    const realId = await resolveRealPaymentId(id);
    if (realId.startsWith('temp-pay-')) {
      return;
    }

    commitPayments(prev => prev.filter(p => p.id !== realId));

    try {
      await supabase
        .from('session_attendances')
        .update({ payment_id: null, paid: false, paid_amount: 0 })
        .eq('payment_id', realId);
    } catch {
      // Ignorar si no existe vínculo o la política aplica solo a pagos
    }
    const { error } = await supabase.from('payments').delete().eq('id', realId);
    if (error) {
      if (previous) {
        const restored = { ...previous, id: realId };
        commitPayments(prev => (prev.some(p => p.id === realId) ? prev : [restored, ...prev]));
      }
      handleSupabaseError(t('appContext.actions.deletePayment'), error);
      return;
    }
  };

  const markPaymentPaid = async (id: string, method?: PaymentMethod) => {
    await updatePayment(id, {
      status: 'paid',
      paymentDate: new Date().toISOString().split('T')[0],
      ...(method ? { paymentMethod: method } : {})
    });
  };

  // Cuota Anual de Socios (Exclusivo Administrador)
  const upsertMemberAnnualFee: AppContextType['upsertMemberAnnualFee'] = async params => {
    clearDbError();
    if (currentUserRef.current?.role !== UserRole.Admin || currentRole !== UserRole.Admin) {
      return { success: false, error: t('appContext.annualFees.adminOnly') };
    }

    const safeAmount = Math.max(0, Number(params.amount) || 0);
    let safePaidAmount = Math.max(0, Number(params.paidAmount) || 0);
    let resolvedStatus: PaymentStatus = params.status;

    if (resolvedStatus === 'paid') {
      safePaidAmount = safeAmount;
    } else if (resolvedStatus === 'exempt' || resolvedStatus === 'cancelled') {
      safePaidAmount = 0;
    } else if (resolvedStatus === 'pending' || resolvedStatus === 'overdue') {
      safePaidAmount = 0;
    } else if (resolvedStatus === 'partial') {
      if (safeAmount > 0 && safePaidAmount >= safeAmount) {
        resolvedStatus = 'paid';
        safePaidAmount = safeAmount;
      } else if (safePaidAmount <= 0) {
        resolvedStatus = 'pending';
        safePaidAmount = 0;
      }
    }

    const resolvedReceipt =
      (params.receiptNumber || '').trim() ||
      (resolvedStatus === 'paid' || resolvedStatus === 'partial'
        ? `CA-${params.feeYear}-${Math.floor(1000 + Math.random() * 9000)}`
        : undefined);
    const resolvedPaymentDate =
      params.paymentDate ||
      (resolvedStatus === 'paid' || resolvedStatus === 'partial'
        ? new Date().toISOString().split('T')[0]
        : undefined);

    const payload: Record<string, unknown> = {
      profile_id: params.profileId,
      member_name: params.memberName,
      member_email: params.memberEmail,
      member_number: params.memberNumber || null,
      fee_year: params.feeYear,
      amount: safeAmount,
      paid_amount: safePaidAmount,
      status: resolvedStatus,
      payment_method: params.paymentMethod || 'cash',
      payment_date: resolvedPaymentDate || null,
      receipt_number: resolvedReceipt || null,
      notes: params.notes?.trim() || null,
      recorded_by: currentUserRef.current?.id || null,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('member_annual_fees')
        .upsert(payload, { onConflict: 'profile_id,fee_year' })
        .select('*')
        .single();

      if (error) {
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('member_annual_fees')
        ) {
          setMemberAnnualFeesTableMissing(true);
        }
        handleSupabaseError(t('appContext.annualFees.saveAction'), error);
        return { success: false, error: error.message };
      }

      setMemberAnnualFeesTableMissing(false);
      const savedFee = mapDbMemberAnnualFeeToFee(data);
      setMemberAnnualFees(prev => {
        const filtered = prev.filter(
          item =>
            item.id !== savedFee.id &&
            !(item.profileId === savedFee.profileId && item.feeYear === savedFee.feeYear)
        );
        return [savedFee, ...filtered].sort((a, b) =>
          b.feeYear !== a.feeYear
            ? b.feeYear - a.feeYear
            : a.memberName.localeCompare(b.memberName)
        );
      });

      return { success: true, fee: savedFee };
    } catch (err: any) {
      const msg = err?.message || t('appContext.annualFees.saveError');
      handleSupabaseError(t('appContext.annualFees.saveAction'), err);
      return { success: false, error: msg };
    }
  };

  const generateAnnualFeesForYear: AppContextType['generateAnnualFeesForYear'] = async params => {
    clearDbError();
    if (currentUserRef.current?.role !== UserRole.Admin || currentRole !== UserRole.Admin) {
      return { success: false, createdCount: 0, error: t('appContext.annualFees.adminOnly') };
    }

    const parsedConfig = parseSocioAnnualFeeConfig(appConfigs);
    const feeAmount =
      params.amount !== undefined && Number.isFinite(params.amount) && params.amount >= 0
        ? params.amount
        : parsedConfig.defaultAmount || DEFAULT_ANNUAL_FEE_AMOUNT;

    const existingProfileIds = new Set(
      memberAnnualFees.filter(f => f.feeYear === params.feeYear).map(f => f.profileId)
    );

    const eligibleProfiles = profiles.filter(
      p =>
        isProfileEligibleForSocioAnnualFee(p, Boolean(params.strictSocioRoleOnly)) &&
        !existingProfileIds.has(p.id)
    );

    if (eligibleProfiles.length === 0) {
      return { success: true, createdCount: 0 };
    }

    const nowIso = new Date().toISOString();
    const rowsToInsert = eligibleProfiles.map(p => ({
      profile_id: p.id,
      member_name: p.name,
      member_email: p.email,
      member_number: p.memberNumber || null,
      fee_year: params.feeYear,
      amount: feeAmount,
      paid_amount: 0,
      status: 'pending',
      payment_method: 'cash',
      payment_date: null,
      receipt_number: null,
      notes: null,
      recorded_by: currentUserRef.current?.id || null,
      updated_at: nowIso
    }));

    try {
      const { data, error } = await supabase
        .from('member_annual_fees')
        .upsert(rowsToInsert, { onConflict: 'profile_id,fee_year', ignoreDuplicates: true })
        .select('*');

      if (error) {
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('member_annual_fees')
        ) {
          setMemberAnnualFeesTableMissing(true);
        }
        handleSupabaseError(t('appContext.annualFees.generateAction'), error);
        return { success: false, createdCount: 0, error: error.message };
      }

      setMemberAnnualFeesTableMissing(false);
      const insertedFees = (data || []).map(mapDbMemberAnnualFeeToFee);
      setMemberAnnualFees(prev => {
        const merged = [...prev];
        for (const fee of insertedFees) {
          const idx = merged.findIndex(
            item => item.profileId === fee.profileId && item.feeYear === fee.feeYear
          );
          if (idx >= 0) merged[idx] = fee;
          else merged.push(fee);
        }
        return merged.sort((a, b) =>
          b.feeYear !== a.feeYear
            ? b.feeYear - a.feeYear
            : a.memberName.localeCompare(b.memberName)
        );
      });

      return { success: true, createdCount: insertedFees.length };
    } catch (err: any) {
      const msg = err?.message || t('appContext.annualFees.generateError');
      handleSupabaseError(t('appContext.annualFees.generateAction'), err);
      return { success: false, createdCount: 0, error: msg };
    }
  };

  const deleteMemberAnnualFee: AppContextType['deleteMemberAnnualFee'] = async id => {
    clearDbError();
    if (currentUserRef.current?.role !== UserRole.Admin || currentRole !== UserRole.Admin) {
      return { success: false, error: t('appContext.annualFees.adminOnly') };
    }

    const previous = memberAnnualFees.find(f => f.id === id);
    setMemberAnnualFees(prev => prev.filter(f => f.id !== id));

    try {
      const { error } = await supabase.from('member_annual_fees').delete().eq('id', id);
      if (error) {
        if (previous) {
          setMemberAnnualFees(prev => [previous, ...prev]);
        }
        handleSupabaseError(t('appContext.annualFees.deleteAction'), error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      if (previous) {
        setMemberAnnualFees(prev => [previous, ...prev]);
      }
      const msg = err?.message || t('appContext.annualFees.deleteError');
      handleSupabaseError(t('appContext.annualFees.deleteAction'), err);
      return { success: false, error: msg };
    }
  };

  const recordClassPayment = async (params: {
    studentId: string;
    activityId: string;
    amount: number;
    isPartial?: boolean;
    status?: PaymentStatus;
    paymentMethod?: PaymentMethod;
    date?: string;
    notes?: string;
  }): Promise<PaymentRecord | null> => {
    clearDbError();
    const activity = activities.find(a => a.id === params.activityId);
    const student = students.find(s => s.id === params.studentId);
    const paymentDate = params.date || new Date().toISOString().split('T')[0];
    const resolvedStatus: PaymentStatus =
      params.status || (params.isPartial ? 'partial' : 'paid');

    const receipt = await recordPayment({
      studentId: params.studentId,
      studentName: student?.name || t('appContext.fallbackStudent'),
      activityId: params.activityId,
      activityName: activity?.name || t('appContext.fallbackWorkshop'),
      periodMonth: selectedPeriod,
      amount: params.amount,
      paymentDate: paymentDate,
      paymentMethod: params.paymentMethod || 'cash',
      status: resolvedStatus,
      collectedByTeacher: true,
      collectedByTeacherId: activity?.teacherId || currentTeacherId,
      notes:
        params.notes ||
        (resolvedStatus === 'partial'
          ? t('appContext.notes.partialClassPayment')
          : t('appContext.notes.fullClassPayment'))
    });

    return receipt;
  };

  const sessionSyncLockRef = useRef<Record<string, Promise<string | null>>>({});

  const upsertSessionAttendance: AppContextType['upsertSessionAttendance'] = async params => {
    clearDbError();
    const existingClosedSession = sessions.find(
      s =>
        s.activityId === params.activityId &&
        s.date?.slice(0, 10) === params.date.slice(0, 10) &&
        s.teacherId === params.teacherId
    );
    if (existingClosedSession?.isClosed) {
      const msg = t('appContext.classClosedReadOnlyError');
      setDbError(msg);
      return { success: false, error: msg };
    }

    const sessionKey = `${params.activityId}::${params.teacherId}::${params.date}`;
    const tempSessionId = `temp-ses-${sessionKey}`;
    const defaultTopic = params.topic?.trim() || '';
    const defaultDuration = params.durationMinutes || 75;

    const cleanDate = params.date.slice(0, 10);
    const absentStudentIdsForDate = new Set(
      studentAbsences
        .filter(
          a =>
            a.activityId === params.activityId &&
            a.sessionDate?.slice(0, 10) === cleanDate &&
            (a.status === 'reported' || a.status === 'approved')
        )
        .map(a => a.studentId)
    );

    // 1. Actualización optimista inmediata en estado local
    setSessions(prev => {
      const existingIdx = prev.findIndex(
        s =>
          s.activityId === params.activityId &&
          s.date === params.date &&
          s.teacherId === params.teacherId
      );

      if (existingIdx !== -1) {
        const current = prev[existingIdx];
        const prevRecords = current.attendanceRecords || [];
        const hasRec = prevRecords.some(r => r.studentId === params.studentId);
        const nextRecords = hasRec
          ? prevRecords.map(r =>
              r.studentId === params.studentId
                ? {
                    ...r,
                    attendance: params.attendance,
                    ...(params.paid !== undefined ? { paid: params.paid } : {}),
                    ...(params.paidAmount !== undefined ? { paidAmount: params.paidAmount } : {}),
                    ...(params.paymentMethod !== undefined ? { paymentMethod: params.paymentMethod } : {}),
                    ...(params.paymentId !== undefined ? { paymentId: params.paymentId } : {})
                  }
                : r
            )
          : [
              ...prevRecords,
              {
                studentId: params.studentId,
                studentName: params.studentName,
                attendance: params.attendance,
                paid: Boolean(params.paid),
                paidAmount: params.paidAmount,
                paymentMethod: params.paymentMethod || 'cash',
                paymentId: params.paymentId
              }
            ];

        const nextCount = nextRecords.filter(r => r.attendance !== 'absent').length;
        const updatedSession: ClassSession = {
          ...current,
          attendanceRecords: nextRecords,
          attendeesCount: nextCount
        };
        return prev.map((s, idx) => (idx === existingIdx ? updatedSession : s));
      }

      const initialRecords = (params.enrolledStudents && params.enrolledStudents.length > 0
        ? params.enrolledStudents
        : [{ id: params.studentId, name: params.studentName }]
      ).map(st => ({
        studentId: st.id,
        studentName: st.name,
        attendance: (st.id === params.studentId
          ? params.attendance
          : absentStudentIdsForDate.has(st.id)
          ? 'absent'
          : 'present') as 'present' | 'absent' | 'partial',
        paid: st.id === params.studentId ? Boolean(params.paid) : false,
        paidAmount: st.id === params.studentId ? params.paidAmount : undefined,
        paymentMethod: (st.id === params.studentId ? params.paymentMethod : 'cash') || 'cash',
        paymentId: st.id === params.studentId ? params.paymentId : undefined
      }));

      const newLocalSession: ClassSession = {
        id: tempSessionId,
        activityId: params.activityId,
        teacherId: params.teacherId,
        date: params.date,
        attendeesCount: initialRecords.filter(r => r.attendance !== 'absent').length,
        durationMinutes: defaultDuration,
        topic: defaultTopic,
        attendanceRecords: initialRecords
      };
      return [newLocalSession, ...prev];
    });

    // 2. Sincronización en Supabase serializada por clase/fecha para evitar sesiones duplicadas
    const ensureSessionId = async (): Promise<string | null> => {
      const localReal = sessions.find(
        s =>
          s.activityId === params.activityId &&
          s.date === params.date &&
          s.teacherId === params.teacherId &&
          !s.id.startsWith('temp-ses-')
      );
      if (localReal) return localReal.id;

      const { data: existingRow, error: lookupErr } = await supabase
        .from('class_sessions')
        .select('id')
        .eq('activity_id', params.activityId)
        .eq('teacher_id', params.teacherId)
        .eq('date', params.date)
        .limit(1)
        .maybeSingle();

      if (lookupErr) {
        handleSupabaseError(t('appContext.actions.findSession'), lookupErr);
        return null;
      }
      if (existingRow?.id) return existingRow.id;

      const initialAttendees =
        params.enrolledStudents && params.enrolledStudents.length > 0
          ? params.enrolledStudents.filter(st =>
              st.id === params.studentId
                ? params.attendance !== 'absent'
                : !absentStudentIdsForDate.has(st.id)
            ).length
          : params.attendance !== 'absent'
          ? 1
          : 0;

      const { data: insertedRow, error: insertErr } = await supabase
        .from('class_sessions')
        .insert([
          {
            activity_id: params.activityId,
            teacher_id: params.teacherId,
            date: params.date,
            attendees_count: initialAttendees,
            duration_minutes: defaultDuration,
            topic: defaultTopic || null
          }
        ])
        .select('id')
        .single();

      if (insertErr || !insertedRow?.id) {
        handleSupabaseError(t('appContext.actions.createAttendanceSession'), insertErr || new Error(t('appContext.noSessionId')));
        return null;
      }

      // Si había otros alumnos matriculados, inicializar sus filas respetando ausencias comunicadas/aprobadas
      if (params.enrolledStudents && params.enrolledStudents.length > 1) {
        const seedRows = params.enrolledStudents
          .filter(st => st.id !== params.studentId)
          .map(st => ({
            session_id: insertedRow.id,
            student_id: st.id,
            attendance: absentStudentIdsForDate.has(st.id) ? 'absent' : 'present',
            paid: false,
            paid_amount: 0,
            payment_method: 'cash',
            payment_id: null
          }));
        if (seedRows.length > 0) {
          await supabase.from('session_attendances').insert(seedRows);
        }
      }

      setSessions(prev =>
        prev.map(s => (s.id === tempSessionId ? { ...s, id: insertedRow.id } : s))
      );
      return insertedRow.id;
    };

    try {
      const pendingLock = sessionSyncLockRef.current[sessionKey];
      const resolveSessionPromise = (pendingLock
        ? pendingLock.catch(() => null).then(() => ensureSessionId())
        : ensureSessionId());
      sessionSyncLockRef.current[sessionKey] = resolveSessionPromise;

      const realSessionId = await resolveSessionPromise;
      if (!realSessionId) {
        return { success: false, error: t('appContext.sessionObtainError') };
      }

      const { data: existingAtt, error: attLookupErr } = await supabase
        .from('session_attendances')
        .select('id')
        .eq('session_id', realSessionId)
        .eq('student_id', params.studentId)
        .limit(1)
        .maybeSingle();

      if (attLookupErr) {
        handleSupabaseError(t('appContext.actions.queryAttendance'), attLookupErr);
        return { success: false, error: attLookupErr.message };
      }

      if (existingAtt?.id) {
        const updateFields: Record<string, any> = {
          attendance: params.attendance
        };
        if (params.paid !== undefined) updateFields.paid = params.paid;
        if (params.paidAmount !== undefined) updateFields.paid_amount = params.paidAmount;
        if (params.paymentMethod !== undefined) updateFields.payment_method = params.paymentMethod;
        if (params.paymentId !== undefined) updateFields.payment_id = params.paymentId || null;

        const { error: updateAttErr } = await supabase
          .from('session_attendances')
          .update(updateFields)
          .eq('id', existingAtt.id);
        if (updateAttErr) {
          handleSupabaseError(t('appContext.actions.updateAttendance'), updateAttErr);
          return { success: false, error: updateAttErr.message };
        }
      } else {
        const { error: insertAttErr } = await supabase
          .from('session_attendances')
          .insert([
            {
              session_id: realSessionId,
              student_id: params.studentId,
              attendance: params.attendance,
              paid: Boolean(params.paid),
              paid_amount: params.paidAmount || 0,
              payment_method: params.paymentMethod || 'cash',
              payment_id: params.paymentId || null
            }
          ]);
        if (insertAttErr) {
          handleSupabaseError(t('appContext.actions.recordAttendance'), insertAttErr);
          return { success: false, error: insertAttErr.message };
        }
      }

      // Recalcular attendees_count en class_sessions desde session_attendances
      const { data: allSessionAtts } = await supabase
        .from('session_attendances')
        .select('attendance')
        .eq('session_id', realSessionId);

      if (allSessionAtts) {
        const nextAttendeesCount = allSessionAtts.filter(r => r.attendance !== 'absent').length;
        await supabase
          .from('class_sessions')
          .update({ attendees_count: nextAttendeesCount })
          .eq('id', realSessionId);
      }

      return { success: true };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.syncAttendance'), err);
      return { success: false, error: err?.message || t('appContext.saveAttendanceError') };
    }
  };

  // Clases Impartidas y Asistencias
  const addClassSession = async (session: Omit<ClassSession, 'id'>) => {
    clearDbError();
    const sessionKey = `${session.activityId}::${session.teacherId}::${session.date}`;
    const normalizedTopic = session.topic?.trim() || '';
    const existingLocal = sessions.find(
      s =>
        s.activityId === session.activityId &&
        s.teacherId === session.teacherId &&
        s.date === session.date
    );

    if (existingLocal?.isClosed) {
      if (session.isClosed === false) {
        if (!session.reopenReason?.trim()) {
          setDbError(t('appContext.reopenReasonRequired'));
          return;
        }
      } else {
        setDbError(t('appContext.classClosedReadOnlyError'));
        return;
      }
    }

    const resolvedIsClosed =
      session.isClosed !== undefined ? session.isClosed : existingLocal?.isClosed;
    const resolvedClosedAt =
      resolvedIsClosed === true
        ? session.closedAt || existingLocal?.closedAt || new Date().toISOString()
        : resolvedIsClosed === false
        ? undefined
        : existingLocal?.closedAt;
    const resolvedClosedBy =
      resolvedIsClosed === true
        ? session.closedBy ||
          existingLocal?.closedBy ||
          (currentRole === UserRole.Admin ? 'administrador' : 'profesor')
        : resolvedIsClosed === false
        ? undefined
        : existingLocal?.closedBy;
    const resolvedClosedByUserId =
      resolvedIsClosed === true
        ? session.closedByUserId || existingLocal?.closedByUserId || currentUser?.id
        : resolvedIsClosed === false
        ? undefined
        : existingLocal?.closedByUserId;
    const resolvedReopenReason =
      resolvedIsClosed === false
        ? session.reopenReason?.trim() || existingLocal?.reopenReason
        : session.reopenReason ?? existingLocal?.reopenReason;
    const resolvedReopenedAt =
      resolvedIsClosed === false
        ? session.reopenedAt || new Date().toISOString()
        : session.reopenedAt ?? existingLocal?.reopenedAt;
    const resolvedReopenedBy =
      resolvedIsClosed === false
        ? session.reopenedBy ||
          (currentRole === UserRole.Admin ? 'administrador' : 'profesor')
        : session.reopenedBy ?? existingLocal?.reopenedBy;

    // Actualización optimista inmediata en estado local para evitar desfase visual al cambiar o guardar notas
    setSessions(prev => {
      const existingIdx = prev.findIndex(
        s =>
          s.activityId === session.activityId &&
          s.teacherId === session.teacherId &&
          s.date === session.date
      );
      if (existingIdx !== -1) {
        return prev.map((s, idx) =>
          idx === existingIdx
            ? {
                ...s,
                attendeesCount: session.attendeesCount,
                durationMinutes: session.durationMinutes,
                topic: normalizedTopic,
                isClosed: resolvedIsClosed,
                closedAt: resolvedClosedAt,
                closedBy: resolvedClosedBy,
                closedByUserId: resolvedClosedByUserId,
                reopenReason: resolvedReopenReason,
                reopenedAt: resolvedReopenedAt,
                reopenedBy: resolvedReopenedBy,
                attendanceRecords: session.attendanceRecords
              }
            : s
        );
      }
      return [
        {
          id: `temp-ses-${sessionKey}`,
          ...session,
          topic: normalizedTopic,
          isClosed: resolvedIsClosed,
          closedAt: resolvedClosedAt,
          closedBy: resolvedClosedBy,
          closedByUserId: resolvedClosedByUserId,
          reopenReason: resolvedReopenReason,
          reopenedAt: resolvedReopenedAt,
          reopenedBy: resolvedReopenedBy
        },
        ...prev
      ];
    });

    const pendingLock = sessionSyncLockRef.current[sessionKey];
    if (pendingLock) {
      await pendingLock.catch(() => null);
    }

    const { data: existingSession } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('activity_id', session.activityId)
      .eq('teacher_id', session.teacherId)
      .eq('date', session.date)
      .limit(1)
      .maybeSingle();

    const baseSessionDb = {
      activity_id: session.activityId,
      teacher_id: session.teacherId,
      date: session.date,
      attendees_count: session.attendeesCount,
      duration_minutes: session.durationMinutes,
      topic: normalizedTopic || null
    };
    const sessionDbBasicClose =
      resolvedIsClosed !== undefined
        ? {
            ...baseSessionDb,
            is_closed: resolvedIsClosed,
            closed_at: resolvedIsClosed ? resolvedClosedAt || new Date().toISOString() : null
          }
        : baseSessionDb;
    const sessionDbWithCloseAudit =
      resolvedIsClosed !== undefined
        ? {
            ...sessionDbBasicClose,
            closed_by: resolvedIsClosed ? resolvedClosedBy || null : null,
            closed_by_user_id:
              resolvedIsClosed && resolvedClosedBy !== 'automatica'
                ? resolvedClosedByUserId || null
                : null,
            ...(resolvedIsClosed === false
              ? {
                  reopen_reason: resolvedReopenReason || null,
                  reopened_at: resolvedReopenedAt || new Date().toISOString(),
                  reopened_by: resolvedReopenedBy || null
                }
              : {})
          }
        : baseSessionDb;

    let targetSessionId = existingSession?.id || '';

    if (targetSessionId) {
      let { error: updateErr } = await supabase
        .from('class_sessions')
        .update(sessionDbWithCloseAudit)
        .eq('id', targetSessionId);
      if (
        updateErr &&
        (updateErr.code === '42703' || updateErr.message?.includes('column'))
      ) {
        const basicRes = await supabase
          .from('class_sessions')
          .update(sessionDbBasicClose)
          .eq('id', targetSessionId);
        updateErr = basicRes.error;
        if (
          updateErr &&
          (updateErr.code === '42703' || updateErr.message?.includes('column'))
        ) {
          const fallbackUpdate = await supabase
            .from('class_sessions')
            .update(baseSessionDb)
            .eq('id', targetSessionId);
          updateErr = fallbackUpdate.error;
        }
      }
      if (updateErr) {
        handleSupabaseError(t('appContext.actions.updateSession'), updateErr);
        return;
      }
      await supabase.from('session_attendances').delete().eq('session_id', targetSessionId);
    } else {
      let { data: newSessionRow, error: sessionErr } = await supabase
        .from('class_sessions')
        .insert([sessionDbWithCloseAudit])
        .select()
        .single();

      if (
        sessionErr &&
        (sessionErr.code === '42703' || sessionErr.message?.includes('column'))
      ) {
        const basicInsert = await supabase
          .from('class_sessions')
          .insert([sessionDbBasicClose])
          .select()
          .single();
        newSessionRow = basicInsert.data;
        sessionErr = basicInsert.error;
        if (
          sessionErr &&
          (sessionErr.code === '42703' || sessionErr.message?.includes('column'))
        ) {
          const fallbackInsert = await supabase
            .from('class_sessions')
            .insert([baseSessionDb])
            .select()
            .single();
          newSessionRow = fallbackInsert.data;
          sessionErr = fallbackInsert.error;
        }
      }

      if (sessionErr) {
        handleSupabaseError(t('appContext.actions.createSession'), sessionErr);
        return;
      }
      targetSessionId = newSessionRow?.id || '';
    }

    if (targetSessionId && session.attendanceRecords && session.attendanceRecords.length > 0) {
      const attendanceDb = session.attendanceRecords.map(rec => ({
        session_id: targetSessionId,
        student_id: rec.studentId,
        attendance: rec.attendance,
        paid: rec.paid,
        paid_amount: rec.paidAmount || 0,
        payment_method: rec.paymentMethod || 'cash',
        payment_id: rec.paymentId || null
      }));
      await supabase.from('session_attendances').insert(attendanceDb);
    }

    await refreshFromSupabase();
  };

  const closeClassSession: AppContextType['closeClassSession'] = async params => {
    clearDbError();
    const nowIso = new Date().toISOString();
    const existingLocal =
      (params.sessionId ? sessions.find(s => s.id === params.sessionId) : undefined) ||
      sessions.find(
        s =>
          s.activityId === params.activityId &&
          s.teacherId === params.teacherId &&
          s.date === params.date
      );

    if (existingLocal?.isClosed) {
      return { success: true };
    }

    if (!existingLocal || params.attendanceRecords !== undefined) {
      await addClassSession({
        activityId: params.activityId,
        teacherId: params.teacherId,
        date: params.date,
        attendeesCount: params.attendeesCount ?? existingLocal?.attendeesCount ?? 0,
        durationMinutes: params.durationMinutes ?? existingLocal?.durationMinutes ?? 75,
        topic: params.topic ?? existingLocal?.topic ?? '',
        isClosed: true,
        closedAt: nowIso,
        closedBy: params.closedBy,
        closedByUserId: params.closedBy === 'automatica' ? undefined : currentUser?.id,
        attendanceRecords: params.attendanceRecords ?? existingLocal?.attendanceRecords
      });
      return { success: true };
    }

    setSessions(prev =>
      prev.map(s =>
        s.id === existingLocal.id
          ? {
              ...s,
              isClosed: true,
              closedAt: nowIso,
              closedBy: params.closedBy,
              closedByUserId: params.closedBy === 'automatica' ? undefined : currentUser?.id
            }
          : s
      )
    );

    const basicPayload = {
      is_closed: true,
      closed_at: nowIso
    };
    const auditPayload = {
      ...basicPayload,
      closed_by: params.closedBy,
      closed_by_user_id: params.closedBy === 'automatica' ? null : currentUser?.id || null
    };

    let { error } = await supabase
      .from('class_sessions')
      .update(auditPayload)
      .eq('id', existingLocal.id);

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      const fallback = await supabase
        .from('class_sessions')
        .update(basicPayload)
        .eq('id', existingLocal.id);
      error = fallback.error;
    }

    if (error) {
      handleSupabaseError(t('appContext.actions.closeSession'), error);
      return { success: false, error: error.message };
    }

    await refreshFromSupabase();
    return { success: true };
  };

  const reopenClassSession: AppContextType['reopenClassSession'] = async params => {
    clearDbError();
    const trimmedReason = (params.reason || '').trim();
    if (!trimmedReason) {
      const msg = t('appContext.reopenReasonRequired');
      setDbError(msg);
      return { success: false, error: msg };
    }

    const nowIso = new Date().toISOString();
    const existingLocal =
      (params.sessionId ? sessions.find(s => s.id === params.sessionId) : undefined) ||
      sessions.find(
        s =>
          s.activityId === params.activityId &&
          s.teacherId === params.teacherId &&
          s.date === params.date
      );

    if (!existingLocal) {
      return { success: false, error: t('appContext.sessionObtainError') };
    }

    setSessions(prev =>
      prev.map(s =>
        s.id === existingLocal.id
          ? {
              ...s,
              isClosed: false,
              closedAt: undefined,
              closedBy: undefined,
              closedByUserId: undefined,
              reopenReason: trimmedReason,
              reopenedAt: nowIso,
              reopenedBy: params.reopenedBy
            }
          : s
      )
    );

    const basicPayload = {
      is_closed: false,
      closed_at: null
    };
    const auditPayload = {
      ...basicPayload,
      closed_by: null,
      closed_by_user_id: null,
      reopen_reason: trimmedReason,
      reopened_at: nowIso,
      reopened_by: params.reopenedBy
    };

    let { error } = await supabase
      .from('class_sessions')
      .update(auditPayload)
      .eq('id', existingLocal.id);

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      const fallback = await supabase
        .from('class_sessions')
        .update(basicPayload)
        .eq('id', existingLocal.id);
      error = fallback.error;
    }

    if (error) {
      handleSupabaseError(t('appContext.actions.reopenSession'), error);
      return { success: false, error: error.message };
    }

    await refreshFromSupabase();
    return { success: true };
  };

  const deleteClassSession = async (id: string) => {
    clearDbError();
    const target = sessions.find(s => s.id === id);
    if (target?.isClosed) {
      setDbError(t('appContext.classClosedReadOnlyError'));
      return;
    }
    const { error } = await supabase.from('class_sessions').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteSession'), error);
      return;
    }
    setSessions(prev => prev.filter(s => s.id !== id));
    await refreshFromSupabase();
  };

  // Cierre automático de clases tras el retraso configurable en app_config
  const autoCloseInFlightRef = useRef(false);
  const lastAutoCloseRunAtRef = useRef(0);
  const autoCloseContextRef = useRef({
    appConfigs,
    sessions,
    activities,
    students,
    currentUser,
    currentRole,
    currentTeacherId
  });
  autoCloseContextRef.current = {
    appConfigs,
    sessions,
    activities,
    students,
    currentUser,
    currentRole,
    currentTeacherId
  };

  const autoCloseCfg = useMemo(() => parseClassAutoCloseConfig(appConfigs), [appConfigs]);

  useEffect(() => {
    if (dbSyncVersion === 0) return;
    if (!autoCloseCfg.enabled) return;
    if (!currentUser) return;

    const runAutoClose = async () => {
      if (autoCloseInFlightRef.current) return;

      const ctx = autoCloseContextRef.current;
      const cfg = parseClassAutoCloseConfig(ctx.appConfigs);
      if (!cfg.enabled || !ctx.currentUser) return;

      const isAdminUser = ctx.currentUser.role === UserRole.Admin;
      const effectiveTeacherId =
        ctx.currentUser.teacherId ||
        (ctx.currentRole === UserRole.Monitor || ctx.currentRole === UserRole.Hibrido
          ? ctx.currentTeacherId
          : '');
      const isTeacherUser =
        !isAdminUser &&
        Boolean(effectiveTeacherId) &&
        (ctx.currentUser.role === UserRole.Monitor ||
          ctx.currentUser.role === UserRole.Hibrido ||
          ctx.currentRole === UserRole.Monitor ||
          ctx.currentRole === UserRole.Hibrido);

      if (!isAdminUser && !isTeacherUser) return;

      const now = new Date();
      const nowIso = now.toISOString();

      const openCandidates = ctx.sessions.filter(ses => {
        const act = ctx.activities.find(a => a.id === ses.activityId);
        if (
          !shouldAutoCloseSession({
            session: ses,
            activity: act,
            delayHours: cfg.delayHours,
            now
          })
        ) {
          return false;
        }
        if (isAdminUser) return true;
        return Boolean(effectiveTeacherId && ses.teacherId === effectiveTeacherId);
      });

      const overdueUnrecordedDrafts = getOverdueUnrecordedScheduledSessions({
        activities: ctx.activities,
        sessions: ctx.sessions,
        students: ctx.students,
        delayHours: cfg.delayHours,
        isAdminUser,
        effectiveTeacherId,
        now
      });

      lastAutoCloseRunAtRef.current = Date.now();
      if (openCandidates.length === 0 && overdueUnrecordedDrafts.length === 0) return;

      autoCloseInFlightRef.current = true;
      const closedIdsConfirmed = new Set<string>();
      const upsertedNewSessions: ClassSession[] = [];

      const isColumnOrCheckError = (err: { code?: string; message?: string } | null) =>
        Boolean(
          err &&
            (err.code === '42703' ||
              err.code === 'PGRST204' ||
              err.code === '23514' ||
              err.message?.includes('column') ||
              err.message?.includes('closed_by'))
        );

      const closeExistingRowWithFallback = async (sessionId: string): Promise<boolean> => {
        let { error } = await supabase
          .from('class_sessions')
          .update({
            is_closed: true,
            closed_at: nowIso,
            closed_by: 'automatica',
            closed_by_user_id: null
          })
          .eq('id', sessionId);

        if (error && isColumnOrCheckError(error)) {
          const midRes = await supabase
            .from('class_sessions')
            .update({
              is_closed: true,
              closed_at: nowIso,
              closed_by: 'automatica'
            })
            .eq('id', sessionId);
          error = midRes.error;

          if (error && isColumnOrCheckError(error)) {
            const basicRes = await supabase
              .from('class_sessions')
              .update({
                is_closed: true,
                closed_at: nowIso
              })
              .eq('id', sessionId);
            error = basicRes.error;
          }
        }

        if (error) {
          console.warn(`Auto-close class_sessions (${sessionId}) warning:`, error.message);
          return false;
        }
        return true;
      };

      try {
        // 1. Cerrar sesiones ya existentes que siguen abiertas tras superar el plazo
        if (openCandidates.length > 0) {
          const candidateIds = openCandidates.map(c => c.id);
          let { error } = await supabase
            .from('class_sessions')
            .update({
              is_closed: true,
              closed_at: nowIso,
              closed_by: 'automatica',
              closed_by_user_id: null
            })
            .in('id', candidateIds);

          if (error && isColumnOrCheckError(error)) {
            const midRes = await supabase
              .from('class_sessions')
              .update({
                is_closed: true,
                closed_at: nowIso,
                closed_by: 'automatica'
              })
              .in('id', candidateIds);
            error = midRes.error;

            if (error && isColumnOrCheckError(error)) {
              const basicRes = await supabase
                .from('class_sessions')
                .update({
                  is_closed: true,
                  closed_at: nowIso
                })
                .in('id', candidateIds);
              error = basicRes.error;
            }
          }

          if (!error) {
            candidateIds.forEach(id => closedIdsConfirmed.add(id));
          } else {
            // Si el lote falla por RLS o fila concreta, reintentar individualmente para cerrar las válidas
            for (const id of candidateIds) {
              const ok = await closeExistingRowWithFallback(id);
              if (ok) closedIdsConfirmed.add(id);
            }
          }
        }

        // 2. Registrar y cerrar sesiones programadas vencidas sin fila previa en class_sessions
        for (const draft of overdueUnrecordedDrafts) {
          const baseRow = {
            activity_id: draft.activityId,
            teacher_id: draft.teacherId,
            date: draft.date,
            attendees_count: 0,
            duration_minutes: draft.durationMinutes,
            topic: null,
            is_closed: true,
            closed_at: nowIso
          };

          let { data: insertedRow, error: insertErr } = await supabase
            .from('class_sessions')
            .insert([
              {
                ...baseRow,
                closed_by: 'automatica',
                closed_by_user_id: null
              }
            ])
            .select('*')
            .single();

          if (insertErr && isColumnOrCheckError(insertErr)) {
            const midInsert = await supabase
              .from('class_sessions')
              .insert([{ ...baseRow, closed_by: 'automatica' }])
              .select('*')
              .single();
            insertedRow = midInsert.data;
            insertErr = midInsert.error;

            if (insertErr && isColumnOrCheckError(insertErr)) {
              const basicInsert = await supabase
                .from('class_sessions')
                .insert([baseRow])
                .select('*')
                .single();
              insertedRow = basicInsert.data;
              insertErr = basicInsert.error;
            }
          }

          if (insertErr && insertErr.code === '23505') {
            const { data: existingDbRow } = await supabase
              .from('class_sessions')
              .select('*')
              .eq('activity_id', draft.activityId)
              .eq('date', draft.date)
              .limit(1)
              .maybeSingle();
            if (existingDbRow?.id) {
              if (existingDbRow.is_closed !== true) {
                const ok = await closeExistingRowWithFallback(existingDbRow.id);
                if (ok) {
                  upsertedNewSessions.push({
                    ...mapDbSessionToSession(existingDbRow, []),
                    isClosed: true,
                    closedAt: nowIso,
                    closedBy: 'automatica',
                    closedByUserId: undefined
                  });
                }
              } else {
                upsertedNewSessions.push(mapDbSessionToSession(existingDbRow, []));
              }
            }
            continue;
          }

          if (insertErr) {
            console.warn(
              `Auto-close scheduled session (${draft.activityId} @ ${draft.date}) warning:`,
              insertErr.message
            );
            continue;
          }

          if (insertedRow) {
            upsertedNewSessions.push(mapDbSessionToSession(insertedRow, []));
          }
        }

        if (closedIdsConfirmed.size > 0 || upsertedNewSessions.length > 0) {
          setSessions(prev => {
            let next = prev.map(s =>
              closedIdsConfirmed.has(s.id)
                ? {
                    ...s,
                    isClosed: true,
                    closedAt: nowIso,
                    closedBy: 'automatica' as const,
                    closedByUserId: undefined
                  }
                : s
            );
            for (const created of upsertedNewSessions) {
              const existingIdx = next.findIndex(
                s =>
                  s.id === created.id ||
                  (s.activityId === created.activityId &&
                    s.date?.slice(0, 10) === created.date?.slice(0, 10))
              );
              if (existingIdx !== -1) {
                next = next.map((s, idx) => (idx === existingIdx ? created : s));
              } else {
                next = [created, ...next];
              }
            }
            return next;
          });
        }
      } catch (err) {
        console.warn('Auto-close error:', err);
      } finally {
        autoCloseInFlightRef.current = false;
      }
    };

    void runAutoClose();

    // Comprobación ligera: al volver a la pestaña (mínimo cada 30 min) o cada 1 hora si permanece abierta
    const AUTO_CLOSE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
    const VISIBILITY_THROTTLE_MS = 30 * 60 * 1000;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastAutoCloseRunAtRef.current >= VISIBILITY_THROTTLE_MS) {
          void runAutoClose();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      void runAutoClose();
    }, AUTO_CLOSE_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [dbSyncVersion, currentUser?.id, autoCloseCfg.enabled, autoCloseCfg.delayHours]);

  // Gestión automática de notas vinculadas a talleres finalizados tras el margen configurado en app_config
  const newsGraceCfg = useMemo(
    () => parseNewsFinishedWorkshopGraceConfig(appConfigs),
    [appConfigs]
  );
  const newsGraceRef = useRef({
    newsNotes,
    activities,
    readNewsNoteIds,
    newsGraceCfg,
    isStrictAdminSession,
    currentUser
  });
  newsGraceRef.current = {
    newsNotes,
    activities,
    readNewsNoteIds,
    newsGraceCfg,
    isStrictAdminSession,
    currentUser
  };

  useEffect(() => {
    if (dbSyncVersion === 0) return;
    if (!currentUser?.id) return;

    const runNewsWorkshopGraceCheck = async () => {
      const ctx = newsGraceRef.current;
      if (!ctx.currentUser?.id) return;
      const now = new Date();
      const endedAtMap = getStoredActivityEndedAtMap();

      for (const note of ctx.newsNotes) {
        if (note.isDeleted || note.deletedAt) continue;

        if (isNewsNoteExpiredByDate(note.expiresAt, now)) {
          if (ctx.isStrictAdminSession) {
            await deleteNewsNote(note.id);
          }
          continue;
        }

        if (!ctx.newsGraceCfg.enabled || !note.activityId) continue;
        const linkedActivity = ctx.activities.find(a => a.id === note.activityId);
        const evaluation = evaluateWorkshopNoteGraceStatus({
          note,
          activity: linkedActivity,
          config: ctx.newsGraceCfg,
          endedAtFallbackMap: endedAtMap,
          now
        });
        if (!evaluation.isExpired) continue;

        if (ctx.newsGraceCfg.action === 'mark_read') {
          if (!ctx.readNewsNoteIds.includes(note.id)) {
            await markNewsNoteRead(note.id, true);
          }
        } else if (ctx.newsGraceCfg.action === 'delete' && ctx.isStrictAdminSession) {
          await deleteNewsNote(note.id);
        }
      }
    };

    void runNewsWorkshopGraceCheck();
    const intervalId = window.setInterval(() => {
      void runNewsWorkshopGraceCheck();
    }, 15 * 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    dbSyncVersion,
    currentUser?.id,
    isStrictAdminSession,
    newsGraceCfg.enabled,
    newsGraceCfg.graceHours,
    newsGraceCfg.action,
    activities,
    newsNotes
  ]);

  // Gastos
  const addExpense = async (expense: Omit<CenterExpense, 'id'>) => {
    clearDbError();
    const dbPayload = mapExpenseToDb(expense);
    const { data, error } = await supabase.from('center_expenses').insert([dbPayload]).select().single();
    if (error) {
      handleSupabaseError(t('appContext.actions.recordExpense'), error);
      return;
    }
    if (data) {
      setExpenses(prev => [mapDbExpenseToExpense(data), ...prev]);
    }
    await refreshFromSupabase();
  };

  const deleteExpense = async (id: string) => {
    clearDbError();
    const { error } = await supabase.from('center_expenses').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteExpense'), error);
      return;
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
    await refreshFromSupabase();
  };

  // Liquidaciones
  const settleTeacherPayout = async (
    teacherId: string,
    periodMonth: string,
    amountToPay: number,
    method: PaymentMethod,
    notes?: string
  ) => {
    clearDbError();
    const summary = teacherSummaries.find(s => s.teacher.id === teacherId);
    const dbPayload = mapPayoutToDb({
      id: '',
      teacherId,
      periodMonth,
      calculatedAmount: summary?.calculatedDue || amountToPay,
      classesCount: summary?.classesCount || 0,
      studentsCount: summary?.studentsCount || 0,
      collectedInHandByTeacher: summary?.collectedInHand || 0,
      balancePending: 0,
      totalSettled: amountToPay,
      status: 'settled',
      settledDate: new Date().toISOString().split('T')[0],
      paymentMethod: method,
      notes: notes || t('appContext.notes.monthlyPayoutSettled')
    });

    const { error } = await supabase.from('teacher_payouts').insert([dbPayload]);
    if (error) {
      handleSupabaseError(t('appContext.actions.recordPayout'), error);
      return;
    }
    await refreshFromSupabase();
  };

  // Sembrador / Inicializador de datos en Supabase si la base de datos está vacía
  const seedInitialDataToSupabase = async () => {
    clearDbError();
    setIsLoadingDb(true);
    try {
      const teachersPayload = INITIAL_TEACHERS.map(teacherItem => ({
        name: teacherItem.name,
        email: teacherItem.email,
        phone: teacherItem.phone,
        avatar_url: teacherItem.avatarUrl || teacherItem.avatar,
        payment_scheme: teacherItem.paymentScheme,
        rate_per_class: teacherItem.ratePerClass,
        fixed_monthly_rate: teacherItem.fixedMonthlyRate,
        revenue_share_percent: teacherItem.revenueSharePercent,
        preferred_payment_method: teacherItem.preferredPaymentMethod,
        collection_type: teacherItem.collectionType || 'personal',
        bank_account: teacherItem.bankAccount,
        active: teacherItem.active,
        notes: teacherItem.notes
      }));
      const { data: createdTeachers, error: tErr } = await supabase.from('teachers').insert(teachersPayload).select();
      if (tErr) throw tErr;

      const tMap: Record<string, string> = {};
      createdTeachers?.forEach((ct, idx) => {
        tMap[INITIAL_TEACHERS[idx].id] = ct.id;
      });

      const activitiesPayload = INITIAL_ACTIVITIES.map(a => ({
        name: a.name,
        description: a.description,
        teacher_id: tMap[a.teacherId] || createdTeachers?.[0]?.id,
        category: a.category,
        color: a.color,
        schedule: a.schedule,
        default_price_monthly: a.defaultPriceMonthly,
        default_price_per_class: a.defaultPricePerClass,
        billing_mode: a.billingMode,
        bizum_enabled: a.bizum_enabled,
        bizum_phone: a.bizum_phone,
        bizum_concept: a.bizum_concept,
        room: a.room,
        active: a.active
      }));
      const { data: createdActivities, error: aErr } = await supabase.from('activities').insert(activitiesPayload).select();
      if (aErr) throw aErr;

      const aMap: Record<string, string> = {};
      createdActivities?.forEach((ca, idx) => {
        aMap[INITIAL_ACTIVITIES[idx].id] = ca.id;
      });

      const studentsPayload = INITIAL_STUDENTS.map(s => ({
        name: s.name,
        email: s.email,
        phone: s.phone,
        status: s.status,
        registered_at: s.registeredAt,
        notes: s.notes
      }));
      const { data: createdStudents, error: sErr } = await supabase.from('students').insert(studentsPayload).select();
      if (sErr) throw sErr;

      const enrollmentsPayload: any[] = [];
      INITIAL_STUDENTS.forEach((origS, sIdx) => {
        const newStudentId = createdStudents?.[sIdx]?.id;
        if (newStudentId && origS.activities) {
          origS.activities.forEach(enr => {
            const newActId = aMap[enr.activityId];
            if (newActId) {
              enrollmentsPayload.push({
                student_id: newStudentId,
                activity_id: newActId,
                custom_price: enr.customPrice || null,
                billing_mode: enr.billingMode || 'monthly',
                enrolled_since: enr.enrolledSince
              });
            }
          });
        }
      });
      if (enrollmentsPayload.length > 0) {
        await supabase.from('student_enrollments').insert(enrollmentsPayload);
      }

      const expensesPayload = INITIAL_EXPENSES.map(e => ({
        title: e.title,
        category: e.category,
        amount: e.amount,
        date: e.date,
        period_month: e.periodMonth,
        payment_method: e.paymentMethod,
        status: e.status,
        invoice_number: e.invoiceNumber,
        notes: e.notes
      }));
      await supabase.from('center_expenses').insert(expensesPayload);

      await refreshFromSupabase();
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.seedInitialData'), err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  const resetToInitialData = async () => {
    await seedInitialDataToSupabase();
  };

  // Exportar a CSV
  const exportToCSV = (type: 'payments' | 'students' | 'expenses' | 'teachers') => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    let filename = `triskell_${type}_${selectedPeriod}.csv`;

    if (type === 'payments') {
      csvContent += t('appContext.csv.paymentsHeader');
      periodPayments.forEach(p => {
        csvContent += `"${p.receiptNumber}","${p.studentName}","${p.activityName}","${p.periodMonth}",${p.amount},"${p.status}","${p.paymentDate || ''}","${p.paymentMethod}","${p.collectedByTeacher ? t('appContext.csv.yes') : t('appContext.csv.no')}"\n`;
      });
    } else if (type === 'students') {
      csvContent += t('appContext.csv.studentsHeader');
      students.forEach(s => {
        csvContent += `"${s.name}","${s.email}","${s.phone}","${s.status}","${s.registeredAt}"\n`;
      });
    } else if (type === 'expenses') {
      csvContent += t('appContext.csv.expensesHeader');
      expenses.filter(e => e.periodMonth === selectedPeriod).forEach(e => {
        csvContent += `"${e.title}","${e.category}",${e.amount},"${e.date}","${e.periodMonth}","${e.paymentMethod}","${e.invoiceNumber || ''}"\n`;
      });
    } else if (type === 'teachers') {
      csvContent += t('appContext.csv.teachersHeader');
      teachers.forEach(teacherItem => {
        csvContent += `"${teacherItem.name}","${teacherItem.email}","${teacherItem.phone}","${teacherItem.paymentScheme}",${teacherItem.ratePerClass},${teacherItem.fixedMonthlyRate},${teacherItem.revenueSharePercent}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==============================================================================
  // CÁLCULOS DINÁMICOS DEL PERÍODO MENSUAL
  // ==============================================================================

  const periodPayments = useMemo(() => {
    return payments.filter(p => p.periodMonth === selectedPeriod);
  }, [payments, selectedPeriod]);

  const totalIncomeCollected = useMemo(() => {
    return periodPayments
      .filter(p => p.status === 'paid' || p.status === 'partial')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [periodPayments]);

  const totalIncomePending = useMemo(() => {
    return periodPayments
      .filter(p => p.status === 'pending' || p.status === 'overdue')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [periodPayments]);

  const totalExpenses = useMemo(() => {
    return expenses
      .filter(e => e.periodMonth === selectedPeriod && e.status === 'paid')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, selectedPeriod]);

  const teacherSummaries = useMemo<TeacherFinancialSummary[]>(() => {
    return teachers.map(teacher => {
      const teacherActivities = activities.filter(a => a.teacherId === teacher.id);
      const activityIds = teacherActivities.map(a => a.id);

      const teacherSessions = sessions.filter(
        s =>
          s.teacherId === teacher.id &&
          s.date.startsWith(selectedPeriod) &&
          !(
            s.closedBy === 'automatica' &&
            s.attendeesCount === 0 &&
            (!s.attendanceRecords || s.attendanceRecords.length === 0)
          )
      );
      const classesCount = teacherSessions.length;

      const enrolledStudentIds = new Set<string>();
      students.forEach(s => {
        if (s.activities.some(act => activityIds.includes(act.activityId))) {
          enrolledStudentIds.add(s.id);
        }
      });
      const studentsCount = enrolledStudentIds.size;

      const teacherPeriodPayments = periodPayments.filter(p => activityIds.includes(p.activityId));
      const grossActivityRevenue = teacherPeriodPayments
        .filter(p => p.status === 'paid' || p.status === 'partial')
        .reduce((sum, p) => sum + p.amount, 0);

      let calculatedDue = 0;
      switch (teacher.paymentScheme) {
        case 'per_class':
          calculatedDue = classesCount * teacher.ratePerClass;
          break;
        case 'monthly_fixed':
          calculatedDue = teacher.fixedMonthlyRate;
          break;
        case 'revenue_share':
          calculatedDue = grossActivityRevenue * (teacher.revenueSharePercent / 100);
          break;
      }

      const collectedInHand = teacherPeriodPayments
        .filter(p => (p.status === 'paid' || p.status === 'partial') && p.collectedByTeacher)
        .reduce((sum, p) => sum + p.amount, 0);

      const teacherPeriodPayouts = payouts.filter(
        p => p.teacherId === teacher.id && p.periodMonth === selectedPeriod && p.status === 'settled'
      );
      const alreadySettled = teacherPeriodPayouts.reduce((sum, p) => sum + p.totalSettled, 0);

      const balanceToPay = Math.max(0, calculatedDue - collectedInHand - alreadySettled);

      let status: 'settled' | 'pending' | 'surplus' = 'pending';
      if (balanceToPay === 0) {
        status = 'settled';
      } else if (collectedInHand > calculatedDue) {
        status = 'surplus';
      }

      return {
        teacher,
        classesCount,
        studentsCount,
        grossActivityRevenue,
        calculatedDue,
        collectedInHand,
        alreadySettled,
        balanceToPay,
        status
      };
    });
  }, [teachers, activities, students, sessions, periodPayments, selectedPeriod, payouts]);

  const totalTeacherCosts = useMemo(() => {
    return teacherSummaries.reduce((acc, s) => acc + s.calculatedDue, 0);
  }, [teacherSummaries]);

  const netMonthlyBalance = useMemo(() => {
    return totalIncomeCollected - totalExpenses - totalTeacherCosts;
  }, [totalIncomeCollected, totalExpenses, totalTeacherCosts]);

  return (
    <AppContext.Provider
      value={{
        selectedPeriod,
        setSelectedPeriod,
        goToPrevPeriod,
        goToNextPeriod,
        goToCurrentPeriod,
        currentRole,
        setCurrentRole,
        currentTeacherId,
        setCurrentTeacherId,
        currentStudentId,
        setCurrentStudentId,
        currentUser,
        setCurrentUser,
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
        isAuthLoading,
        isLoadingDb,
        dbError,
        authDenialKind,
        clearDbError,
        refreshFromSupabase,
        seedInitialDataToSupabase,
        profiles,
        createUserByAdmin,
        updateUserRole,
        updateUserProfileByAdmin,
        toggleUserSocioMembership,
        toggleUserAccessStatus,
        saveUserPermissionDrafts,
        approvePendingUserAccess,
        rejectOrBlockUserAccess,
        deleteUserAccess,
        promoteOrUpdateMemberRole,
        teachers,
        activities,
        students,
        studentAbsences,
        reportStudentAbsence,
        cancelStudentAbsence,
        respondToStudentAbsenceRequest,
        memberStatusHistory,
        addStatusHistoryEntry,
        deleteStatusHistoryEntry,
        payments,
        expenses,
        sessions,
        payouts,
        recordPayment,
        updatePayment,
        deletePayment,
        markPaymentPaid,
        memberAnnualFees,
        memberAnnualFeesTableMissing,
        studentPaymentMessages,
        studentPaymentMessagesTableMissing,
        sendStudentPaymentMessage,
        cancelStudentPaymentMessage,
        evaluateStudentPaymentMessage,
        upsertMemberAnnualFee,
        generateAnnualFeesForYear,
        deleteMemberAnnualFee,
        addStudent,
        updateStudent,
        deleteStudent,
        enrollStudentInActivity,
        updateStudentEnrollment,
        unenrollStudentFromActivity,
        requestActivityEnrollment,
        cancelActivityEnrollmentRequest,
        confirmActivityEnrollment,
        rejectActivityEnrollment,
        requestActivityUnenrollment,
        cancelActivityUnenrollmentRequest,
        approveActivityUnenrollment,
        rejectActivityUnenrollment,
        membershipWithdrawalRequests,
        requestAssociationWithdrawal,
        cancelAssociationWithdrawalRequest,
        approveAssociationWithdrawal,
        rejectAssociationWithdrawal,
        enrollUserFromProfile,
        reevaluateUserOperationalRole,
        quickCreateAndEnrollStudent,
        validatePendingStudent,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        updateTeacherAvatar,
        updateUserAvatar,
        addActivity,
        updateActivity,
        deleteActivity,
        addExpense,
        deleteExpense,
        addClassSession,
        deleteClassSession,
        closeClassSession,
        reopenClassSession,
        upsertSessionAttendance,
        recordClassPayment,
        settleTeacherPayout,
        resetToInitialData,
        exportToCSV,
        periodPayments,
        totalIncomeCollected,
        totalIncomePending,
        totalExpenses,
        teacherSummaries,
        totalTeacherCosts,
        netMonthlyBalance,
        appConfigs: exposedAppConfigs,
        updateAppConfig,
        addAppConfig,
        deleteAppConfig,
        newsNotes,
        readNewsNoteIds,
        addNewsNote,
        updateNewsNote,
        deleteNewsNote,
        restoreNewsNote,
        permanentlyDeleteNewsNote,
        markNewsNoteRead,
        isBiometricsSupported: isBiometricsSupportedState,
        hasBiometricsEnabled: Boolean(biometricUserState),
        biometricUser: biometricUserState,
        enableBiometrics,
        disableBiometrics,
        unlockWithBiometrics
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
