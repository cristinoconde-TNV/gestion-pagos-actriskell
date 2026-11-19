import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, computeOperationalRoleOutcome, deriveOperationalRole } from '../context/AppContext';
import { USER_ROLE_VALUES, normalizeUserRole, deriveAccessFromRow } from '../lib/authRole';
import { createTranslator } from '../lib/i18n';
import { AuthUser, MemberType, OperationalRole, Student, StudentStatus, Teacher, UserRole } from '../types';
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  GraduationCap,
  ShieldCheck,
  Search,
  Edit2,
  Trash2,
  Clock,
  Check,
  X,
  Copy,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Power,
  Mail,
  Phone,
  Link2,
  RotateCcw
} from 'lucide-react';

interface AdminUsersViewProps {
  onOpenAddStudent: (student?: Student) => void;
  onOpenAddTeacher: (teacher?: Teacher) => void;
  onOpenEnrollStudent: (activityId?: string) => void;
}

type AdminUsersSubTab = 'enrollments' | 'students' | 'teachers' | 'accounts';
type StudentFilterChip =
  | 'all'
  | StudentStatus
  | 'active_pending_active'
  | 'active_pending_teacher';

interface PendingConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'danger' | 'warning';
  onConfirm: () => Promise<void> | void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  onOpenAddStudent,
  onOpenAddTeacher,
  onOpenEnrollStudent
}) => {
  const {
    students,
    teachers,
    activities,
    profiles,
    currentUser,
    updateStudent,
    deleteStudent,
    validatePendingStudent,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    enrollStudentInActivity,
    unenrollStudentFromActivity,
    updateTeacher,
    deleteTeacher,
    createUserByAdmin,
    updateUserRole,
    updateUserProfileByAdmin,
    toggleUserSocioMembership,
    toggleUserAccessStatus,
    language
  } = useApp();
  const t = createTranslator(language);

  const pendingValidationStudents = useMemo(
    () =>
      students.filter(
        s => s.status === 'pending_validation' || s.validationStatus === 'pending'
      ),
    [students]
  );

  const pendingEnrollmentRequests = useMemo(() => {
    const items: Array<{
      student: Student;
      activityId: string;
      activityName: string;
      teacherName: string;
      enrolledSince: string;
    }> = [];
    for (const st of students) {
      for (const req of st.pendingEnrollments || []) {
        const act = activities.find(a => a.id === req.activityId);
        if (!act) continue;
        const teacher = teachers.find(tc => tc.id === act.teacherId);
        items.push({
          student: st,
          activityId: act.id,
          activityName: act.name,
          teacherName: teacher?.name || t('adminUsers.unassigned'),
          enrolledSince: req.enrolledSince
        });
      }
    }
    return items;
  }, [students, activities, teachers, language]);

  const totalPendingEnrollmentsAndSignups =
    pendingValidationStudents.length + pendingEnrollmentRequests.length;

  const [activeSubTab, setActiveSubTab] = useState<AdminUsersSubTab>(
    totalPendingEnrollmentsAndSignups > 0 ? 'enrollments' : 'students'
  );
  const hasManualSubTabRef = useRef(false);
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const selectSubTab = (tab: AdminUsersSubTab, scrollToSearch = false) => {
    hasManualSubTabRef.current = true;
    setActiveSubTab(tab);
    if (scrollToSearch) {
      setTimeout(() => {
        searchBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  useEffect(() => {
    if (!hasManualSubTabRef.current && totalPendingEnrollmentsAndSignups > 0) {
      setActiveSubTab('enrollments');
    }
  }, [totalPendingEnrollmentsAndSignups]);

  const [searchQuery, setSearchQuery] = useState('');

  // Filtros internos
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentFilterChip>('all');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [enrollmentTeacherFilter, setEnrollmentTeacherFilter] = useState<string>('all');
  const [enrollmentActivityFilter, setEnrollmentActivityFilter] = useState<string>('all');
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Confirmación in-app
  const [confirmAction, setConfirmAction] = useState<PendingConfirmAction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Feedback general
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [validatingStudentId, setValidatingStudentId] = useState<string | null>(null);
  const [busyEnrollmentKey, setBusyEnrollmentKey] = useState<string | null>(null);

  // Alta de usuario Auth inline
  const [isAddingAuthUser, setIsAddingAuthUser] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authRole, setAuthRole] = useState<UserRole>(UserRole.Alumno);
  const [authPassword, setAuthPassword] = useState(`Triskell${Math.floor(1000 + Math.random() * 9000)}!`);
  const [authTeacherId, setAuthTeacherId] = useState('');
  const [authStudentId, setAuthStudentId] = useState('');
  const [authIsSocio, setAuthIsSocio] = useState(true);
  const [authAccess, setAuthAccess] = useState(true);
  const [authCreateTeacher, setAuthCreateTeacher] = useState(true);
  const [authCreateStudent, setAuthCreateStudent] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    pass: string;
    roleLabel: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Edición de usuario Auth / Perfil
  const [editingProfile, setEditingProfile] = useState<AuthUser | null>(null);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfileRole, setEditProfileRole] = useState<UserRole>(UserRole.Alumno);
  const [editProfileTeacherId, setEditProfileTeacherId] = useState('');
  const [editProfileStudentId, setEditProfileStudentId] = useState('');
  const [editProfileMemberNumber, setEditProfileMemberNumber] = useState('');
  const [editProfileMemberType, setEditProfileMemberType] = useState<MemberType>('socio');
  const [editProfileIsSocio, setEditProfileIsSocio] = useState(true);
  const [editProfileStartDate, setEditProfileStartDate] = useState('');
  const [editProfileEndDate, setEditProfileEndDate] = useState('');
  const [editProfileActive, setEditProfileActive] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [busySocioProfileId, setBusySocioProfileId] = useState<string | null>(null);

  const normalizedQuery = searchQuery.toLowerCase().trim();

  const getRoleLabel = (role: UserRole | string | '') => {
    if (!role) return t('adminUsers.roles.none');
    return normalizeUserRole(role);
  };

  const getOperationalRoleLabel = (opRole: OperationalRole) => {
    switch (opRole) {
      case 'alumno':
        return t('adminUsers.accountsTab.operationalRoles.alumno');
      case 'profesor':
        return t('adminUsers.accountsTab.operationalRoles.profesor');
      case 'hibrido':
        return t('adminUsers.accountsTab.operationalRoles.hibrido');
      case 'vacio':
      default:
        return t('adminUsers.accountsTab.operationalRoles.vacio');
    }
  };

  const getProfileLiveMatrix = (
    p: AuthUser,
    overrideIsSocio?: boolean,
    overrideRole?: UserRole | '',
    overrideTeacherId?: string,
    overrideStudentId?: string,
    overrideAccess?: boolean
  ) => {
    const emailNorm = (p.email || '').toLowerCase().trim();
    const resolvedTeacherId = overrideTeacherId !== undefined ? overrideTeacherId : p.teacherId;
    const resolvedStudentId = overrideStudentId !== undefined ? overrideStudentId : p.studentId;
    const linkedStudent = students.find(
      s =>
        (resolvedStudentId && s.id === resolvedStudentId) ||
        s.profileId === p.id ||
        (emailNorm && s.email.toLowerCase().trim() === emailNorm)
    );
    const linkedTeacher = teachers.find(
      tc =>
        (resolvedTeacherId && tc.id === resolvedTeacherId) ||
        (emailNorm && tc.email.toLowerCase().trim() === emailNorm)
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
    const isSocio =
      overrideIsSocio !== undefined
        ? overrideIsSocio
        : p.isSocio !== undefined
        ? p.isSocio
        : p.memberType !== 'alumno_no_socio' && p.memberType !== 'monitor_no_socio';

    const resolvedManualAccess =
      overrideAccess !== undefined
        ? overrideAccess
        : p.access !== undefined
        ? p.access
        : p.active;

    const outcome = computeOperationalRoleOutcome({
      currentRole: overrideRole !== undefined ? overrideRole : p.role,
      email: p.email,
      hasActiveStudentAssignment,
      hasActiveTeacherAssignment,
      isSocio,
      manualAccess: resolvedManualAccess
    });

    const operationalRole: OperationalRole =
      p.operationalRole && overrideIsSocio === undefined && overrideTeacherId === undefined && overrideStudentId === undefined
        ? p.operationalRole
        : deriveOperationalRole(hasActiveStudentAssignment, hasActiveTeacherAssignment);

    return {
      isSocio,
      operationalRole,
      outcome,
      linkedStudent,
      linkedTeacher
    };
  };

  const getMemberTypeBadge = (memberType?: MemberType) => {
    if (memberType === 'alumno_no_socio') {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          {t('adminUsers.memberType.nonMemberStudent')}
        </span>
      );
    }
    if (memberType === 'monitor_no_socio') {
      return (
        <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
          {t('adminUsers.memberType.nonMemberTeacher')}
        </span>
      );
    }
    return null;
  };

  const getStudentStatusBadge = (status: StudentStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            {t('adminUsers.studentStatus.active')}
          </span>
        );
      case 'pending_validation':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            <Clock className="h-3 w-3" />
            {t('adminUsers.studentStatus.pendingValidation')}
          </span>
        );
      case 'trial':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
            {t('adminUsers.studentStatus.trial')}
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
            {t('adminUsers.studentStatus.inactive')}
          </span>
        );
    }
  };

  const getProfileNameById = (profileId?: string) => {
    if (!profileId) return null;
    const prof = profiles.find(p => p.id === profileId);
    return prof ? prof.name : null;
  };

  // Estadísticas rápidas
  const activeProfilesCount = profiles.filter(p => deriveAccessFromRow(p) && Boolean(p.role)).length;
  const inactiveProfilesCount = profiles.filter(p => !deriveAccessFromRow(p)).length;
  const pendingProfilesCount = profiles.filter(p => deriveAccessFromRow(p) && !p.role).length;

  const activeStudentsCount = students.filter(s => s.status === 'active').length;
  const inactiveStudentsCount = students.filter(s => s.status === 'inactive').length;
  const pendingStudentsCount = pendingValidationStudents.length;

  // Estadísticas rápidas de profesores / monitores
  const activeTeachersCount = teachers.filter(tc => tc.active !== false).length;
  const inactiveTeachersCount = teachers.filter(tc => tc.active === false).length;
  const pendingTeachersCount = profiles.filter(
    p => deriveAccessFromRow(p) && (p.role === UserRole.Monitor || p.role === UserRole.Hibrido) && !p.teacherId
  ).length;

  // Calcula totales de inscripciones: activas, inactivas (soft-deleted) y pendientes
  const {
    totalEnrollmentsCount,
    activeEnrollmentsCount,
    inactiveEnrollmentsCount,
    pendingEnrollmentsCount
  } = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let pending = 0;

    for (const st of students) {
      for (const enr of st.activities || []) {
        if (enr.status === 'active') active++;
        else if (enr.status === 'pending_unenroll') pending++;
        else if (enr.status === 'inactive') inactive++;
      }
      pending += (st.pendingEnrollments || []).length;
      inactive += (st.inactiveEnrollments || []).length;
    }

    return {
      totalEnrollmentsCount: active + inactive + pending,
      activeEnrollmentsCount: active,
      inactiveEnrollmentsCount: inactive,
      pendingEnrollmentsCount: pending
    };
  }, [students]);

  // Filas de inscripciones planas para gestión detallada (incluye activas e inactivas/soft-deleted)
  const enrollmentRows = useMemo(() => {
    const rows: Array<{
      student: Student;
      activityId: string;
      activityName: string;
      teacherId: string;
      teacherName: string;
      price: number;
      billingMode: 'monthly' | 'per_class';
      enrolledSince: string;
      endedAt?: string;
      addedByName: string | null;
      isPendingStudent: boolean;
      isInactiveEnrollment: boolean;
      enrollmentStatus: string;
    }> = [];

    for (const st of students) {
      const addedByName = getProfileNameById(st.registeredBy);
      const isPendingStudent =
        st.status === 'pending_validation' || st.validationStatus === 'pending';

      const appendRow = (enr: Student['activities'][number], isInactiveEnrollment: boolean) => {
        const act = activities.find(a => a.id === enr.activityId);
        if (!act) return;
        const teacher = teachers.find(tc => tc.id === act.teacherId);
        const billingMode = enr.billingMode || act.billingMode;
        const defaultPrice =
          billingMode === 'per_class' ? act.defaultPricePerClass : act.defaultPriceMonthly;

        rows.push({
          student: st,
          activityId: act.id,
          activityName: act.name,
          teacherId: act.teacherId,
          teacherName: teacher?.name || t('adminUsers.unassigned'),
          price: enr.customPrice ?? defaultPrice,
          billingMode,
          enrolledSince: enr.enrolledSince,
          endedAt: enr.endedAt || enr.deletedAt?.split('T')[0],
          addedByName,
          isPendingStudent,
          isInactiveEnrollment,
          enrollmentStatus: enr.status || (isInactiveEnrollment ? 'inactive' : 'active')
        });
      };

      for (const enr of st.activities || []) {
        appendRow(enr, enr.status === 'inactive' || enr.active === false);
      }
      for (const enr of st.inactiveEnrollments || []) {
        appendRow(enr, true);
      }
    }

    return rows
      .filter(row => {
        if (enrollmentStatusFilter === 'active' && row.isInactiveEnrollment) {
          return false;
        }
        if (enrollmentStatusFilter === 'inactive' && !row.isInactiveEnrollment) {
          return false;
        }
        if (enrollmentTeacherFilter !== 'all' && row.teacherId !== enrollmentTeacherFilter) {
          return false;
        }
        if (enrollmentActivityFilter !== 'all' && row.activityId !== enrollmentActivityFilter) {
          return false;
        }
        if (normalizedQuery) {
          const haystack = [
            row.student.name,
            row.student.email,
            row.student.phone,
            row.activityName,
            row.teacherName,
            row.addedByName || ''
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isInactiveEnrollment !== b.isInactiveEnrollment) {
          return a.isInactiveEnrollment ? 1 : -1;
        }
        return a.student.name.localeCompare(
          b.student.name,
          language === 'en' ? 'en' : language === 'gl' ? 'gl' : 'es'
        );
      });
  }, [
    students,
    activities,
    teachers,
    profiles,
    enrollmentTeacherFilter,
    enrollmentActivityFilter,
    enrollmentStatusFilter,
    normalizedQuery,
    language
  ]);

  // Alumnos filtrados (pendientes de validación primero)
  const filteredStudents = useMemo(() => {
    const filtered = students.filter(st => {
      const isPending =
        st.status === 'pending_validation' || st.validationStatus === 'pending';
      if (studentStatusFilter === 'pending_validation') {
        if (!isPending) return false;
      } else if (studentStatusFilter === 'active_pending_active') {
        if (st.memberType !== 'alumno_no_socio' || st.status === 'inactive') return false;
      } else if (studentStatusFilter === 'active_pending_teacher') {
        if (st.memberType !== 'monitor_no_socio') return false;
      } else if (studentStatusFilter !== 'all' && st.status !== studentStatusFilter) {
        return false;
      }
      if (normalizedQuery) {
        const actNames = (st.activities || [])
          .map(e => activities.find(a => a.id === e.activityId)?.name || '')
          .join(' ');
        const haystack = [
          st.name,
          st.email,
          st.phone,
          st.memberNumber || '',
          st.notes || '',
          actNames
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aPending = a.status === 'pending_validation' || a.validationStatus === 'pending';
      const bPending = b.status === 'pending_validation' || b.validationStatus === 'pending';
      if (aPending !== bPending) return aPending ? -1 : 1;
      return a.name.localeCompare(b.name, language === 'en' ? 'en' : language === 'gl' ? 'gl' : 'es');
    });
  }, [students, activities, studentStatusFilter, normalizedQuery, language]);

  // Profesores marcados como "Monitor no socio" para el filtro específico
  const filteredNonMemberTeachers = useMemo(() => {
    if (studentStatusFilter !== 'active_pending_teacher') return [];
    return teachers.filter(tc => {
      if (tc.memberType !== 'monitor_no_socio') return false;
      if (normalizedQuery) {
        const haystack = [tc.name, tc.email, tc.phone, tc.memberNumber || '', tc.notes || '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [teachers, studentStatusFilter, normalizedQuery]);

  // Profesores filtrados
  const filteredTeachers = useMemo(() => {
    return teachers.filter(tc => {
      if (teacherStatusFilter === 'active' && !tc.active) return false;
      if (teacherStatusFilter === 'inactive' && tc.active) return false;
      if (normalizedQuery) {
        const tActs = activities
          .filter(a => a.teacherId === tc.id)
          .map(a => a.name)
          .join(' ');
        const haystack = [tc.name, tc.email, tc.phone, tc.memberNumber || '', tc.notes || '', tActs]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [teachers, activities, teacherStatusFilter, normalizedQuery]);

  // Perfiles Auth filtrados
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      const isProfileActive = deriveAccessFromRow(p);
      const isProfilePending = isProfileActive && !p.role;
      if (accountStatusFilter === 'active' && (!isProfileActive || !p.role)) return false;
      if (accountStatusFilter === 'inactive' && isProfileActive) return false;
      if (accountStatusFilter === 'pending' && !isProfilePending) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        p.name,
        p.email,
        p.memberNumber || '',
        getRoleLabel(p.role),
        p.role || '',
        isProfileActive ? t('adminUsers.accountsTab.accessYes') : t('adminUsers.accountsTab.accessNo')
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [profiles, accountStatusFilter, normalizedQuery]);

  const handleValidateStudent = async (st: Student, approve: boolean) => {
    if (validatingStudentId === st.id) return;
    setValidatingStudentId(st.id);
    setActionFeedback(null);
    try {
      const res = await validatePendingStudent(st.id, approve);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: approve
            ? t('adminUsers.studentsTab.validateApproved', { name: st.name })
            : t('adminUsers.studentsTab.validateRejected', { name: st.name })
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('adminUsers.studentsTab.validateError')
        });
      }
    } finally {
      setValidatingStudentId(null);
    }
  };

  const handleCreateAuthUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authName.trim() || !authEmail.trim()) {
      setActionFeedback({
        type: 'error',
        message: t('adminUsers.accountsTab.missingNameEmailError')
      });
      return;
    }

    setIsSubmittingAuth(true);
    setActionFeedback(null);
    try {
      const res = await createUserByAdmin({
        email: authEmail.trim(),
        fullName: authName.trim(),
        role: authRole,
        isSocio: authIsSocio,
        access: authAccess,
        password: authPassword.trim() || undefined,
        teacherId:
          authRole === UserRole.Monitor || authRole === UserRole.Hibrido
            ? authTeacherId || undefined
            : undefined,
        studentId:
          authRole === UserRole.Alumno || authRole === UserRole.Hibrido || authRole === UserRole.Socio
            ? authStudentId || undefined
            : undefined,
        createTeacherProfile:
          (authRole === UserRole.Monitor || authRole === UserRole.Hibrido) &&
          authCreateTeacher &&
          !authTeacherId,
        createStudentProfile:
          (authRole === UserRole.Alumno || authRole === UserRole.Hibrido || authRole === UserRole.Socio) &&
          authCreateStudent &&
          !authStudentId
      });

      if (!res.success) {
        setActionFeedback({
          type: 'error',
          message: res.error || t('adminUsers.accountsTab.createError')
        });
      } else {
        const passUsed = res.tempPassword || authPassword;
        setCreatedCredentials({
          email: authEmail.trim(),
          pass: passUsed,
          roleLabel: getRoleLabel(authRole)
        });
        setActionFeedback({
          type: 'success',
          message: t('adminUsers.accountsTab.createSuccess', { name: authName.trim() })
        });
        setAuthName('');
        setAuthEmail('');
        setAuthIsSocio(true);
        setAuthAccess(true);
        setAuthPassword(`Triskell${Math.floor(1000 + Math.random() * 9000)}!`);
        setAuthTeacherId('');
        setAuthStudentId('');
        setIsAddingAuthUser(false);
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const openEditProfileModal = (profile: AuthUser) => {
    const derivedSocio =
      profile.isSocio !== undefined
        ? profile.isSocio
        : profile.memberType !== 'alumno_no_socio' && profile.memberType !== 'monitor_no_socio';
    const normalizedRole = normalizeUserRole(profile.role, UserRole.Socio);
    setEditingProfile(profile);
    setEditProfileName(profile.name);
    setEditProfileRole(normalizedRole);
    setEditProfileTeacherId(profile.teacherId || '');
    setEditProfileStudentId(profile.studentId || '');
    setEditProfileMemberNumber(profile.memberNumber || '');
    setEditProfileMemberType(
      profile.memberType ||
        (derivedSocio
          ? 'socio'
          : normalizedRole === UserRole.Monitor
          ? 'monitor_no_socio'
          : 'alumno_no_socio')
    );
    setEditProfileIsSocio(derivedSocio);
    setEditProfileStartDate(profile.startDate || '');
    setEditProfileEndDate(profile.endDate || '');
    setEditProfileActive(deriveAccessFromRow(profile));
  };

  const handleSaveEditedProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile || !editProfileName.trim()) return;
    setIsSavingProfile(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const resolvedEndDate = editProfileActive
      ? editProfileEndDate || null
      : editProfileEndDate || todayStr;
    const res = await updateUserProfileByAdmin(editingProfile.id, {
      name: editProfileName.trim(),
      role: editProfileRole,
      teacherId:
        editProfileRole === UserRole.Monitor || editProfileRole === UserRole.Hibrido
          ? editProfileTeacherId || null
          : null,
      studentId:
        editProfileRole === UserRole.Alumno ||
        editProfileRole === UserRole.Hibrido ||
        editProfileRole === UserRole.Socio
          ? editProfileStudentId || null
          : null,
      memberNumber: editProfileMemberNumber.trim() || null,
      memberType: editProfileMemberType || null,
      isSocio: editProfileIsSocio,
      startDate: editProfileStartDate || null,
      endDate: resolvedEndDate,
      access: editProfileActive,
      active: editProfileActive
    });
    setIsSavingProfile(false);
    if (res.success) {
      setActionFeedback({
        type: 'success',
        message: t('adminUsers.editModal.updateSuccess', { name: editProfileName.trim() })
      });
      setEditingProfile(null);
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || t('adminUsers.editModal.updateError')
      });
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = t('adminUsers.accountsTab.clipboardTemplate', {
      origin: window.location.origin,
      email: createdCredentials.email,
      password: createdCredentials.pass,
      role: createdCredentials.roleLabel
    });
    navigator.clipboard?.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2000);
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    setIsConfirming(true);
    try {
      await confirmAction.onConfirm();
    } finally {
      setIsConfirming(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t('adminUsers.header.title')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('adminUsers.header.subtitle')}
          </p>
        </div>

        {/*<div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenAddStudent()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" />
            <span>Alta Alumno / Socio</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenAddTeacher()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs whitespace-nowrap"
          >
            <GraduationCap className="h-4 w-4" />
            <span>Alta Profesor</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenEnrollStudent()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            <span>Inscribir en Taller</span>
          </button>
        </div>*/}
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => selectSubTab('students', true)}
          className={`text-left rounded-2xl border p-4 shadow-xs transition ${
            activeSubTab === 'students'
              ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
              : pendingStudentsCount > 0
              ? 'border-amber-400/70 bg-amber-50/50 dark:bg-amber-950/20 hover:border-emerald-400/60'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('adminUsers.kpis.studentsTitle')}
            </span>
            <BookOpen className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
            {students.length}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            {t('adminUsers.kpis.studentsActiveCount', { count: activeStudentsCount })}
            <br />
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              {t('adminUsers.kpis.studentsInactivePendingCount', {
                inactive: inactiveStudentsCount,
                pending: pendingStudentsCount
              })}
            </span>
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectSubTab('enrollments', true)}
          className={`text-left rounded-2xl border p-4 shadow-xs transition ${
            activeSubTab === 'enrollments'
              ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30'
              : pendingEnrollmentsCount > 0
              ? 'border-amber-400/70 bg-amber-50/70 dark:bg-amber-950/25 hover:border-amber-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-400/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              {t('adminUsers.kpis.enrollmentsTitle')}
            </span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
            {totalEnrollmentsCount}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            {t('adminUsers.kpis.enrollmentsActiveCount', { count: activeEnrollmentsCount })}
            <br />
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              {t('adminUsers.kpis.enrollmentsInactivePendingCount', {
                inactive: inactiveEnrollmentsCount,
                pending: pendingEnrollmentsCount
              })}
            </span>
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectSubTab('teachers', true)}
          className={`text-left rounded-2xl border p-4 shadow-xs transition ${
            activeSubTab === 'teachers'
              ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('adminUsers.kpis.teachersTitle')}
            </span>
            <GraduationCap className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
            {teachers.length}
          </p>
          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
            {t('adminUsers.kpis.teachersActiveCount', { count: activeTeachersCount })}
            <br />
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              {t('adminUsers.kpis.teachersInactivePendingCount', {
                inactive: inactiveTeachersCount,
                pending: pendingTeachersCount
              })}
            </span>
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectSubTab('accounts', true)}
          className={`text-left rounded-2xl border p-4 shadow-xs transition ${
            activeSubTab === 'accounts'
              ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-50/40 dark:bg-purple-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-400/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('adminUsers.kpis.accountsTitle')}
            </span>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
            {profiles.length}
          </p>
          <p className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
            {t('adminUsers.kpis.accountsActives', { count: activeProfilesCount })}
            <br />
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              {t('adminUsers.kpis.accountsInactivePendingCount', {
                inactive: inactiveProfilesCount,
                pending: pendingProfilesCount
              })}
            </span>
          </p>
        </button>
      </div>

      {/* Feedback Banner */}
      {actionFeedback && (
        <div
          className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-2 ${
            actionFeedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="font-semibold">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Barra Buscador + Acción dinámica */}
      <div ref={searchBarRef} className="scroll-mt-20 space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('adminUsers.searchBar.placeholder')}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Botón de acción dinámico según la pestaña activa */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            {activeSubTab === 'students'
              ? t('adminUsers.searchBar.subTabStudents')
              : activeSubTab === 'teachers'
              ? t('adminUsers.searchBar.subTabTeachers')
              : activeSubTab === 'accounts'
              ? t('adminUsers.searchBar.subTabAccounts')
              : t('adminUsers.searchBar.subTabEnrollments')}
          </span>

          {activeSubTab === 'students' && (
            <button
              type="button"
              onClick={() => onOpenAddStudent()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{t('adminUsers.searchBar.newStudentButton')}</span>
            </button>
          )}

          {activeSubTab === 'teachers' && (
            <button
              type="button"
              onClick={() => onOpenAddTeacher()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs whitespace-nowrap"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>{t('adminUsers.searchBar.newTeacherButton')}</span>
            </button>
          )}

          {activeSubTab === 'accounts' && (
            <button
              type="button"
              onClick={() => setIsAddingAuthUser(prev => !prev)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-700 transition shadow-xs whitespace-nowrap"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>
                {isAddingAuthUser
                  ? t('adminUsers.searchBar.closeFormButton')
                  : t('adminUsers.searchBar.newAuthUserButton')}
              </span>
            </button>
          )}

          {activeSubTab === 'enrollments' && (
            <button
              type="button"
              onClick={() =>
                onOpenEnrollStudent(
                  enrollmentActivityFilter !== 'all' ? enrollmentActivityFilter : undefined
                )
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t('adminUsers.searchBar.newEnrollmentButton')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Aviso destacado siempre visible si hay altas rápidas o solicitudes pendientes al estar en otra subpestaña */}
      {totalPendingEnrollmentsAndSignups > 0 && activeSubTab !== 'enrollments' && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
              {pendingEnrollmentRequests.length > 0 && pendingValidationStudents.length > 0
                ? t('adminUsers.pendingNotice.both', {
                    requests: pendingEnrollmentRequests.length,
                    signups: pendingValidationStudents.length
                  })
                : pendingEnrollmentRequests.length > 0
                ? t('adminUsers.pendingNotice.requestsOnly', {
                    requests: pendingEnrollmentRequests.length
                  })
                : t('adminUsers.pendingNotice.signupsOnly', {
                    signups: pendingValidationStudents.length
                  })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => selectSubTab('enrollments')}
            className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 transition whitespace-nowrap"
          >
            {t('adminUsers.pendingNotice.reviewNow')}
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-PESTAÑA 1: INSCRIPCIONES Y ALTAS DE PROFESORES                 */}
      {/* ================================================================== */}
      {activeSubTab === 'enrollments' && (
        <div className="space-y-5">
          {/* Bloque A: Altas rápidas pendientes de validación */}
          <div className="rounded-2xl border border-amber-500/35 bg-amber-50/60 dark:bg-amber-950/20 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {t('adminUsers.enrollmentsTab.quickSignupsTitle', {
                      count: pendingValidationStudents.length
                    })}
                  </h2>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                    {t('adminUsers.enrollmentsTab.quickSignupsSubtitle')}
                  </p>
                </div>
              </div>
            </div>

            {pendingValidationStudents.length === 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-white/70 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{t('adminUsers.enrollmentsTab.noPendingSignups')}</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingValidationStudents.map(st => {
                  const addedByName = getProfileNameById(st.registeredBy);
                  const stActivities = (st.activities || []).map(enr => {
                    const act = activities.find(a => a.id === enr.activityId);
                    const tc = act ? teachers.find(teacherItem => teacherItem.id === act.teacherId) : undefined;
                    return {
                      actId: enr.activityId,
                      actName: act?.name || t('adminUsers.enrollmentsTab.deletedWorkshop'),
                      teacherName: tc?.name
                    };
                  });

                  return (
                    <div
                      key={st.id}
                      className="rounded-xl border border-amber-500/30 bg-white dark:bg-slate-900 px-3 py-2 md:p-3.5 shadow-xs"
                    >
                      {/* Vista móvil: 1 fila compacta + botones solo icono */}
                      <div className="flex md:hidden items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
                            title={t('adminUsers.enrollmentsTab.pendingDotTooltip')}
                          />
                          <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {st.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenAddStudent(st)}
                            title={t('adminUsers.enrollmentsTab.editCardTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.editCardAria', { name: st.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                title: t('adminUsers.enrollmentsTab.rejectSignupTitle'),
                                description: t('adminUsers.enrollmentsTab.rejectSignupDescription', {
                                  name: st.name
                                }),
                                confirmLabel: t('adminUsers.enrollmentsTab.rejectSignupConfirm'),
                                tone: 'warning',
                                onConfirm: () => handleValidateStudent(st, false)
                              })
                            }
                            title={t('adminUsers.enrollmentsTab.rejectSignupTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.rejectSignupAria', { name: st.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={validatingStudentId === st.id}
                            onClick={() => handleValidateStudent(st, true)}
                            title={t('adminUsers.enrollmentsTab.confirmMemberTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.confirmMemberAria', { name: st.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Vista escritorio */}
                      <div className="hidden md:flex md:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {st.name}
                            </span>
                            {getStudentStatusBadge(st.status)}
                            {addedByName && (
                              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                                {t('adminUsers.enrollmentsTab.addedBy', { name: addedByName })}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                            {st.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {st.phone}
                              </span>
                            )}
                            {st.email && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {st.email}
                              </span>
                            )}
                            <span>{t('adminUsers.enrollmentsTab.signupDate', { date: st.registeredAt })}</span>
                          </div>
                          {stActivities.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {stActivities.map(item => (
                                <span
                                  key={item.actId}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                                >
                                  <Sparkles className="h-3 w-3 text-emerald-600" />
                                  {item.actName}
                                  {item.teacherName ? ` (${item.teacherName})` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {st.notes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                              {t('adminUsers.enrollmentsTab.notePrefix', { note: st.notes })}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenAddStudent(st)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>{t('adminUsers.enrollmentsTab.edit')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                title: t('adminUsers.enrollmentsTab.rejectSignupTitle'),
                                description: t('adminUsers.enrollmentsTab.rejectSignupDescription', {
                                  name: st.name
                                }),
                                confirmLabel: t('adminUsers.enrollmentsTab.rejectSignupConfirm'),
                                tone: 'warning',
                                onConfirm: () => handleValidateStudent(st, false)
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition whitespace-nowrap"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            <span>{t('adminUsers.enrollmentsTab.reject')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={validatingStudentId === st.id}
                            onClick={() => handleValidateStudent(st, true)}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>
                              {validatingStudentId === st.id
                                ? t('adminUsers.enrollmentsTab.confirming')
                                : t('adminUsers.enrollmentsTab.confirmMember')}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bloque A2: Solicitudes de inscripción a talleres enviadas por alumnos */}
          {pendingEnrollmentRequests.length > 0 && (
            <div className="rounded-2xl border border-indigo-500/35 bg-indigo-50/60 dark:bg-indigo-950/20 p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                    {t('adminUsers.enrollmentsTab.workshopRequestsTitle', {
                      count: pendingEnrollmentRequests.length
                    })}
                  </h2>
                  <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
                    {t('adminUsers.enrollmentsTab.workshopRequestsSubtitle')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {pendingEnrollmentRequests.map(req => {
                  const confirmKey = `c:${req.student.id}:${req.activityId}`;
                  const rejectKey = `r:${req.student.id}:${req.activityId}`;
                  const isBusy = busyEnrollmentKey === confirmKey || busyEnrollmentKey === rejectKey;

                  const handleConfirm = async () => {
                    setBusyEnrollmentKey(confirmKey);
                    try {
                      const res = await confirmActivityEnrollment(req.student.id, req.activityId);
                      if (res.success) {
                        setActionFeedback({
                          type: 'success',
                          message: t('adminUsers.enrollmentsTab.requestConfirmedFeedback', {
                            student: req.student.name,
                            activity: req.activityName
                          })
                        });
                      } else {
                        setActionFeedback({
                          type: 'error',
                          message: res.error || t('adminUsers.enrollmentsTab.requestConfirmError')
                        });
                      }
                    } finally {
                      setBusyEnrollmentKey(null);
                    }
                  };

                  const handleReject = async () => {
                    setBusyEnrollmentKey(rejectKey);
                    try {
                      const res = await rejectActivityEnrollment(req.student.id, req.activityId);
                      if (res.success) {
                        setActionFeedback({
                          type: 'success',
                          message: t('adminUsers.enrollmentsTab.requestRejectedFeedback', {
                            student: req.student.name,
                            activity: req.activityName
                          })
                        });
                      } else {
                        setActionFeedback({
                          type: 'error',
                          message: res.error || t('adminUsers.enrollmentsTab.requestRejectError')
                        });
                      }
                    } finally {
                      setBusyEnrollmentKey(null);
                    }
                  };

                  return (
                    <div
                      key={`${req.student.id}-${req.activityId}`}
                      className="rounded-xl border border-indigo-500/25 bg-white dark:bg-slate-900 px-3 py-2 md:p-3.5 shadow-xs"
                    >
                      {/* Vista móvil: 1 fila + botones solo icono */}
                      <div className="flex md:hidden items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                          <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {req.student.name}
                          </span>
                          <span className="truncate text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                            · {req.activityName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={handleReject}
                            title={t('adminUsers.enrollmentsTab.rejectRequestTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.rejectRequestAria', {
                              name: req.student.name
                            })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 transition disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={handleConfirm}
                            title={t('adminUsers.enrollmentsTab.confirmEnrollmentTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.confirmEnrollmentAria', {
                              name: req.student.name
                            })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Vista escritorio */}
                      <div className="hidden md:flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {req.student.name}
                            </span>
                            <span className="rounded-lg bg-indigo-500/10 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                              {req.activityName}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {t('adminUsers.enrollmentsTab.teacherLabel')} <strong>{req.teacherName}</strong>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t('adminUsers.enrollmentsTab.requestedOn', {
                              contact:
                                [req.student.phone, req.student.email].filter(Boolean).join(' · ') ||
                                t('adminUsers.enrollmentsTab.noContact'),
                              date: req.enrolledSince
                            })}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={handleReject}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>{t('adminUsers.enrollmentsTab.reject')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={handleConfirm}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>
                              {busyEnrollmentKey === confirmKey
                                ? t('adminUsers.enrollmentsTab.confirming')
                                : t('adminUsers.enrollmentsTab.confirmSpot')}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bloque B: Inscripciones activas por taller / profesor */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('adminUsers.enrollmentsTab.controlTitle', { count: enrollmentRows.length })}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('adminUsers.enrollmentsTab.controlSubtitle')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={enrollmentStatusFilter}
                  onChange={e => setEnrollmentStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="all">{t('adminUsers.enrollmentsTab.statusAllOption')}</option>
                  <option value="active">{t('adminUsers.enrollmentsTab.statusActiveOption')}</option>
                  <option value="inactive">{t('adminUsers.enrollmentsTab.statusInactiveOption')}</option>
                </select>

                <select
                  value={enrollmentTeacherFilter}
                  onChange={e => setEnrollmentTeacherFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="all">{t('adminUsers.enrollmentsTab.allTeachersOption')}</option>
                  {teachers.map(tc => (
                    <option key={tc.id} value={tc.id}>
                      {t('adminUsers.enrollmentsTab.teacherFilterOption', { name: tc.name })}
                    </option>
                  ))}
                </select>

                <select
                  value={enrollmentActivityFilter}
                  onChange={e => setEnrollmentActivityFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="all">{t('adminUsers.enrollmentsTab.allWorkshopsOption')}</option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    onOpenEnrollStudent(
                      enrollmentActivityFilter !== 'all' ? enrollmentActivityFilter : undefined
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition whitespace-nowrap"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{t('adminUsers.enrollmentsTab.newEnrollment')}</span>
                </button>
              </div>
            </div>

            {enrollmentRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
                {t('adminUsers.enrollmentsTab.emptyEnrollments')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {enrollmentRows.map(row => {
                  const reactivateKey = `reactivate:${row.student.id}:${row.activityId}`;
                  const isReactivating = busyEnrollmentKey === reactivateKey;
                  const handleReactivateEnrollment = async () => {
                    setBusyEnrollmentKey(reactivateKey);
                    try {
                      const res = await enrollStudentInActivity(row.student.id, row.activityId, row.price);
                      if (res.success) {
                        setActionFeedback({
                          type: 'success',
                          message: t('adminUsers.enrollmentsTab.reactivateSuccess', {
                            student: row.student.name,
                            activity: row.activityName
                          })
                        });
                      } else {
                        setActionFeedback({
                          type: 'error',
                          message: res.error || t('adminUsers.enrollmentsTab.reactivateError')
                        });
                      }
                    } finally {
                      setBusyEnrollmentKey(null);
                    }
                  };

                  return (
                    <div
                      key={`${row.student.id}-${row.activityId}-${row.isInactiveEnrollment ? 'inactive' : 'active'}`}
                      className={`py-2 md:py-3 ${row.isInactiveEnrollment ? 'opacity-75' : ''}`}
                    >
                      {/* Vista móvil: 1 fila compacta + botones solo icono */}
                      <div className="flex md:hidden items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              row.isInactiveEnrollment
                                ? 'bg-slate-400'
                                : row.student.status === 'active'
                                ? 'bg-emerald-500'
                                : row.student.status === 'pending_validation'
                                ? 'bg-amber-500'
                                : row.student.status === 'trial'
                                ? 'bg-sky-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {row.student.name}
                          </span>
                          <span
                            className={`truncate text-[11px] font-medium ${
                              row.isInactiveEnrollment
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            · {row.activityName}
                          </span>
                          {row.isInactiveEnrollment && (
                            <span className="shrink-0 rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:text-slate-400">
                              {t('adminUsers.enrollmentsTab.shortInactiveBadge')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {row.isPendingStudent && !row.isInactiveEnrollment && (
                            <button
                              type="button"
                              disabled={validatingStudentId === row.student.id}
                              onClick={() => handleValidateStudent(row.student, true)}
                              title={t('adminUsers.enrollmentsTab.confirmMemberTooltip')}
                              aria-label={t('adminUsers.enrollmentsTab.confirmMemberAria', {
                                name: row.student.name
                              })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenAddStudent(row.student)}
                            title={t('adminUsers.enrollmentsTab.editCardTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.editCardAria', {
                              name: row.student.name
                            })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {row.isInactiveEnrollment ? (
                            <button
                              type="button"
                              disabled={isReactivating}
                              onClick={handleReactivateEnrollment}
                              title={t('adminUsers.enrollmentsTab.reactivateTooltip')}
                              aria-label={t('adminUsers.enrollmentsTab.reactivateAria', {
                                student: row.student.name,
                                activity: row.activityName
                              })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition disabled:opacity-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: t('adminUsers.enrollmentsTab.removeEnrollmentTitle'),
                                  description: t('adminUsers.enrollmentsTab.removeEnrollmentDescription', {
                                    student: row.student.name,
                                    activity: row.activityName
                                  }),
                                  confirmLabel: t('adminUsers.enrollmentsTab.removeEnrollmentConfirm'),
                                  tone: 'danger',
                                  onConfirm: async () => {
                                    const res = await unenrollStudentFromActivity(row.student.id, row.activityId);
                                    if (res.success) {
                                      setActionFeedback({
                                        type: 'success',
                                        message: t('adminUsers.enrollmentsTab.removeEnrollmentSuccess', {
                                          student: row.student.name,
                                          activity: row.activityName
                                        })
                                      });
                                    } else {
                                      setActionFeedback({
                                        type: 'error',
                                        message: res.error || t('adminUsers.enrollmentsTab.removeEnrollmentError')
                                      });
                                    }
                                  }
                                })
                              }
                              title={t('adminUsers.enrollmentsTab.removeFromWorkshopTooltip')}
                              aria-label={t('adminUsers.enrollmentsTab.removeFromWorkshopAria', {
                                student: row.student.name,
                                activity: row.activityName
                              })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Vista escritorio */}
                      <div className="hidden md:flex md:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                              {row.student.name}
                            </span>
                            {getStudentStatusBadge(row.student.status)}
                            <span
                              className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                                row.isInactiveEnrollment
                                  ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 line-through'
                                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {row.activityName}
                            </span>
                            {row.isInactiveEnrollment && (
                              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                {t('adminUsers.enrollmentsTab.inactiveBadge')}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t('adminUsers.enrollmentsTab.teacherLabel')}{' '}
                              <strong className="text-slate-700 dark:text-slate-200">{row.teacherName}</strong>
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>
                              {t('adminUsers.enrollmentsTab.feeLabel')}{' '}
                              <strong className="text-slate-700 dark:text-slate-200">{row.price}€</strong>{' '}
                              ({row.billingMode === 'per_class'
                                ? t('adminUsers.enrollmentsTab.billingPerClass')
                                : t('adminUsers.enrollmentsTab.billingMonthly')})
                            </span>
                            <span>{t('adminUsers.enrollmentsTab.enrolledDate', { date: row.enrolledSince })}</span>
                            {row.isInactiveEnrollment && row.endedAt && (
                              <span className="text-rose-600 dark:text-rose-400 font-medium">
                                {t('adminUsers.enrollmentsTab.endedDate', { date: row.endedAt })}
                              </span>
                            )}
                            {row.addedByName && (
                              <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                {t('adminUsers.enrollmentsTab.signupAddedBy', { name: row.addedByName })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {row.isPendingStudent && !row.isInactiveEnrollment && (
                            <button
                              type="button"
                              disabled={validatingStudentId === row.student.id}
                              onClick={() => handleValidateStudent(row.student, true)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition whitespace-nowrap disabled:opacity-50"
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>
                                {validatingStudentId === row.student.id
                                  ? t('adminUsers.enrollmentsTab.confirming')
                                  : t('adminUsers.enrollmentsTab.confirmMember')}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenAddStudent(row.student)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>{t('adminUsers.enrollmentsTab.editCardButton')}</span>
                          </button>
                          {row.isInactiveEnrollment ? (
                            <button
                              type="button"
                              disabled={isReactivating}
                              onClick={handleReactivateEnrollment}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 dark:border-emerald-800 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition whitespace-nowrap disabled:opacity-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>{t('adminUsers.enrollmentsTab.reactivateButton')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: t('adminUsers.enrollmentsTab.removeEnrollmentTitle'),
                                  description: t('adminUsers.enrollmentsTab.removeEnrollmentDescription', {
                                    student: row.student.name,
                                    activity: row.activityName
                                  }),
                                  confirmLabel: t('adminUsers.enrollmentsTab.removeEnrollmentConfirm'),
                                  tone: 'danger',
                                  onConfirm: async () => {
                                    const res = await unenrollStudentFromActivity(row.student.id, row.activityId);
                                    if (res.success) {
                                      setActionFeedback({
                                        type: 'success',
                                        message: t('adminUsers.enrollmentsTab.removeEnrollmentSuccess', {
                                          student: row.student.name,
                                          activity: row.activityName
                                        })
                                      });
                                    } else {
                                      setActionFeedback({
                                        type: 'error',
                                        message: res.error || t('adminUsers.enrollmentsTab.removeEnrollmentError')
                                      });
                                    }
                                  }
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition whitespace-nowrap"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>{t('adminUsers.enrollmentsTab.removeFromWorkshopButton')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-PESTAÑA 2: ALUMNOS Y SOCIOS (ALTAS, BAJAS, MODIFICACIONES)     */}
      {/* ================================================================== */}
      {activeSubTab === 'students' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as const, label: t('adminUsers.studentsTab.filterAll') },
                { id: 'active' as const, label: t('adminUsers.studentsTab.filterActive') },
                { id: 'pending_validation' as const, label: t('adminUsers.studentsTab.filterPending') },
                { id: 'inactive' as const, label: t('adminUsers.studentsTab.filterInactive') },
                { id: 'active_pending_active' as const, label: t('adminUsers.studentsTab.filterNonMemberActive') },
                { id: 'active_pending_teacher' as const, label: t('adminUsers.studentsTab.filterNonMemberTeacher') }
              ].map((chip, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setStudentStatusFilter(chip.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition text-center truncate ${
                    studentStatusFilter === chip.id
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>          
          </div>

          {filteredStudents.length === 0 && filteredNonMemberTeachers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
              {t('adminUsers.studentsTab.empty')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredNonMemberTeachers.map(tc => (
                <div key={`nmt-${tc.id}`} className="py-2 md:py-3.5">
                  <div className="flex md:hidden items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          tc.active ? 'bg-indigo-500' : 'bg-slate-400'
                        }`}
                      />
                      <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {tc.name}
                      </span>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                        {t('adminUsers.memberType.shortNonMemberTeacher')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenAddTeacher(tc)}
                      title={t('adminUsers.studentsTab.editTeacherTooltip')}
                      aria-label={t('adminUsers.studentsTab.editTeacherAria', { name: tc.name })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="hidden md:flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {tc.name}
                        </span>
                        {getMemberTypeBadge(tc.memberType)}
                        {tc.memberNumber && (
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                            {t('adminUsers.studentsTab.memberNumber', { number: tc.memberNumber })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                        {tc.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {tc.phone}
                          </span>
                        )}
                        {tc.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {tc.email}
                          </span>
                        )}
                        {tc.startDate && <span>{t('adminUsers.studentsTab.startDate', { date: tc.startDate })}</span>}
                        {tc.endDate && <span>{t('adminUsers.studentsTab.leaveDate', { date: tc.endDate })}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenAddTeacher(tc)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>{t('adminUsers.studentsTab.editCard')}</span>
                    </button>
                  </div>
                </div>
              ))}
              {filteredStudents.map(st => {
                const enrolledActivities = (st.activities || [])
                  .map(e => activities.find(a => a.id === e.activityId))
                  .filter((a): a is NonNullable<typeof a> => Boolean(a));
                const isInactive = st.status === 'inactive';
                const isPending =
                  st.status === 'pending_validation' || st.validationStatus === 'pending';
                const linkedProfile = profiles.find(p => p.studentId === st.id || p.id === st.profileId);

                return (
                  <div
                    key={st.id}
                    className={`py-2 md:py-3.5 ${isInactive ? 'opacity-75' : ''}`}
                  >
                    {/* Vista móvil: 1 fila por socio/alumno + botones solo icono */}
                    <div className="flex md:hidden items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            isPending
                              ? 'bg-amber-500'
                              : st.status === 'active'
                              ? 'bg-emerald-500'
                              : st.status === 'trial'
                              ? 'bg-sky-500'
                              : 'bg-slate-400'
                          }`}
                          title={
                            isPending
                              ? t('adminUsers.studentStatus.pendingValidation')
                              : st.status === 'active'
                              ? t('adminUsers.studentStatus.active')
                              : st.status === 'trial'
                              ? t('adminUsers.studentStatus.trial')
                              : t('adminUsers.studentStatus.inactive')
                          }
                        />
                        <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {st.name}
                        </span>
                        {st.memberType === 'alumno_no_socio' && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {t('adminUsers.memberType.shortNonMemberStudent')}
                          </span>
                        )}
                        {st.memberType === 'monitor_no_socio' && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                            {t('adminUsers.memberType.shortNonMemberTeacher')}
                          </span>
                        )}
                        {(isPending || st.status !== 'active') && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                              isPending
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : st.status === 'trial'
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {isPending
                              ? t('adminUsers.studentStatus.shortPending')
                              : st.status === 'trial'
                              ? t('adminUsers.studentStatus.shortTrial')
                              : t('adminUsers.studentStatus.shortInactive')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isPending && (
                          <button
                            type="button"
                            disabled={validatingStudentId === st.id}
                            onClick={() => handleValidateStudent(st, true)}
                            title={t('adminUsers.enrollmentsTab.confirmMemberTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.confirmMemberAria', { name: st.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenAddStudent(st)}
                          title={t('adminUsers.studentsTab.edit')}
                          aria-label={t('adminUsers.studentsTab.editAria', { name: st.name })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await updateStudent(st.id, { status: isInactive ? 'active' : 'inactive' });
                            if (res.success) {
                              setActionFeedback({
                                type: 'success',
                                message: isInactive
                                  ? t('adminUsers.studentsTab.reactivatedFeedback', { name: st.name })
                                  : t('adminUsers.studentsTab.deactivatedFeedback', { name: st.name })
                              });
                            } else {
                              setActionFeedback({
                                type: 'error',
                                message: res.error || t('adminUsers.studentsTab.statusChangeError')
                              });
                            }
                          }}
                          title={isInactive ? t('adminUsers.studentsTab.reactivate') : t('adminUsers.studentsTab.deactivate')}
                          aria-label={
                            isInactive
                              ? t('adminUsers.studentsTab.reactivateAria', { name: st.name })
                              : t('adminUsers.studentsTab.deactivateAria', { name: st.name })
                          }
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                            isInactive
                              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                              : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: t('adminUsers.studentsTab.deleteStudentTitle'),
                              description: t('adminUsers.studentsTab.deleteStudentDescription', {
                                name: st.name
                              }),
                              confirmLabel: t('adminUsers.studentsTab.deleteStudentConfirm'),
                              tone: 'danger',
                              onConfirm: async () => {
                                await deleteStudent(st.id);
                                setActionFeedback({
                                  type: 'success',
                                  message: t('adminUsers.studentsTab.deleteStudentSuccess', { name: st.name })
                                });
                              }
                            })
                          }
                          title={t('adminUsers.studentsTab.delete')}
                          aria-label={t('adminUsers.studentsTab.deleteAria', { name: st.name })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Vista escritorio */}
                    <div className="hidden md:flex md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {st.name}
                          </span>
                          {getStudentStatusBadge(st.status)}
                          {getMemberTypeBadge(st.memberType)}
                          {st.memberNumber && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                              {t('adminUsers.studentsTab.memberNumber', { number: st.memberNumber })}
                            </span>
                          )}
                          {linkedProfile && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                              <Link2 className="h-3 w-3" /> {t('adminUsers.studentsTab.authLinked')}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          {st.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {st.phone}
                            </span>
                          )}
                          {st.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {st.email}
                            </span>
                          )}
                          <span>{t('adminUsers.studentsTab.registeredDate', { date: st.registeredAt })}</span>
                          {st.startDate && <span>{t('adminUsers.studentsTab.startDate', { date: st.startDate })}</span>}
                          {st.endDate && <span>{t('adminUsers.studentsTab.endDate', { date: st.endDate })}</span>}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {enrolledActivities.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic">
                              {t('adminUsers.studentsTab.noWorkshopsAssigned')}
                            </span>
                          ) : (
                            enrolledActivities.map(act => (
                              <span
                                key={act.id}
                                className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                              >
                                {act.name}
                              </span>
                            ))
                          )}
                        </div>

                        {st.notes && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                            {st.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isPending && (
                          <button
                            type="button"
                            disabled={validatingStudentId === st.id}
                            onClick={() => handleValidateStudent(st, true)}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition whitespace-nowrap disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>
                              {validatingStudentId === st.id
                                ? t('adminUsers.enrollmentsTab.confirming')
                                : t('adminUsers.enrollmentsTab.confirmMember')}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenAddStudent(st)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.studentsTab.edit')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const res = await updateStudent(st.id, { status: isInactive ? 'active' : 'inactive' });
                            if (res.success) {
                              setActionFeedback({
                                type: 'success',
                                message: isInactive
                                  ? t('adminUsers.studentsTab.reactivatedFeedback', { name: st.name })
                                  : t('adminUsers.studentsTab.deactivatedFeedback', { name: st.name })
                              });
                            } else {
                              setActionFeedback({
                                type: 'error',
                                message: res.error || t('adminUsers.studentsTab.statusChangeError')
                              });
                            }
                          }}
                          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                            isInactive
                              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                              : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>{isInactive ? t('adminUsers.studentsTab.reactivate') : t('adminUsers.studentsTab.deactivate')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: t('adminUsers.studentsTab.deleteStudentTitle'),
                              description: t('adminUsers.studentsTab.deleteStudentDescription', {
                                name: st.name
                              }),
                              confirmLabel: t('adminUsers.studentsTab.deleteStudentConfirm'),
                              tone: 'danger',
                              onConfirm: async () => {
                                await deleteStudent(st.id);
                                setActionFeedback({
                                  type: 'success',
                                  message: t('adminUsers.studentsTab.deleteStudentSuccess', { name: st.name })
                                });
                              }
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.studentsTab.delete')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-PESTAÑA 3: PROFESORES / MONITORES                              */}
      {/* ================================================================== */}
      {activeSubTab === 'teachers' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as const, label: t('adminUsers.teachersTab.filterAll') },
                { id: 'active' as const, label: t('adminUsers.teachersTab.filterActive') },
                { id: 'inactive' as const, label: t('adminUsers.teachersTab.filterInactive') }
              ].map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setTeacherStatusFilter(chip.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                    teacherStatusFilter === chip.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {filteredTeachers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
              {t('adminUsers.teachersTab.empty')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTeachers.map(tc => {
                const tActivities = activities.filter(a => a.teacherId === tc.id);
                const linkedProfile = profiles.find(p => p.teacherId === tc.id);
                const schemeText =
                  tc.paymentScheme === 'per_class'
                    ? t('adminUsers.teachersTab.schemePerClass', { rate: tc.ratePerClass ?? 0 })
                    : tc.paymentScheme === 'monthly_fixed'
                    ? t('adminUsers.teachersTab.schemeMonthlyFixed', { rate: tc.fixedMonthlyRate ?? 0 })
                    : t('adminUsers.teachersTab.schemeRevenueShare', { percent: tc.revenueSharePercent ?? 0 });

                return (
                  <div
                    key={tc.id}
                    className={`py-2 md:py-3.5 ${!tc.active ? 'opacity-75' : ''}`}
                  >
                    {/* Vista móvil: 1 fila compacta + botones solo icono */}
                    <div className="flex md:hidden items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        {tc.avatarUrl || tc.avatar ? (
                          <img
                            src={tc.avatarUrl || tc.avatar}
                            alt={tc.name}
                            className="h-7 w-7 rounded-full object-cover border border-indigo-400 shrink-0"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs shrink-0">
                            {tc.name.charAt(0)}
                          </div>
                        )}
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            tc.active ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {tc.name}
                        </span>
                        {/* AÑADE ESTA LÍNEA PARA MÓVIL SI ES "monitor_no_socio" */}
                        {tc.memberType === 'monitor_no_socio' && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                            {t('adminUsers.memberType.shortNonMemberTeacher')}
                          </span>
                        )}
                        {!tc.active && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-slate-500/15 text-slate-600 dark:text-slate-400">
                            {t('adminUsers.teachersTab.shortInactive')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenAddTeacher(tc)}
                          title={t('adminUsers.teachersTab.edit')}
                          aria-label={t('adminUsers.teachersTab.editAria', { name: tc.name })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await updateTeacher(tc.id, { active: !tc.active });
                            if (res.success) {
                              setActionFeedback({
                                type: 'success',
                                message: tc.active
                                  ? t('adminUsers.teachersTab.deactivatedFeedback', { name: tc.name })
                                  : t('adminUsers.teachersTab.reactivatedFeedback', { name: tc.name })
                              });
                            } else {
                              setActionFeedback({
                                type: 'error',
                                message: res.error || t('adminUsers.teachersTab.statusChangeError')
                              });
                            }
                          }}
                          title={tc.active ? t('adminUsers.teachersTab.deactivate') : t('adminUsers.teachersTab.reactivate')}
                          aria-label={
                            tc.active
                              ? t('adminUsers.teachersTab.deactivateAria', { name: tc.name })
                              : t('adminUsers.teachersTab.reactivateAria', { name: tc.name })
                          }
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                            !tc.active
                              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                              : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: t('adminUsers.teachersTab.deleteTitle'),
                              description:
                                tActivities.length > 0
                                  ? t('adminUsers.teachersTab.deleteWithWorkshopsDescription', {
                                      name: tc.name,
                                      count: tActivities.length
                                    })
                                  : t('adminUsers.teachersTab.deleteConfirmDescription', {
                                      name: tc.name
                                    }),
                              confirmLabel: t('adminUsers.teachersTab.deleteConfirmLabel'),
                              tone: 'danger',
                              onConfirm: async () => {
                                const res = await deleteTeacher(tc.id);
                                if (res.success) {
                                  setActionFeedback({
                                    type: 'success',
                                    message: t('adminUsers.teachersTab.deleteSuccess', { name: tc.name })
                                  });
                                } else {
                                  setActionFeedback({
                                    type: 'error',
                                    message:
                                      res.error ||
                                      t('adminUsers.teachersTab.deleteError', { name: tc.name })
                                  });
                                }
                              }
                            })
                          }
                          title={t('adminUsers.teachersTab.delete')}
                          aria-label={t('adminUsers.teachersTab.deleteAria', { name: tc.name })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Vista escritorio */}
                    <div className="hidden md:flex md:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {tc.avatarUrl || tc.avatar ? (
                          <img
                            src={tc.avatarUrl || tc.avatar}
                            alt={tc.name}
                            className="h-10 w-10 rounded-full object-cover border border-indigo-400 shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-sm shrink-0">
                            {tc.name.charAt(0)}
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {tc.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                tc.active
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {tc.active
                                ? t('adminUsers.teachersTab.activeBadge')
                                : t('adminUsers.teachersTab.inactiveBadge')}
                            </span>
                            {getMemberTypeBadge(tc.memberType)}
                            {tc.memberNumber && (
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                                {t('adminUsers.studentsTab.memberNumber', { number: tc.memberNumber })}
                              </span>
                            )}
                            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                              {schemeText}
                            </span>
                            {linkedProfile && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                                <Link2 className="h-3 w-3" /> {t('adminUsers.teachersTab.authLinked')}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                            {tc.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {tc.phone}
                              </span>
                            )}
                            {tc.email && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {tc.email}
                              </span>
                            )}
                            <span>
                              {t('adminUsers.teachersTab.collectionLabel', {
                                type:
                                  tc.collectionType === 'association'
                                    ? t('adminUsers.teachersTab.collectionAssociation')
                                    : t('adminUsers.teachersTab.collectionPersonal')
                              })}
                            </span>
                            {tc.startDate && <span>{t('adminUsers.studentsTab.startDate', { date: tc.startDate })}</span>}
                            {tc.endDate && <span>{t('adminUsers.studentsTab.leaveDate', { date: tc.endDate })}</span>}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {tActivities.length === 0 ? (
                              <span className="text-[11px] text-slate-400 italic">
                                {t('adminUsers.teachersTab.noWorkshopsAssigned')}
                              </span>
                            ) : (
                              tActivities.map(act => (
                                <span
                                  key={act.id}
                                  className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                                >
                                  {act.name}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenAddTeacher(tc)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.teachersTab.edit')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const res = await updateTeacher(tc.id, { active: !tc.active });
                            if (res.success) {
                              setActionFeedback({
                                type: 'success',
                                message: tc.active
                                  ? t('adminUsers.teachersTab.deactivatedFeedback', { name: tc.name })
                                  : t('adminUsers.teachersTab.reactivatedFeedback', { name: tc.name })
                              });
                            } else {
                              setActionFeedback({
                                type: 'error',
                                message: res.error || t('adminUsers.teachersTab.statusChangeError')
                              });
                            }
                          }}
                          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                            !tc.active
                              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                              : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>
                            {tc.active
                              ? t('adminUsers.teachersTab.deactivate')
                              : t('adminUsers.teachersTab.reactivate')}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: t('adminUsers.teachersTab.deleteTitle'),
                              description:
                                tActivities.length > 0
                                  ? t('adminUsers.teachersTab.deleteWithWorkshopsDescription', {
                                      name: tc.name,
                                      count: tActivities.length
                                    })
                                  : t('adminUsers.teachersTab.deleteConfirmDescription', {
                                      name: tc.name
                                    }),
                              confirmLabel: t('adminUsers.teachersTab.deleteConfirmLabel'),
                              tone: 'danger',
                              onConfirm: async () => {
                                const res = await deleteTeacher(tc.id);
                                if (res.success) {
                                  setActionFeedback({
                                    type: 'success',
                                    message: t('adminUsers.teachersTab.deleteSuccess', { name: tc.name })
                                  });
                                } else {
                                  setActionFeedback({
                                    type: 'error',
                                    message:
                                      res.error ||
                                      t('adminUsers.teachersTab.deleteError', { name: tc.name })
                                  });
                                }
                              }
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.teachersTab.delete')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-PESTAÑA 4: CUENTAS DE ACCESO (AUTH & PROFILES)                 */}
      {/* ================================================================== */}
      {activeSubTab === 'accounts' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('adminUsers.accountsTab.title')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('adminUsers.accountsTab.subtitle')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: t('adminUsers.accountsTab.filterAll'), count: profiles.length },
                  {
                    id: 'active',
                    label: t('adminUsers.accountsTab.filterActive'),
                    count: activeProfilesCount
                  },
                  {
                    id: 'pending',
                    label: t('adminUsers.accountsTab.filterPending'),
                    count: pendingProfilesCount
                  },
                  {
                    id: 'inactive',
                    label: t('adminUsers.accountsTab.filterInactive'),
                    count: inactiveProfilesCount
                  }
                ] as const
              ).map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setAccountStatusFilter(chip.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    accountStatusFilter === chip.id
                      ? chip.id === 'inactive'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : chip.id === 'pending'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {chip.label} ({chip.count})
                </button>
              ))}
            </div>
          </div>

          {createdCredentials && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Check className="h-4 w-4" />
                  {t('adminUsers.accountsTab.credentialsTitle')}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                >
                  <Copy className="h-3 w-3" />
                  <span>
                    {copiedCreds
                      ? t('adminUsers.accountsTab.copied')
                      : t('adminUsers.accountsTab.copyForSend')}
                  </span>
                </button>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 font-mono text-[11px] border border-emerald-200 dark:border-emerald-800 text-slate-700 dark:text-slate-200 space-y-1">
                <div>{t('adminUsers.accountsTab.emailPrefix')} <strong>{createdCredentials.email}</strong></div>
                <div>{t('adminUsers.accountsTab.passwordPrefix')} <strong>{createdCredentials.pass}</strong></div>
                <div>{t('adminUsers.accountsTab.rolePrefix')} <strong>{createdCredentials.roleLabel}</strong></div>
              </div>
            </div>
          )}

          {isAddingAuthUser && (
            <form
              onSubmit={handleCreateAuthUser}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.fullNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('adminUsers.accountsTab.fullNamePlaceholder')}
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.emailLabel')}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={t('adminUsers.accountsTab.emailPlaceholder')}
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.roleLabel')}
                  </label>
                  <select
                    value={authRole}
                    onChange={e => setAuthRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white font-semibold"
                  >
                    {USER_ROLE_VALUES.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.membershipLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAuthIsSocio(true)}
                      className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                        authIsSocio
                          ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('adminUsers.accountsTab.socioYes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthIsSocio(false)}
                      className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                        !authIsSocio
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('adminUsers.accountsTab.socioNo')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.accessLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAuthAccess(true)}
                      className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                        authAccess
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('adminUsers.accountsTab.accessYes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthAccess(false)}
                      className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                        !authAccess
                          ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('adminUsers.accountsTab.accessNo')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.initialPasswordLabel')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAuthPassword(`Triskell${Math.floor(1000 + Math.random() * 9000)}!`)
                      }
                      className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title={t('adminUsers.accountsTab.generatePasswordTooltip')}
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>

              {(authRole === UserRole.Monitor || authRole === UserRole.Hibrido) && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 space-y-2">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 block text-[11px]">
                    {t('adminUsers.accountsTab.linkTeacherHeading')}
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      value={authTeacherId}
                      onChange={e => setAuthTeacherId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="">{t('adminUsers.accountsTab.linkTeacherPlaceholder')}</option>
                      {teachers.map(tc => (
                        <option key={tc.id} value={tc.id}>
                          {tc.name} ({tc.email || t('adminUsers.noEmail')})
                        </option>
                      ))}
                    </select>
                    {!authTeacherId && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={authCreateTeacher}
                          onChange={e => setAuthCreateTeacher(e.target.checked)}
                          className="rounded text-emerald-600 h-4 w-4"
                        />
                        <span>{t('adminUsers.accountsTab.autoCreateTeacher')}</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {(authRole === UserRole.Alumno || authRole === UserRole.Hibrido || authRole === UserRole.Socio) && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block text-[11px]">
                    {t('adminUsers.accountsTab.linkStudentHeading')}
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      value={authStudentId}
                      onChange={e => setAuthStudentId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="">{t('adminUsers.accountsTab.linkStudentPlaceholder')}</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.email || t('adminUsers.noEmail')})
                        </option>
                      ))}
                    </select>
                    {!authStudentId && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={authCreateStudent}
                          onChange={e => setAuthCreateStudent(e.target.checked)}
                          className="rounded text-emerald-600 h-4 w-4"
                        />
                        <span>{t('adminUsers.accountsTab.autoCreateStudent')}</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAuthUser(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 font-semibold text-slate-700 dark:text-slate-300"
                >
                  {t('adminUsers.accountsTab.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 transition"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {isSubmittingAuth
                      ? t('adminUsers.accountsTab.creating')
                      : t('adminUsers.accountsTab.createButton')}
                  </span>
                </button>
              </div>
            </form>
          )}

          {filteredProfiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
              {t('adminUsers.accountsTab.empty')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProfiles.map(p => {
                const isSelf = currentUser?.id === p.id;
                const matrix = getProfileLiveMatrix(p);
                const isProfileActive = matrix.outcome.access;
                const linkedTeacher = matrix.linkedTeacher;
                const linkedStudent = matrix.linkedStudent;
                const isAccessDenied = !isProfileActive;

                const handleToggleSocio = async () => {
                  const nextSocio = !matrix.isSocio;
                  setBusySocioProfileId(p.id);
                  const res = await toggleUserSocioMembership(
                    {
                      profileId: p.id,
                      studentId: p.studentId,
                      teacherId: p.teacherId,
                      email: p.email
                    },
                    nextSocio
                  );
                  setBusySocioProfileId(null);
                  if (res.success) {
                    setActionFeedback({
                      type: 'success',
                      message: t('adminUsers.accountsTab.membershipUpdated', {
                        name: p.name,
                        status: nextSocio
                          ? t('adminUsers.accountsTab.socioYes')
                          : t('adminUsers.accountsTab.socioNo')
                      })
                    });
                  } else {
                    setActionFeedback({
                      type: 'error',
                      message: res.error || t('adminUsers.accountsTab.statusChangeError')
                    });
                  }
                };

                const handleSoftDeactivateOrReactivate = () => {
                  if (isProfileActive) {
                    setConfirmAction({
                      title: t('adminUsers.accountsTab.deactivateTitle'),
                      description: t('adminUsers.accountsTab.deactivateDescription', {
                        name: p.name,
                        email: p.email
                      }),
                      confirmLabel: t('adminUsers.accountsTab.deactivateConfirmLabel'),
                      tone: 'danger',
                      onConfirm: async () => {
                        const res = await toggleUserAccessStatus(p.id, false);
                        if (res.success) {
                          setActionFeedback({
                            type: 'success',
                            message: t('adminUsers.accountsTab.deactivateSuccess', { name: p.name })
                          });
                        } else {
                          setActionFeedback({
                            type: 'error',
                            message: res.error || t('adminUsers.accountsTab.statusChangeError')
                          });
                        }
                      }
                    });
                  } else {
                    void (async () => {
                      const res = await toggleUserAccessStatus(p.id, true);
                      if (res.success) {
                        setActionFeedback({
                          type: 'success',
                          message: t('adminUsers.accountsTab.reactivateSuccess', { name: p.name })
                        });
                      } else {
                        setActionFeedback({
                          type: 'error',
                          message: res.error || t('adminUsers.accountsTab.statusChangeError')
                        });
                      }
                    })();
                  }
                };

                return (
                  <div
                    key={p.id}
                    className={`py-2 md:py-3 ${!isProfileActive ? 'opacity-75' : ''}`}
                  >
                    {/* Vista móvil: 1 fila compacta + botones solo icono */}
                    <div className="flex md:hidden items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        {p.photoURL ? (
                          <img
                            src={p.photoURL}
                            alt={p.name}
                            className={`h-7 w-7 rounded-full object-cover border shrink-0 ${
                              isProfileActive ? 'border-emerald-500' : 'border-rose-400 grayscale'
                            }`}
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs shrink-0">
                            {p.name.charAt(0) || t('adminUsers.accountsTab.fallbackInitial')}
                          </div>
                        )}
                        <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {p.name}
                        </span>
                        <button
                          type="button"
                          disabled={busySocioProfileId === p.id}
                          onClick={handleToggleSocio}
                          title={t('adminUsers.accountsTab.toggleSocioTooltip')}
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition ${
                            matrix.isSocio
                              ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {matrix.isSocio
                            ? t('adminUsers.accountsTab.socioYes')
                            : t('adminUsers.accountsTab.socioNo')}
                        </button>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            isAccessDenied
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {isAccessDenied
                            ? t('adminUsers.accountsTab.accessBadgeNo')
                            : t('adminUsers.accountsTab.accessBadgeYes')}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            p.role === UserRole.Admin
                              ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                              : p.role === UserRole.Monitor
                              ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                              : p.role === UserRole.Hibrido
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                              : p.role === UserRole.Socio
                              ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                              : p.role === UserRole.Alumno
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {getRoleLabel(p.role)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditProfileModal(p)}
                          title={t('adminUsers.accountsTab.editRoleLinksTooltip')}
                          aria-label={t('adminUsers.accountsTab.editRoleLinksAria', { name: p.name })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={handleSoftDeactivateOrReactivate}
                            title={
                              isProfileActive
                                ? t('adminUsers.accountsTab.deactivateTooltip')
                                : t('adminUsers.accountsTab.reactivateTooltip')
                            }
                            aria-label={
                              isProfileActive
                                ? t('adminUsers.accountsTab.deactivateAria', { name: p.name })
                                : t('adminUsers.accountsTab.reactivateAria', { name: p.name })
                            }
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                              isProfileActive
                                ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                            }`}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Vista escritorio */}
                    <div className="hidden md:flex md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {p.photoURL ? (
                          <img
                            src={p.photoURL}
                            alt={p.name}
                            className={`h-10 w-10 rounded-full object-cover border shrink-0 ${
                              isProfileActive ? 'border-emerald-500' : 'border-rose-400 grayscale'
                            }`}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-sm shrink-0">
                            {p.name.charAt(0) || t('adminUsers.accountsTab.fallbackInitial')}
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {p.name}
                            </span>
                            <button
                              type="button"
                              disabled={busySocioProfileId === p.id}
                              onClick={handleToggleSocio}
                              title={t('adminUsers.accountsTab.toggleSocioTooltip')}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${
                                matrix.isSocio
                                  ? 'border-teal-300 dark:border-teal-700 bg-teal-500/15 text-teal-700 dark:text-teal-300 hover:bg-teal-500/25'
                                  : 'border-amber-300 dark:border-amber-700 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                              }`}
                            >
                              {matrix.isSocio
                                ? t('adminUsers.accountsTab.socioYes')
                                : t('adminUsers.accountsTab.socioNo')}
                            </button>
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                              {t('adminUsers.accountsTab.operationalRoleBadge', {
                                role: getOperationalRoleLabel(matrix.operationalRole)
                              })}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isAccessDenied
                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {isAccessDenied
                                ? t('adminUsers.accountsTab.accessDeniedBadge')
                                : t('adminUsers.accountsTab.accessGrantedBadge', {
                                    access: getRoleLabel(p.role)
                                  })}
                            </span>
                            {isSelf && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                {t('adminUsers.accountsTab.yourUserBadge')}
                              </span>
                            )}
                            {p.memberNumber && (
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                                {t('adminUsers.studentsTab.memberNumber', { number: p.memberNumber })}
                              </span>
                            )}
                            {linkedTeacher && (
                              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                                {t('adminUsers.accountsTab.linkedTeacherBadge', {
                                  name: linkedTeacher.name
                                })}
                              </span>
                            )}
                            {linkedStudent && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                {t('adminUsers.accountsTab.linkedStudentBadge', {
                                  name: linkedStudent.name
                                })}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 block">
                            {p.email}
                            {p.startDate ? t('adminUsers.accountsTab.startDateInline', { date: p.startDate }) : ''}
                            {p.endDate ? t('adminUsers.accountsTab.endDateInline', { date: p.endDate }) : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          value={p.role || ''}
                          onChange={e => {
                            if (e.target.value) {
                              updateUserRole(p.id, e.target.value as UserRole);
                            }
                          }}
                          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
                        >
                          {!p.role && (
                            <option value="" disabled>
                              {t('adminUsers.roles.none')}
                            </option>
                          )}
                          {USER_ROLE_VALUES.map(r => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => openEditProfileModal(p)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.accountsTab.editLinksButton')}</span>
                        </button>

                        {!isSelf && (
                          <button
                            type="button"
                            onClick={handleSoftDeactivateOrReactivate}
                            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                              isProfileActive
                                ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                            }`}
                          >
                            <Power className="h-3.5 w-3.5" />
                            <span>
                              {isProfileActive
                                ? t('adminUsers.accountsTab.deactivateButton')
                                : t('adminUsers.accountsTab.reactivateButton')}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de Edición de Perfil Auth & Vínculos */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('adminUsers.editModal.title')}
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">{editingProfile.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedProfile} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('adminUsers.editModal.displayNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={editProfileName}
                  onChange={e => setEditProfileName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.assignedRoleLabel')}
                  </label>
                  <select
                    value={editProfileRole}
                    onChange={e => setEditProfileRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-900 dark:text-white"
                  >
                    {USER_ROLE_VALUES.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.accountStatusLabel')}
                  </label>
                  <select
                    value={editProfileActive ? 'active' : 'inactive'}
                    disabled={currentUser?.id === editingProfile.id}
                    onChange={e => {
                      const nextActive = e.target.value === 'active';
                      setEditProfileActive(nextActive);
                      if (nextActive) {
                        setEditProfileEndDate('');
                      } else if (!editProfileEndDate) {
                        setEditProfileEndDate(new Date().toISOString().split('T')[0]);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-900 dark:text-white disabled:opacity-60"
                  >
                    <option value="active">{t('adminUsers.editModal.accountStatusActive')}</option>
                    <option value="inactive">{t('adminUsers.editModal.accountStatusInactive')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.isSocioLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditProfileIsSocio(true);
                        setEditProfileMemberType('socio');
                      }}
                      className={`rounded-xl border px-2.5 py-2 text-xs font-bold transition ${
                        editProfileIsSocio
                          ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('adminUsers.editModal.isSocioTrue')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditProfileIsSocio(false);
                        setEditProfileMemberType(
                          editProfileRole === UserRole.Monitor ? 'monitor_no_socio' : 'alumno_no_socio'
                        );
                      }}
                      className={`rounded-xl border px-2.5 py-2 text-xs font-bold transition ${
                        !editProfileIsSocio
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('adminUsers.editModal.isSocioFalse')}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.memberNumberLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('adminUsers.editModal.memberNumberPlaceholder')}
                    value={editProfileMemberNumber}
                    onChange={e => setEditProfileMemberNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {(() => {
                const previewMatrix = getProfileLiveMatrix(
                  editingProfile,
                  editProfileIsSocio,
                  editProfileRole,
                  editProfileTeacherId,
                  editProfileStudentId,
                  editProfileActive
                );
                const previewAccessText =
                  previewMatrix.outcome.category === 'admin_preserved'
                    ? t('adminUsers.editModal.effectiveAccessAdmin')
                    : previewMatrix.outcome.category === 'baja'
                    ? t('adminUsers.editModal.effectiveAccessDenied')
                    : previewMatrix.outcome.category === 'socio_puro'
                    ? t('adminUsers.editModal.effectiveAccessSocio')
                    : t('adminUsers.editModal.effectiveAccessMatched', {
                        role: getRoleLabel(previewMatrix.outcome.role)
                      });
                return (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      {t('adminUsers.editModal.autoSyncMatrixTitle')}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">
                        {t('adminUsers.editModal.derivedOpRoleLabel')}{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {getOperationalRoleLabel(previewMatrix.operationalRole)}
                        </strong>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-bold ${
                          previewMatrix.outcome.access
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {t('adminUsers.editModal.effectiveAccessLabel')} {previewAccessText}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('adminUsers.editModal.memberTypeLabel')}
                </label>
                <select
                  value={editProfileMemberType}
                  onChange={e => {
                    const nextType = e.target.value as MemberType;
                    setEditProfileMemberType(nextType);
                    setEditProfileIsSocio(
                      nextType !== 'alumno_no_socio' && nextType !== 'monitor_no_socio'
                    );
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="socio">{t('adminUsers.editModal.memberTypeSocio')}</option>
                  <option value="alumno_no_socio">{t('adminUsers.editModal.memberTypeNonMemberStudent')}</option>
                  <option value="monitor_no_socio">{t('adminUsers.editModal.memberTypeNonMemberTeacher')}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.startDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={editProfileStartDate}
                    onChange={e => setEditProfileStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.endDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={editProfileEndDate}
                    onChange={e => setEditProfileEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {(editProfileRole === UserRole.Monitor || editProfileRole === UserRole.Hibrido) && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.linkedTeacherLabel')}
                  </label>
                  <select
                    value={editProfileTeacherId}
                    onChange={e => setEditProfileTeacherId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="">{t('adminUsers.editModal.noTeacherOption')}</option>
                    {teachers.map(tc => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(editProfileRole === UserRole.Alumno ||
                editProfileRole === UserRole.Hibrido ||
                editProfileRole === UserRole.Socio) && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.editModal.linkedStudentLabel')}
                  </label>
                  <select
                    value={editProfileStudentId}
                    onChange={e => setEditProfileStudentId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="">{t('adminUsers.editModal.noStudentOption')}</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-semibold text-slate-700 dark:text-slate-300"
                >
                  {t('adminUsers.editModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 transition"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {isSavingProfile
                      ? t('adminUsers.editModal.saving')
                      : t('adminUsers.editModal.saveChanges')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación In-App */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  confirmAction.tone === 'danger'
                    ? 'bg-rose-500/15 text-rose-600'
                    : 'bg-amber-500/15 text-amber-600'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {confirmAction.title}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {confirmAction.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('adminUsers.confirmModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isConfirming}
                onClick={executeConfirmAction}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white transition ${
                  confirmAction.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {isConfirming ? t('adminUsers.confirmModal.processing') : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
