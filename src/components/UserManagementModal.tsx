import React, { useState } from 'react';
import { useApp, deriveOperationalRole } from '../context/AppContext';
import { calculateUserAuthState, USER_ROLE_VALUES } from '../lib/authRole';
import { UserRole, AuthUser, OperationalRole } from '../types';
import { createTranslator } from '../lib/i18n';
import {
  X,
  Check,
  UserPlus,
  ShieldCheck,
  Search,
  Key,
  Copy,
  Power,
  Mail,
  UserCheck,
  Building,
  GraduationCap,
  Sparkles,
  AlertCircle,
  Clock,
  UserX
} from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const {
    profiles,
    createUserByAdmin,
    updateUserRole,
    toggleUserSocioMembership,
    toggleUserAccessStatus,
    teachers,
    students,
    activities,
    validatePendingStudent,
    currentUser,
    language
  } = useApp();
  const t = createTranslator(language);

  const pendingValidationStudents = students.filter(
    s => s.status === 'pending_validation' || s.validationStatus === 'pending'
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Formulario de Alta
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.Alumno);
  const [password, setPassword] = useState('Triskell2026!');
  const [isSocio, setIsSocio] = useState(true);
  const [access, setAccess] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [createTeacherRecord, setCreateTeacherRecord] = useState(true);
  const [createStudentRecord, setCreateStudentRecord] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busySocioId, setBusySocioId] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    pass: string;
    role: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmToggleUser, setConfirmToggleUser] = useState<AuthUser | null>(null);

  if (!isOpen) return null;

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

  const getProfileLiveStatus = (p: AuthUser) => {
    const emailNorm = (p.email || '').toLowerCase().trim();
    const linkedStudent = students.find(
      s =>
        (p.studentId && s.id === p.studentId) ||
        s.profileId === p.id ||
        (emailNorm && s.email.toLowerCase().trim() === emailNorm)
    );
    const linkedTeacher = teachers.find(
      tc =>
        (p.teacherId && tc.id === p.teacherId) ||
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
    const profileIsSocio =
      p.isSocio !== undefined
        ? p.isSocio
        : p.memberType !== 'alumno_no_socio' && p.memberType !== 'monitor_no_socio';
    const manualAccess = p.access !== undefined ? p.access : p.active;
    const calculated = calculateUserAuthState({
      currentRole: p.role,
      email: p.email,
      hasActiveStudentAssignment,
      hasActiveTeacherAssignment,
      isSocio: profileIsSocio,
      manualAccess
    });
    const operationalRole: OperationalRole =
      p.operationalRole ?? deriveOperationalRole(hasActiveStudentAssignment, hasActiveTeacherAssignment);

    return {
      isSocio: calculated.isSocio,
      operationalRole,
      access: calculated.access,
      role: calculated.role,
      isAccessDenied: !calculated.access
    };
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setFeedbackError(t('userManagementModal.errors.missingNameOrEmail'));
      return;
    }

    setIsSubmitting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await createUserByAdmin({
        email: email.trim(),
        fullName: name.trim(),
        role,
        isSocio,
        access,
        password: password.trim() || undefined,
        teacherId: (role === UserRole.Monitor || role === UserRole.Hibrido) ? selectedTeacherId || undefined : undefined,
        studentId: (role === UserRole.Alumno || role === UserRole.Hibrido || role === UserRole.Socio) ? selectedStudentId || undefined : undefined,
        createTeacherProfile: (role === UserRole.Monitor || role === UserRole.Hibrido) && createTeacherRecord && !selectedTeacherId,
        createStudentProfile: (role === UserRole.Alumno || role === UserRole.Hibrido || role === UserRole.Socio) && createStudentRecord && !selectedStudentId
      });

      if (!res.success) {
        setFeedbackError(res.error || t('userManagementModal.errors.createFailed'));
      } else {
        const passUsed = res.tempPassword || password;
        setCreatedCredentials({
          email: email.trim(),
          pass: passUsed,
          role
        });
        setFeedbackSuccess(t('userManagementModal.createSuccess', { name }));
        setName('');
        setEmail('');
        setIsSocio(true);
        setAccess(true);
        setPassword(`Triskell${Math.floor(1000 + Math.random() * 9000)}!`);
        setIsAddingUser(false);
      }
    } catch (err: any) {
      setFeedbackError(err.message || t('userManagementModal.errors.registerFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = t('userManagementModal.credentialsClipboard', {
      origin: window.location.origin,
      email: createdCredentials.email,
      password: createdCredentials.pass,
      role: createdCredentials.role
    });
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredProfiles = profiles.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('userManagementModal.title')}
                </h3>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  {t('userManagementModal.badgeSelfRegisterDisabled')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('userManagementModal.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">

          {/* Banner de credenciales recién creadas para copiar */}
          {createdCredentials && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-1.5">
                  <Check className="h-4 w-4" />
                  {t('userManagementModal.credentialsBannerTitle')}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copied ? t('userManagementModal.copiedButton') : t('userManagementModal.copyButton')}</span>
                </button>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 font-mono text-[11px] border border-emerald-200 dark:border-emerald-800 text-slate-700 dark:text-slate-200 space-y-1">
                <div>{t('userManagementModal.credentialEmail')} <strong>{createdCredentials.email}</strong></div>
                <div>{t('userManagementModal.credentialPassword')} <strong>{createdCredentials.pass}</strong></div>
                <div>{t('userManagementModal.credentialRole')} <strong>{createdCredentials.role}</strong></div>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {t('userManagementModal.credentialsHint')}
              </p>
            </div>
          )}

          {feedbackSuccess && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 p-3 text-emerald-700 dark:text-emerald-300 font-semibold">
              {feedbackSuccess}
            </div>
          )}

          {feedbackError && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 p-3 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{feedbackError}</span>
            </div>
          )}

          {pendingValidationStudents.length > 0 && !isAddingUser && (
            <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/25 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  {t('userManagementModal.pendingValidationsTitle', { count: pendingValidationStudents.length })}
                </span>
              </div>
              <div className="divide-y divide-amber-500/20">
                {pendingValidationStudents.map(st => {
                  const actNames = (st.activities || [])
                    .map(e => activities.find(a => a.id === e.activityId)?.name)
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div
                      key={st.id}
                      className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{st.name}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          {[st.phone, st.email].filter(Boolean).join(' · ') || t('userManagementModal.noContact')}
                          {actNames ? ` · ${actNames}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => validatePendingStudent(st.id, false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 transition"
                        >
                          <UserX className="h-3 w-3" />
                          <span>{t('userManagementModal.rejectButton')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => validatePendingStudent(st.id, true)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                        >
                          <UserCheck className="h-3 w-3" />
                          <span>{t('userManagementModal.confirmMemberButton')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botón "+ Dar de Alta Nuevo Acceso" vs Lista */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={t('userManagementModal.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setIsAddingUser(!isAddingUser);
                setFeedbackError(null);
                setFeedbackSuccess(null);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 font-bold text-white hover:bg-emerald-700 transition shadow-xs shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              <span>{isAddingUser ? t('userManagementModal.viewListButton') : t('userManagementModal.addUserButton')}</span>
            </button>
          </div>

          {/* Formulario de Alta por el Administrador */}
          {isAddingUser ? (
            <form onSubmit={handleCreateSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  {t('userManagementModal.form.title')}
                </h4>
                <span className="text-[10px] text-slate-400">{t('userManagementModal.form.adminControlBadge')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('userManagementModal.form.fullNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('userManagementModal.form.fullNamePlaceholder')}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('userManagementModal.form.emailLabel')}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={t('userManagementModal.form.emailPlaceholder')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('userManagementModal.form.roleLabel')}
                  </label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
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
                    {t('userManagementModal.form.passwordLabel')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(`Triskell${Math.floor(1000 + Math.random() * 9000)}!`)}
                      title={t('userManagementModal.form.generatePasswordTooltip')}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {t('userManagementModal.form.membershipLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:w-64">
                    <button
                      type="button"
                      onClick={() => setIsSocio(true)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        isSocio
                          ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('userManagementModal.form.membershipSocio')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSocio(false)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        !isSocio
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('userManagementModal.form.membershipNonSocio')}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {t('userManagementModal.form.accessLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:w-64">
                    <button
                      type="button"
                      onClick={() => setAccess(true)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        access
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('userManagementModal.form.accessYes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccess(false)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        !access
                          ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t('userManagementModal.form.accessNo')}
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {t('userManagementModal.form.membershipHint')}
                </p>
              </div>

              {/* Vinculación opcional con Monitor o Alumno existente */}
              {(role === UserRole.Monitor || role === UserRole.Hibrido) && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 space-y-2">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 block text-[11px]">
                    {t('userManagementModal.form.teacherRecordTitle')}
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <select
                      value={selectedTeacherId}
                      onChange={e => setSelectedTeacherId(e.target.value)}
                      className="w-full sm:w-auto flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="">{t('userManagementModal.form.linkExistingTeacher')}</option>
                      {teachers.map(teacherItem => (
                        <option key={teacherItem.id} value={teacherItem.id}>
                          {teacherItem.name} ({teacherItem.email})
                        </option>
                      ))}
                    </select>

                    {!selectedTeacherId && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createTeacherRecord}
                          onChange={e => setCreateTeacherRecord(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                        <span>{t('userManagementModal.form.autoCreateTeacher')}</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {(role === UserRole.Alumno || role === UserRole.Hibrido || role === UserRole.Socio) && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block text-[11px]">
                    {role === UserRole.Socio ? t('userManagementModal.form.memberRecordTitle') : t('userManagementModal.form.studentMemberRecordTitle')}
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <select
                      value={selectedStudentId}
                      onChange={e => setSelectedStudentId(e.target.value)}
                      className="w-full sm:w-auto flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="">{t('userManagementModal.form.linkExistingStudent')}</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.email || t('userManagementModal.form.noEmail')})
                        </option>
                      ))}
                    </select>

                    {!selectedStudentId && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createStudentRecord}
                          onChange={e => setCreateStudentRecord(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                        <span>{role === UserRole.Socio ? t('userManagementModal.form.autoCreateMember') : t('userManagementModal.form.autoCreateStudent')}</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                >
                  {t('userManagementModal.form.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  <Check className="h-4 w-4" />
                  <span>{isSubmitting ? t('userManagementModal.form.submitting') : t('userManagementModal.form.submitButton')}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Lista de Usuarios Autorizados en Profiles */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-1">
                <span>{t('userManagementModal.list.authorizedCount', { count: filteredProfiles.length })}</span>
                <span>{t('userManagementModal.list.postgresRoleColumn')}</span>
              </div>

              {confirmToggleUser && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    {confirmToggleUser.access !== false && confirmToggleUser.active !== false
                      ? t('userManagementModal.list.confirmDeactivate', {
                          name: confirmToggleUser.name,
                          email: confirmToggleUser.email
                        })
                      : t('userManagementModal.list.confirmReactivate', {
                          name: confirmToggleUser.name,
                          email: confirmToggleUser.email
                        })}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmToggleUser(null)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {t('userManagementModal.form.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const target = confirmToggleUser;
                        const currentlyHasAccess = target.access !== false && target.active !== false;
                        const nextAccess = !currentlyHasAccess;
                        setConfirmToggleUser(null);
                        setFeedbackError(null);
                        setFeedbackSuccess(null);
                        const res = await toggleUserAccessStatus(target.id, nextAccess);
                        if (res.success) {
                          setFeedbackSuccess(
                            nextAccess
                              ? t('userManagementModal.list.reactivateSuccess', { name: target.name })
                              : t('userManagementModal.list.deactivateSuccess', { name: target.name })
                          );
                        } else if (res.error) {
                          setFeedbackError(res.error);
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold text-white ${
                        confirmToggleUser.access !== false && confirmToggleUser.active !== false
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {confirmToggleUser.access !== false && confirmToggleUser.active !== false
                        ? t('userManagementModal.list.inactiveBadge')
                        : t('userManagementModal.list.activeBadge')}
                    </button>
                  </div>
                </div>
              )}

              {filteredProfiles.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
                  {t('userManagementModal.list.emptySearch')}
                </div>
              ) : (
                filteredProfiles.map(p => {
                  const isCurrent = currentUser?.id === p.id;
                  const liveStatus = getProfileLiveStatus(p);
                  const isProfileActive = liveStatus.access;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !isProfileActive ? 'opacity-75' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {p.photoURL ? (
                          <img
                            src={p.photoURL}
                            alt={p.name}
                            className={`h-10 w-10 rounded-full object-cover border ${
                              isProfileActive ? 'border-emerald-500' : 'border-rose-400 grayscale'
                            }`}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-sm">
                            {p.name.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-white text-xs">
                              {p.name}
                            </span>
                            <button
                              type="button"
                              disabled={busySocioId === p.id}
                              onClick={async () => {
                                const nextSocio = !liveStatus.isSocio;
                                setBusySocioId(p.id);
                                setFeedbackError(null);
                                setFeedbackSuccess(null);
                                const res = await toggleUserSocioMembership(
                                  {
                                    profileId: p.id,
                                    studentId: p.studentId,
                                    teacherId: p.teacherId,
                                    email: p.email
                                  },
                                  nextSocio
                                );
                                setBusySocioId(null);
                                if (res.success) {
                                  setFeedbackSuccess(
                                    t('userManagementModal.list.membershipUpdated', {
                                      name: p.name,
                                      status: nextSocio
                                        ? t('userManagementModal.list.socioBadge')
                                        : t('userManagementModal.list.nonSocioBadge')
                                    })
                                  );
                                } else if (res.error) {
                                  setFeedbackError(res.error);
                                }
                              }}
                              title={t('userManagementModal.list.toggleSocioTooltip')}
                              className={`rounded-full border px-1.5 py-0.2 text-[9px] font-bold transition ${
                                liveStatus.isSocio
                                  ? 'border-teal-300 dark:border-teal-700 bg-teal-500/15 text-teal-700 dark:text-teal-300 hover:bg-teal-500/25'
                                  : 'border-amber-300 dark:border-amber-700 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                              }`}
                            >
                              {liveStatus.isSocio
                                ? t('userManagementModal.list.socioBadge')
                                : t('userManagementModal.list.nonSocioBadge')}
                            </button>
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[9px] font-semibold text-slate-700 dark:text-slate-300">
                              {t('userManagementModal.list.opRoleLabel', {
                                role: getOperationalRoleLabel(liveStatus.operationalRole)
                              })}
                            </span>
                            {liveStatus.isAccessDenied ? (
                              <span className="rounded-full bg-rose-500/15 px-1.5 py-0.2 text-[9px] font-bold text-rose-700 dark:text-rose-300">
                                {t('userManagementModal.list.accessDeniedBadge')}
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                                {t('userManagementModal.list.activeBadge')}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-600">
                                {t('userManagementModal.list.currentUserBadge')}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-mono">
                            {p.email}
                          </span>
                        </div>
                      </div>

                      {/* Selector de Rol y Acciones */}
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <select
                          value={p.role || ''}
                          onChange={e => {
                            if (e.target.value) {
                              updateUserRole(p.id, e.target.value as UserRole);
                            }
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition ${
                            p.role === UserRole.Admin
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                              : p.role === UserRole.Monitor
                              ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                              : p.role === UserRole.Alumno
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : p.role === UserRole.Socio
                              ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800'
                              : p.role === UserRole.Hibrido
                              ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                              : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {!p.role && (
                            <option value="" disabled>
                              {t('userManagementModal.list.rolesCompact.none')}
                            </option>
                          )}
                          {USER_ROLE_VALUES.map(r => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => setConfirmToggleUser(p)}
                            title={
                              isProfileActive
                                ? t('userManagementModal.list.deactivateTooltip')
                                : t('userManagementModal.list.reactivateTooltip')
                            }
                            className={`p-1.5 rounded-lg transition ${
                              isProfileActive
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>

        {/* Barra Inferior Fija */}
        <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-between shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="text-[11px] text-slate-400">
            {t('userManagementModal.footerSecurityText')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('userManagementModal.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
