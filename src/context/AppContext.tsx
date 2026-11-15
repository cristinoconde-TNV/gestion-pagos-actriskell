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
  AuthUser,
  AppConfigSetting,
  NewsNote,
  MemberType,
  MemberStatusHistoryEntry,
  AppLanguage
} from '../types';
import {
  supabase,
  createIsolatedAuthClient,
  mapDbTeacherToTeacher,
  mapTeacherToDb,
  mapDbActivityToActivity,
  mapActivityToDb,
  mapDbStudentToStudent,
  mapDbHistoryToHistory,
  mapDbPaymentToPayment,
  mapPaymentToDb,
  mapDbSessionToSession,
  mapDbExpenseToExpense,
  mapExpenseToDb,
  mapDbPayoutToPayout,
  mapPayoutToDb
} from '../lib/supabase';
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
import { normalizeAppLanguage } from '../lib/i18n';


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
  clearDbError: () => void;
  refreshFromSupabase: () => Promise<void>;
  seedInitialDataToSupabase: () => Promise<void>;

  // Gestión de Usuarios y Accesos (Exclusivo Administrador)
  profiles: AuthUser[];
  createUserByAdmin: (params: {
    email: string;
    fullName: string;
    role: UserRole;
    password?: string;
    teacherId?: string;
    studentId?: string;
    memberNumber?: string;
    memberType?: MemberType;
    startDate?: string;
    endDate?: string;
    createTeacherProfile?: boolean;
    createStudentProfile?: boolean;
  }) => Promise<{ success: boolean; error?: string; tempPassword?: string }>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  updateUserProfileByAdmin: (
    userId: string,
    updates: {
      name?: string;
      role?: UserRole;
      teacherId?: string | null;
      studentId?: string | null;
      memberNumber?: string | null;
      memberType?: MemberType | null;
      startDate?: string | null;
      endDate?: string | null;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  deleteUserAccess: (userId: string) => Promise<void>;
  promoteOrUpdateMemberRole: (
    targetRole: 'socio' | 'student' | 'teacher' | 'teacher_student'
  ) => Promise<{ success: boolean; error?: string }>;

  teachers: Teacher[];
  activities: Activity[];
  students: Student[];
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

  addStudent: (student: Omit<Student, 'id' | 'registeredAt'>) => Promise<{ success: boolean; error?: string }>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<{ success: boolean; error?: string }>;
  deleteStudent: (id: string) => Promise<void>;
  enrollStudentInActivity: (studentId: string, activityId: string, customPrice?: number) => Promise<{ success: boolean; error?: string }>;
  unenrollStudentFromActivity: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  requestActivityEnrollment: (activityId: string, studentId?: string) => Promise<{ success: boolean; error?: string; studentId?: string }>;
  cancelActivityEnrollmentRequest: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  confirmActivityEnrollment: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
  rejectActivityEnrollment: (studentId: string, activityId: string) => Promise<{ success: boolean; error?: string }>;
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
  quickCreateAndEnrollStudent: (params: {
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    activityId: string;
    customPrice?: number;
  }) => Promise<{ success: boolean; studentId?: string; error?: string }>;
  validatePendingStudent: (studentId: string, approve: boolean) => Promise<{ success: boolean; error?: string }>;

  addTeacher: (teacher: Omit<Teacher, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateTeacher: (id: string, updates: Partial<Teacher>) => Promise<{ success: boolean; error?: string }>;
  deleteTeacher: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateTeacherAvatar: (teacherId: string, avatarUrl: string) => Promise<void>;

  addActivity: (activity: Omit<Activity, 'id'>) => Promise<void>;
  updateActivity: (id: string, updates: Partial<Activity>) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  addExpense: (expense: Omit<CenterExpense, 'id'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  addClassSession: (session: Omit<ClassSession, 'id'>) => Promise<void>;
  deleteClassSession: (id: string) => Promise<void>;
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
  updateAppConfig: (config_key: string, config_value: string, is_active: boolean) => Promise<void>;
  addAppConfig: (config: AppConfigSetting) => Promise<void>;
  deleteAppConfig: (config_key: string) => Promise<void>;

  // Últimas notas / Comunicados
  newsNotes: NewsNote[];
  addNewsNote: (note: Omit<NewsNote, 'id'>) => Promise<void>;
  deleteNewsNote: (id: string) => Promise<void>;

  // Biometría y Sesión en Caché
  isBiometricsSupported: boolean;
  hasBiometricsEnabled: boolean;
  biometricUser: StoredBiometricInfo | null;
  enableBiometrics: () => Promise<boolean>;
  disableBiometrics: () => void;
  unlockWithBiometrics: () => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Estado de usuario y autenticación con Supabase Auth
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);

  // Estados de navegación y roles
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-11');
  const [currentRole, setCurrentRoleState] = useState<UserRole>('admin');
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

  // Estado de verificación inicial de Auth y de conexión/errores de Supabase
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Colecciones sincronizadas en tiempo real con Supabase
  const [profiles, setProfiles] = useState<AuthUser[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
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

  // Últimas notas / Comunicados
  const [newsNotes, setNewsNotes] = useState<NewsNote[]>(() => {
    try {
      const local = localStorage.getItem('triskell_news_notes');
      return local ? JSON.parse(local) : INITIAL_NEWS_NOTES;
    } catch {
      return INITIAL_NEWS_NOTES;
    }
  });

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

  const clearDbError = useCallback(() => setDbError(null), []);

  const handleSupabaseError = useCallback((contextMsg: string, error: any) => {
    console.error(`[Supabase Error] ${contextMsg}:`, error);
    let msg = error?.message || 'Error de comunicación con Supabase';
    if (error?.code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
      msg = `Permiso RLS denegado: Tu usuario actual no tiene permisos suficientes para ${contextMsg.toLowerCase()}. Inicia sesión con la cuenta de Administrador.`;
    }
    setDbError(msg);
  }, []);

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
          profilesRes.data.map(p => ({
            id: p.id,
            email: p.email,
            name: p.full_name,
            role: p.role as UserRole,
            language: p.language ? normalizeAppLanguage(p.language) : 'es',
            photoURL: p.avatar_url || undefined,
            teacherId: p.teacher_id || undefined,
            studentId: p.student_id || undefined,
            memberNumber: p.member_number || undefined,
            memberType: (p.member_type as MemberType) || undefined,
            startDate:
              p.start_date ||
              (typeof p.created_at === 'string' ? p.created_at.split('T')[0] : undefined),
            endDate: p.end_date || undefined,
            provider: 'email',
            createdAt: p.created_at
          }))
        );
      }

      // 2. Cargar Monitores
      const teachersRes = await supabase.from('teachers').select('*').order('name');
      if (requestSeq !== refreshSeqRef.current) return;
      if (teachersRes.error) {
        handleSupabaseError('Cargar monitores', teachersRes.error);
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
        handleSupabaseError('Cargar talleres', activitiesRes.error);
      } else {
        const loadedActivities = (activitiesRes.data || []).map(mapDbActivityToActivity);
        setActivities(loadedActivities);
      }

      // 4. Cargar Alumnos y Matrículas
      const [studentsRes, enrollmentsRes] = await Promise.all([
        supabase.from('students').select('*').order('name'),
        supabase.from('student_enrollments').select('*')
      ]);
      if (requestSeq !== refreshSeqRef.current) return;

      if (studentsRes.error) {
        handleSupabaseError('Cargar alumnos', studentsRes.error);
      } else {
        const hasEnrollmentsError = Boolean(enrollmentsRes.error);
        const enrollments = enrollmentsRes.data || [];
        setStudents(prev => {
          const prevById = new Map(prev.map(s => [s.id, s]));
          return (studentsRes.data || []).map(row => {
            const mapped = mapDbStudentToStudent(row, enrollments);
            if (hasEnrollmentsError) {
              const existing = prevById.get(row.id);
              if (existing) {
                return {
                  ...mapped,
                  activities: existing.activities,
                  pendingEnrollments: existing.pendingEnrollments
                };
              }
            }
            return mapped;
          });
        });
        const firstStudentId = studentsRes.data?.[0]?.id;
        if (firstStudentId) {
          setCurrentStudentId(prev => prev || firstStudentId);
        }
      }

      // 5. Cargar Pagos y Recibos
      const paymentsRes = await supabase
        .from('payments')
        .select('*, students(name), activities(name)')
        .order('created_at', { ascending: false });
      if (requestSeq !== refreshSeqRef.current) return;

      if (paymentsRes.error) {
        handleSupabaseError('Cargar pagos', paymentsRes.error);
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
        handleSupabaseError('Cargar gastos', expensesRes.error);
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
        handleSupabaseError('Cargar clases impartidas', sessionsRes.error);
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
        handleSupabaseError('Cargar liquidaciones', payoutsRes.error);
      } else {
        const loadedPayouts = (payoutsRes.data || []).map(mapDbPayoutToPayout);
        setPayouts(loadedPayouts);
      }

      // 9. Cargar Configuración Global ('app_config')
      try {
        const configRes = await supabase.from('app_config').select('*');
        if (requestSeq !== refreshSeqRef.current) return;
        if (!configRes.error && configRes.data && configRes.data.length > 0) {
          const loadedConfigs: AppConfigSetting[] = configRes.data
            .filter((c: any) => c.config_key !== 'google_calendar')
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

      // 10. Cargar Últimas notas / Comunicados
      try {
        const notesRes = await supabase.from('news_notes').select('*').order('date', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (!notesRes.error && notesRes.data && notesRes.data.length > 0) {
          const loadedNotes: NewsNote[] = notesRes.data.map((n: any) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            date: n.date,
            category: n.category || 'general',
            author: n.author,
            pinned: Boolean(n.pinned)
          }));
          setNewsNotes(loadedNotes);
          localStorage.setItem('triskell_news_notes', JSON.stringify(loadedNotes));
        }
      } catch (e) {
        console.warn('news_notes fetch error:', e);
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

    } catch (err: any) {
      handleSupabaseError('Sincronización general', err);
    } finally {
      if (requestSeq === refreshSeqRef.current) {
        setIsLoadingDb(false);
      }
    }
  }, [handleSupabaseError]);

  // Cargar perfil del usuario desde Supabase auth.users y public.profiles con control estricto de autorización (Whitelisting)
  const syncUserProfile = useCallback(async (userId: string, userEmail?: string, userMeta?: any) => {
    try {
      if (!userEmail) {
        await supabase.auth.signOut();
        setCurrentUser(null);
        return;
      }

      const emailNormalized = userEmail.toLowerCase().trim();
      const isMasterAdmin = emailNormalized === 'cristino.conde@actriskell.org';

      // 1-2. Consultar en paralelo perfil por ID/email, profesor y alumno autorizados
      const [profileByUidRes, profileByEmailRes, teacherMatchRes, studentMatchRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('profiles').select('*').ilike('email', emailNormalized).maybeSingle(),
        supabase.from('teachers').select('*').ilike('email', emailNormalized).maybeSingle(),
        supabase.from('students').select('*').ilike('email', emailNormalized).maybeSingle()
      ]);

      const profileByUid = profileByUidRes.data;
      const profileByEmail = profileByEmailRes.data;
      const existingProfile = profileByUid || profileByEmail;
      const teacherMatch = teacherMatchRes.data;
      const studentMatch = studentMatchRes.data;

      // Comprobar si el usuario fue autorizado previamente por el Administrador
      const isWhitelisted = isMasterAdmin || Boolean(existingProfile) || Boolean(teacherMatch) || Boolean(studentMatch);

      if (!isWhitelisted) {
        console.warn(`[TRISKELL AUTH] Acceso no autorizado para correo: ${emailNormalized}`);
        await supabase.auth.signOut();
        setCurrentUser(null);
        setDbError(`Acceso Denegado: El correo "${userEmail}" no ha sido dado de alta por la Administración de TRISKELL. Solicita al administrador tu alta para poder acceder.`);
        return;
      }

      // Determinar rol
      let role: UserRole = 'student';
      if (isMasterAdmin) {
        role = 'admin';
      } else if (existingProfile?.role) {
        role = existingProfile.role as UserRole;
      } else if (teacherMatch && studentMatch) {
        role = 'teacher_student';
      } else if (teacherMatch) {
        role = 'teacher';
      } else if (studentMatch) {
        role = 'student';
      }

      const fullName = existingProfile?.full_name || teacherMatch?.name || studentMatch?.name || userMeta?.full_name || userMeta?.name || userEmail.split('@')[0] || 'Usuario';
      const avatarUrl = existingProfile?.avatar_url || teacherMatch?.avatar_url || userMeta?.avatar_url || userMeta?.picture || undefined;
      const teacherId = existingProfile?.teacher_id || teacherMatch?.id || undefined;
      const studentId = existingProfile?.student_id || studentMatch?.id || undefined;

      const userLanguage = normalizeAppLanguage(
        existingProfile?.language ||
          userMeta?.language ||
          (() => {
            try {
              return localStorage.getItem('triskell_language');
            } catch {
              return null;
            }
          })()
      );

      // Vincular o actualizar la fila en profiles con el auth user id (sin tocar rol/vínculos si no cambian)
      try {
        let upsertErr: { code?: string; message: string } | null = null;
        if (profileByUid) {
          const linksOrRoleChanged =
            profileByUid.role !== role ||
            (profileByUid.teacher_id || null) !== (teacherId || null) ||
            (profileByUid.student_id || null) !== (studentId || null);

          const basePayload = linksOrRoleChanged
            ? {
                email: emailNormalized,
                full_name: fullName,
                avatar_url: avatarUrl || null,
                role,
                teacher_id: teacherId || null,
                student_id: studentId || null
              }
            : {
                email: emailNormalized,
                full_name: fullName,
                avatar_url: avatarUrl || null
              };

          const extPayload = { ...basePayload, language: userLanguage };
          let res = await supabase.from('profiles').update(extPayload).eq('id', userId);
          if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
            res = await supabase.from('profiles').update(basePayload).eq('id', userId);
          }
          upsertErr = res.error;
        } else {
          const baseUpsert = {
            id: userId,
            email: emailNormalized,
            full_name: fullName,
            avatar_url: avatarUrl || null,
            role,
            teacher_id: teacherId || null,
            student_id: studentId || null
          };
          let res = await supabase.from('profiles').upsert({ ...baseUpsert, language: userLanguage });
          if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
            res = await supabase.from('profiles').upsert(baseUpsert);
          }
          upsertErr = res.error;
        }
        if (upsertErr) {
          console.warn('profiles upsert warning:', upsertErr.message);
        }
      } catch (upsertEx) {
        console.warn('profiles upsert exception:', upsertEx);
      }

      const authUserObj: AuthUser = {
        id: userId,
        email: emailNormalized,
        name: fullName,
        photoURL: avatarUrl,
        role: role,
        language: userLanguage,
        teacherId: teacherId,
        studentId: studentId,
        memberNumber: existingProfile?.member_number || undefined,
        memberType: (existingProfile?.member_type as MemberType) || undefined,
        startDate:
          existingProfile?.start_date ||
          (typeof existingProfile?.created_at === 'string'
            ? existingProfile.created_at.split('T')[0]
            : undefined),
        endDate: existingProfile?.end_date || undefined,
        provider: userMeta?.iss?.includes('google') ? 'google' : 'email',
        lastLogin: new Date().toISOString()
      };

      setCurrentUser(authUserObj);
      setCurrentRoleState(role);
      setLanguageState(userLanguage);
      if (teacherId) setCurrentTeacherId(teacherId);
      if (studentId) setCurrentStudentId(studentId);

      // Guardar en caché local para desbloqueo rápido / biométrico
      cacheAuthSession({
        email: emailNormalized,
        name: fullName,
        role: role,
        language: userLanguage,
        userId: userId,
        timestamp: Date.now()
      });

    } catch (e: any) {
      console.error('Error synchronizing user profile:', e);
      handleSupabaseError('Sincronizar perfil de usuario', e);
    }
  }, [handleSupabaseError]);

  // Suscripción al estado de Auth de Supabase: esperar verificación antes de consultar tablas protegidas
  useEffect(() => {
    let mounted = true;
    let initialHandled = false;

    const initAuth = async () => {
      try {
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
          await syncUserProfile(session.user.id, session.user.email, session.user.user_metadata);
        } else {
          // Verificar si hay sesión recordada en caché o biometría
          const cached = getCachedAuthSession();
          const storedBio = getStoredBiometricUser();

          // Si hay sesión recordada y NO tiene biometría obligatoria, restaurar
          if (cached && !storedBio) {
            const cachedLang = normalizeAppLanguage(cached.language);
            setCurrentUser({
              id: cached.userId || 'cached-usr',
              email: cached.email,
              name: cached.name,
              role: (cached.role as UserRole) || 'student',
              language: cachedLang,
              provider: 'email',
              lastLogin: new Date(cached.timestamp).toISOString()
            });
            setCurrentRoleState((cached.role as UserRole) || 'student');
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
            await syncUserProfile(session.user.id, session.user.email, session.user.user_metadata);
          }
          return;
        }

        if (session?.user) {
          await syncUserProfile(session.user.id, session.user.email, session.user.user_metadata);
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

  // Función para cambiar de rol y persistirlo en la tabla profiles de Supabase
  const setCurrentRole = useCallback(async (newRole: UserRole) => {
    setCurrentRoleState(newRole);
    if (currentUser?.id && !currentUser.id.startsWith('demo-')) {
      try {
        await supabase
          .from('profiles')
          .update({ role: newRole })
          .eq('id', currentUser.id);
      } catch (err) {
        console.warn('Error updating role in Supabase profiles:', err);
      }
    }
  }, [currentUser]);

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
            return { success: false, error: err?.message || 'Error guardando idioma' };
          }
        }
      }

      return { success: true };
    },
    [currentUser]
  );

  // Inicio de sesión con Google OAuth mediante Supabase
  const loginWithGoogle = async () => {
    clearDbError();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) {
        handleSupabaseError('Inicio de sesión con Google', error);
      }
    } catch (e: any) {
      handleSupabaseError('Inicio de sesión con Google', e);
    }
  };

  // Inicio de sesión con Email y Contraseña mediante Supabase
  const loginWithEmail = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const emailNorm = email.toLowerCase().trim();

      // Verificar primero que el correo esté autorizado por el administrador
      const isMaster = emailNorm === 'cristino.conde@actriskell.org';
      const [profileCheck, teacherCheck, studentCheck] = await Promise.all([
        supabase.from('profiles').select('id').ilike('email', emailNorm).maybeSingle(),
        supabase.from('teachers').select('id').ilike('email', emailNorm).maybeSingle(),
        supabase.from('students').select('id').ilike('email', emailNorm).maybeSingle()
      ]);

      const isWhitelisted = isMaster || Boolean(profileCheck.data) || Boolean(teacherCheck.data) || Boolean(studentCheck.data);

      if (!isWhitelisted) {
        return {
          success: false,
          error: `Acceso no autorizado: El correo "${email}" no figura en el registro de usuarios de la asociación. Contacta con la Coordinación para que dé de alta tu cuenta.`
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password: pass
      });

      if (error) {
        handleSupabaseError('Inicio de sesión con Email', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        await syncUserProfile(data.user.id, data.user.email, data.user.user_metadata);
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Error de autenticación' };
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
          error: 'La nueva contraseña debe tener al menos 6 caracteres.'
        };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return {
          success: false,
          error: 'No hay una sesión activa de Supabase Auth. Inicia sesión con tu correo y contraseña actual o solicita un correo de restablecimiento.'
        };
      }

      const { error } = await supabase.auth.updateUser({ password: trimmed });
      if (error) {
        handleSupabaseError('Cambiar contraseña', error);
        return { success: false, error: error.message };
      }

      setIsPasswordRecoveryMode(false);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo actualizar la contraseña.' };
    }
  };

  // Solicitar enlace de restablecimiento / cambio de contraseña por correo
  const requestPasswordReset = async (email: string): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const emailNorm = email.trim().toLowerCase();
      if (!emailNorm) {
        return { success: false, error: 'Introduce tu correo electrónico.' };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        redirectTo: window.location.origin
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo enviar el correo de recuperación.' };
    }
  };

  // Cierre de sesión en Supabase
  const logout = async () => {
    try {
      clearCachedAuthSession();
      setIsPasswordRecoveryMode(false);
      await supabase.auth.signOut();
      setCurrentUser(null);
    } catch (e) {
      console.error('Error logging out:', e);
    }
  };

  // Configuración Global ('app_config')
  const updateAppConfig = async (config_key: string, config_value: string, is_active: boolean) => {
    setAppConfigs(prev => {
      const updated = prev.map(c =>
        c.config_key === config_key
          ? { ...c, config_value, is_active, updated_at: new Date().toISOString() }
          : c
      );
      localStorage.setItem('triskell_app_configs', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('app_config').upsert({
        config_key,
        config_value,
        is_active,
        updated_at: new Date().toISOString()
      });
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
    setAppConfigs(prev => {
      const filtered = prev.filter(c => c.config_key !== config.config_key);
      const updated = [...filtered, { ...config, updated_at: new Date().toISOString() }];
      localStorage.setItem('triskell_app_configs', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('app_config').upsert({
        config_key: config.config_key,
        config_value: config.config_value,
        is_active: config.is_active,
        description: config.description,
        updated_at: new Date().toISOString()
      });
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
  const addNewsNote = async (note: Omit<NewsNote, 'id'>) => {
    const newNote: NewsNote = {
      ...note,
      id: `note-${Date.now()}`
    };
    setNewsNotes(prev => {
      const updated = [newNote, ...prev];
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      let { error } = await supabase.from('news_notes').insert([newNote]);
      if (error && error.code === '22P02') {
        const { id: _ignored, ...noteWithoutId } = newNote;
        const retryRes = await supabase.from('news_notes').insert([noteWithoutId]);
        error = retryRes.error;
      }
      if (!error) {
        await refreshFromSupabase();
      } else {
        console.warn('news_notes insert error:', error.message);
      }
    } catch (e) {
      console.warn('news_notes insert error:', e);
    }
  };

  const deleteNewsNote = async (id: string) => {
    setNewsNotes(prev => {
      const updated = prev.filter(n => n.id !== id);
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('news_notes').delete().eq('id', id);
      if (!error) {
        await refreshFromSupabase();
      } else {
        console.warn('news_notes delete error:', error.message);
      }
    } catch (e) {
      console.warn('news_notes delete error:', e);
    }
  };

  // Biometría
  const enableBiometrics = async (): Promise<boolean> => {
    if (!currentUser) throw new Error('Debes haber iniciado sesión para activar biometría.');
    const ok = await registerBiometricCredential(
      currentUser.id,
      currentUser.email,
      currentUser.name,
      currentUser.role
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
      const user = await authenticateWithBiometrics();
      if (user) {
        const authUserObj: AuthUser = {
          id: user.credentialId,
          email: user.email,
          name: user.name,
          role: (user.role as UserRole) || 'student',
          lastLogin: new Date().toISOString()
        };
        setCurrentUser(authUserObj);
        setCurrentRoleState((user.role as UserRole) || 'student');

        cacheAuthSession({
          email: user.email,
          name: user.name,
          role: user.role,
          userId: user.credentialId,
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
            error: 'La tabla member_status_history aún no existe en Supabase. Ejecuta el script SQL proporcionado.'
          };
        }
        handleSupabaseError('Añadir ciclo de historial', error);
        return { success: false, error: error.message };
      }
      if (data) {
        setMemberStatusHistory(prev => [mapDbHistoryToHistory(data), ...prev]);
      }
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al registrar historial' };
    }
  };

  const deleteStatusHistoryEntry: AppContextType['deleteStatusHistoryEntry'] = async id => {
    clearDbError();
    try {
      const { error } = await supabase.from('member_status_history').delete().eq('id', id);
      if (error) {
        handleSupabaseError('Eliminar registro de historial', error);
        return { success: false, error: error.message };
      }
      setMemberStatusHistory(prev => prev.filter(h => h.id !== id));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al eliminar historial' };
    }
  };

  const createUserByAdmin = async (params: {
    email: string;
    fullName: string;
    role: UserRole;
    password?: string;
    teacherId?: string;
    studentId?: string;
    memberNumber?: string;
    memberType?: MemberType;
    startDate?: string;
    endDate?: string;
    createTeacherProfile?: boolean;
    createStudentProfile?: boolean;
  }): Promise<{ success: boolean; error?: string; tempPassword?: string }> => {
    clearDbError();
    try {
      const emailNorm = params.email.toLowerCase().trim();
      const fullNameClean = params.fullName.trim();
      const tempPassword = (params.password || `Triskell${Math.floor(1000 + Math.random() * 9000)}!`).trim();
      const todayStr = new Date().toISOString().split('T')[0];
      const effectiveStartDate = params.startDate || todayStr;
      const effectiveMemberType: MemberType =
        params.memberType || (params.role === 'teacher' ? 'socio' : 'socio');

      if (!emailNorm || !emailNorm.includes('@')) {
        return { success: false, error: 'El correo electrónico no es válido.' };
      }
      if (tempPassword.length < 6) {
        return { success: false, error: 'La contraseña debe tener al menos 6 caracteres para Supabase Auth.' };
      }

      // 0. Verificar sesión JWT real del Administrador para evitar fallos RLS posteriores
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.access_token) {
        return {
          success: false,
          error: 'No hay una sesión real activa de Administrador en Supabase Auth. Inicia sesión con Google o correo/contraseña antes de dar de alta usuarios.'
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
            role: params.role
          }
        }
      });

      if (authError) {
        const msg = authError.message || 'Error en Supabase Auth al registrar el usuario.';
        const msgLower = msg.toLowerCase();
        if (msgLower.includes('signups not allowed')) {
          return {
            success: false,
            error: 'Supabase Auth tiene desactivado el registro (Signups not allowed). Activa "Allow new users to sign up" en Supabase Auth o usa una Edge Function con service_role.'
          };
        }
        if (msgLower.includes('database error saving new user')) {
          return {
            success: false,
            error: `Error de BD en Supabase Auth al guardar el usuario con rol "${params.role}": el trigger handle_new_user() (on_auth_user_created) o la restricción CHECK/ENUM de rol en public.profiles rechazó el alta. Ejecuta el script SQL actualizado en Supabase SQL Editor.`
          };
        }
        return { success: false, error: `Error en Supabase Auth: ${msg}` };
      }

      const newAuthUserId = authData?.user?.id;
      if (!newAuthUserId) {
        return {
          success: false,
          error: 'Supabase Auth no devolvió ningún ID de usuario (auth.users). Operación abortada.'
        };
      }

      // En Supabase, si el email ya existe y Confirm Email está activo, devuelve identities = []
      if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {
        return {
          success: false,
          error: `El correo "${emailNorm}" ya existe en Supabase Auth (auth.users).`
        };
      }

      let linkedTeacherId = params.teacherId || null;
      let linkedStudentId = params.studentId || null;

      // 2. Si se solicitó crear ficha de monitor automática (o reutilizar por email)
      if ((params.role === 'teacher' || params.role === 'teacher_student') && params.createTeacherProfile && !linkedTeacherId) {
        const { data: existingTeacher, error: findTeacherErr } = await supabase
          .from('teachers')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();

        if (findTeacherErr) {
          return { success: false, error: `Usuario creado en Auth, pero error consultando monitores: ${findTeacherErr.message}` };
        }

        if (existingTeacher?.id) {
          linkedTeacherId = existingTeacher.id;
        } else {
          const baseTeacherInsert = {
            name: fullNameClean,
            email: emailNorm,
            phone: '',
            payment_scheme: 'per_class',
            rate_per_class: 25,
            fixed_monthly_rate: 0,
            revenue_share_percent: 60,
            preferred_payment_method: 'cash',
            collection_type: 'personal',
            active: true
          };
          const extTeacherInsert = {
            ...baseTeacherInsert,
            member_number: params.memberNumber || null,
            member_type: effectiveMemberType,
            start_date: effectiveStartDate,
            end_date: params.endDate || null
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
              .insert([baseTeacherInsert])
              .select('id')
              .single();
          }

          if (teacherInsertRes.error) {
            return { success: false, error: `Usuario creado en Auth (${newAuthUserId}), pero error al crear ficha de Monitor: ${teacherInsertRes.error.message}` };
          }
          linkedTeacherId = teacherInsertRes.data.id;
        }
      }

      // 3. Si se solicitó crear ficha de alumno/socio automática (o reutilizar por email)
      if (
        (params.role === 'student' || params.role === 'teacher_student' || params.role === 'socio') &&
        params.createStudentProfile &&
        !linkedStudentId
      ) {
        const { data: existingStudent, error: findStudentErr } = await supabase
          .from('students')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();

        if (findStudentErr) {
          return { success: false, error: `Usuario creado en Auth, pero error consultando alumnos: ${findStudentErr.message}` };
        }

        if (existingStudent?.id) {
          linkedStudentId = existingStudent.id;
        } else {
          const baseStudentInsert = {
            name: fullNameClean,
            email: emailNorm,
            phone: '',
            status: 'active',
            registered_at: effectiveStartDate
          };
          const extStudentInsert = {
            ...baseStudentInsert,
            member_number: params.memberNumber || null,
            member_type: effectiveMemberType,
            start_date: effectiveStartDate,
            end_date: params.endDate || null
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
              .insert([baseStudentInsert])
              .select('id')
              .single();
          }

          if (studentInsertRes.error) {
            return { success: false, error: `Usuario creado en Auth (${newAuthUserId}), pero error al crear ficha de Socio/Alumno: ${studentInsertRes.error.message}` };
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
        createdProfileRow?.role === params.role &&
        (createdProfileRow?.teacher_id || null) === (linkedTeacherId || null) &&
        (createdProfileRow?.student_id || null) === (linkedStudentId || null);

      let profileError: { code?: string; message?: string } | null = null;

      if (sameRoleAndLinks) {
        const extMetaUpdate = {
          full_name: fullNameClean,
          member_number: params.memberNumber || null,
          member_type: effectiveMemberType,
          start_date: effectiveStartDate,
          end_date: params.endDate || null
        };
        let metaRes = await supabase
          .from('profiles')
          .update(extMetaUpdate)
          .eq('id', newAuthUserId);
        if (
          metaRes.error &&
          (metaRes.error.code === '42703' || metaRes.error.message?.includes('column'))
        ) {
          metaRes = await supabase
            .from('profiles')
            .update({ full_name: fullNameClean })
            .eq('id', newAuthUserId);
        }
        profileError = metaRes.error;
      } else {
        const baseProfilePayload = {
          email: emailNorm,
          full_name: fullNameClean,
          role: params.role,
          teacher_id: linkedTeacherId,
          student_id: linkedStudentId
        };
        const extProfilePayload = {
          ...baseProfilePayload,
          member_number: params.memberNumber || null,
          member_type: effectiveMemberType,
          start_date: effectiveStartDate,
          end_date: params.endDate || null
        };

        let profileRes = createdProfileRow
          ? await supabase.from('profiles').update(extProfilePayload).eq('id', newAuthUserId)
          : await supabase
              .from('profiles')
              .upsert({ id: newAuthUserId, ...extProfilePayload }, { onConflict: 'id' });

        if (
          profileRes.error &&
          (profileRes.error.code === '42703' || profileRes.error.message?.includes('column'))
        ) {
          profileRes = createdProfileRow
            ? await supabase.from('profiles').update(baseProfilePayload).eq('id', newAuthUserId)
            : await supabase
                .from('profiles')
                .upsert({ id: newAuthUserId, ...baseProfilePayload }, { onConflict: 'id' });
        }
        profileError = profileRes.error;
      }

      if (profileError) {
        const pErrMsg = profileError.message || '';
        if (profileError.code === '23514' || pErrMsg.includes('profiles_role_check')) {
          return {
            success: false,
            error: `Usuario creado en Auth (${newAuthUserId}), pero la restricción CHECK de "public.profiles" aún no permite el rol "${params.role}". Ejecuta el script SQL actualizado en Supabase.`
          };
        }
        if (pErrMsg.toLowerCase().includes('solo la administración')) {
          return {
            success: false,
            error: `Usuario creado en Auth (${newAuthUserId}), pero el trigger de seguridad en "public.profiles" bloqueó actualizar rol/vínculos ("${pErrMsg}"). Asegúrate en Supabase de que tu usuario administrador actual tenga role='admin' en public.profiles (con id = auth.uid()) y ejecuta el script SQL para actualizar el trigger de protección.`
          };
        }
        return {
          success: false,
          error: `Usuario creado en Auth (${newAuthUserId}), pero error al vincular public.profiles: ${pErrMsg}`
        };
      }

      await refreshFromSupabase();
      return { success: true, tempPassword };
    } catch (err: any) {
      console.error('Error creating user by administrator:', err);
      return { success: false, error: err.message || 'Error inesperado al registrar el usuario' };
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    clearDbError();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) {
        handleSupabaseError('Actualizar rol de usuario', error);
        return;
      }

      setProfiles(prev =>
        prev.map(p => (p.id === userId ? { ...p, role: newRole } : p))
      );
      await refreshFromSupabase();
    } catch (e: any) {
      handleSupabaseError('Actualizar rol', e);
    }
  };

  const updateUserProfileByAdmin: AppContextType['updateUserProfileByAdmin'] = async (
    userId,
    updates
  ) => {
    clearDbError();
    try {
      const baseDbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) baseDbUpdates.full_name = updates.name.trim();
      if (updates.role !== undefined) baseDbUpdates.role = updates.role;
      if (updates.teacherId !== undefined) baseDbUpdates.teacher_id = updates.teacherId || null;
      if (updates.studentId !== undefined) baseDbUpdates.student_id = updates.studentId || null;

      const fullDbUpdates: Record<string, any> = { ...baseDbUpdates };
      if (updates.memberNumber !== undefined) fullDbUpdates.member_number = updates.memberNumber || null;
      if (updates.memberType !== undefined) fullDbUpdates.member_type = updates.memberType || null;
      if (updates.startDate !== undefined) fullDbUpdates.start_date = updates.startDate || null;
      if (updates.endDate !== undefined) fullDbUpdates.end_date = updates.endDate || null;

      if (Object.keys(fullDbUpdates).length === 0) return { success: true };

      const initialRes = await supabase
        .from('profiles')
        .update(fullDbUpdates)
        .eq('id', userId);
      let updateError = initialRes.error;

      if (updateError && (updateError.code === '42703' || updateError.message?.includes('column'))) {
        if (Object.keys(baseDbUpdates).length > 0) {
          const fallbackRes = await supabase
            .from('profiles')
            .update(baseDbUpdates)
            .eq('id', userId);
          updateError = fallbackRes.error;
        } else {
          updateError = null;
        }
      }

      if (updateError) {
        handleSupabaseError('Actualizar usuario', updateError);
        return { success: false, error: updateError.message };
      }

      setProfiles(prev =>
        prev.map(p =>
          p.id === userId
            ? {
                ...p,
                ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
                ...(updates.role !== undefined ? { role: updates.role } : {}),
                ...(updates.teacherId !== undefined
                  ? { teacherId: updates.teacherId || undefined }
                  : {}),
                ...(updates.studentId !== undefined
                  ? { studentId: updates.studentId || undefined }
                  : {}),
                ...(updates.memberNumber !== undefined
                  ? { memberNumber: updates.memberNumber || undefined }
                  : {}),
                ...(updates.memberType !== undefined
                  ? { memberType: updates.memberType || undefined }
                  : {}),
                ...(updates.startDate !== undefined
                  ? { startDate: updates.startDate || undefined }
                  : {}),
                ...(updates.endDate !== undefined
                  ? { endDate: updates.endDate || undefined }
                  : {})
              }
            : p
        )
      );
      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || 'Error al actualizar usuario';
      handleSupabaseError('Actualizar usuario', e);
      return { success: false, error: msg };
    }
  };

  const promoteOrUpdateMemberRole: AppContextType['promoteOrUpdateMemberRole'] = async targetRole => {
    clearDbError();
    try {
      if (!currentUser) {
        return { success: false, error: 'Debes iniciar sesión para actualizar tu rol.' };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return {
          success: false,
          error: 'Tu sesión de Supabase Auth no está activa. Inicia sesión nuevamente.'
        };
      }

      const emailNorm = (currentUser.email || '').trim().toLowerCase();
      const todayStr = new Date().toISOString().split('T')[0];
      let nextStudentId = currentUser.studentId || currentStudentId || undefined;
      let nextTeacherId = currentUser.teacherId || currentTeacherId || undefined;

      // Garantizar ficha de alumno si pasa a student o teacher_student
      if ((targetRole === 'student' || targetRole === 'teacher_student') && !nextStudentId) {
        const localStudent = students.find(
          s => s.profileId === currentUser.id || (emailNorm && s.email.trim().toLowerCase() === emailNorm)
        );
        if (localStudent) {
          nextStudentId = localStudent.id;
        } else {
          const basePayload = {
            name: currentUser.name || 'Socio',
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

      // Garantizar ficha de monitor si pasa a teacher o teacher_student
      if ((targetRole === 'teacher' || targetRole === 'teacher_student') && !nextTeacherId) {
        const localTeacher = teachers.find(
          t => emailNorm && t.email.trim().toLowerCase() === emailNorm
        );
        if (localTeacher) {
          nextTeacherId = localTeacher.id;
        } else {
          const basePayload = {
            name: currentUser.name || 'Monitor',
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
          role: targetRole,
          ...(nextStudentId ? { student_id: nextStudentId } : {}),
          ...(nextTeacherId ? { teacher_id: nextTeacherId } : {})
        })
        .eq('id', currentUser.id);

      if (profErr) {
        handleSupabaseError('Actualizar participación / rol', profErr);
        return { success: false, error: profErr.message };
      }

      setCurrentUser(prev =>
        prev
          ? {
              ...prev,
              role: targetRole,
              studentId: nextStudentId || prev.studentId,
              teacherId: nextTeacherId || prev.teacherId
            }
          : prev
      );
      setCurrentRoleState(targetRole);
      if (nextStudentId) setCurrentStudentId(nextStudentId);
      if (nextTeacherId) setCurrentTeacherId(nextTeacherId);

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'No se pudo actualizar tu rol en la asociación.' };
    }
  };

  const deleteUserAccess = async (userId: string) => {
    clearDbError();
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) {
        handleSupabaseError('Revocar acceso de usuario', error);
        return;
      }

      setProfiles(prev => prev.filter(p => p.id !== userId));
      await refreshFromSupabase();
    } catch (e: any) {
      handleSupabaseError('Revocar acceso', e);
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
    const teacherWithDefaults: Omit<Teacher, 'id'> = {
      ...teacher,
      memberType: teacher.memberType || 'socio',
      startDate: teacher.startDate || todayStr,
      endDate: teacher.active ? teacher.endDate : teacher.endDate || todayStr
    };
    const dbPayload = mapTeacherToDb(teacherWithDefaults);
    let insertRes = await supabase.from('teachers').insert([dbPayload]).select().single();

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
      } = dbPayload;
      insertRes = await supabase.from('teachers').insert([legacyPayload]).select().single();
    }

    if (insertRes.error) {
      handleSupabaseError('Alta de monitor', insertRes.error);
      return { success: false, error: insertRes.error.message };
    }
    if (insertRes.data) {
      const newTeacher = mapDbTeacherToTeacher(insertRes.data);
      setTeachers(prev => [...prev, newTeacher]);
      await recordStatusHistoryCycle({
        entityType: 'teacher',
        entityId: newTeacher.id,
        status: newTeacher.active ? 'active' : 'inactive',
        startDate: newTeacher.startDate || todayStr,
        endDate: newTeacher.endDate,
        notes: 'Alta de monitor en el centro'
      });
    }
    await refreshFromSupabase();
    return { success: true };
  };

  const updateTeacher: AppContextType['updateTeacher'] = async (id, updates) => {
    clearDbError();
    const current = teachers.find(t => t.id === id);
    if (!current) {
      return { success: false, error: 'Monitor no encontrado.' };
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const merged: Teacher = { ...current, ...updates };
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
      const {
        member_number: _m1,
        member_type: _m2,
        start_date: _m3,
        end_date: _m4,
        ...legacyPayload
      } = dbPayload;
      updateRes = await supabase.from('teachers').update(legacyPayload).eq('id', id).select('*');
    }

    if (updateRes.error) {
      handleSupabaseError('Actualizar monitor', updateRes.error);
      return { success: false, error: updateRes.error.message };
    }

    if (updates.active !== undefined && updates.active !== current.active) {
      await recordStatusHistoryCycle({
        entityType: 'teacher',
        entityId: id,
        status: merged.active ? 'active' : 'inactive',
        startDate: todayStr,
        endDate: merged.active ? undefined : merged.endDate || todayStr,
        notes: merged.active ? 'Reactivación de monitor' : 'Baja de monitor'
      });
    }

    setTeachers(prev => prev.map(t => (t.id === id ? merged : t)));
    await refreshFromSupabase();
    return { success: true };
  };

  const deleteTeacher: AppContextType['deleteTeacher'] = async id => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const authErr = new Error(
          'No hay una sesión activa en Supabase Auth. Inicia sesión nuevamente para eliminar monitores.'
        );
        handleSupabaseError('Eliminar monitor', authErr);
        return { success: false, error: authErr.message };
      }

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
          friendlyMsg =
            'No se pudo eliminar el monitor porque tiene talleres, sesiones o liquidaciones vinculadas con restricción FK. Ejecuta el SQL de actualización (ON DELETE SET NULL) o desactívalo como "De baja".';
        }
        const errObj = new Error(friendlyMsg);
        handleSupabaseError('Eliminar monitor', errObj);
        return { success: false, error: friendlyMsg };
      }

      if (!deletedRows || deletedRows.length === 0) {
        const { data: stillExists } = await supabase
          .from('teachers')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        const rlsMsg = stillExists
          ? 'Supabase devolvió 0 filas eliminadas por política RLS DELETE en teachers. Ejecuta el script SQL de políticas RLS para monitores.'
          : 'No se encontró el monitor en Supabase para eliminar.';
        const rlsErr = new Error(rlsMsg);
        handleSupabaseError('Eliminar monitor', rlsErr);
        return { success: false, error: rlsMsg };
      }

      setTeachers(prev => prev.filter(t => t.id !== id));
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Error al eliminar monitor';
      handleSupabaseError('Eliminar monitor', err);
      return { success: false, error: msg };
    }
  };

  const updateTeacherAvatar = async (teacherId: string, avatarUrl: string) => {
    await updateTeacher(teacherId, { avatarUrl, avatar: avatarUrl });
  };

  // Talleres / Actividades
  const addActivity = async (activity: Omit<Activity, 'id'>) => {
    clearDbError();
    const dbPayload = mapActivityToDb(activity);
    const { data, error } = await supabase.from('activities').insert([dbPayload]).select().single();
    if (error) {
      handleSupabaseError('Crear taller', error);
      return;
    }
    if (data) {
      const newAct = mapDbActivityToActivity(data);
      setActivities(prev => [...prev, newAct]);
    }
    await refreshFromSupabase();
  };

  const updateActivity = async (id: string, updates: Partial<Activity>) => {
    clearDbError();
    const current = activities.find(a => a.id === id);
    if (!current) return;
    const merged = { ...current, ...updates };
    const dbPayload = mapActivityToDb(merged);
    const { error } = await supabase.from('activities').update(dbPayload).eq('id', id);
    if (error) {
      handleSupabaseError('Actualizar taller', error);
      return;
    }
    setActivities(prev => prev.map(a => (a.id === id ? merged : a)));
    await refreshFromSupabase();
  };

  const deleteActivity = async (id: string) => {
    clearDbError();
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
      handleSupabaseError('Eliminar taller', error);
      return;
    }
    setActivities(prev => prev.filter(a => a.id !== id));
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
    const fullPayload = { ...activePayload, status, ...(extraFields || {}) };

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
      if (extraFields && Object.keys(extraFields).length > 0) {
        res = await tryUpsert({ ...activePayload, status });
      }
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        if (status === 'pending') {
          return {
            error: new Error(
              'Falta la columna "status" en la tabla "student_enrollments" de Supabase. Ejecuta el script SQL proporcionado para habilitar solicitudes pendientes.'
            )
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

  const addStudent = async (
    student: Omit<Student, 'id' | 'registeredAt'>
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const todayStr = new Date().toISOString().split('T')[0];
    const effectiveStartDate = student.startDate || todayStr;
    const isPending = student.status === 'pending_validation';
    const baseStudentDb: Record<string, any> = {
      name: student.name,
      email: student.email || null,
      phone: student.phone || null,
      status: student.status,
      registered_at: effectiveStartDate,
      notes: student.notes || null
    };
    const extendedStudentDb: Record<string, any> = {
      ...baseStudentDb,
      validation_status: isPending ? 'pending' : student.status === 'inactive' ? 'rejected' : 'validated',
      registered_by: currentUser?.id || null,
      member_number: student.memberNumber || null,
      member_type: student.memberType || 'socio',
      start_date: effectiveStartDate,
      end_date: student.endDate || (student.status === 'inactive' ? todayStr : null)
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
        .insert([baseStudentDb])
        .select()
        .single();
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
      handleSupabaseError('Alta de alumno', insertRes.error);
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
        notes: 'Alta inicial de socio/alumno'
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

    if (updates.name !== undefined) studentDb.name = updates.name;
    if (updates.email !== undefined) studentDb.email = updates.email || null;
    if (updates.phone !== undefined) studentDb.phone = updates.phone || null;
    if (updates.memberNumber !== undefined) studentDb.member_number = updates.memberNumber || null;
    if (updates.memberType !== undefined) studentDb.member_type = updates.memberType || 'socio';
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
        const authErr = new Error(
          'No hay una sesión activa en Supabase Auth (solo sesión en caché). Cierra sesión e inicia sesión de nuevo para guardar cambios en alumnos.'
        );
        handleSupabaseError('Actualizar alumno', authErr);
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
        const {
          validation_status: _ignored,
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...fallbackDb
        } = studentDb;
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
        handleSupabaseError('Actualizar alumno', res.error);
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
            ? 'No se pudo actualizar la ficha del alumno en Supabase (0 filas modificadas por política RLS de UPDATE en students). Ejecuta el SQL de actualización de políticas RLS.'
            : 'No se encontró la ficha del alumno en Supabase (posiblemente fue eliminada o pertenece solo a datos locales).'
        );
        handleSupabaseError('Actualizar alumno', rlsErr);
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
            ? 'Reincorporación (socio activo)'
            : updates.status === 'inactive'
            ? 'Baja de socio/alumno'
            : `Cambio de estado a ${updates.status}`
      });
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
          handleSupabaseError('Actualizar matrícula en taller', upsertErr);
          return { success: false, error: upsertErr.message };
        }
      }

      for (const removedActId of removedIds) {
        const { data: delRows, error: delErr } = await supabase
          .from('student_enrollments')
          .delete()
          .eq('student_id', id)
          .eq('activity_id', removedActId)
          .select('id');

        if (delErr || !delRows || delRows.length === 0) {
          const { error: softErr } = await supabase
            .from('student_enrollments')
            .update({ active: false })
            .eq('student_id', id)
            .eq('activity_id', removedActId);
          if (softErr) {
            handleSupabaseError('Quitar matrícula de taller', delErr || softErr);
            return { success: false, error: (delErr || softErr).message };
          }
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

    await refreshFromSupabase();
    return { success: true };
  };

  const deleteStudent = async (id: string) => {
    clearDbError();
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) {
      handleSupabaseError('Eliminar alumno', error);
      return;
    }
    setStudents(prev => prev.filter(s => s.id !== id));
    await refreshFromSupabase();
  };

  const enrollStudentInActivity = async (
    studentId: string,
    activityId: string,
    customPrice?: number
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const { error } = await upsertEnrollmentRow(studentId, activityId, customPrice);

    if (error) {
      handleSupabaseError('Inscribir alumno en taller', error);
      return { success: false, error: error.message };
    }
    await refreshFromSupabase();
    return { success: true };
  };

  const unenrollStudentFromActivity = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const { data: deletedRows, error: deleteErr } = await supabase
        .from('student_enrollments')
        .delete()
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('id');

      let removed = !deleteErr && Array.isArray(deletedRows) && deletedRows.length > 0;

      // Fallback: si RLS bloquea DELETE pero permite UPDATE (baja lógica active = false)
      if (!removed) {
        const { data: updatedRows, error: updateErr } = await supabase
          .from('student_enrollments')
          .update({ active: false })
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .select('id');

        if (!updateErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
          removed = true;
        } else {
          const finalErr =
            deleteErr ||
            updateErr ||
            new Error(
              'Permiso denegado o política RLS en Supabase al intentar quitar al alumno del taller (0 filas modificadas). Ejecuta el SQL de políticas RLS para student_enrollments.'
            );
          handleSupabaseError('Quitar alumno del taller', finalErr);
          return { success: false, error: finalErr.message };
        }
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? {
                ...s,
                activities: s.activities.filter(a => a.activityId !== activityId),
                pendingEnrollments: (s.pendingEnrollments || []).filter(
                  a => a.activityId !== activityId
                )
              }
            : s
        )
      );
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Error al quitar el alumno del taller.';
      handleSupabaseError('Quitar alumno del taller', err);
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
        error: 'Debes iniciar sesión en Supabase para solicitar inscripción en una actividad.'
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
      name: currentUser.name || emailNorm.split('@')[0] || 'Alumno',
      email: emailNorm || null,
      phone: '',
      status: 'active',
      notes: 'Ficha creada automáticamente al solicitar inscripción en taller'
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
          'No se pudo crear tu ficha de alumno en Supabase para registrar la solicitud (revisa RLS en students).'
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
        const msg =
          'No hay una sesión activa de Supabase Auth. Vuelve a iniciar sesión antes de enviar la solicitud.';
        setDbError(msg);
        return { success: false, error: msg };
      }

      const { studentId: resolvedStudentId, error: resolveErr } =
        await resolveStudentIdForCurrentUser(explicitStudentId);
      if (!resolvedStudentId) {
        const msg = resolveErr || 'No se pudo identificar tu ficha de alumno.';
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
        handleSupabaseError('Solicitar inscripción a taller', error);
        return { success: false, error: error.message };
      }

      if (!Array.isArray(upsertData) || upsertData.length === 0) {
        const rlsMsg =
          'Supabase no permitió registrar la solicitud (0 filas devueltas por política RLS en student_enrollments). Ejecuta el SQL de actualización.';
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
      const msg = err?.message || 'Error al solicitar la inscripción.';
      handleSupabaseError('Solicitar inscripción a taller', err);
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
        const msg =
          'No hay una sesión activa de Supabase Auth. Inicia sesión nuevamente para cancelar la solicitud.';
        setDbError(msg);
        return { success: false, error: msg };
      }

      const { data: deletedPending, error: deletePendingErr } = await supabase
        .from('student_enrollments')
        .delete()
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .eq('status', 'pending')
        .select('id');

      let cancelled =
        !deletePendingErr && Array.isArray(deletedPending) && deletedPending.length > 0;

      if (!cancelled) {
        const { data: deletedAny, error: deleteAnyErr } = await supabase
          .from('student_enrollments')
          .delete()
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .select('id');

        if (!deleteAnyErr && Array.isArray(deletedAny) && deletedAny.length > 0) {
          cancelled = true;
        } else {
          // Fallback: baja lógica si RLS bloquea DELETE pero permite UPDATE
          const { data: updatedRows, error: updateErr } = await supabase
            .from('student_enrollments')
            .update({ status: 'rejected', active: false })
            .eq('student_id', studentId)
            .eq('activity_id', activityId)
            .select('id');

          if (!updateErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
            cancelled = true;
          } else {
            const finalErr =
              deletePendingErr ||
              deleteAnyErr ||
              updateErr ||
              new Error(
                'Permiso denegado o política RLS en Supabase al cancelar la solicitud (0 filas eliminadas). Ejecuta el SQL de actualización.'
              );
            handleSupabaseError('Cancelar solicitud de inscripción', finalErr);
            return { success: false, error: finalErr.message };
          }
        }
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? {
                ...s,
                pendingEnrollments: (s.pendingEnrollments || []).filter(
                  e => e.activityId !== activityId
                )
              }
            : s
        )
      );
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Error al cancelar la solicitud.';
      handleSupabaseError('Cancelar solicitud de inscripción', err);
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
        const msg =
          'No hay una sesión activa de Supabase Auth. Vuelve a iniciar sesión para confirmar la inscripción.';
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
        handleSupabaseError('Confirmar inscripción', updateRes.error);
        return { success: false, error: updateRes.error.message };
      }

      let confirmedRow = Array.isArray(updateRes.data) ? updateRes.data[0] : null;
      if (!confirmedRow) {
        const upsertRes = await upsertEnrollmentRow(studentId, activityId);
        if (upsertRes.error) {
          handleSupabaseError('Confirmar inscripción', upsertRes.error);
          return { success: false, error: upsertRes.error.message };
        }
        confirmedRow = Array.isArray(upsertRes.data) ? upsertRes.data[0] : null;
      }

      if (!confirmedRow) {
        const rlsMsg =
          'Supabase devolvió 0 filas actualizadas al confirmar la inscripción. Revisa las políticas RLS UPDATE en student_enrollments ejecutando el script SQL proporcionado.';
        setDbError(rlsMsg);
        return { success: false, error: rlsMsg };
      }

      const act = activities.find(a => a.id === activityId);
      const targetStudentObj = students.find(s => s.id === studentId);
      const linkedProfileObj = profiles.find(
        p => p.studentId === studentId || (targetStudentObj?.profileId && p.id === targetStudentObj.profileId)
      );
      if (linkedProfileObj && linkedProfileObj.role === 'socio') {
        try {
          await supabase.from('profiles').update({ role: 'student' }).eq('id', linkedProfileObj.id);
          if (currentUser?.id === linkedProfileObj.id) {
            setCurrentUser(prev => (prev ? { ...prev, role: 'student' } : prev));
            setCurrentRoleState('student');
          }
        } catch {
          // Best-effort promotion socio -> student
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
            activities: alreadyActive
              ? s.activities.map(e => (e.activityId === activityId ? newEntry : e))
              : [...s.activities, newEntry],
            pendingEnrollments: (s.pendingEnrollments || []).filter(
              e => e.activityId !== activityId
            )
          };
        })
      );

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Error al confirmar la inscripción.';
      handleSupabaseError('Confirmar inscripción', err);
      return { success: false, error: msg };
    }
  };

  const rejectActivityEnrollment = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    return await cancelActivityEnrollmentRequest(studentId, activityId);
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
        const basePayload = {
          name: profile.name,
          email: emailNorm || null,
          phone: null,
          status: 'active',
          notes:
            profile.role === 'teacher' || profile.role === 'teacher_student'
              ? 'Monitor inscrito como alumno en taller'
              : null
        };

        const extendedPayload = {
          ...basePayload,
          profile_id: profile.id,
          validation_status: 'validated',
          registered_by: currentUser?.id || null
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
          const msg = insertRes.error?.message || 'No se pudo crear la ficha de alumno para el perfil.';
          handleSupabaseError('Vincular usuario como alumno', insertRes.error || new Error(msg));
          return { success: false, error: msg };
        }

        resolvedStudentId = insertRes.data.id;

        // 3. Vincular student_id en profiles (y promover teacher -> teacher_student / socio -> student si aplica)
        const profileUpdates: Record<string, any> = { student_id: resolvedStudentId };
        if (profile.role === 'teacher') {
          profileUpdates.role = 'teacher_student';
        } else if (profile.role === 'socio') {
          profileUpdates.role = 'student';
        }
        try {
          await supabase.from('profiles').update(profileUpdates).eq('id', profile.id);
        } catch {
          // Best-effort: si RLS restringe editar profiles a otros usuarios, el trigger SQL o admin lo sincroniza
        }
      } else {
        const promoUpdates: Record<string, any> = {};
        if (profile.role === 'socio') promoUpdates.role = 'student';
        else if (profile.role === 'teacher') promoUpdates.role = 'teacher_student';
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
        handleSupabaseError('Registrar matrícula de usuario', enrollErr);
        return { success: false, error: enrollErr.message };
      }

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      handleSupabaseError('Inscribir usuario existente', err);
      return { success: false, error: err?.message || 'Error al inscribir usuario' };
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
      const cleanNotes = notes?.trim() || 'Alta rápida desde inscripción a taller (pendiente de validación)';

      const basePendingPayload = {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        status: 'pending_validation',
        notes: cleanNotes
      };

      const extendedPendingPayload = {
        ...basePendingPayload,
        validation_status: 'pending',
        registered_by: currentUser?.id || null
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
        const rawMsg = createRes.error?.message || 'Error al crear alumno provisional.';
        const friendlyMsg = rawMsg.includes('students_status_check')
          ? 'La restricción students_status_check en Supabase no incluye aún "pending_validation". Ejecuta el SQL de actualización.'
          : rawMsg;
        handleSupabaseError('Alta rápida de alumno pendiente', createRes.error || new Error(friendlyMsg));
        return { success: false, error: friendlyMsg };
      }

      const newStudentId = createRes.data.id;
      const { error: enrollErr } = await upsertEnrollmentRow(newStudentId, activityId, customPrice);

      if (enrollErr) {
        handleSupabaseError('Matricular alumno recién creado', enrollErr);
        await refreshFromSupabase();
        return { success: false, studentId: newStudentId, error: enrollErr.message };
      }

      await refreshFromSupabase();
      return { success: true, studentId: newStudentId };
    } catch (err: any) {
      handleSupabaseError('Alta rápida y matrícula', err);
      return { success: false, error: err?.message || 'Error inesperado al dar de alta al alumno' };
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
        const authErr = new Error(
          'Tu sesión en Supabase Auth ha expirado o está en caché local. Cierra sesión y vuelve a entrar con tu cuenta de administrador para validar altas.'
        );
        handleSupabaseError('Validar alta definitiva de socio', authErr);
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
        handleSupabaseError('Validar alta definitiva de socio', updateRes.error);
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
            ? 'Supabase no actualizó el registro (0 filas modificadas por política RLS de UPDATE en students). Ejecuta el script SQL de políticas RLS para admins/monitores.'
            : 'No se encontró el alumno en Supabase para validar.'
        );
        handleSupabaseError('Validar alta definitiva de socio', rlsErr);
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
        notes: approve ? 'Validación de alta rápida confirmada' : 'Alta rápida rechazada'
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

      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      handleSupabaseError('Validar socio pendiente', err);
      return { success: false, error: err?.message || 'No se pudo validar el socio' };
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
      studentName: student?.name || payment.studentName || 'Alumno',
      activityId: payment.activityId,
      activityName: activity?.name || payment.activityName || 'Actividad',
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
          ? new Error('La restricción payments_status_check en Supabase aún no permite "partial". Ejecuta el SQL de actualización en Supabase.')
          : error;
        handleSupabaseError('Registrar pago en Supabase', enhancedError);
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
        ? new Error('La restricción payments_status_check en Supabase aún no permite "partial". Ejecuta el SQL de actualización en Supabase.')
        : error;
      handleSupabaseError('Actualizar pago', enhancedError);
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
      handleSupabaseError('Eliminar pago', error);
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

  const recordClassPayment = async (params: {
    studentId: string;
    activityId: string;
    amount: number;
    isPartial?: boolean;
    paymentMethod?: PaymentMethod;
    date?: string;
    notes?: string;
  }): Promise<PaymentRecord | null> => {
    clearDbError();
    const activity = activities.find(a => a.id === params.activityId);
    const student = students.find(s => s.id === params.studentId);
    const paymentDate = params.date || new Date().toISOString().split('T')[0];

    const receipt = await recordPayment({
      studentId: params.studentId,
      studentName: student?.name || 'Alumno',
      activityId: params.activityId,
      activityName: activity?.name || 'Taller',
      periodMonth: selectedPeriod,
      amount: params.amount,
      paymentDate: paymentDate,
      paymentMethod: params.paymentMethod || 'cash',
      status: params.isPartial ? 'partial' : 'paid',
      collectedByTeacher: true,
      collectedByTeacherId: activity?.teacherId || currentTeacherId,
      notes: params.notes || (params.isPartial ? 'Pago parcial en clase' : 'Pago de clase impartida')
    });

    return receipt;
  };

  const sessionSyncLockRef = useRef<Record<string, Promise<string | null>>>({});

  const upsertSessionAttendance: AppContextType['upsertSessionAttendance'] = async params => {
    clearDbError();
    const sessionKey = `${params.activityId}::${params.teacherId}::${params.date}`;
    const tempSessionId = `temp-ses-${sessionKey}`;
    const defaultTopic = params.topic?.trim() || '';
    const defaultDuration = params.durationMinutes || 75;

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
        attendance: (st.id === params.studentId ? params.attendance : 'present') as
          | 'present'
          | 'absent'
          | 'partial',
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
        handleSupabaseError('Buscar sesión de clase', lookupErr);
        return null;
      }
      if (existingRow?.id) return existingRow.id;

      const initialAttendees =
        params.enrolledStudents && params.enrolledStudents.length > 0
          ? params.enrolledStudents.filter(st =>
              st.id === params.studentId ? params.attendance !== 'absent' : true
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
        handleSupabaseError('Crear sesión de asistencia', insertErr || new Error('Sin ID de sesión'));
        return null;
      }

      // Si había otros alumnos matriculados, inicializar sus filas por defecto como presentes
      if (params.enrolledStudents && params.enrolledStudents.length > 1) {
        const seedRows = params.enrolledStudents
          .filter(st => st.id !== params.studentId)
          .map(st => ({
            session_id: insertedRow.id,
            student_id: st.id,
            attendance: 'present',
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
        return { success: false, error: 'No se pudo obtener o crear la sesión en Supabase.' };
      }

      const { data: existingAtt, error: attLookupErr } = await supabase
        .from('session_attendances')
        .select('id')
        .eq('session_id', realSessionId)
        .eq('student_id', params.studentId)
        .limit(1)
        .maybeSingle();

      if (attLookupErr) {
        handleSupabaseError('Consultar asistencia en Supabase', attLookupErr);
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
          handleSupabaseError('Actualizar asistencia en Supabase', updateAttErr);
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
          handleSupabaseError('Registrar asistencia en Supabase', insertAttErr);
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
      handleSupabaseError('Sincronizar asistencia', err);
      return { success: false, error: err?.message || 'Error al guardar asistencia' };
    }
  };

  // Clases Impartidas y Asistencias
  const addClassSession = async (session: Omit<ClassSession, 'id'>) => {
    clearDbError();
    const sessionKey = `${session.activityId}::${session.teacherId}::${session.date}`;
    const normalizedTopic = session.topic?.trim() || '';

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
                attendanceRecords: session.attendanceRecords
              }
            : s
        );
      }
      return [
        {
          id: `temp-ses-${sessionKey}`,
          ...session,
          topic: normalizedTopic
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

    const sessionDb = {
      activity_id: session.activityId,
      teacher_id: session.teacherId,
      date: session.date,
      attendees_count: session.attendeesCount,
      duration_minutes: session.durationMinutes,
      topic: normalizedTopic || null
    };

    let targetSessionId = existingSession?.id || '';

    if (targetSessionId) {
      const { error: updateErr } = await supabase
        .from('class_sessions')
        .update(sessionDb)
        .eq('id', targetSessionId);
      if (updateErr) {
        handleSupabaseError('Actualizar clase impartida', updateErr);
        return;
      }
      await supabase.from('session_attendances').delete().eq('session_id', targetSessionId);
    } else {
      const { data: newSessionRow, error: sessionErr } = await supabase
        .from('class_sessions')
        .insert([sessionDb])
        .select()
        .single();

      if (sessionErr) {
        handleSupabaseError('Anotar clase impartida', sessionErr);
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

  const deleteClassSession = async (id: string) => {
    clearDbError();
    const { error } = await supabase.from('class_sessions').delete().eq('id', id);
    if (error) {
      handleSupabaseError('Eliminar sesión de clase', error);
      return;
    }
    setSessions(prev => prev.filter(s => s.id !== id));
    await refreshFromSupabase();
  };

  // Gastos
  const addExpense = async (expense: Omit<CenterExpense, 'id'>) => {
    clearDbError();
    const dbPayload = mapExpenseToDb(expense);
    const { data, error } = await supabase.from('center_expenses').insert([dbPayload]).select().single();
    if (error) {
      handleSupabaseError('Registrar gasto', error);
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
      handleSupabaseError('Eliminar gasto', error);
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
      notes: notes || 'Liquidación mensual formalizada'
    });

    const { error } = await supabase.from('teacher_payouts').insert([dbPayload]);
    if (error) {
      handleSupabaseError('Registrar liquidación', error);
      return;
    }
    await refreshFromSupabase();
  };

  // Sembrador / Inicializador de datos en Supabase si la base de datos está vacía
  const seedInitialDataToSupabase = async () => {
    clearDbError();
    setIsLoadingDb(true);
    try {
      const teachersPayload = INITIAL_TEACHERS.map(t => ({
        name: t.name,
        email: t.email,
        phone: t.phone,
        avatar_url: t.avatarUrl || t.avatar,
        payment_scheme: t.paymentScheme,
        rate_per_class: t.ratePerClass,
        fixed_monthly_rate: t.fixedMonthlyRate,
        revenue_share_percent: t.revenueSharePercent,
        preferred_payment_method: t.preferredPaymentMethod,
        collection_type: t.collectionType || 'personal',
        bank_account: t.bankAccount,
        active: t.active,
        notes: t.notes
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
      handleSupabaseError('Poblar datos iniciales en Supabase', err);
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
      csvContent += 'Recibo,Alumno,Actividad,Mes,Importe,Estado,FechaPago,Metodo,CobradoEnMano\n';
      periodPayments.forEach(p => {
        csvContent += `"${p.receiptNumber}","${p.studentName}","${p.activityName}","${p.periodMonth}",${p.amount},"${p.status}","${p.paymentDate || ''}","${p.paymentMethod}","${p.collectedByTeacher ? 'Sí' : 'No'}"\n`;
      });
    } else if (type === 'students') {
      csvContent += 'Nombre,Email,Telefono,Estado,FechaAlta\n';
      students.forEach(s => {
        csvContent += `"${s.name}","${s.email}","${s.phone}","${s.status}","${s.registeredAt}"\n`;
      });
    } else if (type === 'expenses') {
      csvContent += 'Concepto,Categoria,Importe,Fecha,Mes,Metodo,Factura\n';
      expenses.filter(e => e.periodMonth === selectedPeriod).forEach(e => {
        csvContent += `"${e.title}","${e.category}",${e.amount},"${e.date}","${e.periodMonth}","${e.paymentMethod}","${e.invoiceNumber || ''}"\n`;
      });
    } else if (type === 'teachers') {
      csvContent += 'Nombre,Email,Telefono,Modalidad,TarifaClase,FijoMensual,PorcentajeCuotas\n';
      teachers.forEach(t => {
        csvContent += `"${t.name}","${t.email}","${t.phone}","${t.paymentScheme}",${t.ratePerClass},${t.fixedMonthlyRate},${t.revenueSharePercent}\n`;
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
        s => s.teacherId === teacher.id && s.date.startsWith(selectedPeriod)
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
        clearDbError,
        refreshFromSupabase,
        seedInitialDataToSupabase,
        profiles,
        createUserByAdmin,
        updateUserRole,
        updateUserProfileByAdmin,
        deleteUserAccess,
        promoteOrUpdateMemberRole,
        teachers,
        activities,
        students,
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
        addStudent,
        updateStudent,
        deleteStudent,
        enrollStudentInActivity,
        unenrollStudentFromActivity,
        requestActivityEnrollment,
        cancelActivityEnrollmentRequest,
        confirmActivityEnrollment,
        rejectActivityEnrollment,
        enrollUserFromProfile,
        quickCreateAndEnrollStudent,
        validatePendingStudent,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        updateTeacherAvatar,
        addActivity,
        updateActivity,
        deleteActivity,
        addExpense,
        deleteExpense,
        addClassSession,
        deleteClassSession,
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
        appConfigs,
        updateAppConfig,
        addAppConfig,
        deleteAppConfig,
        newsNotes,
        addNewsNote,
        deleteNewsNote,
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
