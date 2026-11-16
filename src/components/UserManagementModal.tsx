import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserRole, AuthUser } from '../types';
import { createTranslator } from '../lib/i18n';
import {
  X,
  Check,
  UserPlus,
  ShieldCheck,
  Search,
  Key,
  Copy,
  Trash2,
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
    deleteUserAccess,
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
  const [role, setRole] = useState<UserRole>('student');
  const [password, setPassword] = useState('Triskell2026!');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [createTeacherRecord, setCreateTeacherRecord] = useState(true);
  const [createStudentRecord, setCreateStudentRecord] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    pass: string;
    role: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

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
        password: password.trim() || undefined,
        teacherId: (role === 'teacher' || role === 'teacher_student') ? selectedTeacherId || undefined : undefined,
        studentId: (role === 'student' || role === 'teacher_student' || role === 'socio') ? selectedStudentId || undefined : undefined,
        createTeacherProfile: (role === 'teacher' || role === 'teacher_student') && createTeacherRecord && !selectedTeacherId,
        createStudentProfile: (role === 'student' || role === 'teacher_student' || role === 'socio') && createStudentRecord && !selectedStudentId
      });

      if (!res.success) {
        setFeedbackError(res.error || t('userManagementModal.errors.createFailed'));
      } else {
        const passUsed = res.tempPassword || password;
        setCreatedCredentials({
          email: email.trim(),
          pass: passUsed,
          role:
            role === 'admin'
              ? t('common.roles.admin')
              : role === 'teacher'
              ? t('common.roles.teacher')
              : role === 'student'
              ? t('common.roles.student')
              : role === 'socio'
              ? t('common.roles.socio')
              : t('common.roles.teacher_student')
        });
        setFeedbackSuccess(t('userManagementModal.createSuccess', { name }));
        setName('');
        setEmail('');
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
    return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.role.includes(q);
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
                    <option value="socio">{t('userManagementModal.form.rolesDetailed.socio')}</option>
                    <option value="student">{t('userManagementModal.form.rolesDetailed.student')}</option>
                    <option value="teacher">{t('userManagementModal.form.rolesDetailed.teacher')}</option>
                    <option value="teacher_student">{t('userManagementModal.form.rolesDetailed.teacher_student')}</option>
                    <option value="admin">{t('userManagementModal.form.rolesDetailed.admin')}</option>
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

              {/* Vinculación opcional con Monitor o Alumno existente */}
              {(role === 'teacher' || role === 'teacher_student') && (
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

              {(role === 'student' || role === 'teacher_student' || role === 'socio') && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block text-[11px]">
                    {role === 'socio' ? t('userManagementModal.form.memberRecordTitle') : t('userManagementModal.form.studentMemberRecordTitle')}
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
                        <span>{role === 'socio' ? t('userManagementModal.form.autoCreateMember') : t('userManagementModal.form.autoCreateStudent')}</span>
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

              {filteredProfiles.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
                  {t('userManagementModal.list.emptySearch')}
                </div>
              ) : (
                filteredProfiles.map(p => {
                  const isCurrent = currentUser?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {p.photoURL ? (
                          <img
                            src={p.photoURL}
                            alt={p.name}
                            className="h-10 w-10 rounded-full object-cover border border-emerald-500"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-sm">
                            {p.name.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-xs">
                              {p.name}
                            </span>
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
                          value={p.role}
                          onChange={e => updateUserRole(p.id, e.target.value as UserRole)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition ${
                            p.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                              : p.role === 'teacher'
                              ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                              : p.role === 'student'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : p.role === 'socio'
                              ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800'
                              : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                          }`}
                        >
                          <option value="socio">{t('userManagementModal.list.rolesCompact.socio')}</option>
                          <option value="student">{t('userManagementModal.list.rolesCompact.student')}</option>
                          <option value="teacher">{t('userManagementModal.list.rolesCompact.teacher')}</option>
                          <option value="teacher_student">{t('userManagementModal.list.rolesCompact.teacher_student')}</option>
                          <option value="admin">{t('userManagementModal.list.rolesCompact.admin')}</option>
                        </select>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('userManagementModal.list.confirmRevoke', { name: p.name, email: p.email }))) {
                                deleteUserAccess(p.id);
                              }
                            }}
                            title={t('userManagementModal.list.revokeTooltip')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                          >
                            <Trash2 className="h-4 w-4" />
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
