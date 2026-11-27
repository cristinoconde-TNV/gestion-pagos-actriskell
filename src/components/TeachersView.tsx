import React, { useState } from 'react';
import { useApp, TeacherFinancialSummary } from '../context/AppContext';
import { ClassSession, Teacher, UserRole } from '../types';
import { createTranslator } from '../lib/i18n';
import { getPaymentMethodLabel } from '../lib/paymentMethods';
import { StudentNameButton } from './ContactQuickActions';
import {
  GraduationCap,
  Calendar,
  DollarSign,
  Plus,
  CheckCircle2,
  Clock,
  Landmark,
  Edit2,
  Trash2,
  AlertTriangle,
  X,
  Lock,
  Unlock,
  Bot,
  ShieldCheck,
  UserCheck,
  Loader2
} from 'lucide-react';

interface TeachersViewProps {
  onOpenTeacherPayout: (summary: TeacherFinancialSummary) => void;
  onOpenAddTeacher: (teacher?: Teacher) => void;
  onOpenAddSession: (teacherId?: string) => void;
}

export const TeachersView: React.FC<TeachersViewProps> = ({
  onOpenTeacherPayout,
  onOpenAddTeacher,
  onOpenAddSession
}) => {
  const {
    selectedPeriod,
    teacherSummaries,
    sessions,
    payouts,
    deleteClassSession,
    closeClassSession,
    reopenClassSession,
    deleteTeacher,
    currentRole,
    language
  } = useApp();
  const t = createTranslator(language);

  const [activeTab, setActiveTab] = useState<'roster' | 'sessions' | 'payouts'>('roster');
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [isDeletingTeacher, setIsDeletingTeacher] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [sessionToReopen, setSessionToReopen] = useState<ClassSession | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [isReopeningSession, setIsReopeningSession] = useState(false);

  const periodSessions = sessions.filter(s => s.date.startsWith(selectedPeriod));
  const periodPayouts = payouts.filter(p => p.periodMonth === selectedPeriod);

  const handleCloseSessionRow = async (ses: ClassSession) => {
    if (ses.isClosed || sessionBusyId) return;
    setActionError(null);
    setSessionBusyId(ses.id);
    try {
      const res = await closeClassSession({
        sessionId: ses.id,
        activityId: ses.activityId,
        teacherId: ses.teacherId,
        date: ses.date,
        closedBy: currentRole === UserRole.Admin ? 'administrador' : 'profesor'
      });
      if (!res.success && res.error) {
        setActionError(res.error);
      }
    } finally {
      setSessionBusyId(null);
    }
  };

  const handleConfirmReopenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToReopen || isReopeningSession) return;
    const trimmed = reopenReason.trim();
    if (!trimmed) {
      setReopenError(t('teachersView.reopenModal.reasonRequired'));
      return;
    }
    setIsReopeningSession(true);
    setReopenError(null);
    setActionError(null);
    try {
      const res = await reopenClassSession({
        sessionId: sessionToReopen.id,
        activityId: sessionToReopen.activityId,
        teacherId: sessionToReopen.teacherId,
        date: sessionToReopen.date,
        reason: trimmed,
        reopenedBy: currentRole === UserRole.Admin ? 'administrador' : 'profesor'
      });
      if (!res.success) {
        setReopenError(res.error || t('teachersView.reopenModal.reasonRequired'));
        return;
      }
      setSessionToReopen(null);
      setReopenReason('');
    } finally {
      setIsReopeningSession(false);
    }
  };

  const handleConfirmDeleteTeacher = async () => {
    if (!teacherToDelete || isDeletingTeacher) return;
    setIsDeletingTeacher(true);
    setActionError(null);
    try {
      const res = await deleteTeacher(teacherToDelete.id);
      if (!res.success) {
        setActionError(res.error || t('teachersView.deleteErrorFallback', { name: teacherToDelete.name }));
      }
      setTeacherToDelete(null);
    } finally {
      setIsDeletingTeacher(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera & Pestañas del módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t('teachersView.title', { period: selectedPeriod })}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('teachersView.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenAddSession()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Calendar className="h-4 w-4" />
            <span>{t('teachersView.addSessionShort')}</span>
          </button>
          <button
            onClick={() => onOpenAddTeacher()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{t('teachersView.addTeacherButton')}</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="p-1 rounded-lg hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Sub-navegación interna */}
      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('roster')}
          className={`rounded-lg px-3 py-1.5 transition ${
            activeTab === 'roster'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('teachersView.tabs.roster', { count: teacherSummaries.length })}
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`rounded-lg px-3 py-1.5 transition ${
            activeTab === 'sessions'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('teachersView.tabs.sessions', { count: periodSessions.length })}
        </button>
        <button
          onClick={() => setActiveTab('payouts')}
          className={`rounded-lg px-3 py-1.5 transition ${
            activeTab === 'payouts'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('teachersView.tabs.payouts', { count: periodPayouts.length })}
        </button>
      </div>

      {/* Vista 1: Roster de Profesores con Desglose Financiero */}
      {activeTab === 'roster' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {teacherSummaries.map(ts => {
            const { teacher, calculatedDue, collectedInHand, alreadySettled, balanceToPay, classesCount, studentsCount } = ts;

            const schemeBadge = {
              per_class: t('teachersView.schemes.perClass', { rate: teacher.ratePerClass }),
              monthly_fixed: t('teachersView.schemes.monthlyFixed', { rate: teacher.fixedMonthlyRate }),
              revenue_share: t('teachersView.schemes.revenueShare', { percent: teacher.revenueSharePercent })
            }[teacher.paymentScheme];

            return (
              <div
                key={teacher.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  {/* Encabezado del profesor */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <img
                        src={teacher.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                        alt={teacher.name}
                        className="h-12 w-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div>
                          <StudentNameButton
                            name={teacher.name}
                            phone={teacher.phone}
                            email={teacher.email}
                            className="font-bold text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              teacher.active !== false && teacher.status !== 'inactive'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {teacher.active !== false && teacher.status !== 'inactive'
                              ? t('adminUsers.teachersTab.activeBadge')
                              : t('adminUsers.teachersTab.inactiveBadge')}
                          </span>
                          {teacher.memberType === 'monitor_no_socio' && (
                            <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                              {t('adminUsers.memberType.nonMemberTeacher')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenAddTeacher(teacher)}
                        title={t('teachersView.editTeacherTooltip')}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setTeacherToDelete(teacher);
                        }}
                        title={t('teachersView.deleteTeacherTooltip')}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Etiqueta de esquema contractual */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      {schemeBadge}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                      {t('teachersView.classesThisMonth', { count: classesCount })}
                    </span>
                    <span className="text-slate-400 text-[11px]">•</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                      {t('teachersView.studentsInGroups', { count: studentsCount })}
                    </span>
                  </div>

                  {/* Cuadro de Liquidación Detallada */}
                  <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3.5 border border-slate-200/60 dark:border-slate-800 text-xs space-y-2">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>{t('teachersView.totalEarnedLabel')}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {calculatedDue.toFixed(2)} €
                      </span>
                    </div>

                    {collectedInHand > 0 && (
                      <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-medium">
                        <span>{t('teachersView.collectedInHandLabel')}</span>
                        <span>−{collectedInHand.toFixed(2)} €</span>
                      </div>
                    )}

                    {alreadySettled > 0 && (
                      <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-medium">
                        <span>{t('teachersView.alreadySettledLabel')}</span>
                        <span>−{alreadySettled.toFixed(2)} €</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700 font-bold">
                      <span className="text-slate-900 dark:text-white">{t('teachersView.balancePendingLabel')}</span>
                      <span className="text-base text-emerald-600 dark:text-emerald-400">
                        {balanceToPay.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                  <button
                    onClick={() => onOpenAddSession(teacher.id)}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t('teachersView.addSessionAction')}</span>
                  </button>

                  <button
                    onClick={() => onOpenTeacherPayout(ts)}
                    className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs flex items-center gap-1.5"
                  >
                    <Landmark className="h-3.5 w-3.5" />
                    <span>{t('teachersView.settleAction')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vista 2: Registro de Clases Impartidas */}
      {activeTab === 'sessions' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {t('teachersView.sessionsLogTitle', { period: selectedPeriod })}
            </span>
            <button
              onClick={() => onOpenAddSession()}
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition"
            >
              {t('teachersView.newSessionButton')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">{t('teachersView.sessionsTable.date')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.sessionsTable.teacher')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.sessionsTable.attendees')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.sessionsTable.duration')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.sessionsTable.topic')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.sessionsTable.status')}</th>
                  <th className="py-2.5 px-4 text-right">{t('teachersView.sessionsTable.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                {periodSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('teachersView.sessionsTable.empty')}
                    </td>
                  </tr>
                ) : (
                  periodSessions.map(s => {
                    const teacher = teacherSummaries.find(item => item.teacher.id === s.teacherId)?.teacher;
                    const closedByRole = s.closedBy || 'profesor';
                    const closerBadgeText = t(
                      `teachersView.sessionsTable.closedByShort.${closedByRole}` as
                        | 'teachersView.sessionsTable.closedByShort.profesor'
                        | 'teachersView.sessionsTable.closedByShort.automatica'
                        | 'teachersView.sessionsTable.closedByShort.administrador'
                    );
                    const CloserIcon =
                      closedByRole === 'automatica'
                        ? Bot
                        : closedByRole === 'administrador'
                        ? ShieldCheck
                        : UserCheck;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white tabular-nums">
                          {s.date}
                        </td>
                        <td className="py-2.5 px-4 font-medium">
                          {teacher ? (
                            <StudentNameButton
                              name={teacher.name}
                              phone={teacher.phone}
                              email={teacher.email}
                              className="font-medium text-slate-900 dark:text-white"
                            />
                          ) : (
                            t('teachersView.sessionsTable.defaultTeacher')
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            {t('teachersView.sessionsTable.attendeesBadge', { count: s.attendeesCount })}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 tabular-nums">
                          {t('teachersView.sessionsTable.durationBadge', { minutes: s.durationMinutes })}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-xs">
                          <div className="truncate">
                            {s.topic || t('teachersView.sessionsTable.defaultTopic')}
                          </div>
                          {!s.isClosed && s.reopenReason && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate mt-0.5">
                              {t('teachersView.sessionsTable.reopenedNote', { reason: s.reopenReason })}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {s.isClosed ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                              <Lock className="h-3 w-3 shrink-0" />
                              <CloserIcon className="h-3 w-3 shrink-0" />
                              <span>{t('teachersView.sessionsTable.closedBadge', { by: closerBadgeText })}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {t('teachersView.sessionsTable.openBadge')}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {s.isClosed ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReopenReason('');
                                  setReopenError(null);
                                  setSessionToReopen(s);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              >
                                <Unlock className="h-3 w-3" />
                                <span>{t('teachersView.sessionsTable.reopenButton')}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={sessionBusyId === s.id}
                                onClick={() => void handleCloseSessionRow(s)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600/25 transition disabled:opacity-50"
                              >
                                <Lock className="h-3 w-3" />
                                <span>{t('teachersView.sessionsTable.closeButton')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={Boolean(s.isClosed)}
                              onClick={() => {
                                if (!s.isClosed) void deleteClassSession(s.id);
                              }}
                              title={
                                s.isClosed
                                  ? t('teachersView.sessionsTable.readOnlyDeleteTooltip')
                                  : undefined
                              }
                              className={`p-1 rounded-lg transition ${
                                s.isClosed
                                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-rose-600'
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista 3: Historial de Liquidaciones Emitidas */}
      {activeTab === 'payouts' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {t('teachersView.payoutsTable.title')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">{t('teachersView.payoutsTable.payoutId')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.payoutsTable.teacher')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.payoutsTable.amountPaid')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.payoutsTable.paymentDate')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.payoutsTable.method')}</th>
                  <th className="py-2.5 px-4">{t('teachersView.payoutsTable.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                {periodPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {t('teachersView.payoutsTable.empty')}
                    </td>
                  </tr>
                ) : (
                  periodPayouts.map(p => {
                    const teacher = teacherSummaries.find(item => item.teacher.id === p.teacherId)?.teacher;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                          {p.id}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                          {teacher ? (
                            <StudentNameButton
                              name={teacher.name}
                              phone={teacher.phone}
                              email={teacher.email}
                              className="font-semibold text-slate-900 dark:text-white"
                            />
                          ) : (
                            t('teachersView.payoutsTable.defaultTeacher')
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-extrabold text-sm text-slate-900 dark:text-white">
                          {p.totalSettled.toFixed(2)} €
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">
                          {p.settledDate}
                        </td>
                        <td className="py-2.5 px-4 font-medium">
                          {getPaymentMethodLabel(p.paymentMethod, t)}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('teachersView.payoutsTable.statusTransferred')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {teacherToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('teachersView.deleteModal.title')}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('teachersView.deleteModal.confirmPrefix')} <strong>{teacherToDelete.name}</strong>{t('teachersView.deleteModal.confirmSuffix')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingTeacher}
                onClick={() => setTeacherToDelete(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('teachersView.deleteModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isDeletingTeacher}
                onClick={handleConfirmDeleteTeacher}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeletingTeacher ? t('teachersView.deleteModal.deleting') : t('teachersView.deleteModal.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionToReopen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmReopenSession}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  <Unlock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('teachersView.reopenModal.title')}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t('teachersView.reopenModal.subtitle', { date: sessionToReopen.date })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isReopeningSession}
                onClick={() => setSessionToReopen(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                {t('teachersView.reopenModal.reasonLabel')}
              </label>
              <textarea
                rows={3}
                required
                value={reopenReason}
                onChange={e => {
                  setReopenReason(e.target.value);
                  if (reopenError) setReopenError(null);
                }}
                placeholder={t('teachersView.reopenModal.reasonPlaceholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white focus:outline-indigo-500"
              />
              {reopenError && (
                <p className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  {reopenError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isReopeningSession}
                onClick={() => setSessionToReopen(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('teachersView.reopenModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isReopeningSession || !reopenReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isReopeningSession && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isReopeningSession
                    ? t('teachersView.reopenModal.confirming')
                    : t('teachersView.reopenModal.confirm')}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
