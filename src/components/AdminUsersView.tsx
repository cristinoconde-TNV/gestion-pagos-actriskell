import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, computeOperationalRoleOutcome, deriveOperationalRole } from '../context/AppContext';
import {
  USER_ROLE_VALUES,
  normalizeUserRole,
  deriveAccessFromRow,
  isPendingApprovalProfile,
  MASTER_ADMIN_EMAIL
} from '../lib/authRole';
import { createTranslator } from '../lib/i18n';
import {
  evaluateProfileLoginInactivity,
  LoginInactivityEvaluation,
  parseLoginInactivityConfig
} from '../lib/inactivityConfig';
import {
  AuthUser,
  MemberType,
  MembershipWithdrawalRequest,
  OperationalRole,
  Student,
  StudentStatus,
  Teacher,
  UserRole
} from '../types';
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
  Link2,
  RotateCcw,
  Loader2,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { StudentNameButton } from './ContactQuickActions';

interface AdminUsersViewProps {
  onOpenAddStudent: (student?: Student) => void;
  onOpenAddTeacher: (teacher?: Teacher) => void;
  onOpenEnrollStudent: (activityId?: string) => void;
  openAccountsSignal?: {
    nonce: number;
    openCreateForm?: boolean;
    openBajasAccordion?: boolean;
    openAltasAccordion?: boolean;
  } | null;
}

type AdminUsersSubTab = 'enrollments' | 'students' | 'teachers' | 'accounts';
type StudentFilterStatus = 'all' | StudentStatus;
type StudentFilterMemberType = 'all' | 'socio' | 'alumno_no_socio' | 'monitor_no_socio';

interface PendingConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'danger' | 'warning';
  onConfirm: () => Promise<void> | void;
}

interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownConfig {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterDropdownOption[];
}

