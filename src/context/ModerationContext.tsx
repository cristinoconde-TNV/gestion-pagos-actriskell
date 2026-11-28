import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import {
  Activity,
  AppConfigSetting,
  AuthUser,
  MemberType,
  MembershipWithdrawalRequest,
  NewsNote,
  OperationalRole,
  PaymentMethod,
  PaymentPaidToType,
  StudentAbsence,
  StudentPaymentMessage,
  UserRole
} from '../types';
import { ANNUAL_FEE_CONFIG_KEY } from '../lib/annualFee';
import {
  isNewsNoteExpiredByDate,
  isWorkshopFinalized,
  getStoredActivityEndedAtMap,
  setStoredActivityEndedAt
} from '../lib/newsConfig';
import {
  deriveIsSocioFromRow,
  mapDbAbsenceToAbsence,
  mapDbActivityToActivity,
  mapDbExpenseToExpense,
  mapDbHistoryToHistory,
  mapDbMemberAnnualFeeToFee,
  mapDbPaymentToPayment,
  mapDbPayoutToPayout,
  mapDbSessionToSession,
  mapDbStudentPaymentMessageToMessage,
  mapDbStudentToStudent,
  mapDbTeacherToTeacher,
  mapDbWithdrawalRequestToRequest,
  mapPublicDbTeacherToTeacher,
  normalizeOperationalRole,
  supabase
} from '../lib/supabase';
import {
  DEFAULT_BASE_USER_ROLE,
  deriveAccessFromRow,
  deriveOperationalRoleFromAssignments,
  isProfileExplicitlyAuthorized,
  isValidUserRole,
  MASTER_ADMIN_EMAIL,
  normalizeUserRole,
  ProfileAccessStatus,
  resolveProfileAccessStatus,
  toCanonicalProfileRole
} from '../lib/authRole';
import {
  isClassSessionClosed,
  isClassSessionClosedOrPast
} from '../lib/absences';
import { getMadridDateIso } from '../lib/date';
import { clearCachedAuthSession } from '../lib/biometrics';
import { normalizeAppLanguage } from '../lib/i18n';
import { isDeactivatedAccount, useAuth } from './AuthContext';
import { useAcademyData } from './AcademyDataContext';
import { useFinance } from './FinanceContext';

export interface ModerationContextType {
  membershipWithdrawalRequests: MembershipWithdrawalRequest[];
  setMembershipWithdrawalRequests: React.Dispatch<
    React.SetStateAction<MembershipWithdrawalRequest[]>
  >;
  studentPaymentMessages: StudentPaymentMessage[];
  setStudentPaymentMessages: React.Dispatch<React.SetStateAction<StudentPaymentMessage[]>>;
  studentPaymentMessagesTableMissing: boolean;
  setStudentPaymentMessagesTableMissing: React.Dispatch<React.SetStateAction<boolean>>;

  approvePendingUserAccess: (
    userId: string,
    overrides?: { role?: UserRole | ''; isSocio?: boolean }
  ) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  rejectOrBlockUserAccess: (
    userId: string
  ) => Promise<{ success: boolean; error?: string }>;
  validatePendingStudent: (
    studentId: string,
    approve: boolean
  ) => Promise<{ success: boolean; error?: string }>;

  requestActivityEnrollment: (
    activityId: string,
    studentId?: string
  ) => Promise<{ success: boolean; error?: string; studentId?: string }>;
  cancelActivityEnrollmentRequest: (
    studentId: string,
    activityId: string
  ) => Promise<{ success: boolean; error?: string }>;
  confirmActivityEnrollment: (
    studentId: string,
    activityId: string
  ) => Promise<{ success: boolean; error?: string }>;
  rejectActivityEnrollment: (
    studentId: string,
    activityId: string
  ) => Promise<{ success: boolean; error?: string }>;

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
  cancelStudentPaymentMessage: (
    messageId: string
  ) => Promise<{ success: boolean; error?: string }>;
  evaluateStudentPaymentMessage: (params: {
    messageId: string;
    status: 'approved' | 'rejected';
    teacherEvaluation?: string;
    markPaymentAsPaid?: boolean;
    paymentMethod?: PaymentMethod;
    collectedByTeacher?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
}

const ModerationContext = createContext<ModerationContextType | undefined>(undefined);

export const ModerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    currentUserRef,
    setCurrentUser,
    setCurrentRoleState,
    setCurrentTeacherId,
    setCurrentStudentId,
    setIsLoadingDb,
    bumpDbSyncVersion,
    setDbError,
    setAuthDenialKind,
    clearDbError,
    resolveAuthDenial,
    handleSupabaseError,
    registerRefreshHandler,
    profiles,
    setProfiles,
    setAppConfigs,
    updateProfileWithColumnFallback,
    recordStatusHistoryCycle,
    reevaluateUserOperationalRole,
    t
  } = useAuth();

  const {
    teachers,
    setTeachers,
    activities,
    setActivities,
    students,
    setStudents,
    studentAbsences,
    setStudentAbsences,
    setMemberStatusHistory,
    sessions,
    setSessions,
    setNewsNotes,
    setReadNewsNoteIds,
    upsertEnrollmentRow,
    softDeleteEnrollmentRow,
    resolveStudentIdForCurrentUser
  } = useAcademyData();

  const {
    paymentsRef,
    setPayments,
    setExpenses,
    setPayouts,
    setMemberAnnualFees,
    setMemberAnnualFeesTableMissing,
    updatePayment
  } = useFinance();

  const [membershipWithdrawalRequests, setMembershipWithdrawalRequests] = useState<
    MembershipWithdrawalRequest[]
  >([]);
  const [studentPaymentMessages, setStudentPaymentMessages] = useState<StudentPaymentMessage[]>([]);
  const [studentPaymentMessagesTableMissing, setStudentPaymentMessagesTableMissing] = useState(false);

  const refreshSeqRef = useRef(0);

  const refreshFromSupabase = useCallback(async () => {
    const requestSeq = ++refreshSeqRef.current;
    const PUBLIC_TEACHER_COLUMNS = 'id, name, phone, avatar_url, active, status, member_number';

    const mapProfileRowToAuthUser = (p: any): AuthUser => {
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
    };

    const mergeById = <T extends { id: string }>(...lists: T[][]): T[] => {
      const seen = new Set<string>();
      const out: T[] = [];
      for (const list of lists) {
        for (const item of list) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          out.push(item);
        }
      }
      return out;
    };

    try {
      setIsLoadingDb(true);

      const activeUser = currentUserRef.current;
      if (!activeUser) {
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (requestSeq !== refreshSeqRef.current) return;

      const activeJwtSession = sessionData?.session;
      const hasValidJwt = Boolean(
        activeJwtSession?.access_token &&
          activeJwtSession.user &&
          activeJwtSession.user.id === activeUser.id
      );
      const activeEmail = (activeJwtSession?.user?.email || activeUser.email || '').toLowerCase().trim();
      const sessionUserId = activeJwtSession?.user?.id || activeUser.id;
      const isMasterAdmin = activeEmail === MASTER_ADMIN_EMAIL;

      // 0. Resolver perfil propio verificado antes de consultar colecciones
      let selfProfileRes = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUserId)
        .maybeSingle();
      if (!selfProfileRes.error && !selfProfileRes.data && activeEmail) {
        selfProfileRes = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', activeEmail)
          .maybeSingle();
      }
      if (requestSeq !== refreshSeqRef.current) return;

      const freshProfile = selfProfileRes.data || null;
      const verifiedRole: UserRole = isMasterAdmin
        ? UserRole.Admin
        : freshProfile && isValidUserRole(freshProfile.role)
        ? normalizeUserRole(freshProfile.role)
        : activeUser.role;

      const isCallerStrictlyAdmin = verifiedRole === UserRole.Admin;
      const isTeacherOrHybrid =
        !isCallerStrictlyAdmin &&
        (verifiedRole === UserRole.Monitor || verifiedRole === UserRole.Hibrido);
      const isHybrid = !isCallerStrictlyAdmin && verifiedRole === UserRole.Hibrido;
      const isStudent = !isCallerStrictlyAdmin && verifiedRole === UserRole.Alumno;

      let freshTeacherRow: any = null;
      let freshStudentRow: any = null;

      if (!isMasterAdmin) {
        const candidateTeacherId = freshProfile?.teacher_id || activeUser.teacherId;
        const candidateStudentId = freshProfile?.student_id || activeUser.studentId;

        const [selfTeacherRes, selfStudentRes] = await Promise.all([
          isTeacherOrHybrid || candidateTeacherId
            ? candidateTeacherId
              ? supabase.from('teachers').select('*').eq('id', candidateTeacherId).maybeSingle()
              : activeEmail
              ? supabase.from('teachers').select('*').ilike('email', activeEmail).maybeSingle()
              : Promise.resolve({ data: null, error: null } as any)
            : Promise.resolve({ data: null, error: null } as any),
          candidateStudentId
            ? supabase.from('students').select('*').eq('id', candidateStudentId).maybeSingle()
            : supabase.from('students').select('*').eq('profile_id', sessionUserId).maybeSingle()
        ]);
        if (requestSeq !== refreshSeqRef.current) return;

        freshTeacherRow = selfTeacherRes.data || null;
        if (!freshTeacherRow && isTeacherOrHybrid && activeEmail) {
          const fallbackTeacherRes = await supabase
            .from('teachers')
            .select('*')
            .ilike('email', activeEmail)
            .maybeSingle();
          if (requestSeq !== refreshSeqRef.current) return;
          freshTeacherRow = fallbackTeacherRes.data || null;
        }

        freshStudentRow = selfStudentRes.data || null;
        if (!freshStudentRow && activeEmail) {
          const fallbackStudentRes = await supabase
            .from('students')
            .select('*')
            .ilike('email', activeEmail)
            .maybeSingle();
          if (requestSeq !== refreshSeqRef.current) return;
          freshStudentRow = fallbackStudentRes.data || null;
        }

        const isCurrentDeactivated = isDeactivatedAccount({
          email: activeEmail,
          profile: freshProfile,
          teacher: freshTeacherRow,
          student: freshStudentRow
        });
        const hasMissingOrUnauthorizedProfile =
          !selfProfileRes.error &&
          !(hasValidJwt && isMasterAdmin) &&
          !activeUser.id.startsWith('demo-') &&
          !activeUser.id.startsWith('usr-') &&
          (!freshProfile || !isProfileExplicitlyAuthorized(freshProfile, activeEmail));

        if (!hasValidJwt || isCurrentDeactivated || hasMissingOrUnauthorizedProfile) {
          if (import.meta.env.DEV) {
            console.warn('[TRISKELL AUTH] Sesión revocada: sesión JWT ausente o usuario no autorizado');
          }
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
          const resolvedStudentId =
            freshProfile.student_id || freshStudentRow?.id || activeUser.studentId;
          const resolvedTeacherId =
            freshProfile.teacher_id || freshTeacherRow?.id || activeUser.teacherId;
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
      } else if (!hasValidJwt) {
        if (import.meta.env.DEV) {
          console.warn('[TRISKELL AUTH] Sesión revocada: sesión JWT ausente');
        }
        clearCachedAuthSession();
        void supabase.auth.signOut();
        setCurrentUser(null);
        const denial = resolveAuthDenial(freshProfile, activeUser.email);
        setAuthDenialKind(denial.kind);
        setDbError(denial.message);
        return;
      }

      const resolvedTeacherId =
        freshProfile?.teacher_id || freshTeacherRow?.id || activeUser.teacherId || '';
      const resolvedStudentId =
        freshProfile?.student_id || freshStudentRow?.id || activeUser.studentId || '';

      // 1. Perfiles: Admin carga todos; otros roles únicamente su propio perfil
      let loadedProfileRows: any[] = freshProfile ? [freshProfile] : [];
      if (isCallerStrictlyAdmin) {
        const profilesRes = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (!profilesRes.error && profilesRes.data) {
          loadedProfileRows = profilesRes.data;
        }
      }
      setProfiles(loadedProfileRows.map(mapProfileRowToAuthUser));

      // 2. Monitores
      let loadedTeacherRows: any[] = [];
      if (isCallerStrictlyAdmin) {
        const teachersRes = await supabase.from('teachers').select('*').order('name');
        if (requestSeq !== refreshSeqRef.current) return;
        if (teachersRes.error) {
          handleSupabaseError(t('appContext.actions.loadTeachers'), teachersRes.error);
        } else {
          loadedTeacherRows = teachersRes.data || [];
          const loadedTeachers = loadedTeacherRows.map(mapDbTeacherToTeacher);
          setTeachers(loadedTeachers);
          if (loadedTeachers.length > 0) {
            setCurrentTeacherId(prev => prev || loadedTeachers[0].id);
          }
        }
      } else {
        let publicTeachersRes = await supabase
          .from('teachers_public')
          .select(PUBLIC_TEACHER_COLUMNS)
          .order('name');
        if (requestSeq !== refreshSeqRef.current) return;
        if (
          publicTeachersRes.error &&
          (publicTeachersRes.error.code === '42P01' ||
            publicTeachersRes.error.code === 'PGRST205' ||
            publicTeachersRes.error.message?.toLowerCase().includes('teachers_public'))
        ) {
          publicTeachersRes = await supabase
            .from('teachers')
            .select(PUBLIC_TEACHER_COLUMNS)
            .order('name');
          if (requestSeq !== refreshSeqRef.current) return;
        }
        if (publicTeachersRes.error) {
          handleSupabaseError(t('appContext.actions.loadTeachers'), publicTeachersRes.error);
        } else {
          const publicRows = publicTeachersRes.data || [];
          loadedTeacherRows = publicRows.map(row =>
            freshTeacherRow && row.id === freshTeacherRow.id ? freshTeacherRow : row
          );
          if (freshTeacherRow && !loadedTeacherRows.some(r => r.id === freshTeacherRow.id)) {
            loadedTeacherRows.push(freshTeacherRow);
          }
          const loadedTeachers = loadedTeacherRows.map(row =>
            freshTeacherRow && row.id === freshTeacherRow.id
              ? mapDbTeacherToTeacher(freshTeacherRow)
              : mapPublicDbTeacherToTeacher(row)
          );
          setTeachers(loadedTeachers);
          if (isTeacherOrHybrid && resolvedTeacherId) {
            setCurrentTeacherId(resolvedTeacherId);
          } else {
            setCurrentTeacherId('');
          }
        }
      }

      // 3. Talleres / Actividades
      let loadedActivities: Activity[] = [];
      const activitiesRes = await supabase.from('activities').select('*').order('name');
      if (requestSeq !== refreshSeqRef.current) return;
      if (activitiesRes.error) {
        handleSupabaseError(t('appContext.actions.loadActivities'), activitiesRes.error);
      } else {
        loadedActivities = (activitiesRes.data || []).map(mapDbActivityToActivity);
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

      const myTeachingActivityIds =
        isTeacherOrHybrid && resolvedTeacherId
          ? loadedActivities.filter(a => a.teacherId === resolvedTeacherId).map(a => a.id)
          : [];

      // 4. Alumnos y Matrículas (segmentados por rol)
      let myEnrolledActivityIds: string[] = [];
      if (isCallerStrictlyAdmin) {
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
      } else if (isTeacherOrHybrid) {
        const [teachEnrollRes, selfEnrollRes] = await Promise.all([
          myTeachingActivityIds.length > 0
            ? supabase.from('student_enrollments').select('*').in('activity_id', myTeachingActivityIds)
            : Promise.resolve({ data: [], error: null } as any),
          isHybrid && resolvedStudentId
            ? supabase.from('student_enrollments').select('*').eq('student_id', resolvedStudentId)
            : Promise.resolve({ data: [], error: null } as any)
        ]);
        if (requestSeq !== refreshSeqRef.current) return;

        const hasEnrollmentsError = Boolean(teachEnrollRes.error || selfEnrollRes.error);
        const scopedEnrollments = mergeById<any>(
          teachEnrollRes.data || [],
          selfEnrollRes.data || []
        );
        myEnrolledActivityIds = Array.from(
          new Set(
            (selfEnrollRes.data || [])
              .map((e: any) => e.activity_id)
              .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
          )
        );
        const scopedStudentIds = Array.from(
          new Set([
            ...scopedEnrollments
              .map((e: any) => e.student_id)
              .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id)),
            ...(resolvedStudentId ? [resolvedStudentId] : [])
          ])
        );

        let scopedStudentRows: any[] = [];
        if (scopedStudentIds.length > 0) {
          const studentsRes = await supabase
            .from('students')
            .select('*')
            .in('id', scopedStudentIds)
            .order('name');
          if (requestSeq !== refreshSeqRef.current) return;
          if (studentsRes.error) {
            handleSupabaseError(t('appContext.actions.loadStudents'), studentsRes.error);
          } else {
            scopedStudentRows = studentsRes.data || [];
          }
        }

        if (scopedStudentIds.length === 0 || scopedStudentRows.length > 0) {
          setStudents(prev => {
            const prevById = new Map(prev.map(s => [s.id, s]));
            return scopedStudentRows.map(row => {
              const mapped = mapDbStudentToStudent(row, scopedEnrollments);
              if (hasEnrollmentsError) {
                const existing = prevById.get(row.id);
                if (existing) {
                  return {
                    ...mapped,
                    activities: existing.activities,
                    pendingEnrollments: existing.pendingEnrollments,
                    inactiveEnrollments: existing.inactiveEnrollments
                  };
                }
              }
              return mapped;
            });
          });
        }
        setCurrentStudentId(resolvedStudentId || '');
      } else {
        if (resolvedStudentId) {
          const enrollmentsRes = await supabase
            .from('student_enrollments')
            .select('*')
            .eq('student_id', resolvedStudentId);
          if (requestSeq !== refreshSeqRef.current) return;
          const ownEnrollments = enrollmentsRes.data || [];
          myEnrolledActivityIds = Array.from(
            new Set(
              ownEnrollments
                .map((e: any) => e.activity_id)
                .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
            )
          );
          if (freshStudentRow) {
            const mappedSelf = mapDbStudentToStudent(freshStudentRow, ownEnrollments);
            const enrichedSelf = {
              ...mappedSelf,
              email: mappedSelf.email || freshProfile?.email || '',
              phone: mappedSelf.phone || freshTeacherRow?.phone || ''
            };
            setStudents(prev => {
              if (enrollmentsRes.error) {
                const existing = prev.find(s => s.id === freshStudentRow.id);
                if (existing) {
                  return [
                    {
                      ...enrichedSelf,
                      activities: existing.activities,
                      pendingEnrollments: existing.pendingEnrollments,
                      inactiveEnrollments: existing.inactiveEnrollments
                    }
                  ];
                }
              }
              return [enrichedSelf];
            });
          } else {
            setStudents([]);
          }
          setCurrentStudentId(resolvedStudentId);
        } else {
          setStudents([]);
          setCurrentStudentId('');
        }
      }

      // 5. Pagos y Recibos
      if (isCallerStrictlyAdmin) {
        const paymentsRes = await supabase
          .from('payments')
          .select('*, students(name), activities(name)')
          .order('created_at', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (paymentsRes.error) {
          handleSupabaseError(t('appContext.actions.loadPayments'), paymentsRes.error);
        } else {
          setPayments((paymentsRes.data || []).map(row => mapDbPaymentToPayment(row)));
        }
      } else if (isTeacherOrHybrid) {
        const [teachPayRes, selfPayRes] = await Promise.all([
          myTeachingActivityIds.length > 0
            ? supabase
                .from('payments')
                .select('*, students(name), activities(name)')
                .in('activity_id', myTeachingActivityIds)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null } as any),
          isHybrid && resolvedStudentId
            ? supabase
                .from('payments')
                .select('*, students(name), activities(name)')
                .eq('student_id', resolvedStudentId)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null } as any)
        ]);
        if (requestSeq !== refreshSeqRef.current) return;
        if (teachPayRes.error || selfPayRes.error) {
          handleSupabaseError(
            t('appContext.actions.loadPayments'),
            teachPayRes.error || selfPayRes.error
          );
        } else {
          const mergedPayments = mergeById<any>(teachPayRes.data || [], selfPayRes.data || []);
          setPayments(mergedPayments.map(row => mapDbPaymentToPayment(row)));
        }
      } else if (isStudent && resolvedStudentId) {
        const paymentsRes = await supabase
          .from('payments')
          .select('*, students(name), activities(name)')
          .eq('student_id', resolvedStudentId)
          .order('created_at', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (paymentsRes.error) {
          handleSupabaseError(t('appContext.actions.loadPayments'), paymentsRes.error);
        } else {
          setPayments((paymentsRes.data || []).map(row => mapDbPaymentToPayment(row)));
        }
      } else {
        setPayments([]);
      }

      // 6. Gastos del Centro (exclusivo Administrador)
      if (isCallerStrictlyAdmin) {
        const expensesRes = await supabase
          .from('center_expenses')
          .select('*')
          .order('date', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (expensesRes.error) {
          handleSupabaseError(t('appContext.actions.loadExpenses'), expensesRes.error);
        } else {
          setExpenses((expensesRes.data || []).map(mapDbExpenseToExpense));
        }
      } else {
        setExpenses([]);
      }

      // 7. Sesiones y Asistencias
      if (isCallerStrictlyAdmin) {
        const [sessionsRes, attendancesRes] = await Promise.all([
          supabase.from('class_sessions').select('*').order('date', { ascending: false }),
          supabase.from('session_attendances').select('*, students(name)')
        ]);
        if (requestSeq !== refreshSeqRef.current) return;
        if (sessionsRes.error) {
          handleSupabaseError(t('appContext.actions.loadSessions'), sessionsRes.error);
        } else {
          const attendances = attendancesRes.data || [];
          setSessions((sessionsRes.data || []).map(row => mapDbSessionToSession(row, attendances)));
        }
      } else if (isTeacherOrHybrid) {
        const allTeacherRelevantActIds = Array.from(
          new Set([...myTeachingActivityIds, ...(isHybrid ? myEnrolledActivityIds : [])])
        );
        const [byTeacherSesRes, byActSesRes] = await Promise.all([
          resolvedTeacherId
            ? supabase
                .from('class_sessions')
                .select('*')
                .eq('teacher_id', resolvedTeacherId)
                .order('date', { ascending: false })
            : Promise.resolve({ data: [], error: null } as any),
          allTeacherRelevantActIds.length > 0
            ? supabase
                .from('class_sessions')
                .select('*')
                .in('activity_id', allTeacherRelevantActIds)
                .order('date', { ascending: false })
            : Promise.resolve({ data: [], error: null } as any)
        ]);
        if (requestSeq !== refreshSeqRef.current) return;

        if (byTeacherSesRes.error || byActSesRes.error) {
          handleSupabaseError(
            t('appContext.actions.loadSessions'),
            byTeacherSesRes.error || byActSesRes.error
          );
        } else {
          const mergedSessions = mergeById<any>(byTeacherSesRes.data || [], byActSesRes.data || []);
          const teachingSessionIds = mergedSessions
            .filter(
              s =>
                s.teacher_id === resolvedTeacherId ||
                myTeachingActivityIds.includes(s.activity_id)
            )
            .map(s => s.id);

          const [teachAttRes, selfAttRes] = await Promise.all([
            teachingSessionIds.length > 0
              ? supabase
                  .from('session_attendances')
                  .select('*, students(name)')
                  .in('session_id', teachingSessionIds)
              : Promise.resolve({ data: [], error: null } as any),
            isHybrid && resolvedStudentId
              ? supabase
                  .from('session_attendances')
                  .select('*, students(name)')
                  .eq('student_id', resolvedStudentId)
              : Promise.resolve({ data: [], error: null } as any)
          ]);
          if (requestSeq !== refreshSeqRef.current) return;

          const mergedAttendances = mergeById<any>(teachAttRes.data || [], selfAttRes.data || []);
          setSessions(mergedSessions.map(row => mapDbSessionToSession(row, mergedAttendances)));
        }
      } else if (isStudent && resolvedStudentId && myEnrolledActivityIds.length > 0) {
        const [sessionsRes, ownAttendancesRes] = await Promise.all([
          supabase
            .from('class_sessions')
            .select(
              'id, activity_id, teacher_id, date, attendees_count, duration_minutes, topic, is_closed, closed_at, closed_by, reopen_reason, reopened_at, reopened_by'
            )
            .in('activity_id', myEnrolledActivityIds)
            .order('date', { ascending: false }),
          supabase
            .from('session_attendances')
            .select('*, students(name)')
            .eq('student_id', resolvedStudentId)
        ]);
        if (requestSeq !== refreshSeqRef.current) return;
        if (sessionsRes.error) {
          handleSupabaseError(t('appContext.actions.loadSessions'), sessionsRes.error);
        } else {
          const ownAttendances = ownAttendancesRes.data || [];
          setSessions(
            (sessionsRes.data || []).map(row => mapDbSessionToSession(row, ownAttendances))
          );
        }
      } else {
        setSessions([]);
      }

      // 8. Liquidaciones de Monitores
      if (isCallerStrictlyAdmin) {
        const payoutsRes = await supabase
          .from('teacher_payouts')
          .select('*')
          .order('period_month', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (payoutsRes.error) {
          handleSupabaseError(t('appContext.actions.loadPayouts'), payoutsRes.error);
        } else {
          setPayouts((payoutsRes.data || []).map(mapDbPayoutToPayout));
        }
      } else if (isTeacherOrHybrid && resolvedTeacherId) {
        const payoutsRes = await supabase
          .from('teacher_payouts')
          .select('*')
          .eq('teacher_id', resolvedTeacherId)
          .order('period_month', { ascending: false });
        if (requestSeq !== refreshSeqRef.current) return;
        if (payoutsRes.error) {
          handleSupabaseError(t('appContext.actions.loadPayouts'), payoutsRes.error);
        } else {
          setPayouts((payoutsRes.data || []).map(mapDbPayoutToPayout));
        }
      } else {
        setPayouts([]);
      }

      // 9. Configuración Global
      try {
        const configQuery = isCallerStrictlyAdmin
          ? supabase.from('app_config').select('*').neq('config_key', 'google_calendar')
          : supabase
              .from('app_config')
              .select('*')
              .not('config_key', 'in', `("google_calendar","${ANNUAL_FEE_CONFIG_KEY}")`);
        const configRes = await configQuery;
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

      // 10. Últimas notas / Comunicados y lecturas por usuario
      try {
        const notesQuery = isCallerStrictlyAdmin
          ? supabase.from('news_notes').select('*').order('date', { ascending: false })
          : supabase
              .from('news_notes')
              .select('*')
              .or('is_deleted.is.null,is_deleted.eq.false')
              .is('deleted_at', null)
              .order('date', { ascending: false });
        const notesRes = await notesQuery;
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

      // 11. Historial de Estados (exclusivo Administrador)
      if (isCallerStrictlyAdmin) {
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
      } else {
        setMemberStatusHistory([]);
      }

      // 12. Avisos de Ausencia de Alumnos
      try {
        if (isCallerStrictlyAdmin) {
          const absencesRes = await supabase
            .from('student_absences')
            .select('*')
            .neq('status', 'cancelled')
            .order('session_date', { ascending: true });
          if (requestSeq !== refreshSeqRef.current) return;
          if (!absencesRes.error && absencesRes.data) {
            setStudentAbsences(absencesRes.data.map(mapDbAbsenceToAbsence));
          }
        } else if (isTeacherOrHybrid) {
          const [teachAbsRes, selfAbsRes] = await Promise.all([
            myTeachingActivityIds.length > 0
              ? supabase
                  .from('student_absences')
                  .select('*')
                  .in('activity_id', myTeachingActivityIds)
                  .neq('status', 'cancelled')
                  .order('session_date', { ascending: true })
              : Promise.resolve({ data: [], error: null } as any),
            isHybrid && resolvedStudentId
              ? supabase
                  .from('student_absences')
                  .select('*')
                  .eq('student_id', resolvedStudentId)
                  .neq('status', 'cancelled')
                  .order('session_date', { ascending: true })
              : Promise.resolve({ data: [], error: null } as any)
          ]);
          if (requestSeq !== refreshSeqRef.current) return;
          if (!teachAbsRes.error && !selfAbsRes.error) {
            const mergedAbsences = mergeById<any>(teachAbsRes.data || [], selfAbsRes.data || []);
            setStudentAbsences(mergedAbsences.map(mapDbAbsenceToAbsence));
          }
        } else if (isStudent && resolvedStudentId) {
          const absencesRes = await supabase
            .from('student_absences')
            .select('*')
            .eq('student_id', resolvedStudentId)
            .neq('status', 'cancelled')
            .order('session_date', { ascending: true });
          if (requestSeq !== refreshSeqRef.current) return;
          if (!absencesRes.error && absencesRes.data) {
            setStudentAbsences(absencesRes.data.map(mapDbAbsenceToAbsence));
          }
        } else {
          setStudentAbsences([]);
        }
      } catch (e) {
        console.warn('student_absences fetch error:', e);
      }

      // 13. Solicitudes de Baja de la Asociación
      try {
        const withdrawalQuery = isCallerStrictlyAdmin
          ? supabase
              .from('membership_withdrawal_requests')
              .select('*')
              .order('created_at', { ascending: false })
          : supabase
              .from('membership_withdrawal_requests')
              .select('*')
              .eq('profile_id', sessionUserId)
              .order('created_at', { ascending: false });
        const withdrawalRes = await withdrawalQuery;
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

      // 14. Cuotas Anuales de Socios (exclusivo Administrador)
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

      // 15. Mensajes de Alumnos sobre Cuotas
      try {
        if (isCallerStrictlyAdmin) {
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
        } else if (isTeacherOrHybrid) {
          const [byTeacherMsgRes, byActMsgRes, selfMsgRes] = await Promise.all([
            resolvedTeacherId
              ? supabase
                  .from('student_payment_messages')
                  .select('*')
                  .eq('teacher_id', resolvedTeacherId)
                  .order('created_at', { ascending: false })
              : Promise.resolve({ data: [], error: null } as any),
            myTeachingActivityIds.length > 0
              ? supabase
                  .from('student_payment_messages')
                  .select('*')
                  .in('activity_id', myTeachingActivityIds)
                  .order('created_at', { ascending: false })
              : Promise.resolve({ data: [], error: null } as any),
            isHybrid && resolvedStudentId
              ? supabase
                  .from('student_payment_messages')
                  .select('*')
                  .eq('student_id', resolvedStudentId)
                  .order('created_at', { ascending: false })
              : Promise.resolve({ data: [], error: null } as any)
          ]);
          if (requestSeq !== refreshSeqRef.current) return;
          const firstErr = byTeacherMsgRes.error || byActMsgRes.error || selfMsgRes.error;
          if (firstErr) {
            if (
              firstErr.code === '42P01' ||
              firstErr.code === 'PGRST205' ||
              firstErr.message?.toLowerCase().includes('student_payment_messages')
            ) {
              setStudentPaymentMessagesTableMissing(true);
              setStudentPaymentMessages([]);
            } else {
              setStudentPaymentMessagesTableMissing(false);
              console.warn('student_payment_messages fetch error:', firstErr);
            }
          } else {
            setStudentPaymentMessagesTableMissing(false);
            const mergedMsgs = mergeById<any>(
              byTeacherMsgRes.data || [],
              byActMsgRes.data || [],
              selfMsgRes.data || []
            );
            setStudentPaymentMessages(mergedMsgs.map(mapDbStudentPaymentMessageToMessage));
          }
        } else if (isStudent && resolvedStudentId) {
          const payMsgsRes = await supabase
            .from('student_payment_messages')
            .select('*')
            .eq('student_id', resolvedStudentId)
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
        } else {
          setStudentPaymentMessagesTableMissing(false);
          setStudentPaymentMessages([]);
        }
      } catch (e) {
        console.warn('student_payment_messages fetch error:', e);
      }

      if (requestSeq === refreshSeqRef.current) {
        bumpDbSyncVersion();
      }
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.generalSync'), err);
    } finally {
      if (requestSeq === refreshSeqRef.current) {
        setIsLoadingDb(false);
      }
    }
  }, [
    bumpDbSyncVersion,
    currentUserRef,
    handleSupabaseError,
    resolveAuthDenial,
    setActivities,
    setAppConfigs,
    setAuthDenialKind,
    setCurrentRoleState,
    setCurrentStudentId,
    setCurrentTeacherId,
    setCurrentUser,
    setDbError,
    setExpenses,
    setIsLoadingDb,
    setMemberAnnualFees,
    setMemberAnnualFeesTableMissing,
    setMemberStatusHistory,
    setNewsNotes,
    setPayments,
    setPayouts,
    setProfiles,
    setReadNewsNoteIds,
    setSessions,
    setStudentAbsences,
    setStudents,
    setTeachers,
    t
  ]);

  useLayoutEffect(() => {
    return registerRefreshHandler(refreshFromSupabase);
  }, [registerRefreshHandler, refreshFromSupabase]);

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

  // Moderación de acceso de cuentas pendientes/rechazadas
  const approvePendingUserAccess: ModerationContextType['approvePendingUserAccess'] = async (
    userId,
    overrides
  ) => {
    clearDbError();
    try {
      const targetProfile = profiles.find(p => p.id === userId);
      const emailNorm = (targetProfile?.email || '').toLowerCase().trim();
      const todayStr = getMadridDateIso();

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

  const rejectOrBlockUserAccess: ModerationContextType['rejectOrBlockUserAccess'] = async userId => {
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

      const todayStr = getMadridDateIso();
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

  // Validación de alumnos provisionales
  const validatePendingStudent: ModerationContextType['validatePendingStudent'] = async (
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
      const todayStr = getMadridDateIso();
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

  // Moderación de solicitudes de inscripción y baja en talleres
  const requestActivityEnrollment: ModerationContextType['requestActivityEnrollment'] = async (
    activityId,
    explicitStudentId
  ) => {
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

      const today = getMadridDateIso();
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

  const cancelActivityEnrollmentRequest: ModerationContextType['cancelActivityEnrollmentRequest'] = async (
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
      const todayStr = getMadridDateIso(new Date(nowIso));
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

  const confirmActivityEnrollment: ModerationContextType['confirmActivityEnrollment'] = async (
    studentId,
    activityId
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
        if (
          stReactivate.error &&
          (stReactivate.error.code === '42703' || stReactivate.error.message?.includes('column'))
        ) {
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
              getMadridDateIso(),
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

  const rejectActivityEnrollment: ModerationContextType['rejectActivityEnrollment'] = async (
    studentId,
    activityId
  ) => {
    return await cancelActivityEnrollmentRequest(studentId, activityId);
  };

  const requestActivityUnenrollment: ModerationContextType['requestActivityUnenrollment'] = async (
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

  const cancelActivityUnenrollmentRequest: ModerationContextType['cancelActivityUnenrollmentRequest'] = async (
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

  const approveActivityUnenrollment: ModerationContextType['approveActivityUnenrollment'] = async (
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
      const todayStr = getMadridDateIso(new Date(nowIso));
      const trimmedNotes = checks.notes?.trim() || null;

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

  const rejectActivityUnenrollment: ModerationContextType['rejectActivityUnenrollment'] = async (
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
  const requestAssociationWithdrawal: ModerationContextType['requestAssociationWithdrawal'] = async reason => {
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

  const cancelAssociationWithdrawalRequest: ModerationContextType['cancelAssociationWithdrawalRequest'] = async requestId => {
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

  const approveAssociationWithdrawal: ModerationContextType['approveAssociationWithdrawal'] = async (
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
      const todayStr = getMadridDateIso(new Date(nowIso));
      const trimmedNotes = checks.notes?.trim() || null;

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

  const rejectAssociationWithdrawal: ModerationContextType['rejectAssociationWithdrawal'] = async (
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

  // Avisos y solicitudes de ausencia de alumnos
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

  const reportStudentAbsence: ModerationContextType['reportStudentAbsence'] = async ({
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

  const cancelStudentAbsence: ModerationContextType['cancelStudentAbsence'] = async absenceId => {
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

  const respondToStudentAbsenceRequest: ModerationContextType['respondToStudentAbsenceRequest'] = async (
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

  // Mensajes de alumnos sobre cuotas hacia el profesor
  const sendStudentPaymentMessage: ModerationContextType['sendStudentPaymentMessage'] = async params => {
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

  const cancelStudentPaymentMessage: ModerationContextType['cancelStudentPaymentMessage'] = async messageId => {
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

  const evaluateStudentPaymentMessage: ModerationContextType['evaluateStudentPaymentMessage'] = async ({
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
              paymentDate: getMadridDateIso(),
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

  return (
    <ModerationContext.Provider
      value={{
        membershipWithdrawalRequests,
        setMembershipWithdrawalRequests,
        studentPaymentMessages,
        setStudentPaymentMessages,
        studentPaymentMessagesTableMissing,
        setStudentPaymentMessagesTableMissing,
        approvePendingUserAccess,
        rejectOrBlockUserAccess,
        validatePendingStudent,
        requestActivityEnrollment,
        cancelActivityEnrollmentRequest,
        confirmActivityEnrollment,
        rejectActivityEnrollment,
        requestActivityUnenrollment,
        cancelActivityUnenrollmentRequest,
        approveActivityUnenrollment,
        rejectActivityUnenrollment,
        requestAssociationWithdrawal,
        cancelAssociationWithdrawalRequest,
        approveAssociationWithdrawal,
        rejectAssociationWithdrawal,
        reportStudentAbsence,
        cancelStudentAbsence,
        respondToStudentAbsenceRequest,
        sendStudentPaymentMessage,
        cancelStudentPaymentMessage,
        evaluateStudentPaymentMessage
      }}
    >
      {children}
    </ModerationContext.Provider>
  );
};

export const useModeration = () => {
  const context = useContext(ModerationContext);
  if (!context) {
    throw new Error('useModeration must be used within a ModerationProvider');
  }
  return context;
};