const AdminSectionHeader: React.FC<{
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, subtitle, badge, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h2>
        {badge}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
    </div>
    {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
  </div>
);

const AdminAccordion: React.FC<{
  title: string;
  subtitle?: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  tone?: 'indigo' | 'amber' | 'rose';
  children: React.ReactNode;
}> = ({ title, subtitle, count, isOpen, onToggle, icon, tone = 'amber', children }) => {
  const toneStyles = {
    indigo: {
      wrapper: 'border-indigo-500/35 bg-indigo-50/60 dark:bg-indigo-950/20',
      title: 'text-indigo-950 dark:text-indigo-100',
      subtitle: 'text-indigo-800/80 dark:text-indigo-300/80',
      badge:
        count > 0
          ? 'bg-indigo-600 text-white'
          : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
      chevron: 'text-indigo-700 dark:text-indigo-300',
      divider: 'border-indigo-500/20'
    },
    amber: {
      wrapper: 'border-amber-500/35 bg-amber-50/60 dark:bg-amber-950/20',
      title: 'text-amber-950 dark:text-amber-100',
      subtitle: 'text-amber-800/80 dark:text-amber-300/80',
      badge:
        count > 0
          ? 'bg-amber-600 text-white'
          : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
      chevron: 'text-amber-700 dark:text-amber-300',
      divider: 'border-amber-500/20'
    },
    rose: {
      wrapper: 'border-rose-500/35 bg-rose-50/60 dark:bg-rose-950/20',
      title: 'text-rose-950 dark:text-rose-100',
      subtitle: 'text-rose-800/80 dark:text-rose-300/80',
      badge:
        count > 0
          ? 'bg-rose-600 text-white'
          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
      chevron: 'text-rose-700 dark:text-rose-300',
      divider: 'border-rose-500/20'
    }
  }[tone];

  return (
    <div className={`rounded-2xl border overflow-hidden transition ${toneStyles.wrapper}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-bold ${toneStyles.title}`}>{title}</span>
              <span
                className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${toneStyles.badge}`}
              >
                {count}
              </span>
            </div>
            {subtitle && (
              <p className={`text-[11px] mt-0.5 truncate sm:whitespace-normal ${toneStyles.subtitle}`}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${toneStyles.chevron} ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className={`px-4 pb-4 pt-3 border-t ${toneStyles.divider}`}>{children}</div>
      )}
    </div>
  );
};

const AdminFilterBar: React.FC<{
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters: FilterDropdownConfig[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  clearFiltersLabel: string;
}> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  filters,
  hasActiveFilters,
  onClearFilters,
  clearFiltersLabel
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 flex flex-col lg:flex-row lg:items-center gap-2.5">
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => onSearchChange('')}
          aria-label={clearFiltersLabel}
          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-2 shrink-0">
      {filters.map(f => (
        <select
          key={f.id}
          aria-label={f.label}
          value={f.value}
          onChange={e => f.onChange(e.target.value)}
          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
        >
          {f.options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      <button
        type="button"
        disabled={!hasActiveFilters}
        onClick={onClearFilters}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span>{clearFiltersLabel}</span>
      </button>
    </div>
  </div>
);

const AdminListContainer: React.FC<{
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  emptyMessage: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  clearFiltersLabel: string;
  showingLabel: string;
  pageOfLabel: string;
  prevLabel: string;
  nextLabel: string;
  perPageOptions: Array<{ value: number; label: string }>;
  rightSummary?: React.ReactNode;
  tableHeader?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  emptyMessage,
  hasActiveFilters,
  onClearFilters,
  clearFiltersLabel,
  showingLabel,
  pageOfLabel,
  prevLabel,
  nextLabel,
  perPageOptions,
  rightSummary,
  tableHeader,
  children
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-1">
        <span>{showingLabel}</span>
        {rightSummary && <span className="hidden md:inline">{rightSummary}</span>}
      </div>

      {totalItems === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{emptyMessage}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{clearFiltersLabel}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="@container rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
            {tableHeader}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <select
                value={pageSize}
                onChange={e => onPageSizeChange(Number(e.target.value))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {perPageOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="font-semibold">{pageOfLabel}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => onPageChange(safePage - 1)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{prevLabel}</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(safePage + 1)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{nextLabel}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  onOpenAddStudent,
  onOpenAddTeacher,
  onOpenEnrollStudent,
  openAccountsSignal
}) => {
  const {
    students,
    teachers,
    activities,
    payments,
    profiles,
    appConfigs,
    currentUser,
    updateStudent,
    deleteStudent,
    validatePendingStudent,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    membershipWithdrawalRequests,
    approveAssociationWithdrawal,
    rejectAssociationWithdrawal,
    enrollStudentInActivity,
    updateStudentEnrollment,
    unenrollStudentFromActivity,
    updateTeacher,
    deleteTeacher,
    createUserByAdmin,
    updateUserProfileByAdmin,
    saveUserPermissionDrafts,
    approvePendingUserAccess,
    rejectOrBlockUserAccess,
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

  const pendingWithdrawalRequests = useMemo(
    () => membershipWithdrawalRequests.filter(r => r.status === 'pending'),
    [membershipWithdrawalRequests]
  );

  const pendingAccountsInitialCount = useMemo(
    () => profiles.filter(p => isPendingApprovalProfile(p)).length,
    [profiles]
  );

  const totalPendingEnrollmentsTab =
    pendingValidationStudents.length + pendingEnrollmentRequests.length;
  const totalPendingAccountsTab =
    pendingAccountsInitialCount + pendingWithdrawalRequests.length;

  const [activeSubTab, setActiveSubTab] = useState<AdminUsersSubTab>(
    openAccountsSignal
      ? 'accounts'
      : totalPendingEnrollmentsTab > 0
      ? 'enrollments'
      : totalPendingAccountsTab > 0
      ? 'accounts'
      : 'students'
  );
  const hasManualSubTabRef = useRef(Boolean(openAccountsSignal));
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
    if (hasManualSubTabRef.current) return;
    if (totalPendingEnrollmentsTab > 0) {
      setActiveSubTab('enrollments');
    } else if (totalPendingAccountsTab > 0) {
      setActiveSubTab('accounts');
    }
  }, [totalPendingEnrollmentsTab, totalPendingAccountsTab]);

  const [searchQuery, setSearchQuery] = useState('');

  // Acordeones (todos colapsados/cerrados por defecto salvo navegación directa desde aviso)
  const [isEnrollReqAccordionOpen, setIsEnrollReqAccordionOpen] = useState(false);
  const [isQuickSignupsAccordionOpen, setIsQuickSignupsAccordionOpen] = useState(false);
  const [isAccountsAltasAccordionOpen, setIsAccountsAltasAccordionOpen] = useState(
    Boolean(openAccountsSignal?.openAltasAccordion)
  );
  const [isAccountsBajasAccordionOpen, setIsAccountsBajasAccordionOpen] = useState(
    Boolean(openAccountsSignal?.openBajasAccordion)
  );
  const [isAccountsInactivityAccordionOpen, setIsAccountsInactivityAccordionOpen] = useState(false);

  // Filtros desplegables unificados por pantalla
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentFilterStatus>('all');
  const [studentMemberTypeFilter, setStudentMemberTypeFilter] =
    useState<StudentFilterMemberType>('all');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [teacherCollectionFilter, setTeacherCollectionFilter] = useState<
    'all' | 'association' | 'personal'
  >('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<
    'all' | 'active' | 'inactive' | 'pending'
  >('all');
  const [accountRoleFilter, setAccountRoleFilter] = useState<'all' | UserRole | 'none'>('all');
  const [accountSocioFilter, setAccountSocioFilter] = useState<'all' | 'socio' | 'non_socio'>('all');
  const [enrollmentTeacherFilter, setEnrollmentTeacherFilter] = useState<string>('all');
  const [enrollmentActivityFilter, setEnrollmentActivityFilter] = useState<string>('all');
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Paginación por pantalla
  const [pageSize, setPageSize] = useState<number>(10);
  const [tabPages, setTabPages] = useState<Record<AdminUsersSubTab, number>>({
    enrollments: 1,
    students: 1,
    teachers: 1,
    accounts: 1
  });
  const setTabPage = (tab: AdminUsersSubTab, nextPage: number) =>
    setTabPages(prev => ({ ...prev, [tab]: Math.max(1, nextPage) }));

  useEffect(() => {
    setTabPages(prev => ({ ...prev, enrollments: 1 }));
  }, [searchQuery, enrollmentStatusFilter, enrollmentTeacherFilter, enrollmentActivityFilter]);

  useEffect(() => {
    setTabPages(prev => ({ ...prev, students: 1 }));
  }, [searchQuery, studentStatusFilter, studentMemberTypeFilter]);

  useEffect(() => {
    setTabPages(prev => ({ ...prev, teachers: 1 }));
  }, [searchQuery, teacherStatusFilter, teacherCollectionFilter]);

  useEffect(() => {
    setTabPages(prev => ({ ...prev, accounts: 1 }));
  }, [searchQuery, accountStatusFilter, accountRoleFilter, accountSocioFilter]);

  // Confirmación in-app
  const [confirmAction, setConfirmAction] = useState<PendingConfirmAction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Feedback general
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [validatingStudentId, setValidatingStudentId] = useState<string | null>(null);
  const [busyEnrollmentKey, setBusyEnrollmentKey] = useState<string | null>(null);

  // Alta de usuario Auth inline
  const [isAddingAuthUser, setIsAddingAuthUser] = useState(Boolean(openAccountsSignal?.openCreateForm));
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authRole, setAuthRole] = useState<UserRole>(UserRole.Alumno);
  const [authMemberNumber, setAuthMemberNumber] = useState('');
  const [authPassword, setAuthPassword] = useState(`Triskell${Math.floor(1000 + Math.random() * 9000)}!`);
  const [authTeacherId, setAuthTeacherId] = useState('');
  const [authStudentId, setAuthStudentId] = useState('');
  const [authIsSocio, setAuthIsSocio] = useState(true);
  const [authAccess, setAuthAccess] = useState(true);
  const [authCreateTeacher, setAuthCreateTeacher] = useState(true);
  const [authCreateStudent, setAuthCreateStudent] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  useEffect(() => {
    if (!openAccountsSignal) return;
    hasManualSubTabRef.current = true;
    setActiveSubTab('accounts');
    if (openAccountsSignal.openCreateForm) {
      setAccountStatusFilter('all');
      setIsAddingAuthUser(true);
    } else {
      setIsAddingAuthUser(false);
    }
    if (openAccountsSignal.openBajasAccordion) {
      setIsAccountsBajasAccordionOpen(true);
    }
    if (openAccountsSignal.openAltasAccordion) {
      setIsAccountsAltasAccordionOpen(true);
    }
  }, [openAccountsSignal]);
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
  const [draftProfileEdits, setDraftProfileEdits] = useState<
    Record<string, { isSocio: boolean; role: UserRole | ''; access: boolean }>
  >({});
  const [savingDraftUserIds, setSavingDraftUserIds] = useState<Record<string, boolean>>({});
  const [isSavingAllDrafts, setIsSavingAllDrafts] = useState(false);
  const [busyApprovalUserIds, setBusyApprovalUserIds] = useState<Record<string, boolean>>({});
  const [busyInactivityUserIds, setBusyInactivityUserIds] = useState<Record<string, boolean>>({});
  const [pendingApprovalDrafts, setPendingApprovalDrafts] = useState<
    Record<string, { role?: UserRole | ''; isSocio?: boolean }>
  >({});

  // Moderación de solicitudes de baja de la asociación
  const [withdrawalTarget, setWithdrawalTarget] = useState<MembershipWithdrawalRequest | null>(null);
  const [withdrawalDebtsChecked, setWithdrawalDebtsChecked] = useState(false);
  const [withdrawalMaterialsChecked, setWithdrawalMaterialsChecked] = useState(false);
  const [withdrawalNotes, setWithdrawalNotes] = useState('');
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [isModeratingWithdrawal, setIsModeratingWithdrawal] = useState(false);

  const openWithdrawalModerationModal = (req: MembershipWithdrawalRequest) => {
    setWithdrawalTarget(req);
    setWithdrawalDebtsChecked(false);
    setWithdrawalMaterialsChecked(false);
    setWithdrawalNotes('');
    setWithdrawalError(null);
  };

  // Modal de edición exclusiva de inscripciones en talleres del profesor (desde INSCRIPCIONS)
  interface EnrollmentDraftItem {
    activityId: string;
    customPrice: string;
    billingMode: 'monthly' | 'per_class';
    enrolledSince: string;
  }
  const [enrollModalTarget, setEnrollModalTarget] = useState<{
    studentId: string;
    focusTeacherId?: string;
    focusActivityId?: string;
  } | null>(null);
  const [enrollModalTeacherId, setEnrollModalTeacherId] = useState<string>('all');
  const [enrollmentDrafts, setEnrollmentDrafts] = useState<Record<string, EnrollmentDraftItem>>({});
  const [savingEnrollmentActivityId, setSavingEnrollmentActivityId] = useState<string | null>(null);
  const [quickEnrollTeacherId, setQuickEnrollTeacherId] = useState<string>('');
  const [quickEnrollActivityId, setQuickEnrollActivityId] = useState<string>('');
  const [quickEnrollPrice, setQuickEnrollPrice] = useState<string>('');
  const [quickEnrollBusy, setQuickEnrollBusy] = useState(false);
  const [enrollModalError, setEnrollModalError] = useState<string | null>(null);

  const buildEnrollmentDraftsForStudent = (st: Student): Record<string, EnrollmentDraftItem> => {
    const drafts: Record<string, EnrollmentDraftItem> = {};
    const allList = [
      ...(st.activities || []),
      ...(st.pendingEnrollments || []),
      ...(st.inactiveEnrollments || [])
    ];
    const todayIso = new Date().toISOString().split('T')[0];
    for (const enr of allList) {
      if (drafts[enr.activityId]) continue;
      const act = activities.find(a => a.id === enr.activityId);
      drafts[enr.activityId] = {
        activityId: enr.activityId,
        customPrice:
          enr.customPrice !== undefined && enr.customPrice !== null
            ? String(enr.customPrice)
            : '',
        billingMode: enr.billingMode || act?.billingMode || 'monthly',
        enrolledSince: enr.enrolledSince || todayIso
      };
    }
    return drafts;
  };

  const openStudentEnrollmentsModal = (
    studentId: string,
    focusTeacherId?: string,
    focusActivityId?: string
  ) => {
    const st = students.find(s => s.id === studentId);
    if (!st) return;
    setEnrollmentDrafts(buildEnrollmentDraftsForStudent(st));
    const resolvedTeacherFilter =
      focusTeacherId && teachers.some(tc => tc.id === focusTeacherId)
        ? focusTeacherId
        : enrollmentTeacherFilter !== 'all'
        ? enrollmentTeacherFilter
        : 'all';
    setEnrollModalTeacherId(resolvedTeacherFilter);
    const defaultAddTeacher =
      resolvedTeacherFilter !== 'all'
        ? resolvedTeacherFilter
        : teachers.find(tc => tc.active !== false)?.id || teachers[0]?.id || '';
    setQuickEnrollTeacherId(defaultAddTeacher);
    const activeSet = new Set(
      (st.activities || [])
        .filter(a => a.active !== false && a.status !== 'inactive')
        .map(a => a.activityId)
    );
    const candidateAct = activities.find(
      a => (!defaultAddTeacher || a.teacherId === defaultAddTeacher) && !activeSet.has(a.id)
    );
    setQuickEnrollActivityId(candidateAct?.id || '');
    setQuickEnrollPrice('');
    setEnrollModalError(null);
    setEnrollModalTarget({ studentId, focusTeacherId, focusActivityId });
  };

  useEffect(() => {
    if (!enrollModalTarget) return;
    const st = students.find(s => s.id === enrollModalTarget.studentId);
    if (!st) return;
    const freshDrafts = buildEnrollmentDraftsForStudent(st);
    setEnrollmentDrafts(prev => {
      const next: Record<string, EnrollmentDraftItem> = {};
      for (const actId of Object.keys(freshDrafts)) {
        next[actId] = prev[actId] || freshDrafts[actId];
      }
      return next;
    });
    const activeSet = new Set(
      (st.activities || [])
        .filter(a => a.active !== false && a.status !== 'inactive')
        .map(a => a.activityId)
    );
    const availableForTeacher = activities.filter(
      a => (!quickEnrollTeacherId || a.teacherId === quickEnrollTeacherId) && !activeSet.has(a.id)
    );
    if (
      availableForTeacher.length > 0 &&
      !availableForTeacher.some(a => a.id === quickEnrollActivityId)
    ) {
      setQuickEnrollActivityId(availableForTeacher[0].id);
    } else if (availableForTeacher.length === 0 && quickEnrollActivityId !== '') {
      setQuickEnrollActivityId('');
    }
  }, [enrollModalTarget, students, activities, quickEnrollTeacherId]);

  const normalizedQuery = searchQuery.toLowerCase().trim();

  const getRoleLabel = (role: UserRole | string | '') => {
    if (!role) return t('adminUsers.roles.none');
    const normalized = normalizeUserRole(role);
    switch (normalized) {
      case UserRole.Admin:
        return t('adminUsers.roles.admin');
      case UserRole.Monitor:
        return t('adminUsers.roles.teacher');
      case UserRole.Alumno:
        return t('adminUsers.roles.student');
      case UserRole.Hibrido:
        return t('adminUsers.roles.teacherStudent');
      case UserRole.Socio:
      default:
        return t('adminUsers.roles.socio');
    }
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

  // Estadísticas rápidas (particiones mutuamente excluyentes y auditadas)
  const pendingApprovalProfiles = useMemo(
    () =>
      profiles.filter(p => {
        if (!isPendingApprovalProfile(p)) return false;
        if (!normalizedQuery) return true;
        const haystack = [p.name, p.email, p.memberNumber || '', getRoleLabel(p.role), p.role || '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [profiles, normalizedQuery, language]
  );

  const { activeProfilesCount, inactiveProfilesCount, pendingProfilesCount } = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let pending = 0;
    for (const p of profiles) {
      if (isPendingApprovalProfile(p)) {
        pending++;
      } else if (deriveAccessFromRow(p)) {
        active++;
      } else {
        inactive++;
      }
    }
    return {
      activeProfilesCount: active,
      inactiveProfilesCount: inactive,
      pendingProfilesCount: pending
    };
  }, [profiles]);

  const loginInactivityConfig = useMemo(
    () => parseLoginInactivityConfig(appConfigs),
    [appConfigs]
  );

  const {
    inactivityEvaluationByUserId,
    inactivityProposedTotalCount,
    inactivityProposedAccounts
  } = useMemo(() => {
    const map = new Map<string, LoginInactivityEvaluation>();
    if (!loginInactivityConfig.enabled) {
      return {
        inactivityEvaluationByUserId: map,
        inactivityProposedTotalCount: 0,
        inactivityProposedAccounts: [] as Array<{
          profile: AuthUser;
          evaluation: LoginInactivityEvaluation;
        }>
      };
    }

    const allCandidates: Array<{
      profile: AuthUser;
      evaluation: LoginInactivityEvaluation;
    }> = [];

    for (const p of profiles) {
      if (isPendingApprovalProfile(p)) continue;
      if (!deriveAccessFromRow(p)) continue;
      if (currentUser?.id === p.id) continue;
      if ((p.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL) continue;

      const evaluation = evaluateProfileLoginInactivity(p, loginInactivityConfig);
      if (evaluation.isInactiveCandidate) {
        map.set(p.id, evaluation);
        allCandidates.push({ profile: p, evaluation });
      }
    }

    allCandidates.sort((a, b) => {
      const aMs = a.evaluation.referenceDateMs ?? 0;
      const bMs = b.evaluation.referenceDateMs ?? 0;
      return aMs - bMs;
    });

    const filteredCandidates = !normalizedQuery
      ? allCandidates
      : allCandidates.filter(({ profile: p }) => {
          const haystack = [
            p.name,
            p.email,
            p.memberNumber || '',
            getRoleLabel(p.role),
            p.role || ''
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        });

    return {
      inactivityEvaluationByUserId: map,
      inactivityProposedTotalCount: allCandidates.length,
      inactivityProposedAccounts: filteredCandidates
    };
  }, [profiles, loginInactivityConfig, currentUser?.id, normalizedQuery, language]);

  const formatDateShort = (iso?: string) => {
    if (!iso) return '';
    return iso.includes('T') ? iso.split('T')[0] : iso;
  };

  const handleRevokeInactiveAppAccess = (p: AuthUser) => {
    if (currentUser?.id === p.id) return;
    if ((p.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL) return;
    setConfirmAction({
      title: t('adminUsers.accountsTab.inactivityRevokeConfirmTitle'),
      description: t('adminUsers.accountsTab.inactivityRevokeConfirmDescription', {
        name: p.name || p.email,
        email: p.email
      }),
      confirmLabel: t('adminUsers.accountsTab.inactivityRevokeConfirmButton'),
      tone: 'warning',
      onConfirm: async () => {
        setBusyInactivityUserIds(prev => ({ ...prev, [p.id]: true }));
        setActionFeedback(null);
        try {
          const res = await toggleUserAccessStatus(p.id, false);
          if (res.success) {
            setDraftProfileEdits(prev => {
              if (!(p.id in prev)) return prev;
              const copy = { ...prev };
              delete copy[p.id];
              return copy;
            });
            setActionFeedback({
              type: 'success',
              message: t('adminUsers.accountsTab.inactivityRevokeSuccess', {
                name: p.name || p.email
              })
            });
          } else {
            setActionFeedback({
              type: 'error',
              message: res.error || t('adminUsers.accountsTab.statusChangeError')
            });
          }
        } finally {
          setBusyInactivityUserIds(prev => {
            const copy = { ...prev };
            delete copy[p.id];
            return copy;
          });
        }
      }
    });
  };

  const { activeStudentsCount, inactiveStudentsCount, pendingStudentsCount } = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let pending = 0;
    for (const s of students) {
      const isPending = s.status === 'pending_validation' || s.validationStatus === 'pending';
      if (isPending) {
        pending++;
      } else if (s.status === 'inactive') {
        inactive++;
      } else {
        active++;
      }
    }
    return {
      activeStudentsCount: active,
      inactiveStudentsCount: inactive,
      pendingStudentsCount: pending
    };
  }, [students]);

  const { activeTeachersCount, inactiveTeachersCount, pendingTeachersCount } = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let pendingRecords = 0;
    const teacherEmails = new Set<string>();

    for (const tc of teachers) {
      if (tc.email) teacherEmails.add(tc.email.toLowerCase().trim());
      const isInactive = tc.active === false || tc.status === 'inactive';
      const isPending =
        !isInactive && (tc.status === 'pending' || tc.status === 'pending_validation');
      if (isInactive) inactive++;
      else if (isPending) pendingRecords++;
      else active++;
    }

    const unlinkedProfiles = profiles.filter(p => {
      if (isPendingApprovalProfile(p) || !deriveAccessFromRow(p)) return false;
      if (p.role !== UserRole.Monitor && p.role !== UserRole.Hibrido) return false;
      if (p.teacherId) return false;
      const emailNorm = (p.email || '').toLowerCase().trim();
      return !(emailNorm && teacherEmails.has(emailNorm));
    }).length;

    return {
      activeTeachersCount: active,
      inactiveTeachersCount: inactive,
      pendingTeachersCount: pendingRecords + unlinkedProfiles
    };
  }, [teachers, profiles]);

  // Calcula totales de inscripciones sobre talleres válidos: activas, inactivas (soft-deleted) y pendientes
  const {
    totalEnrollmentsCount,
    activeEnrollmentsCount,
    inactiveEnrollmentsCount,
    pendingEnrollmentsCount
  } = useMemo(() => {
    const validActivityIds = new Set(activities.map(a => a.id));
    let active = 0;
    let inactive = 0;
    let pending = 0;

    for (const st of students) {
      for (const enr of st.activities || []) {
        if (!validActivityIds.has(enr.activityId)) continue;
        if (enr.active === false || enr.status === 'inactive' || enr.status === 'rejected') {
          inactive++;
        } else if (
          enr.status === 'pending' ||
          enr.status === 'pending_enrollment' ||
          enr.status === 'pending_unenroll' ||
          enr.status === 'pending_withdrawal'
        ) {
          pending++;
        } else {
          active++;
        }
      }
      for (const req of st.pendingEnrollments || []) {
        if (validActivityIds.has(req.activityId)) pending++;
      }
      for (const enr of st.inactiveEnrollments || []) {
        if (validActivityIds.has(enr.activityId)) inactive++;
      }
    }

    return {
      totalEnrollmentsCount: active + inactive + pending,
      activeEnrollmentsCount: active,
      inactiveEnrollmentsCount: inactive,
      pendingEnrollmentsCount: pending
    };
  }, [students, activities]);

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

  // Alumnos filtrados por estado, condición de socio y búsqueda
  const filteredStudents = useMemo(() => {
    const filtered = students.filter(st => {
      const isPending =
        st.status === 'pending_validation' || st.validationStatus === 'pending';

      if (studentStatusFilter === 'pending_validation') {
        if (!isPending) return false;
      } else if (studentStatusFilter === 'inactive') {
        if (isPending || st.status !== 'inactive') return false;
      } else if (studentStatusFilter === 'trial') {
        if (isPending || st.status !== 'trial') return false;
      } else if (studentStatusFilter === 'active') {
        if (isPending || st.status !== 'active') return false;
      }

      if (studentMemberTypeFilter === 'socio') {
        if (st.memberType === 'alumno_no_socio' || st.memberType === 'monitor_no_socio') {
          return false;
        }
      } else if (studentMemberTypeFilter !== 'all') {
        if (st.memberType !== studentMemberTypeFilter) return false;
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
  }, [students, activities, studentStatusFilter, studentMemberTypeFilter, normalizedQuery, language]);

  // Profesores marcados como "Monitor no socio" para el filtro de condición
  const filteredNonMemberTeachers = useMemo(() => {
    if (studentMemberTypeFilter !== 'monitor_no_socio') return [];
    return teachers.filter(tc => {
      if (tc.memberType !== 'monitor_no_socio') return false;
      const isInactive = tc.active === false || tc.status === 'inactive';
      if (studentStatusFilter === 'active' && isInactive) return false;
      if (studentStatusFilter === 'inactive' && !isInactive) return false;
      if (studentStatusFilter === 'trial' || studentStatusFilter === 'pending_validation') {
        return false;
      }
      if (normalizedQuery) {
        const haystack = [tc.name, tc.email, tc.phone, tc.memberNumber || '', tc.notes || '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [teachers, studentStatusFilter, studentMemberTypeFilter, normalizedQuery]);

  type StudentListItem =
    | { kind: 'non_member_teacher'; teacher: Teacher }
    | { kind: 'student'; student: Student };

  const studentListItems = useMemo<StudentListItem[]>(() => {
    const items: StudentListItem[] = [];
    for (const tc of filteredNonMemberTeachers) {
      items.push({ kind: 'non_member_teacher', teacher: tc });
    }
    for (const st of filteredStudents) {
      items.push({ kind: 'student', student: st });
    }
    return items;
  }, [filteredNonMemberTeachers, filteredStudents]);

  // Profesores filtrados por estado, modalidad de cobro y búsqueda
  const filteredTeachers = useMemo(() => {
    return teachers.filter(tc => {
      const isInactive = tc.active === false || tc.status === 'inactive';
      if (teacherStatusFilter === 'active' && isInactive) return false;
      if (teacherStatusFilter === 'inactive' && !isInactive) return false;
      if (teacherCollectionFilter !== 'all' && tc.collectionType !== teacherCollectionFilter) {
        return false;
      }
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
  }, [teachers, activities, teacherStatusFilter, teacherCollectionFilter, normalizedQuery]);

  // Perfiles Auth filtrados (coherente con KPIs: Todos, Activos, Pendientes y De baja)
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      const isPending = isPendingApprovalProfile(p);
      const isProfileActive = !isPending && deriveAccessFromRow(p);

      if (accountStatusFilter === 'pending' && !isPending) return false;
      if (accountStatusFilter === 'active' && !isProfileActive) return false;
      if (accountStatusFilter === 'inactive' && (isPending || isProfileActive)) return false;

      if (accountRoleFilter === 'none') {
        if (p.hasExplicitRole !== false && p.role) return false;
      } else if (accountRoleFilter !== 'all') {
        if (p.hasExplicitRole === false || normalizeUserRole(p.role) !== accountRoleFilter) {
          return false;
        }
      }

      const effectiveIsSocio =
        p.isSocio !== undefined
          ? p.isSocio
          : p.memberType !== 'alumno_no_socio' && p.memberType !== 'monitor_no_socio';
      if (accountSocioFilter === 'socio' && !effectiveIsSocio) return false;
      if (accountSocioFilter === 'non_socio' && effectiveIsSocio) return false;

      if (!normalizedQuery) return true;
      const haystack = [
        p.name,
        p.email,
        p.memberNumber || '',
        getRoleLabel(p.role),
        p.role || '',
        isPending
          ? t('adminUsers.accountsTab.pendingBadge')
          : isProfileActive
          ? t('adminUsers.accountsTab.accessYes')
          : t('adminUsers.accountsTab.accessNo')
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [
    profiles,
    accountStatusFilter,
    accountRoleFilter,
    accountSocioFilter,
    normalizedQuery,
    language
  ]);

  // Segmentos paginados por pantalla
  const enrollmentsPageSafe = Math.min(
    tabPages.enrollments,
    Math.max(1, Math.ceil(enrollmentRows.length / pageSize))
  );
  const paginatedEnrollmentRows = useMemo(
    () =>
      enrollmentRows.slice(
        (enrollmentsPageSafe - 1) * pageSize,
        enrollmentsPageSafe * pageSize
      ),
    [enrollmentRows, enrollmentsPageSafe, pageSize]
  );

  const studentsPageSafe = Math.min(
    tabPages.students,
    Math.max(1, Math.ceil(studentListItems.length / pageSize))
  );
  const paginatedStudentListItems = useMemo(
    () =>
      studentListItems.slice(
        (studentsPageSafe - 1) * pageSize,
        studentsPageSafe * pageSize
      ),
    [studentListItems, studentsPageSafe, pageSize]
  );

  const teachersPageSafe = Math.min(
    tabPages.teachers,
    Math.max(1, Math.ceil(filteredTeachers.length / pageSize))
  );
  const paginatedTeachers = useMemo(
    () =>
      filteredTeachers.slice(
        (teachersPageSafe - 1) * pageSize,
        teachersPageSafe * pageSize
      ),
    [filteredTeachers, teachersPageSafe, pageSize]
  );

  const accountsPageSafe = Math.min(
    tabPages.accounts,
    Math.max(1, Math.ceil(filteredProfiles.length / pageSize))
  );
  const paginatedProfiles = useMemo(
    () =>
      filteredProfiles.slice(
        (accountsPageSafe - 1) * pageSize,
        accountsPageSafe * pageSize
      ),
    [filteredProfiles, accountsPageSafe, pageSize]
  );

  const perPageOptions = useMemo(
    () =>
      [10, 25, 50].map(count => ({
        value: count,
        label: t('adminUsers.common.perPage', { count })
      })),
    [language]
  );

  const formatShowingLabel = (total: number, safePage: number) => {
    if (total === 0) return t('adminUsers.common.showingZero');
    const start = (safePage - 1) * pageSize + 1;
    const end = Math.min(total, safePage * pageSize);
    return t('adminUsers.common.showingRange', { start, end, total });
  };

  const formatPageOfLabel = (total: number, safePage: number) =>
    t('adminUsers.common.pageOf', {
      page: safePage,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    });

  const getPersistedProfileDraftBase = (p: AuthUser) => {
    const persistedSocio =
      p.isSocio !== undefined
        ? p.isSocio
        : p.memberType !== 'alumno_no_socio' && p.memberType !== 'monitor_no_socio';
    const persistedRole: UserRole | '' = p.hasExplicitRole === false ? '' : p.role || '';
    const persistedAccess = deriveAccessFromRow(p);
    return {
      isSocio: persistedSocio,
      role: persistedRole,
      access: persistedAccess
    };
  };

  const stageProfileDraftField = (
    p: AuthUser,
    patch: Partial<{ isSocio: boolean; role: UserRole | ''; access: boolean }>
  ) => {
    const base = getPersistedProfileDraftBase(p);
    setDraftProfileEdits(prev => {
      const current = prev[p.id] ?? base;
      const next = { ...current, ...patch };
      if (
        next.isSocio === base.isSocio &&
        next.role === base.role &&
        next.access === base.access
      ) {
        if (!(p.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      }
      return { ...prev, [p.id]: next };
    });
  };

  const handleConfirmSingleDraft = async (p: AuthUser) => {
    const draft = draftProfileEdits[p.id];
    if (!draft) return;
    setSavingDraftUserIds(prev => ({ ...prev, [p.id]: true }));
    setActionFeedback(null);
    try {
      const res = await saveUserPermissionDrafts([
        {
          userId: p.id,
          isSocio: draft.isSocio,
          role: draft.role,
          access: draft.access
        }
      ]);
      if (res.success) {
        setDraftProfileEdits(prev => {
          const copy = { ...prev };
          delete copy[p.id];
          return copy;
        });
        setActionFeedback({
          type: 'success',
          message: t('adminUsers.accountsTab.draftSavedSuccess', { name: p.name })
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('adminUsers.accountsTab.statusChangeError')
        });
      }
    } finally {
      setSavingDraftUserIds(prev => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });
    }
  };

  const handleConfirmAllDrafts = async () => {
    const entries = Object.entries(draftProfileEdits);
    if (entries.length === 0) return;
    setIsSavingAllDrafts(true);
    setActionFeedback(null);
    try {
      const payload = entries.map(([userId, draft]) => ({
        userId,
        isSocio: draft.isSocio,
        role: draft.role,
        access: draft.access
      }));
      const res = await saveUserPermissionDrafts(payload);
      if (res.success) {
        setDraftProfileEdits({});
        setActionFeedback({
          type: 'success',
          message: t('adminUsers.accountsTab.draftBatchSavedSuccess', {
            count: res.updatedCount
          })
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('adminUsers.accountsTab.statusChangeError')
        });
      }
    } finally {
      setIsSavingAllDrafts(false);
    }
  };

  const handleApprovePending = async (p: AuthUser) => {
    setBusyApprovalUserIds(prev => ({ ...prev, [p.id]: true }));
    setActionFeedback(null);
    try {
      const overrides = pendingApprovalDrafts[p.id];
      const res = await approvePendingUserAccess(p.id, overrides);
      if (res.success) {
        setPendingApprovalDrafts(prev => {
          const copy = { ...prev };
          delete copy[p.id];
          return copy;
        });
        setDraftProfileEdits(prev => {
          const copy = { ...prev };
          delete copy[p.id];
          return copy;
        });
        setActionFeedback({
          type: 'success',
          message: t('adminUsers.accountsTab.approveSuccess', {
            name: p.name,
            role: getRoleLabel(res.role || UserRole.Socio)
          })
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('adminUsers.accountsTab.approveError')
        });
      }
    } finally {
      setBusyApprovalUserIds(prev => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });
    }
  };

  const handleRejectBlockPending = (p: AuthUser) => {
    setConfirmAction({
      title: t('adminUsers.accountsTab.rejectBlockTitle'),
      description: t('adminUsers.accountsTab.rejectBlockDescription', {
        name: p.name,
        email: p.email
      }),
      confirmLabel: t('adminUsers.accountsTab.rejectBlockConfirmLabel'),
      tone: 'danger',
      onConfirm: async () => {
        setBusyApprovalUserIds(prev => ({ ...prev, [p.id]: true }));
        try {
          const res = await rejectOrBlockUserAccess(p.id);
          if (res.success) {
            setPendingApprovalDrafts(prev => {
              const copy = { ...prev };
              delete copy[p.id];
              return copy;
            });
            setDraftProfileEdits(prev => {
              const copy = { ...prev };
              delete copy[p.id];
              return copy;
            });
            setActionFeedback({
              type: 'success',
              message: t('adminUsers.accountsTab.rejectBlockSuccess', { name: p.name })
            });
          } else {
            setActionFeedback({
              type: 'error',
              message: res.error || t('adminUsers.accountsTab.statusChangeError')
            });
          }
        } finally {
          setBusyApprovalUserIds(prev => {
            const copy = { ...prev };
            delete copy[p.id];
            return copy;
          });
        }
      }
    });
  };

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
        memberNumber: authMemberNumber.trim() || undefined,
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
        setAuthMemberNumber('');
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
    const stagedDraft = draftProfileEdits[profile.id];
    const derivedSocio =
      stagedDraft !== undefined
        ? stagedDraft.isSocio
        : profile.isSocio !== undefined
        ? profile.isSocio
        : profile.memberType !== 'alumno_no_socio' && profile.memberType !== 'monitor_no_socio';
    const normalizedRole = normalizeUserRole(
      stagedDraft?.role !== undefined && stagedDraft.role !== '' ? stagedDraft.role : profile.role,
      UserRole.Socio
    );
    const derivedActive =
      stagedDraft !== undefined ? stagedDraft.access : deriveAccessFromRow(profile);
    setEditingProfile(profile);
    setEditProfileName(profile.name);
    setEditProfileRole(normalizedRole);
    setEditProfileTeacherId(profile.teacherId || '');
    setEditProfileStudentId(profile.studentId || '');
    setEditProfileMemberNumber(profile.memberNumber || '');
    setEditProfileMemberType(
      derivedSocio
        ? 'socio'
        : normalizedRole === UserRole.Monitor || normalizedRole === UserRole.Hibrido
        ? 'monitor_no_socio'
        : 'alumno_no_socio'
    );
    setEditProfileIsSocio(derivedSocio);
    setEditProfileStartDate(profile.startDate || '');
    setEditProfileEndDate(derivedActive ? profile.endDate || '' : profile.endDate || '');
    setEditProfileActive(derivedActive);
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
      setDraftProfileEdits(prev => {
        if (!(editingProfile.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[editingProfile.id];
        return copy;
      });
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

  const getProfileContactInfo = (
    profile: Pick<AuthUser, 'id' | 'email' | 'studentId' | 'teacherId'>
  ) => {
    const emailLower = (profile.email || '').trim().toLowerCase();
    const linkedStu = students.find(
      s =>
        (profile.studentId && s.id === profile.studentId) ||
        s.profileId === profile.id ||
        (emailLower && (s.email || '').trim().toLowerCase() === emailLower)
    );
    const linkedTc = teachers.find(
      tc =>
        (profile.teacherId && tc.id === profile.teacherId) ||
        (emailLower && (tc.email || '').trim().toLowerCase() === emailLower)
    );
    return {
      phone: linkedStu?.phone || linkedTc?.phone || undefined,
      email: profile.email || linkedStu?.email || linkedTc?.email || undefined
    };
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

      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          onClick={() => {
            selectSubTab('accounts', true);
            if (pendingWithdrawalRequests.length > 0) {
              setIsAccountsBajasAccordionOpen(false);
            }
            if (pendingProfilesCount > 0) {
              setIsAccountsAltasAccordionOpen(false);
            }
            if (inactivityProposedTotalCount > 0) {
              setIsAccountsInactivityAccordionOpen(false);
            }
          }}
          className={`text-left rounded-2xl border p-4 shadow-xs transition ${
            activeSubTab === 'accounts'
              ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-50/40 dark:bg-purple-950/20'
              : pendingWithdrawalRequests.length > 0
              ? 'border-rose-400/70 bg-rose-50/60 dark:bg-rose-950/25 hover:border-purple-400/60'
              : pendingProfilesCount > 0 || inactivityProposedTotalCount > 0
              ? 'border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/25 hover:border-purple-400/60'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-400/60'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('adminUsers.kpis.accountsTitle')}
            </span>
            <div className="flex items-center gap-1.5">
              {pendingProfilesCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                  {pendingProfilesCount}
                </span>
              )}
              {inactivityProposedTotalCount > 0 && (
                <span
                  title={t('adminUsers.kpis.accountsInactivityProposed', {
                    count: inactivityProposedTotalCount
                  })}
                  className="rounded-full bg-orange-500 px-1.5 py-0.2 text-[10px] font-black text-white"
                >
                  {inactivityProposedTotalCount}
                </span>
              )}
              {pendingWithdrawalRequests.length > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                  {pendingWithdrawalRequests.length}
                </span>
              )}
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </div>
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
            {inactivityProposedTotalCount > 0 && (
              <>
                <br />
                <span className="text-amber-700 dark:text-amber-400 font-bold">
                  {t('adminUsers.kpis.accountsInactivityProposed', {
                    count: inactivityProposedTotalCount
                  })}
                </span>
              </>
            )}
            {pendingWithdrawalRequests.length > 0 && (
              <>
                <br />
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {t('adminUsers.kpis.accountsWithdrawalsPending', {
                    count: pendingWithdrawalRequests.length
                  })}
                </span>
              </>
            )}
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

      <div ref={searchBarRef} className="scroll-mt-20">
        {/* ================================================================== */}
        {/* PANTALLA 1: INSCRIPCIONES                                          */}
        {/* ================================================================== */}
        {activeSubTab === 'enrollments' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
            <AdminSectionHeader
              title={t('adminUsers.enrollmentsTab.screenTitle')}
              subtitle={t('adminUsers.enrollmentsTab.screenSubtitle')}
              action={
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
              }
            />

            <AdminAccordion
              title={t('adminUsers.enrollmentsTab.accordionRequestsTitle')}
              subtitle={t('adminUsers.enrollmentsTab.workshopRequestsSubtitle')}
              count={pendingEnrollmentRequests.length}
              isOpen={isEnrollReqAccordionOpen}
              onToggle={() => setIsEnrollReqAccordionOpen(prev => !prev)}
              icon={<Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
              tone="indigo"
            >
              {pendingEnrollmentRequests.length === 0 ? (
                <div className="rounded-xl border border-indigo-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{t('adminUsers.common.emptyEnrollmentRequests')}</span>
                </div>
              ) : (
                <div className="@container rounded-xl border border-indigo-500/25 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                  <div className="hidden @[720px]:grid @[720px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_105px_255px] gap-3 items-center px-3.5 py-2 border-b border-indigo-500/15 bg-indigo-50/40 dark:bg-indigo-950/20 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>{t('common.columns.student')}</span>
                    <span>{t('common.columns.workshop')}</span>
                    <span>{t('common.columns.teacher')}</span>
                    <span>{t('common.columns.requestedAt')}</span>
                    <span className="text-right">{t('common.columns.actions')}</span>
                  </div>
                  <div className="divide-y divide-indigo-500/15">
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
                        className="px-3 py-2 @[720px]:px-3.5 @[720px]:py-3"
                      >
                        <div className="flex @[720px]:hidden items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                              <StudentNameButton
                                name={req.student.name}
                                phone={req.student.phone}
                                email={req.student.email}
                                subtitle={req.activityName}
                                className="truncate text-xs font-bold text-slate-900 dark:text-white"
                              />
                            </div>
                            <div className="pl-3.5 truncate text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                              {req.activityName}
                            </div>
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

                        <div className="hidden @[720px]:grid @[720px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_105px_255px] gap-3 items-center">
                          <div className="min-w-0">
                            <StudentNameButton
                              name={req.student.name}
                              phone={req.student.phone}
                              email={req.student.email}
                              subtitle={req.activityName}
                              className="font-bold text-sm text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="min-w-0">
                            <span className="inline-block rounded-lg bg-indigo-500/10 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 break-words">
                              {req.activityName}
                            </span>
                          </div>

                          <div className="min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {req.teacherName}
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {req.enrolledSince}
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
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
            </AdminAccordion>

            <AdminFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder={t('adminUsers.enrollmentsTab.searchPlaceholder')}
              hasActiveFilters={
                Boolean(searchQuery.trim()) ||
                enrollmentStatusFilter !== 'all' ||
                enrollmentTeacherFilter !== 'all' ||
                enrollmentActivityFilter !== 'all'
              }
              onClearFilters={() => {
                setSearchQuery('');
                setEnrollmentStatusFilter('all');
                setEnrollmentTeacherFilter('all');
                setEnrollmentActivityFilter('all');
              }}
              clearFiltersLabel={t('adminUsers.common.clearFilters')}
              filters={[
                {
                  id: 'enrollment-status',
                  label: t('adminUsers.enrollmentsTab.statusFilterLabel'),
                  value: enrollmentStatusFilter,
                  onChange: v => setEnrollmentStatusFilter(v as 'all' | 'active' | 'inactive'),
                  options: [
                    { value: 'all', label: t('adminUsers.enrollmentsTab.statusAllOption') },
                    { value: 'active', label: t('adminUsers.enrollmentsTab.statusActiveOption') },
                    { value: 'inactive', label: t('adminUsers.enrollmentsTab.statusInactiveOption') }
                  ]
                },
                {
                  id: 'enrollment-teacher',
                  label: t('adminUsers.enrollmentsTab.teacherFilterLabel'),
                  value: enrollmentTeacherFilter,
                  onChange: setEnrollmentTeacherFilter,
                  options: [
                    { value: 'all', label: t('adminUsers.enrollmentsTab.allTeachersOption') },
                    ...teachers.map(tc => ({
                      value: tc.id,
                      label: t('adminUsers.enrollmentsTab.teacherFilterOption', { name: tc.name })
                    }))
                  ]
                },
                {
                  id: 'enrollment-activity',
                  label: t('adminUsers.enrollmentsTab.workshopFilterLabel'),
                  value: enrollmentActivityFilter,
                  onChange: setEnrollmentActivityFilter,
                  options: [
                    { value: 'all', label: t('adminUsers.enrollmentsTab.allWorkshopsOption') },
                    ...activities.map(a => ({ value: a.id, label: a.name }))
                  ]
                }
              ]}
            />

            <AdminListContainer
              totalItems={enrollmentRows.length}
              page={enrollmentsPageSafe}
              pageSize={pageSize}
              onPageChange={p => setTabPage('enrollments', p)}
              onPageSizeChange={size => {
                setPageSize(size);
                setTabPage('enrollments', 1);
              }}
              emptyMessage={t('adminUsers.enrollmentsTab.emptyEnrollments')}
              hasActiveFilters={
                Boolean(searchQuery.trim()) ||
                enrollmentStatusFilter !== 'all' ||
                enrollmentTeacherFilter !== 'all' ||
                enrollmentActivityFilter !== 'all'
              }
              onClearFilters={() => {
                setSearchQuery('');
                setEnrollmentStatusFilter('all');
                setEnrollmentTeacherFilter('all');
                setEnrollmentActivityFilter('all');
              }}
              clearFiltersLabel={t('adminUsers.common.clearFilters')}
              showingLabel={formatShowingLabel(enrollmentRows.length, enrollmentsPageSafe)}
              pageOfLabel={formatPageOfLabel(enrollmentRows.length, enrollmentsPageSafe)}
              prevLabel={t('adminUsers.common.prevPage')}
              nextLabel={t('adminUsers.common.nextPage')}
              perPageOptions={perPageOptions}
              tableHeader={
                <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_105px_110px_296px] gap-3 items-center px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>{t('common.columns.student')}</span>
                  <span>{t('common.columns.workshop')}</span>
                  <span>{t('common.columns.quota')}</span>
                  <span>{t('common.columns.enrolledDate')}</span>
                  <span className="text-right">{t('common.columns.actions')}</span>
                </div>
              }
            >
              {paginatedEnrollmentRows.map(row => {
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
                    className={`px-3 py-2.5 @[740px]:px-3.5 @[740px]:py-3 ${row.isInactiveEnrollment ? 'opacity-75' : ''}`}
                  >
                    <div className="flex @[740px]:hidden items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="min-w-0 flex items-center gap-1.5">
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
                          <StudentNameButton
                            name={row.student.name}
                            phone={row.student.phone}
                            email={row.student.email}
                            subtitle={row.activityName}
                            className="truncate text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="pl-3.5 flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={`truncate text-[11px] font-medium ${
                              row.isInactiveEnrollment
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {row.activityName}
                          </span>
                          {row.isInactiveEnrollment && (
                            <span className="shrink-0 rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:text-slate-400">
                              {t('adminUsers.enrollmentsTab.shortInactiveBadge')}
                            </span>
                          )}
                        </div>
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
                          onClick={() =>
                            openStudentEnrollmentsModal(
                              row.student.id,
                              row.teacherId,
                              row.activityId
                            )
                          }
                          title={t('adminUsers.enrollmentsTab.editEnrollmentTooltip')}
                          aria-label={t('adminUsers.enrollmentsTab.editEnrollmentAria', {
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

                    <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_105px_110px_296px] gap-3 items-center">
                      <div className="min-w-0 space-y-1">
                        <div>
                          <StudentNameButton
                            name={row.student.name}
                            phone={row.student.phone}
                            email={row.student.email}
                            subtitle={row.activityName}
                            className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getStudentStatusBadge(row.student.status)}
                          {row.addedByName && (
                            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                              {t('adminUsers.enrollmentsTab.signupAddedBy', { name: row.addedByName })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
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
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {t('adminUsers.enrollmentsTab.teacherLabel')}{' '}
                          <strong className="text-slate-700 dark:text-slate-200">{row.teacherName}</strong>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        <strong className="text-slate-700 dark:text-slate-200">{row.price}€</strong>{' '}
                        <span className="block text-[10px]">
                          {row.billingMode === 'per_class'
                            ? t('adminUsers.enrollmentsTab.billingPerClass')
                            : t('adminUsers.enrollmentsTab.billingMonthly')}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                        <div>{row.enrolledSince}</div>
                        {row.isInactiveEnrollment && row.endedAt && (
                          <div className="text-rose-600 dark:text-rose-400 font-medium">
                            {t('adminUsers.enrollmentsTab.endedDate', { date: row.endedAt })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
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
                          onClick={() =>
                            openStudentEnrollmentsModal(
                              row.student.id,
                              row.teacherId,
                              row.activityId
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>{t('adminUsers.enrollmentsTab.editEnrollmentButton')}</span>
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
            </AdminListContainer>
          </div>
        )}

      {/* ================================================================== */}
      {/* PANTALLA 2: SOCIOS Y ALUMNOS                                       */}
      {/* ================================================================== */}
      {activeSubTab === 'students' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
          <AdminSectionHeader
            title={t('adminUsers.studentsTab.screenTitle')}
            subtitle={t('adminUsers.studentsTab.screenSubtitle')}
            action={
              <button
                type="button"
                onClick={() => onOpenAddStudent()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{t('adminUsers.searchBar.newStudentButton')}</span>
              </button>
            }
          />

          <AdminAccordion
            title={t('adminUsers.studentsTab.accordionQuickSignupsTitle')}
            subtitle={t('adminUsers.enrollmentsTab.quickSignupsSubtitle')}
            count={pendingValidationStudents.length}
            isOpen={isQuickSignupsAccordionOpen}
            onToggle={() => setIsQuickSignupsAccordionOpen(prev => !prev)}
            icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            tone="amber"
          >
            {pendingValidationStudents.length === 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{t('adminUsers.enrollmentsTab.noPendingSignups')}</span>
              </div>
            ) : (
              <div className="@container rounded-xl border border-amber-500/30 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_105px_290px] gap-3 items-center px-3.5 py-2 border-b border-amber-500/15 bg-amber-50/40 dark:bg-amber-950/20 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>{t('common.columns.student')}</span>
                  <span>{t('common.columns.workshops')}</span>
                  <span>{t('common.columns.enrolledDate')}</span>
                  <span className="text-right">{t('common.columns.actions')}</span>
                </div>
                <div className="divide-y divide-amber-500/15">
                {pendingValidationStudents.map(st => {
                  const addedByName = getProfileNameById(st.registeredBy);
                  const stActivities = (st.activities || []).map(enr => {
                    const act = activities.find(a => a.id === enr.activityId);
                    const tc = act ? teachers.find(teacherItem => teacherItem.id === act.teacherId) : undefined;
                    return {
                      actId: enr.activityId,
                      actName: act?.name || t('adminUsers.enrollmentsTab.deletedWorkshop'),
                      teacherId: tc?.id,
                      teacherName: tc?.name
                    };
                  });
                  const primaryTeacherId = stActivities.find(a => a.teacherId)?.teacherId;

                  return (
                    <div
                      key={st.id}
                      className="px-3 py-2 md:px-3.5 md:py-3"
                    >
                      <div className="flex @[740px]:hidden items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
                            title={t('adminUsers.enrollmentsTab.pendingDotTooltip')}
                          />
                          <StudentNameButton
                            name={st.name}
                            phone={st.phone}
                            email={st.email}
                            className="truncate text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openStudentEnrollmentsModal(st.id, primaryTeacherId)}
                            title={t('adminUsers.enrollmentsTab.editEnrollmentTooltip')}
                            aria-label={t('adminUsers.enrollmentsTab.editEnrollmentAria', { name: st.name })}
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

                      <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_105px_290px] gap-3 items-center">
                        <div className="min-w-0 space-y-1">
                          <div>
                            <StudentNameButton
                              name={st.name}
                              phone={st.phone}
                              email={st.email}
                              className="font-bold text-sm text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {getStudentStatusBadge(st.status)}
                            {addedByName && (
                              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                                {t('adminUsers.enrollmentsTab.addedBy', { name: addedByName })}
                              </span>
                            )}
                          </div>
                          {st.notes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                              {t('adminUsers.enrollmentsTab.notePrefix', { note: st.notes })}
                            </p>
                          )}
                        </div>

                        <div className="min-w-0">
                          {stActivities.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
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
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {st.registeredAt}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openStudentEnrollmentsModal(st.id, primaryTeacherId)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>{t('adminUsers.enrollmentsTab.editEnrollmentButton')}</span>
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
              </div>
            )}
          </AdminAccordion>

          <AdminFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('adminUsers.studentsTab.searchPlaceholder')}
            hasActiveFilters={
              Boolean(searchQuery.trim()) ||
              studentStatusFilter !== 'all' ||
              studentMemberTypeFilter !== 'all'
            }
            onClearFilters={() => {
              setSearchQuery('');
              setStudentStatusFilter('all');
              setStudentMemberTypeFilter('all');
            }}
            clearFiltersLabel={t('adminUsers.common.clearFilters')}
            filters={[
              {
                id: 'student-status',
                label: t('adminUsers.studentsTab.statusFilterLabel'),
                value: studentStatusFilter,
                onChange: v => setStudentStatusFilter(v as StudentFilterStatus),
                options: [
                  { value: 'all', label: t('adminUsers.studentsTab.statusAllOption') },
                  { value: 'active', label: t('adminUsers.studentsTab.statusActiveOption') },
                  { value: 'trial', label: t('adminUsers.studentsTab.statusTrialOption') },
                  { value: 'pending_validation', label: t('adminUsers.studentsTab.statusPendingOption') },
                  { value: 'inactive', label: t('adminUsers.studentsTab.statusInactiveOption') }
                ]
              },
              {
                id: 'student-member-type',
                label: t('adminUsers.studentsTab.memberTypeFilterLabel'),
                value: studentMemberTypeFilter,
                onChange: v => setStudentMemberTypeFilter(v as StudentFilterMemberType),
                options: [
                  { value: 'all', label: t('adminUsers.studentsTab.memberTypeAllOption') },
                  { value: 'socio', label: t('adminUsers.studentsTab.memberTypeSocioOption') },
                  {
                    value: 'alumno_no_socio',
                    label: t('adminUsers.studentsTab.memberTypeNonMemberStudentOption')
                  },
                  {
                    value: 'monitor_no_socio',
                    label: t('adminUsers.studentsTab.memberTypeNonMemberTeacherOption')
                  }
                ]
              }
            ]}
          />

          <AdminListContainer
            totalItems={studentListItems.length}
            page={studentsPageSafe}
            pageSize={pageSize}
            onPageChange={p => setTabPage('students', p)}
            onPageSizeChange={size => {
              setPageSize(size);
              setTabPage('students', 1);
            }}
            emptyMessage={t('adminUsers.studentsTab.empty')}
            hasActiveFilters={
              Boolean(searchQuery.trim()) ||
              studentStatusFilter !== 'all' ||
              studentMemberTypeFilter !== 'all'
            }
            onClearFilters={() => {
              setSearchQuery('');
              setStudentStatusFilter('all');
              setStudentMemberTypeFilter('all');
            }}
            clearFiltersLabel={t('adminUsers.common.clearFilters')}
            showingLabel={formatShowingLabel(studentListItems.length, studentsPageSafe)}
            pageOfLabel={formatPageOfLabel(studentListItems.length, studentsPageSafe)}
            prevLabel={t('adminUsers.common.prevPage')}
            nextLabel={t('adminUsers.common.nextPage')}
            perPageOptions={perPageOptions}
            tableHeader={
              <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1.25fr)_125px_296px] gap-3 items-center px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{t('common.columns.member')}</span>
                <span>{t('common.columns.workshops')}</span>
                <span>{t('common.columns.enrolledDate')}</span>
                <span className="text-right">{t('common.columns.actions')}</span>
              </div>
            }
          >
            {paginatedStudentListItems.map(item => {
              if (item.kind === 'non_member_teacher') {
                const tc = item.teacher;
                return (
                  <div key={`nmt-${tc.id}`} className="px-3 py-2.5 md:px-3.5 md:py-3.5">
                    <div className="flex @[740px]:hidden items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              tc.active ? 'bg-indigo-500' : 'bg-slate-400'
                            }`}
                          />
                          <StudentNameButton
                            name={tc.name}
                            phone={tc.phone}
                            email={tc.email}
                            className="truncate text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="pl-4 flex flex-wrap items-center gap-1">
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                            {t('adminUsers.memberType.shortNonMemberTeacher')}
                          </span>
                          {!tc.active && (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-slate-500/15 text-slate-600 dark:text-slate-400">
                              {t('adminUsers.teachersTab.shortInactive')}
                            </span>
                          )}
                        </div>
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
                    <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1.25fr)_125px_296px] gap-3 items-center">
                      <div className="min-w-0 space-y-1">
                        <div>
                          <StudentNameButton
                            name={tc.name}
                            phone={tc.phone}
                            email={tc.email}
                            className="font-bold text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
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
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 italic">—</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                        {tc.startDate && <div>{t('adminUsers.studentsTab.startDate', { date: tc.startDate })}</div>}
                        {tc.endDate && <div>{t('adminUsers.studentsTab.leaveDate', { date: tc.endDate })}</div>}
                        {!tc.startDate && !tc.endDate && <span>—</span>}
                      </div>
                      <div className="flex items-center justify-end">
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
                  </div>
                );
              }

              const st = item.student;
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
                  className={`px-3 py-2.5 md:px-3.5 md:py-3.5 ${isInactive ? 'opacity-75' : ''}`}
                >
                  <div className="flex @[740px]:hidden items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="min-w-0 flex items-center gap-2">
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
                        <StudentNameButton
                          name={st.name}
                          phone={st.phone}
                          email={st.email}
                          className="truncate text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      {(st.memberType === 'alumno_no_socio' ||
                        st.memberType === 'monitor_no_socio' ||
                        isPending ||
                        st.status !== 'active') && (
                        <div className="pl-4 flex flex-wrap items-center gap-1">
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

                  <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1.25fr)_125px_296px] gap-3 items-center">
                    <div className="min-w-0 space-y-1">
                      <div>
                        <StudentNameButton
                          name={st.name}
                          phone={st.phone}
                          email={st.email}
                          className="font-bold text-sm text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
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
                      {st.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                          {st.notes}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
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
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                      <div>{st.registeredAt}</div>
                      {st.startDate && <div>{t('adminUsers.studentsTab.startDate', { date: st.startDate })}</div>}
                      {st.endDate && <div>{t('adminUsers.studentsTab.endDate', { date: st.endDate })}</div>}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
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
          </AdminListContainer>
        </div>
      )}

      {/* ================================================================== */}
      {/* PANTALLA 3: MONITORES                                              */}
      {/* ================================================================== */}
      {activeSubTab === 'teachers' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
          <AdminSectionHeader
            title={t('adminUsers.teachersTab.screenTitle')}
            subtitle={t('adminUsers.teachersTab.screenSubtitle')}
            action={
              <button
                type="button"
                onClick={() => onOpenAddTeacher()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>{t('adminUsers.searchBar.newTeacherButton')}</span>
              </button>
            }
          />

          <AdminFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('adminUsers.teachersTab.searchPlaceholder')}
            hasActiveFilters={
              Boolean(searchQuery.trim()) ||
              teacherStatusFilter !== 'all' ||
              teacherCollectionFilter !== 'all'
            }
            onClearFilters={() => {
              setSearchQuery('');
              setTeacherStatusFilter('all');
              setTeacherCollectionFilter('all');
            }}
            clearFiltersLabel={t('adminUsers.common.clearFilters')}
            filters={[
              {
                id: 'teacher-status',
                label: t('adminUsers.teachersTab.statusFilterLabel'),
                value: teacherStatusFilter,
                onChange: v => setTeacherStatusFilter(v as 'all' | 'active' | 'inactive'),
                options: [
                  { value: 'all', label: t('adminUsers.teachersTab.filterAll') },
                  { value: 'active', label: t('adminUsers.teachersTab.filterActive') },
                  { value: 'inactive', label: t('adminUsers.teachersTab.filterInactive') }
                ]
              },
              {
                id: 'teacher-collection',
                label: t('adminUsers.teachersTab.collectionFilterLabel'),
                value: teacherCollectionFilter,
                onChange: v => setTeacherCollectionFilter(v as 'all' | 'association' | 'personal'),
                options: [
                  { value: 'all', label: t('adminUsers.teachersTab.collectionAllOption') },
                  { value: 'association', label: t('adminUsers.teachersTab.collectionAssociationOption') },
                  { value: 'personal', label: t('adminUsers.teachersTab.collectionPersonalOption') }
                ]
              }
            ]}
          />

          <AdminListContainer
            totalItems={filteredTeachers.length}
            page={teachersPageSafe}
            pageSize={pageSize}
            onPageChange={p => setTabPage('teachers', p)}
            onPageSizeChange={size => {
              setPageSize(size);
              setTabPage('teachers', 1);
            }}
            emptyMessage={t('adminUsers.teachersTab.empty')}
            hasActiveFilters={
              Boolean(searchQuery.trim()) ||
              teacherStatusFilter !== 'all' ||
              teacherCollectionFilter !== 'all'
            }
            onClearFilters={() => {
              setSearchQuery('');
              setTeacherStatusFilter('all');
              setTeacherCollectionFilter('all');
            }}
            clearFiltersLabel={t('adminUsers.common.clearFilters')}
            showingLabel={formatShowingLabel(filteredTeachers.length, teachersPageSafe)}
            pageOfLabel={formatPageOfLabel(filteredTeachers.length, teachersPageSafe)}
            prevLabel={t('adminUsers.common.prevPage')}
            nextLabel={t('adminUsers.common.nextPage')}
            perPageOptions={perPageOptions}
            tableHeader={
              <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_290px] gap-3 items-center px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{t('common.columns.teacher')}</span>
                <span>{t('common.columns.scheme')}</span>
                <span>{t('common.columns.workshops')}</span>
                <span className="text-right">{t('common.columns.actions')}</span>
              </div>
            }
          >
            {paginatedTeachers.map(tc => {
              const tActivities = activities.filter(a => a.teacherId === tc.id);
              const linkedProfile = profiles.find(p => p.teacherId === tc.id);
              const isInactive = tc.active === false || tc.status === 'inactive';
              const schemeText =
                tc.paymentScheme === 'per_class'
                  ? t('adminUsers.teachersTab.schemePerClass', { rate: tc.ratePerClass ?? 0 })
                  : tc.paymentScheme === 'monthly_fixed'
                  ? t('adminUsers.teachersTab.schemeMonthlyFixed', { rate: tc.fixedMonthlyRate ?? 0 })
                  : t('adminUsers.teachersTab.schemeRevenueShare', { percent: tc.revenueSharePercent ?? 0 });

              return (
                <div
                  key={tc.id}
                  className={`px-3 py-2 md:px-3.5 md:py-3.5 ${isInactive ? 'opacity-75' : ''}`}
                >
                  {/* Vista móvil */}
                  <div className="flex @[740px]:hidden items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 flex items-start gap-2">
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
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              !isInactive ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          <StudentNameButton
                            name={tc.name}
                            phone={tc.phone}
                            email={tc.email}
                            className="truncate text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="pl-3.5 flex flex-wrap items-center gap-1">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                              !isInactive
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {!isInactive
                              ? t('adminUsers.teachersTab.activeBadge')
                              : t('adminUsers.teachersTab.inactiveBadge')}
                          </span>
                          {tc.memberType === 'monitor_no_socio' && (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                              {t('adminUsers.memberType.shortNonMemberTeacher')}
                            </span>
                          )}
                        </div>
                      </div>
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
                          const res = await updateTeacher(tc.id, { active: isInactive });
                          if (res.success) {
                            setActionFeedback({
                              type: 'success',
                              message: !isInactive
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
                        title={!isInactive ? t('adminUsers.teachersTab.deactivate') : t('adminUsers.teachersTab.reactivate')}
                        aria-label={
                          !isInactive
                            ? t('adminUsers.teachersTab.deactivateAria', { name: tc.name })
                            : t('adminUsers.teachersTab.reactivateAria', { name: tc.name })
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
                  <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_290px] gap-3 items-center">
                    <div className="flex items-start gap-3 min-w-0">
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

                      <div className="min-w-0 space-y-1">
                        <div>
                          <StudentNameButton
                            name={tc.name}
                            phone={tc.phone}
                            email={tc.email}
                            className="font-bold text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              !isInactive
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {!isInactive
                              ? t('adminUsers.teachersTab.activeBadge')
                              : t('adminUsers.teachersTab.inactiveBadge')}
                          </span>
                          {getMemberTypeBadge(tc.memberType)}
                          {tc.memberNumber && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                              {t('adminUsers.studentsTab.memberNumber', { number: tc.memberNumber })}
                            </span>
                          )}
                          {linkedProfile && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                              <Link2 className="h-3 w-3" /> {t('adminUsers.teachersTab.authLinked')}
                            </span>
                          )}
                        </div>

                        {(tc.startDate || tc.endDate) && (
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                            {tc.startDate && <span>{t('adminUsers.studentsTab.startDate', { date: tc.startDate })}</span>}
                            {tc.endDate && <span>{t('adminUsers.studentsTab.leaveDate', { date: tc.endDate })}</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <span className="inline-block rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                        {schemeText}
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('adminUsers.teachersTab.collectionLabel', {
                          type:
                            tc.collectionType === 'association'
                              ? t('adminUsers.teachersTab.collectionAssociation')
                              : t('adminUsers.teachersTab.collectionPersonal')
                        })}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
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

                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
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
                          const res = await updateTeacher(tc.id, { active: isInactive });
                          if (res.success) {
                            setActionFeedback({
                              type: 'success',
                              message: !isInactive
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
                          isInactive
                            ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                            : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>
                          {!isInactive
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
          </AdminListContainer>
        </div>
      )}

      {/* ================================================================== */}
      {/* PANTALLA 4: CUENTAS DE ACCESO                                      */}
      {/* ================================================================== */}
      {activeSubTab === 'accounts' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-xs">
          <AdminSectionHeader
            title={t('adminUsers.accountsTab.screenTitle')}
            subtitle={t('adminUsers.accountsTab.screenSubtitle')}
            badge={
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {t('adminUsers.accountsTab.badgeSelfRegisterDisabled')}
              </span>
            }
            action={
              <button
                type="button"
                onClick={() => setIsAddingAuthUser(prev => !prev)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
              >
                {isAddingAuthUser ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    <span>{t('adminUsers.searchBar.closeFormButton')}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{t('adminUsers.searchBar.newAuthUserButton')}</span>
                  </>
                )}
              </button>
            }
          />

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
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {t('adminUsers.accountsTab.credentialsHint')}
              </p>
            </div>
          )}
          {isAddingAuthUser && (
            <form
              onSubmit={handleCreateAuthUser}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3.5 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  <span>{t('adminUsers.accountsTab.createFormTitle')}</span>
                </h4>
                <span className="text-[10px] font-semibold text-slate-400">
                  {t('adminUsers.accountsTab.adminControlBadge')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('adminUsers.accountsTab.memberNumberLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('adminUsers.accountsTab.memberNumberPlaceholder')}
                    value={authMemberNumber}
                    onChange={e => setAuthMemberNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white font-mono"
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
                        {getRoleLabel(r)}
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

              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {t('adminUsers.accountsTab.membershipHint')}
              </p>

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
                    {authRole === UserRole.Socio
                      ? t('adminUsers.accountsTab.linkMemberHeading')
                      : t('adminUsers.accountsTab.linkStudentHeading')}
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
                        <span>
                          {authRole === UserRole.Socio
                            ? t('adminUsers.accountsTab.autoCreateMember')
                            : t('adminUsers.accountsTab.autoCreateStudent')}
                        </span>
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

          <AdminAccordion
            title={t('adminUsers.accountsTab.accordionAltasTitle')}
            subtitle={t('adminUsers.accountsTab.pendingSectionSubtitle')}
            count={pendingApprovalProfiles.length}
            isOpen={isAccountsAltasAccordionOpen}
            onToggle={() => setIsAccountsAltasAccordionOpen(prev => !prev)}
            icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            tone="amber"
          >
            {pendingApprovalProfiles.length === 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{t('adminUsers.accountsTab.pendingEmpty')}</span>
              </div>
            ) : (
              <div className="@container overflow-hidden rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white/85 dark:bg-slate-900/70">
                <div className="hidden @[780px]:grid @[780px]:grid-cols-[minmax(0,1.35fr)_250px_290px] gap-3 items-center px-3.5 py-2 border-b border-amber-200/70 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>{t('common.columns.account')}</span>
                  <span>{t('common.columns.roleAndAccess')}</span>
                  <span className="text-right">{t('common.columns.actions')}</span>
                </div>
                <div className="divide-y divide-amber-200/70 dark:divide-amber-900/50">
                {pendingApprovalProfiles.map(p => {
                  const isBusyApproval = Boolean(busyApprovalUserIds[p.id]);
                  const pendingOverride = pendingApprovalDrafts[p.id];
                  const selectedRole: UserRole | '' =
                    pendingOverride?.role !== undefined
                      ? pendingOverride.role
                      : p.hasExplicitRole === false
                      ? ''
                      : p.role || '';
                  const selectedIsSocio: boolean =
                    pendingOverride?.isSocio !== undefined
                      ? pendingOverride.isSocio
                      : p.isSocio !== undefined
                      ? p.isSocio
                      : true;
                  const contactInfo = getProfileContactInfo(p);

                  return (
                    <div
                      key={p.id}
                      className="px-3.5 py-3 flex flex-col @[780px]:grid @[780px]:grid-cols-[minmax(0,1.35fr)_250px_290px] @[780px]:items-center gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {p.photoURL ? (
                          <img
                            src={p.photoURL}
                            alt={p.name}
                            className="h-9 w-9 rounded-full object-cover border border-amber-400 shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-bold flex items-center justify-center text-xs shrink-0">
                            {(p.name || p.email || '').charAt(0).toUpperCase() || t('adminUsers.accountsTab.fallbackInitial')}
                          </div>
                        )}
                        <div className="min-w-0 space-y-1">
                          <div>
                            <StudentNameButton
                              name={p.name || p.email}
                              phone={contactInfo.phone}
                              email={contactInfo.email}
                              className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                              {t('adminUsers.accountsTab.pendingBadge')}
                            </span>
                            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                              {t('adminUsers.accountsTab.accessBadgeNo')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusyApproval}
                          onClick={() =>
                            setPendingApprovalDrafts(prev => ({
                              ...prev,
                              [p.id]: {
                                ...(prev[p.id] || {}),
                                isSocio: !selectedIsSocio
                              }
                            }))
                          }
                          className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                            selectedIsSocio
                              ? 'border-teal-300 dark:border-teal-700 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                              : 'border-amber-300 dark:border-amber-700 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {selectedIsSocio
                            ? t('adminUsers.accountsTab.socioYes')
                            : t('adminUsers.accountsTab.socioNo')}
                        </button>

                        <select
                          value={selectedRole}
                          disabled={isBusyApproval}
                          onChange={e =>
                            setPendingApprovalDrafts(prev => ({
                              ...prev,
                              [p.id]: {
                                ...(prev[p.id] || {}),
                                role: e.target.value as UserRole
                              }
                            }))
                          }
                          className="min-w-0 max-w-full flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
                        >
                          <option value="">
                            {t('adminUsers.roles.none')} → {getRoleLabel(UserRole.Socio)}
                          </option>
                          {USER_ROLE_VALUES.map(r => (
                            <option key={r} value={r}>
                              {getRoleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center @[780px]:justify-end gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusyApproval}
                          onClick={() => openEditProfileModal(p)}
                          title={t('adminUsers.accountsTab.editRoleLinksTooltip')}
                          aria-label={t('adminUsers.accountsTab.editRoleLinksAria', { name: p.name })}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t('adminUsers.accountsTab.editLinksButton')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusyApproval}
                          onClick={() => handleApprovePending(p)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                          {isBusyApproval ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {isBusyApproval
                              ? t('adminUsers.accountsTab.approvingButton')
                              : t('adminUsers.accountsTab.approveButton')}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusyApproval || currentUser?.id === p.id}
                          onClick={() => handleRejectBlockPending(p)}
                          title={t('adminUsers.accountsTab.rejectBlockTooltip')}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.accountsTab.rejectBlockButton')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </AdminAccordion>

          <AdminAccordion
            title={t('adminUsers.accountsTab.accordionBajasTitle')}
            subtitle={t('adminUsers.enrollmentsTab.withdrawalRequestsSubtitle')}
            count={pendingWithdrawalRequests.length}
            isOpen={isAccountsBajasAccordionOpen}
            onToggle={() => setIsAccountsBajasAccordionOpen(prev => !prev)}
            icon={<UserX className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
            tone="rose"
          >
            {pendingWithdrawalRequests.length === 0 ? (
              <div className="rounded-xl border border-rose-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{t('adminUsers.common.emptyWithdrawals')}</span>
              </div>
            ) : (
              <div className="@container rounded-xl border border-rose-500/25 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="hidden @[700px]:grid @[700px]:grid-cols-[minmax(0,1.3fr)_110px_minmax(0,1.1fr)_215px] gap-3 items-center px-3.5 py-2 border-b border-rose-500/15 bg-rose-50/40 dark:bg-rose-950/20 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>{t('common.columns.account')}</span>
                  <span>{t('common.columns.requestedAt')}</span>
                  <span>{t('common.columns.reason')}</span>
                  <span className="text-right">{t('common.columns.action')}</span>
                </div>
                <div className="divide-y divide-rose-500/15">
                {pendingWithdrawalRequests.map(req => {
                  const reqProfile = profiles.find(pr => pr.id === req.userId);
                  const reqContact = getProfileContactInfo({
                    id: req.userId || '',
                    email: req.userEmail || reqProfile?.email || '',
                    studentId: reqProfile?.studentId,
                    teacherId: reqProfile?.teacherId
                  });
                  return (
                  <div
                    key={req.id}
                    className="px-3 py-2.5 md:px-3.5 md:py-3"
                  >
                    {/* Vista móvil */}
                    <div className="flex @[700px]:hidden items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                          <StudentNameButton
                            name={req.userName}
                            phone={reqContact.phone}
                            email={reqContact.email}
                            className="truncate text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="pl-3.5 flex flex-wrap items-center gap-1">
                          <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 shrink-0">
                            {getRoleLabel(req.userRole)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openWithdrawalModerationModal(req)}
                        className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700 transition"
                      >
                        {t('adminUsers.enrollmentsTab.reviewWithdrawalShort')}
                      </button>
                    </div>

                    {/* Vista escritorio */}
                    <div className="hidden @[700px]:grid @[700px]:grid-cols-[minmax(0,1.3fr)_110px_minmax(0,1.1fr)_215px] gap-3 items-center">
                      <div className="min-w-0 space-y-1">
                        <div>
                          <StudentNameButton
                            name={req.userName}
                            phone={reqContact.phone}
                            email={reqContact.email}
                            className="font-bold text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                            {getRoleLabel(req.userRole)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {req.createdAt.split('T')[0]}
                      </div>

                      <div className="min-w-0">
                        {req.reason ? (
                          <p className="text-xs italic text-slate-600 dark:text-slate-300">
                            "{req.reason}"
                          </p>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openWithdrawalModerationModal(req)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs whitespace-nowrap shrink-0"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span>{t('adminUsers.enrollmentsTab.reviewWithdrawalButton')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
                </div>
              </div>
            )}
          </AdminAccordion>

          <AdminAccordion
            title={t('adminUsers.accountsTab.accordionInactivityTitle')}
            subtitle={
              loginInactivityConfig.enabled
                ? t('adminUsers.accountsTab.inactivitySubtitleEnabled', {
                    months: loginInactivityConfig.months,
                    unit:
                      loginInactivityConfig.months === 1
                        ? t('adminConfig.inactivitySettings.monthUnitSingular')
                        : t('adminConfig.inactivitySettings.monthUnitPlural')
                  })
                : t('adminUsers.accountsTab.inactivitySubtitleDisabled')
            }
            count={inactivityProposedAccounts.length}
            isOpen={isAccountsInactivityAccordionOpen}
            onToggle={() => setIsAccountsInactivityAccordionOpen(prev => !prev)}
            icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            tone="amber"
          >
            <div className="space-y-2.5">
              <div className="rounded-xl border border-amber-500/25 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>{t('adminUsers.accountsTab.inactivityScopeNotice')}</span>
              </div>

              {!loginInactivityConfig.enabled ? (
                <div className="rounded-xl border border-amber-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>{t('adminUsers.accountsTab.inactivityDisabledHint')}</span>
                </div>
              ) : inactivityProposedAccounts.length === 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    {t('adminUsers.accountsTab.inactivityEmpty', {
                      months: loginInactivityConfig.months,
                      unit:
                        loginInactivityConfig.months === 1
                          ? t('adminConfig.inactivitySettings.monthUnitSingular')
                          : t('adminConfig.inactivitySettings.monthUnitPlural')
                    })}
                  </span>
                </div>
              ) : (
                <div className="@container rounded-xl border border-amber-500/25 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                  <div className="hidden @[720px]:grid @[720px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_275px] gap-3 items-center px-3.5 py-2 border-b border-amber-500/15 bg-amber-50/40 dark:bg-amber-950/20 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>{t('common.columns.account')}</span>
                    <span>{t('common.columns.inactivity')}</span>
                    <span className="text-right">{t('common.columns.actions')}</span>
                  </div>
                  <div className="divide-y divide-amber-500/15">
                  {inactivityProposedAccounts.map(({ profile: p, evaluation }) => {
                    const isBusyRevoke = Boolean(busyInactivityUserIds[p.id]);
                    const refDateShort = formatDateShort(evaluation.referenceDateIso);
                    const lastLoginText = evaluation.hasRecordedLogin
                      ? t('adminUsers.accountsTab.inactivityLastLoginLabel', {
                          date: refDateShort
                        })
                      : refDateShort
                      ? t('adminUsers.accountsTab.inactivityNoLoginRecorded', {
                          date: refDateShort
                        })
                      : t('adminUsers.accountsTab.inactivityNoReferenceDate');

                    const effectiveIsSocio =
                      p.isSocio !== undefined
                        ? p.isSocio
                        : p.memberType !== 'alumno_no_socio' && p.memberType !== 'monitor_no_socio';
                    const contactInfo = getProfileContactInfo(p);

                    return (
                      <div
                        key={p.id}
                        className="px-3 py-2.5 md:px-3.5 md:py-3 flex flex-col @[720px]:grid @[720px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_275px] @[720px]:items-center gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {p.photoURL ? (
                            <img
                              src={p.photoURL}
                              alt={p.name}
                              className="h-9 w-9 rounded-full object-cover border border-amber-400 shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-bold flex items-center justify-center text-xs shrink-0">
                              {(p.name || p.email || '').charAt(0).toUpperCase() ||
                                t('adminUsers.accountsTab.fallbackInitial')}
                            </div>
                          )}

                          <div className="min-w-0 space-y-1">
                            <div>
                              <StudentNameButton
                                name={p.name || p.email}
                                phone={contactInfo.phone}
                                email={contactInfo.email}
                                className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                {getRoleLabel(p.hasExplicitRole === false ? '' : p.role)}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  effectiveIsSocio
                                    ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                                    : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {effectiveIsSocio
                                  ? t('adminUsers.accountsTab.socioYes')
                                  : t('adminUsers.accountsTab.socioNo')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                              {t('adminUsers.accountsTab.inactivityElapsedBadge', {
                                months: evaluation.monthsElapsed
                              })}
                            </span>
                            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                              {t('adminUsers.accountsTab.inactivityDaysElapsed', {
                                days: evaluation.daysElapsed
                              })}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {lastLoginText}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center @[720px]:justify-end gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isBusyRevoke}
                            onClick={() => openEditProfileModal(p)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>{t('adminUsers.accountsTab.editLinksButton')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusyRevoke}
                            onClick={() => handleRevokeInactiveAppAccess(p)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs disabled:opacity-50"
                          >
                            {isBusyRevoke ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                            <span>{t('adminUsers.accountsTab.inactivityRevokeButton')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          </AdminAccordion>

          <AdminFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('adminUsers.accountsTab.searchPlaceholder')}
            hasActiveFilters={
              Boolean(searchQuery.trim()) ||
              accountStatusFilter !== 'all' ||
              accountRoleFilter !== 'all' ||
              accountSocioFilter !== 'all'
            }
            onClearFilters={() => {
              setSearchQuery('');
              setAccountStatusFilter('all');
              setAccountRoleFilter('all');
              setAccountSocioFilter('all');
            }}
            clearFiltersLabel={t('adminUsers.common.clearFilters')}
            filters={[
              {
                id: 'account-status',
                label: t('adminUsers.accountsTab.statusFilterLabel'),
                value: accountStatusFilter,
                onChange: v =>
                  setAccountStatusFilter(v as 'all' | 'active' | 'inactive' | 'pending'),
                options: [
                  {
                    value: 'all',
                    label: `${t('adminUsers.accountsTab.filterAll')} (${profiles.length})`
                  },
                  {
                    value: 'active',
                    label: `${t('adminUsers.accountsTab.filterActive')} (${activeProfilesCount})`
                  },
                  {
                    value: 'pending',
                    label: `${t('adminUsers.accountsTab.filterPending')} (${pendingProfilesCount})`
                  },
                  {
                    value: 'inactive',
                    label: `${t('adminUsers.accountsTab.filterInactive')} (${inactiveProfilesCount})`
                  }
                ]
              },
              {
                id: 'account-role',
                label: t('adminUsers.accountsTab.roleFilterLabel'),
                value: accountRoleFilter,
                onChange: v => setAccountRoleFilter(v as 'all' | UserRole | 'none'),
                options: [
                  { value: 'all', label: t('adminUsers.accountsTab.roleAllOption') },
                  ...USER_ROLE_VALUES.map(r => ({ value: r, label: getRoleLabel(r) })),
                  { value: 'none', label: t('adminUsers.roles.none') }
                ]
              },
              {
                id: 'account-socio',
                label: t('adminUsers.accountsTab.membershipFilterLabel'),
                value: accountSocioFilter,
                onChange: v => setAccountSocioFilter(v as 'all' | 'socio' | 'non_socio'),
                options: [
                  { value: 'all', label: t('adminUsers.accountsTab.membershipAllOption') },
                  { value: 'socio', label: t('adminUsers.accountsTab.socioYes') },
                  { value: 'non_socio', label: t('adminUsers.accountsTab.socioNo') }
                ]
              }
            ]}
          />

          {/* Banner de cambios en borrador sin confirmar */}
          {Object.keys(draftProfileEdits).length > 0 && (
            <div className="rounded-xl border border-indigo-400/60 bg-indigo-50/90 dark:bg-indigo-950/35 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                <AlertCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>
                  {t('adminUsers.accountsTab.unsavedChangesBanner', {
                    count: Object.keys(draftProfileEdits).length
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isSavingAllDrafts}
                  onClick={() => setDraftProfileEdits({})}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t('adminUsers.accountsTab.discardAllDraftsButton')}</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingAllDrafts}
                  onClick={handleConfirmAllDrafts}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs disabled:opacity-50"
                >
                  {isSavingAllDrafts ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {isSavingAllDrafts
                      ? t('adminUsers.accountsTab.confirmingChangeButton')
                      : t('adminUsers.accountsTab.confirmBatchButton', {
                          count: Object.keys(draftProfileEdits).length
                        })}
                  </span>
                </button>
              </div>
            </div>
          )}

          <AdminListContainer
            totalItems={filteredProfiles.length}
            page={accountsPageSafe}
            pageSize={pageSize}
            onPageChange={p => setTabPage('accounts', p)}
            onPageSizeChange={size => {
              setPageSize(size);
              setTabPage('accounts', 1);
            }}
            emptyMessage={t('adminUsers.accountsTab.empty')}
            hasActiveFilters={
              Boolean(searchQuery.trim()) ||
              accountStatusFilter !== 'all' ||
              accountRoleFilter !== 'all' ||
              accountSocioFilter !== 'all'
            }
            onClearFilters={() => {
              setSearchQuery('');
              setAccountStatusFilter('all');
              setAccountRoleFilter('all');
              setAccountSocioFilter('all');
            }}
            clearFiltersLabel={t('adminUsers.common.clearFilters')}
            showingLabel={formatShowingLabel(filteredProfiles.length, accountsPageSafe)}
            pageOfLabel={formatPageOfLabel(filteredProfiles.length, accountsPageSafe)}
            prevLabel={t('adminUsers.common.prevPage')}
            nextLabel={t('adminUsers.common.nextPage')}
            perPageOptions={perPageOptions}
            rightSummary={t('adminUsers.accountsTab.postgresRoleColumn')}
            tableHeader={
              <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_310px] gap-3 items-center px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{t('common.columns.account')}</span>
                <span>{t('common.columns.linksAndActivity')}</span>
                <span className="text-right">{t('common.columns.roleAndAccess')}</span>
              </div>
            }
          >
            {paginatedProfiles.map(p => {
              if (isPendingApprovalProfile(p)) {
                const isBusyApproval = Boolean(busyApprovalUserIds[p.id]);
                const pendingOverride = pendingApprovalDrafts[p.id];
                const selectedRole: UserRole | '' =
                  pendingOverride?.role !== undefined
                    ? pendingOverride.role
                    : p.hasExplicitRole === false
                    ? ''
                    : p.role || '';
                const selectedIsSocio: boolean =
                  pendingOverride?.isSocio !== undefined
                    ? pendingOverride.isSocio
                    : p.isSocio !== undefined
                    ? p.isSocio
                    : true;
                const pendingContactInfo = getProfileContactInfo(p);

                return (
                  <div
                    key={p.id}
                    className="px-3 md:px-3.5 py-3 flex flex-col @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_310px] @[740px]:items-center gap-3 bg-amber-50/40 dark:bg-amber-950/15"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {p.photoURL ? (
                        <img
                          src={p.photoURL}
                          alt={p.name}
                          className="h-9 w-9 rounded-full object-cover border border-amber-400 shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-bold flex items-center justify-center text-xs shrink-0">
                          {(p.name || p.email || '').charAt(0).toUpperCase() || t('adminUsers.accountsTab.fallbackInitial')}
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <div>
                          <StudentNameButton
                            name={p.name || p.email}
                            phone={pendingContactInfo.phone}
                            email={pendingContactInfo.email}
                            className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                            {t('adminUsers.accountsTab.pendingBadge')}
                          </span>
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                            {t('adminUsers.accountsTab.accessBadgeNo')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusyApproval}
                        onClick={() =>
                          setPendingApprovalDrafts(prev => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] || {}),
                              isSocio: !selectedIsSocio
                            }
                          }))
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                          selectedIsSocio
                            ? 'border-teal-300 dark:border-teal-700 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                            : 'border-amber-300 dark:border-amber-700 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {selectedIsSocio
                          ? t('adminUsers.accountsTab.socioYes')
                          : t('adminUsers.accountsTab.socioNo')}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center @[740px]:justify-end gap-2 shrink-0">

                      <select
                        value={selectedRole}
                        disabled={isBusyApproval}
                        onChange={e =>
                          setPendingApprovalDrafts(prev => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] || {}),
                              role: e.target.value as UserRole
                            }
                          }))
                        }
                        className="min-w-0 max-w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
                      >
                        <option value="">
                          {t('adminUsers.roles.none')} → {getRoleLabel(UserRole.Socio)}
                        </option>
                        {USER_ROLE_VALUES.map(r => (
                          <option key={r} value={r}>
                            {getRoleLabel(r)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={isBusyApproval}
                        onClick={() => openEditProfileModal(p)}
                        title={t('adminUsers.accountsTab.editRoleLinksTooltip')}
                        aria-label={t('adminUsers.accountsTab.editRoleLinksAria', { name: p.name })}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t('adminUsers.accountsTab.editLinksButton')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusyApproval}
                        onClick={() => handleApprovePending(p)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                      >
                        {isBusyApproval ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {isBusyApproval
                            ? t('adminUsers.accountsTab.approvingButton')
                            : t('adminUsers.accountsTab.approveButton')}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusyApproval || currentUser?.id === p.id}
                        onClick={() => handleRejectBlockPending(p)}
                        title={t('adminUsers.accountsTab.rejectBlockTooltip')}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        <span>{t('adminUsers.accountsTab.rejectBlockButton')}</span>
                      </button>
                    </div>
                  </div>
                );
              }

              const isSelf = currentUser?.id === p.id;
                  const isMasterAdmin =
                    (p.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL;
                  const baseDraft = getPersistedProfileDraftBase(p);
                  const activeDraft = draftProfileEdits[p.id];
                  const hasDraft = Boolean(activeDraft);
                  const effectiveDraft = activeDraft ?? baseDraft;
                  const isSavingRow = Boolean(savingDraftUserIds[p.id]) || isSavingAllDrafts;

                  const matrix = getProfileLiveMatrix(
                    p,
                    effectiveDraft.isSocio,
                    effectiveDraft.role,
                    undefined,
                    undefined,
                    effectiveDraft.access
                  );
                  const isProfileActive = effectiveDraft.access;
                  const linkedTeacher = matrix.linkedTeacher;
                  const linkedStudent = matrix.linkedStudent;
                  const isAccessDenied = !isProfileActive;
                  const inactivityEval = inactivityEvaluationByUserId.get(p.id);
                  const contactInfo = getProfileContactInfo(p);

                  const handleToggleSocioDraft = () => {
                    stageProfileDraftField(p, { isSocio: !effectiveDraft.isSocio });
                  };

                  const handleToggleAccessDraft = () => {
                    if (isSelf || isMasterAdmin) return;
                    stageProfileDraftField(p, { access: !effectiveDraft.access });
                  };

                  const handleDiscardRowDraft = () => {
                    setDraftProfileEdits(prev => {
                      const copy = { ...prev };
                      delete copy[p.id];
                      return copy;
                    });
                  };

                  return (
                    <div
                      key={p.id}
                      className={`px-3 md:px-3.5 py-2.5 md:py-3 transition ${
                        hasDraft
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                          : !isProfileActive
                          ? 'opacity-80'
                          : ''
                      }`}
                    >
                      {/* Vista móvil */}
                      <div className="flex flex-col gap-2 @[740px]:hidden">
                        <div className="flex items-center justify-between gap-2">
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
                                {(p.name || p.email || '').charAt(0).toUpperCase() || t('adminUsers.accountsTab.fallbackInitial')}
                              </div>
                            )}
                            <StudentNameButton
                              name={p.name || p.email}
                              phone={contactInfo.phone}
                              email={contactInfo.email}
                              className="truncate text-xs font-bold text-slate-900 dark:text-white"
                            />
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
                            {!isSelf && !isMasterAdmin && (
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={handleToggleAccessDraft}
                                title={t('adminUsers.accountsTab.toggleAccessTooltip')}
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

                        <div className="pl-9 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {hasDraft && (
                            <span className="shrink-0 rounded bg-indigo-600/15 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
                              {t('adminUsers.accountsTab.unsavedRowBadge')}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={isSavingRow}
                            onClick={handleToggleSocioDraft}
                            title={t('adminUsers.accountsTab.toggleSocioTooltip')}
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition ${
                              effectiveDraft.isSocio
                                ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            } ${
                              activeDraft && activeDraft.isSocio !== baseDraft.isSocio
                                ? 'ring-2 ring-indigo-500'
                                : ''
                            }`}
                          >
                            {effectiveDraft.isSocio
                              ? t('adminUsers.accountsTab.socioYes')
                              : t('adminUsers.accountsTab.socioNo')}
                          </button>
                          <button
                            type="button"
                            disabled={isSavingRow || isSelf || isMasterAdmin}
                            onClick={handleToggleAccessDraft}
                            title={t('adminUsers.accountsTab.toggleAccessTooltip')}
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition ${
                              isAccessDenied
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            } ${
                              activeDraft && activeDraft.access !== baseDraft.access
                                ? 'ring-2 ring-indigo-500'
                                : ''
                            } disabled:cursor-default`}
                          >
                            {isAccessDenied
                              ? t('adminUsers.accountsTab.accessBadgeNo')
                              : t('adminUsers.accountsTab.accessBadgeYes')}
                          </button>
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 font-semibold text-slate-700 dark:text-slate-300">
                            {t('adminUsers.accountsTab.operationalRoleBadge', {
                              role: getOperationalRoleLabel(matrix.operationalRole)
                            })}
                          </span>
                          {inactivityEval && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.2 font-bold text-amber-800 dark:text-amber-300">
                              {t('adminUsers.accountsTab.inactivityElapsedBadge', {
                                months: inactivityEval.monthsElapsed
                              })}
                            </span>
                          )}
                          {p.memberNumber && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 font-mono font-semibold text-slate-600 dark:text-slate-300">
                              {t('adminUsers.studentsTab.memberNumber', { number: p.memberNumber })}
                            </span>
                          )}
                          {isSelf && (
                            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 font-bold text-emerald-700 dark:text-emerald-300">
                              {t('adminUsers.accountsTab.yourUserBadge')}
                            </span>
                          )}
                          {p.lastLogin && (
                            <span className="font-mono">
                              {t('adminUsers.accountsTab.lastLoginInline', {
                                date: formatDateShort(p.lastLogin)
                              }).replace(/^\s*·\s*/, '')}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pl-9">
                          <select
                            value={effectiveDraft.role}
                            disabled={isSavingRow || isMasterAdmin}
                            title={t('adminUsers.accountsTab.draftRoleTooltip')}
                            onChange={e =>
                              stageProfileDraftField(p, {
                                role: e.target.value as UserRole
                              })
                            }
                            className={`rounded-lg border px-2 py-1 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 ${
                              activeDraft && activeDraft.role !== baseDraft.role
                                ? 'border-indigo-500 ring-1 ring-indigo-500'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {!effectiveDraft.role && (
                              <option value="" disabled>
                                {t('adminUsers.roles.none')}
                              </option>
                            )}
                            {USER_ROLE_VALUES.map(r => (
                              <option key={r} value={r}>
                                {getRoleLabel(r)}
                              </option>
                            ))}
                          </select>

                          {hasDraft && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={handleDiscardRowDraft}
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                              >
                                {t('adminUsers.accountsTab.discardDraftButton')}
                              </button>
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={() => handleConfirmSingleDraft(p)}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {isSavingRow ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                <span>
                                  {isSavingRow
                                    ? t('adminUsers.accountsTab.confirmingChangeButton')
                                    : t('adminUsers.accountsTab.confirmChangeButton')}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vista escritorio */}
                      <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_310px] gap-3 items-center">
                        <div className="flex items-center gap-3 min-w-0">
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
                              {(p.name || p.email || '').charAt(0).toUpperCase() || t('adminUsers.accountsTab.fallbackInitial')}
                            </div>
                          )}
                          <div className="min-w-0 space-y-1">
                            <div>
                              <StudentNameButton
                                name={p.name || p.email}
                                phone={contactInfo.phone}
                                email={contactInfo.email}
                                className="font-bold text-sm text-slate-900 dark:text-white truncate"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {hasDraft && (
                                <span className="rounded-full bg-indigo-600/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                                  {t('adminUsers.accountsTab.unsavedRowBadge')}
                                </span>
                              )}
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={handleToggleSocioDraft}
                                title={t('adminUsers.accountsTab.toggleSocioTooltip')}
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${
                                  effectiveDraft.isSocio
                                    ? 'border-teal-300 dark:border-teal-700 bg-teal-500/15 text-teal-700 dark:text-teal-300 hover:bg-teal-500/25'
                                    : 'border-amber-300 dark:border-amber-700 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                                } ${
                                  activeDraft && activeDraft.isSocio !== baseDraft.isSocio
                                    ? 'ring-2 ring-indigo-500'
                                    : ''
                                }`}
                              >
                                {effectiveDraft.isSocio
                                  ? t('adminUsers.accountsTab.socioYes')
                                  : t('adminUsers.accountsTab.socioNo')}
                              </button>
                              <button
                                type="button"
                                disabled={isSavingRow || isSelf || isMasterAdmin}
                                onClick={handleToggleAccessDraft}
                                title={t('adminUsers.accountsTab.toggleAccessTooltip')}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                                  isAccessDenied
                                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25'
                                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                                } ${
                                  activeDraft && activeDraft.access !== baseDraft.access
                                    ? 'ring-2 ring-indigo-500'
                                    : ''
                                } disabled:cursor-default`}
                              >
                                {isAccessDenied
                                  ? t('adminUsers.accountsTab.accessDeniedBadge')
                                  : t('adminUsers.accountsTab.accessGrantedBadge', {
                                      access: getRoleLabel(effectiveDraft.role)
                                    })}
                              </button>
                              {isSelf && (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                  {t('adminUsers.accountsTab.yourUserBadge')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                              {t('adminUsers.accountsTab.operationalRoleBadge', {
                                role: getOperationalRoleLabel(matrix.operationalRole)
                              })}
                            </span>
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
                            {inactivityEval && (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                {t('adminUsers.accountsTab.inactivityElapsedBadge', {
                                  months: inactivityEval.monthsElapsed
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
                          {(p.startDate || p.endDate || p.lastLogin) && (
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {[
                                p.startDate ? t('adminUsers.accountsTab.startDateInline', { date: p.startDate }).replace(/^\s*·\s*/, '') : '',
                                p.endDate ? t('adminUsers.accountsTab.endDateInline', { date: p.endDate }).replace(/^\s*·\s*/, '') : '',
                                p.lastLogin
                                  ? t('adminUsers.accountsTab.lastLoginInline', {
                                      date: formatDateShort(p.lastLogin)
                                    }).replace(/^\s*·\s*/, '')
                                  : ''
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          <select
                            value={effectiveDraft.role}
                            disabled={isSavingRow || isMasterAdmin}
                            title={t('adminUsers.accountsTab.draftRoleTooltip')}
                            onChange={e =>
                              stageProfileDraftField(p, {
                                role: e.target.value as UserRole
                              })
                            }
                            className={`min-w-0 max-w-full rounded-xl border bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 ${
                              activeDraft && activeDraft.role !== baseDraft.role
                                ? 'border-indigo-500 ring-1 ring-indigo-500'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {!effectiveDraft.role && (
                              <option value="" disabled>
                                {t('adminUsers.roles.none')}
                              </option>
                            )}
                            {USER_ROLE_VALUES.map(r => (
                              <option key={r} value={r}>
                                {getRoleLabel(r)}
                              </option>
                            ))}
                          </select>

                          {hasDraft && (
                            <>
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={handleDiscardRowDraft}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>{t('adminUsers.accountsTab.discardDraftButton')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={() => handleConfirmSingleDraft(p)}
                                className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs whitespace-nowrap disabled:opacity-50"
                              >
                                {isSavingRow ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                <span>
                                  {isSavingRow
                                    ? t('adminUsers.accountsTab.confirmingChangeButton')
                                    : t('adminUsers.accountsTab.confirmChangeButton')}
                                </span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => openEditProfileModal(p)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>{t('adminUsers.accountsTab.editLinksButton')}</span>
                          </button>

                          {!isSelf && !isMasterAdmin && (
                            <button
                              type="button"
                              disabled={isSavingRow}
                              onClick={handleToggleAccessDraft}
                              title={t('adminUsers.accountsTab.toggleAccessTooltip')}
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
          </AdminListContainer>
        </div>
      )}
      </div>

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
                    disabled={(editingProfile.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL}
                    onChange={e => setEditProfileRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-900 dark:text-white disabled:opacity-60"
                  >
                    {USER_ROLE_VALUES.map(r => (
                      <option key={r} value={r}>
                        {getRoleLabel(r)}
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
                    disabled={
                      currentUser?.id === editingProfile.id ||
                      (editingProfile.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL
                    }
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

      {/* Modal de Revisión de Baja de la Asociación (checklist de material y pagos al corriente) */}
      {withdrawalTarget && (() => {
        const emailNorm = withdrawalTarget.userEmail.toLowerCase().trim();
        const linkedProfile = profiles.find(
          p =>
            (withdrawalTarget.profileId && p.id === withdrawalTarget.profileId) ||
            (withdrawalTarget.userId && p.id === withdrawalTarget.userId) ||
            (emailNorm && p.email.toLowerCase().trim() === emailNorm)
        );
        const linkedStudent = students.find(
          s =>
            (withdrawalTarget.studentId && s.id === withdrawalTarget.studentId) ||
            (linkedProfile?.studentId && s.id === linkedProfile.studentId) ||
            (linkedProfile && s.profileId === linkedProfile.id) ||
            (emailNorm && s.email.toLowerCase().trim() === emailNorm)
        );
        const linkedTeacher = teachers.find(
          tc =>
            (withdrawalTarget.teacherId && tc.id === withdrawalTarget.teacherId) ||
            (linkedProfile?.teacherId && tc.id === linkedProfile.teacherId) ||
            (emailNorm && tc.email.toLowerCase().trim() === emailNorm)
        );

        const unpaidPayments = payments.filter(
          p =>
            linkedStudent &&
            p.studentId === linkedStudent.id &&
            (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
        );
        const unpaidTotal = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
        const activeWorkshopsCount = (linkedStudent?.activities || []).filter(
          e => e.active !== false && e.status !== 'inactive'
        ).length;
        const canApprove =
          withdrawalDebtsChecked && withdrawalMaterialsChecked && !isModeratingWithdrawal;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <UserX className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t('adminUsers.withdrawalModal.title')}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('adminUsers.withdrawalModal.subtitle')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isModeratingWithdrawal}
                  onClick={() => setWithdrawalTarget(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('adminUsers.withdrawalModal.memberLabel')}</span>
                  <strong className="text-slate-900 dark:text-white">{withdrawalTarget.userName}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('adminUsers.withdrawalModal.emailLabel')}</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {withdrawalTarget.userEmail}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('adminUsers.withdrawalModal.roleLabel')}</span>
                  <strong className="text-slate-900 dark:text-white">
                    {getRoleLabel(withdrawalTarget.userRole)}
                  </strong>
                </div>
                {(activeWorkshopsCount > 0 || linkedTeacher) && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">
                      {t('adminUsers.withdrawalModal.linkedEntitiesLabel')}
                    </span>
                    <span className="text-right font-semibold text-slate-700 dark:text-slate-200">
                      {[
                        activeWorkshopsCount > 0
                          ? t('adminUsers.withdrawalModal.activeWorkshopsCount', {
                              count: activeWorkshopsCount
                            })
                          : null,
                        linkedTeacher ? t('adminUsers.withdrawalModal.teacherRecord') : null
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-slate-400">
                  {t('adminUsers.withdrawalModal.requestedAtLabel', {
                    date: withdrawalTarget.createdAt.split('T')[0]
                  })}
                </p>
                {withdrawalTarget.reason && (
                  <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      {t('adminUsers.withdrawalModal.reasonLabel')}
                    </span>
                    <p className="italic text-slate-700 dark:text-slate-200">
                      "{withdrawalTarget.reason}"
                    </p>
                  </div>
                )}
              </div>

              <div
                className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                  unpaidPayments.length > 0
                    ? 'border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                    : 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider opacity-80">
                  {t('adminUsers.withdrawalModal.debtsSectionTitle')}
                </span>
                <p className="font-bold">
                  {unpaidPayments.length > 0
                    ? t('adminUsers.withdrawalModal.debtsAlert', {
                        count: unpaidPayments.length,
                        amount: unpaidTotal.toFixed(2)
                      })
                    : t('adminUsers.withdrawalModal.debtsClear')}
                </p>
                {unpaidPayments.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] font-mono">
                    {unpaidPayments.map(p => (
                      <li key={p.id}>
                        {t('adminUsers.withdrawalModal.debtLine', {
                          period: p.periodMonth,
                          receipt: p.receiptNumber,
                          amount: p.amount.toFixed(2),
                          status: p.status
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={withdrawalMaterialsChecked}
                    onChange={e => setWithdrawalMaterialsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t('adminUsers.withdrawalModal.checkMaterials')}</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={withdrawalDebtsChecked}
                    onChange={e => setWithdrawalDebtsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t('adminUsers.withdrawalModal.checkDebts')}</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('adminUsers.withdrawalModal.notesLabel')}
                </label>
                <input
                  type="text"
                  value={withdrawalNotes}
                  onChange={e => setWithdrawalNotes(e.target.value)}
                  placeholder={t('adminUsers.withdrawalModal.notesPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-rose-500"
                />
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('adminUsers.withdrawalModal.autoCancellationHint')}
              </p>

              {withdrawalError && (
                <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{withdrawalError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isModeratingWithdrawal}
                  onClick={() => setWithdrawalTarget(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {t('adminUsers.withdrawalModal.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isModeratingWithdrawal}
                  onClick={async () => {
                    setIsModeratingWithdrawal(true);
                    setWithdrawalError(null);
                    try {
                      const res = await rejectAssociationWithdrawal(
                        withdrawalTarget.id,
                        withdrawalNotes.trim() || undefined
                      );
                      if (res.success) {
                        setActionFeedback({
                          type: 'success',
                          message: t('adminUsers.withdrawalModal.rejectedFeedback', {
                            name: withdrawalTarget.userName
                          })
                        });
                        setWithdrawalTarget(null);
                      } else {
                        setWithdrawalError(
                          res.error || t('adminUsers.withdrawalModal.rejectError')
                        );
                      }
                    } finally {
                      setIsModeratingWithdrawal(false);
                    }
                  }}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {t('adminUsers.withdrawalModal.rejectButton')}
                </button>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={async () => {
                    setIsModeratingWithdrawal(true);
                    setWithdrawalError(null);
                    try {
                      const res = await approveAssociationWithdrawal(withdrawalTarget.id, {
                        debtsChecked: withdrawalDebtsChecked,
                        materialsChecked: withdrawalMaterialsChecked,
                        notes: withdrawalNotes.trim() || undefined
                      });
                      if (res.success) {
                        setActionFeedback({
                          type: 'success',
                          message: t('adminUsers.withdrawalModal.approvedFeedback', {
                            name: withdrawalTarget.userName
                          })
                        });
                        setWithdrawalTarget(null);
                      } else {
                        setWithdrawalError(
                          res.error || t('adminUsers.withdrawalModal.approveError')
                        );
                      }
                    } finally {
                      setIsModeratingWithdrawal(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isModeratingWithdrawal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {isModeratingWithdrawal
                      ? t('adminUsers.withdrawalModal.processing')
                      : t('adminUsers.withdrawalModal.approveButton')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Inscripciones en Talleres del Profesor (sin ficha personal del alumno) */}
      {enrollModalTarget && (() => {
        const modalStudent = students.find(s => s.id === enrollModalTarget.studentId);
        if (!modalStudent) return null;

        type ModalEnrItem = {
          kind: 'active' | 'pending' | 'inactive';
          activityId: string;
          activityName: string;
          teacherId: string;
          teacherName: string;
          originalBillingMode: 'monthly' | 'per_class';
          originalCustomPrice: number | undefined;
          originalEnrolledSince: string;
          endedAt?: string;
        };

        const rawItems: ModalEnrItem[] = [];
        const pushList = (
          list: Student['activities'] | undefined,
          defaultKind: 'active' | 'pending' | 'inactive'
        ) => {
          for (const enr of list || []) {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act) continue;
            const tc = teachers.find(item => item.id === act.teacherId);
            const resolvedKind: 'active' | 'pending' | 'inactive' =
              defaultKind === 'active' && (enr.status === 'inactive' || enr.active === false)
                ? 'inactive'
                : defaultKind;
            rawItems.push({
              kind: resolvedKind,
              activityId: act.id,
              activityName: act.name,
              teacherId: act.teacherId,
              teacherName: tc?.name || t('adminUsers.unassigned'),
              originalBillingMode: enr.billingMode || act.billingMode,
              originalCustomPrice: enr.customPrice,
              originalEnrolledSince: enr.enrolledSince || new Date().toISOString().split('T')[0],
              endedAt: enr.endedAt || enr.deletedAt?.split('T')[0]
            });
          }
        };

        pushList(modalStudent.activities, 'active');
        pushList(modalStudent.pendingEnrollments, 'pending');
        pushList(modalStudent.inactiveEnrollments, 'inactive');

        const countByTeacher = new Map<string, number>();
        for (const item of rawItems) {
          countByTeacher.set(item.teacherId, (countByTeacher.get(item.teacherId) || 0) + 1);
        }

        const visibleItems = rawItems.filter(
          item => enrollModalTeacherId === 'all' || item.teacherId === enrollModalTeacherId
        );

        const activeActivityIdsSet = new Set(
          (modalStudent.activities || [])
            .filter(a => a.active !== false && a.status !== 'inactive')
            .map(a => a.activityId)
        );
        const addableActivities = activities.filter(
          a =>
            (!quickEnrollTeacherId || a.teacherId === quickEnrollTeacherId) &&
            !activeActivityIdsSet.has(a.id)
        );

        const selectableActivitiesForEdit =
          enrollModalTeacherId !== 'all'
            ? activities.filter(a => a.teacherId === enrollModalTeacherId)
            : activities;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-4">
              {/* Cabecera (identidad solo lectura + ámbito talleres) */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {t('adminUsers.enrollmentsModal.title')}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {modalStudent.name}
                    </span>
                    {modalStudent.memberNumber && (
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        {t('adminUsers.studentsTab.memberNumber', {
                          number: modalStudent.memberNumber
                        })}
                      </span>
                    )}
                    {getStudentStatusBadge(modalStudent.status)}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('adminUsers.enrollmentsModal.scopeHint')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnrollModalTarget(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Selector de profesor */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-2.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {t('adminUsers.enrollmentsModal.teacherFilterLabel')}
                </label>
                <select
                  value={enrollModalTeacherId}
                  onChange={e => {
                    const nextTeacherId = e.target.value;
                    setEnrollModalTeacherId(nextTeacherId);
                    if (nextTeacherId !== 'all') {
                      setQuickEnrollTeacherId(nextTeacherId);
                    }
                  }}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 sm:min-w-[240px]"
                >
                  <option value="all">
                    {t('adminUsers.enrollmentsModal.allTeachersWithCount', {
                      count: rawItems.length
                    })}
                  </option>
                  {teachers.map(tc => (
                    <option key={tc.id} value={tc.id}>
                      {t('adminUsers.enrollmentsModal.teacherOptionWithCount', {
                        name: tc.name,
                        count: countByTeacher.get(tc.id) || 0
                      })}
                    </option>
                  ))}
                </select>
              </div>

              {enrollModalError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{enrollModalError}</span>
                </div>
              )}

              {/* Lista de inscripciones del alumno en talleres del profesor */}
              {visibleItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('adminUsers.enrollmentsModal.emptyForTeacher')}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleItems.map(item => {
                    const draft: EnrollmentDraftItem = enrollmentDrafts[item.activityId] || {
                      activityId: item.activityId,
                      customPrice:
                        item.originalCustomPrice !== undefined && item.originalCustomPrice !== null
                          ? String(item.originalCustomPrice)
                          : '',
                      billingMode: item.originalBillingMode,
                      enrolledSince: item.originalEnrolledSince
                    };
                    const targetAct = activities.find(a => a.id === draft.activityId);
                    const targetDefaultPrice = targetAct
                      ? draft.billingMode === 'per_class'
                        ? targetAct.defaultPricePerClass
                        : targetAct.defaultPriceMonthly
                      : 0;
                    const originalPriceStr =
                      item.originalCustomPrice !== undefined && item.originalCustomPrice !== null
                        ? String(item.originalCustomPrice)
                        : '';
                    const isDirty =
                      draft.activityId !== item.activityId ||
                      draft.billingMode !== item.originalBillingMode ||
                      draft.customPrice.trim() !== originalPriceStr ||
                      draft.enrolledSince !== item.originalEnrolledSince;
                    const isSavingRow = savingEnrollmentActivityId === item.activityId;

                    const updateDraft = (patch: Partial<EnrollmentDraftItem>) => {
                      setEnrollmentDrafts(prev => ({
                        ...prev,
                        [item.activityId]: { ...draft, ...patch }
                      }));
                    };

                    const handleSaveRow = async () => {
                      setEnrollModalError(null);
                      const trimmedPrice = draft.customPrice.trim();
                      let parsedPrice: number | null = null;
                      if (trimmedPrice !== '') {
                        const num = Number(trimmedPrice.replace(',', '.'));
                        if (!Number.isFinite(num) || num < 0) {
                          setEnrollModalError(t('adminUsers.enrollmentsModal.invalidPriceError'));
                          return;
                        }
                        parsedPrice = num;
                      }
                      setSavingEnrollmentActivityId(item.activityId);
                      try {
                        const res = await updateStudentEnrollment({
                          studentId: modalStudent.id,
                          activityId: item.activityId,
                          newActivityId: draft.activityId,
                          customPrice: parsedPrice,
                          billingMode: draft.billingMode,
                          enrolledSince: draft.enrolledSince
                        });
                        if (res.success) {
                          const targetActName =
                            activities.find(a => a.id === draft.activityId)?.name ||
                            item.activityName;
                          setEnrollmentDrafts(prev => {
                            const copy = { ...prev };
                            if (draft.activityId !== item.activityId) {
                              delete copy[item.activityId];
                            }
                            copy[draft.activityId] = {
                              activityId: draft.activityId,
                              customPrice: parsedPrice !== null ? String(parsedPrice) : '',
                              billingMode: draft.billingMode,
                              enrolledSince: draft.enrolledSince
                            };
                            return copy;
                          });
                          setActionFeedback({
                            type: 'success',
                            message: t('adminUsers.enrollmentsModal.saveSuccess', {
                              student: modalStudent.name,
                              activity: targetActName
                            })
                          });
                        } else {
                          setEnrollModalError(
                            res.error || t('adminUsers.enrollmentsModal.saveError')
                          );
                        }
                      } finally {
                        setSavingEnrollmentActivityId(null);
                      }
                    };

                    const workshopOptions = selectableActivitiesForEdit.some(
                      a => a.id === item.activityId
                    )
                      ? selectableActivitiesForEdit
                      : [
                          ...selectableActivitiesForEdit,
                          ...activities.filter(a => a.id === item.activityId)
                        ];

                    return (
                      <div
                        key={`${item.kind}-${item.activityId}`}
                        className={`rounded-xl border p-3.5 space-y-3 ${
                          item.kind === 'inactive'
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30'
                            : item.kind === 'pending'
                            ? 'border-indigo-300/60 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {item.activityName}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t('adminUsers.enrollmentsTab.teacherLabel')}{' '}
                              <strong className="text-slate-700 dark:text-slate-200">
                                {item.teacherName}
                              </strong>
                            </span>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.kind === 'active'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : item.kind === 'pending'
                                ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {item.kind === 'active'
                              ? t('adminUsers.enrollmentsModal.statusActive')
                              : item.kind === 'pending'
                              ? t('adminUsers.enrollmentsModal.statusPending')
                              : t('adminUsers.enrollmentsModal.statusInactive')}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              {t('adminUsers.enrollmentsModal.workshopLabel')}
                            </label>
                            <select
                              value={draft.activityId}
                              onChange={e => {
                                const nextActId = e.target.value;
                                const nextAct = activities.find(a => a.id === nextActId);
                                updateDraft({
                                  activityId: nextActId,
                                  billingMode: nextAct?.billingMode || draft.billingMode
                                });
                              }}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                            >
                              {workshopOptions.map(actOpt => {
                                const tcOpt = teachers.find(tc => tc.id === actOpt.teacherId);
                                return (
                                  <option key={actOpt.id} value={actOpt.id}>
                                    {enrollModalTeacherId === 'all' && tcOpt
                                      ? `${actOpt.name} (${tcOpt.name})`
                                      : actOpt.name}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              {t('adminUsers.enrollmentsModal.billingModeLabel')}
                            </label>
                            <select
                              value={draft.billingMode}
                              onChange={e =>
                                updateDraft({
                                  billingMode: e.target.value as 'monthly' | 'per_class'
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                            >
                              <option value="monthly">
                                {t('adminUsers.enrollmentsTab.billingMonthly')}
                              </option>
                              <option value="per_class">
                                {t('adminUsers.enrollmentsTab.billingPerClass')}
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              {t('adminUsers.enrollmentsModal.customPriceLabel')}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={draft.customPrice}
                              onChange={e => updateDraft({ customPrice: e.target.value })}
                              placeholder={t('adminUsers.enrollmentsModal.defaultPricePlaceholder', {
                                price: targetDefaultPrice
                              })}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              {t('adminUsers.enrollmentsModal.enrolledSinceLabel')}
                            </label>
                            <div className="relative">
                              <input
                                type="date"
                                value={draft.enrolledSince}
                                onChange={e => updateDraft({ enrolledSince: e.target.value })}
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {item.kind === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={async () => {
                                  setSavingEnrollmentActivityId(item.activityId);
                                  setEnrollModalError(null);
                                  try {
                                    const res = await rejectActivityEnrollment(
                                      modalStudent.id,
                                      item.activityId
                                    );
                                    if (!res.success) {
                                      setEnrollModalError(
                                        res.error || t('adminUsers.enrollmentsTab.requestRejectError')
                                      );
                                    } else {
                                      setActionFeedback({
                                        type: 'success',
                                        message: t(
                                          'adminUsers.enrollmentsTab.requestRejectedFeedback',
                                          {
                                            student: modalStudent.name,
                                            activity: item.activityName
                                          }
                                        )
                                      });
                                    }
                                  } finally {
                                    setSavingEnrollmentActivityId(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-800 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                                <span>{t('adminUsers.enrollmentsTab.reject')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSavingRow}
                                onClick={async () => {
                                  setSavingEnrollmentActivityId(item.activityId);
                                  setEnrollModalError(null);
                                  try {
                                    const res = await confirmActivityEnrollment(
                                      modalStudent.id,
                                      item.activityId
                                    );
                                    if (!res.success) {
                                      setEnrollModalError(
                                        res.error || t('adminUsers.enrollmentsTab.requestConfirmError')
                                      );
                                    } else {
                                      setActionFeedback({
                                        type: 'success',
                                        message: t(
                                          'adminUsers.enrollmentsTab.requestConfirmedFeedback',
                                          {
                                            student: modalStudent.name,
                                            activity: item.activityName
                                          }
                                        )
                                      });
                                    }
                                  } finally {
                                    setSavingEnrollmentActivityId(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                              >
                                <Check className="h-3 w-3" />
                                <span>{t('adminUsers.enrollmentsTab.confirmSpot')}</span>
                              </button>
                            </>
                          )}

                          {item.kind === 'inactive' ? (
                            <button
                              type="button"
                              disabled={isSavingRow}
                              onClick={handleSaveRow}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              {isSavingRow ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              <span>
                                {isDirty
                                  ? t('adminUsers.enrollmentsModal.saveAndReactivateButton')
                                  : t('adminUsers.enrollmentsTab.reactivateButton')}
                              </span>
                            </button>
                          ) : (
                            <>
                              {item.kind === 'active' && (
                                <button
                                  type="button"
                                  disabled={isSavingRow}
                                  onClick={() =>
                                    setConfirmAction({
                                      title: t('adminUsers.enrollmentsTab.removeEnrollmentTitle'),
                                      description: t(
                                        'adminUsers.enrollmentsTab.removeEnrollmentDescription',
                                        {
                                          student: modalStudent.name,
                                          activity: item.activityName
                                        }
                                      ),
                                      confirmLabel: t(
                                        'adminUsers.enrollmentsTab.removeEnrollmentConfirm'
                                      ),
                                      tone: 'danger',
                                      onConfirm: async () => {
                                        const res = await unenrollStudentFromActivity(
                                          modalStudent.id,
                                          item.activityId
                                        );
                                        if (res.success) {
                                          setActionFeedback({
                                            type: 'success',
                                            message: t(
                                              'adminUsers.enrollmentsTab.removeEnrollmentSuccess',
                                              {
                                                student: modalStudent.name,
                                                activity: item.activityName
                                              }
                                            )
                                          });
                                        } else {
                                          setEnrollModalError(
                                            res.error ||
                                              t('adminUsers.enrollmentsTab.removeEnrollmentError')
                                          );
                                        }
                                      }
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>{t('adminUsers.enrollmentsTab.removeFromWorkshopButton')}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isSavingRow || !isDirty}
                                onClick={handleSaveRow}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isSavingRow ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                <span>
                                  {isSavingRow
                                    ? t('adminUsers.enrollmentsModal.savingButton')
                                    : t('adminUsers.enrollmentsModal.saveButton')}
                                </span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Añadir nueva inscripción en taller de profesor */}
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/15 p-3.5 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('adminUsers.enrollmentsModal.addSectionTitle')}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {t('adminUsers.enrollmentsModal.selectTeacherLabel')}
                    </label>
                    <select
                      value={quickEnrollTeacherId}
                      onChange={e => setQuickEnrollTeacherId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                    >
                      <option value="">{t('adminUsers.enrollmentsTab.allTeachersOption')}</option>
                      {teachers.map(tc => (
                        <option key={tc.id} value={tc.id}>
                          {tc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {t('adminUsers.enrollmentsModal.selectWorkshopLabel')}
                    </label>
                    <select
                      value={quickEnrollActivityId}
                      onChange={e => setQuickEnrollActivityId(e.target.value)}
                      disabled={addableActivities.length === 0}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 disabled:opacity-50"
                    >
                      {addableActivities.length === 0 ? (
                        <option value="">
                          {t('adminUsers.enrollmentsModal.noAvailableWorkshops')}
                        </option>
                      ) : (
                        addableActivities.map(actOpt => {
                          const tcOpt = teachers.find(tc => tc.id === actOpt.teacherId);
                          return (
                            <option key={actOpt.id} value={actOpt.id}>
                              {!quickEnrollTeacherId && tcOpt
                                ? `${actOpt.name} (${tcOpt.name})`
                                : actOpt.name}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {t('adminUsers.enrollmentsModal.customPriceLabel')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={quickEnrollPrice}
                      onChange={e => setQuickEnrollPrice(e.target.value)}
                      placeholder={(() => {
                        const selAct = activities.find(a => a.id === quickEnrollActivityId);
                        const def = selAct
                          ? selAct.billingMode === 'per_class'
                            ? selAct.defaultPricePerClass
                            : selAct.defaultPriceMonthly
                          : 0;
                        return t('adminUsers.enrollmentsModal.defaultPricePlaceholder', {
                          price: def
                        });
                      })()}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!quickEnrollActivityId || quickEnrollBusy}
                    onClick={async () => {
                      if (!quickEnrollActivityId) return;
                      setEnrollModalError(null);
                      let parsedPrice: number | undefined = undefined;
                      if (quickEnrollPrice.trim() !== '') {
                        const num = Number(quickEnrollPrice.trim().replace(',', '.'));
                        if (!Number.isFinite(num) || num < 0) {
                          setEnrollModalError(t('adminUsers.enrollmentsModal.invalidPriceError'));
                          return;
                        }
                        parsedPrice = num;
                      }
                      setQuickEnrollBusy(true);
                      try {
                        const res = await enrollStudentInActivity(
                          modalStudent.id,
                          quickEnrollActivityId,
                          parsedPrice
                        );
                        if (res.success) {
                          const actName =
                            activities.find(a => a.id === quickEnrollActivityId)?.name || '';
                          setQuickEnrollPrice('');
                          setActionFeedback({
                            type: 'success',
                            message: t('adminUsers.enrollmentsModal.addEnrollSuccess', {
                              student: modalStudent.name,
                              activity: actName
                            })
                          });
                        } else {
                          setEnrollModalError(
                            res.error || t('adminUsers.enrollmentsModal.addEnrollError')
                          );
                        }
                      } finally {
                        setQuickEnrollBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {quickEnrollBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {quickEnrollBusy
                        ? t('adminUsers.enrollmentsModal.addingEnrollButton')
                        : t('adminUsers.enrollmentsModal.addEnrollButton')}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setEnrollModalTarget(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  {t('adminUsers.enrollmentsModal.closeButton')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
