import React from 'react';
import { useApp } from '../context/AppContext';
import { PaymentRecord } from '../types';
import { createTranslator } from '../lib/i18n';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Calendar,
  Sparkles,
  MessageCircle,
  Plus,
  UserCheck,
  UserX,
  Check,
  X,
  IdCard
} from 'lucide-react';
import { NewsCarouselSection } from './NewsCarouselSection';
import { StudentNameButton } from './ContactQuickActions';
import { formatSocioNumberPadded } from '../lib/memberNumber';

interface DashboardViewProps {
  onOpenRecordPayment: (initialPayment?: PaymentRecord) => void;
  onOpenAddSession: () => void;
  onOpenAddExpense: () => void;
  onNavigateToTab: (tab: string) => void;
  onReviewWithdrawalRequests?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenRecordPayment,
  onOpenAddSession,
  onOpenAddExpense,
  onNavigateToTab,
  onReviewWithdrawalRequests
}) => {
  const {
    selectedPeriod,
    totalIncomeCollected,
    totalIncomePending,
    totalExpenses,
    totalTeacherCosts,
    netMonthlyBalance,
    periodPayments,
    markPaymentPaid,
    teacherSummaries,
    students,
    activities,
    teachers,
    validatePendingStudent,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    membershipWithdrawalRequests,
    currentUser,
    profiles,
    language
  } = useApp();
  const t = createTranslator(language);

  const adminEmailNorm = (currentUser?.email || '').trim().toLowerCase();
  const matchedAdminProfile = profiles.find(
    p =>
      p.id === currentUser?.id ||
      (adminEmailNorm && p.email.trim().toLowerCase() === adminEmailNorm)
  );
  const linkedAdminStudent = students.find(
    s =>
      (currentUser?.studentId && s.id === currentUser.studentId) ||
      s.profileId === currentUser?.id ||
      (adminEmailNorm && s.email.trim().toLowerCase() === adminEmailNorm)
  );
  const linkedAdminTeacher = teachers.find(
    tc =>
      (currentUser?.teacherId && tc.id === currentUser.teacherId) ||
      (adminEmailNorm && tc.email.trim().toLowerCase() === adminEmailNorm)
  );
  const formattedMemberNumber = formatSocioNumberPadded(
    currentUser?.memberNumber ||
      matchedAdminProfile?.memberNumber ||
      linkedAdminStudent?.memberNumber ||
      linkedAdminTeacher?.memberNumber
  );

  const pendingWithdrawalRequests = membershipWithdrawalRequests.filter(
    r => r.status === 'pending'
  );

  // Alumnos con pagos pendientes en este mes
  const pendingPayments = periodPayments.filter(p => p.status === 'pending' || p.status === 'overdue');
  const paidPayments = periodPayments.filter(p => p.status === 'paid' || p.status === 'partial');

  // Altas rápidas pendientes de confirmación definitiva por el Administrador
  const pendingValidationStudents = students.filter(
    s => s.status === 'pending_validation' || s.validationStatus === 'pending'
  );

  // Solicitudes de inscripción a talleres enviadas por alumnos
  const pendingEnrollmentRequests = students.flatMap(st =>
    (st.pendingEnrollments || [])
      .map(enr => {
        const act = activities.find(a => a.id === enr.activityId);
        if (!act) return null;
        const teacher = teachers.find(item => item.id === act.teacherId);
        return {
          student: st,
          activityId: act.id,
          activityName: act.name,
          teacherName: teacher?.name || t('dashboard.defaultNoTeacher'),
          enrolledSince: enr.enrolledSince
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  );

  // Profesores con saldo pendiente de abonar
  const teachersWithPendingBalance = teacherSummaries.filter(ts => ts.balanceToPay > 0);

  // Generar enlace WhatsApp con mensaje predeterminado
  const handleWhatsAppReminder = (payment: PaymentRecord) => {
    const student = students.find(s => s.id === payment.studentId);
    const phone = student?.phone?.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      t('dashboard.whatsappMessage', {
        studentName: payment.studentName,
        activityName: payment.activityName,
        period: payment.periodMonth,
        amount: payment.amount
      })
    );
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    } else {
      navigator.clipboard.writeText(decodeURIComponent(message));
      alert(t('dashboard.whatsappClipboardAlert', { message: decodeURIComponent(message) }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera Portal del Administrador */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {t('dashboard.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('dashboard.subtitle', { period: selectedPeriod })}
          </p>
        </div>
        {formattedMemberNumber && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-200 shadow-xs whitespace-nowrap shrink-0">
            <IdCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t('common.socioNumberBadge', { number: formattedMemberNumber })}</span>
          </span>
        )}
      </div>

      {/* KPI Cards de Finanzas Mensuales */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Recaudado */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('dashboard.kpi.collectedTitle')}</span>
            <div className="h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowDownRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {totalIncomeCollected.toFixed(2)} €
            </span>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
              {t('dashboard.kpi.collectedCount', { count: paidPayments.length })}
            </p>
          </div>
        </div>

        {/* Por cobrar */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('dashboard.kpi.pendingTitle')}</span>
            <div className="h-6 w-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-black tabular-nums text-amber-600 dark:text-amber-400">
              {totalIncomePending.toFixed(2)} €
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t('dashboard.kpi.pendingCount', { count: pendingPayments.length })}
            </p>
          </div>
        </div>

        {/* Profesores */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('dashboard.kpi.teachersTitle')}</span>
            <div className="h-6 w-6 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {totalTeacherCosts.toFixed(2)} €
            </span>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
              {t('dashboard.kpi.teachersSubtitle')}
            </p>
          </div>
        </div>

        {/* Gastos */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('dashboard.kpi.expensesTitle')}</span>
            <div className="h-6 w-6 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {totalExpenses.toFixed(2)} €
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t('dashboard.kpi.expensesSubtitle')}
            </p>
          </div>
        </div>

        {/* Margen neto */}
        <div className={`col-span-2 sm:col-span-2 lg:col-span-1 rounded-2xl border p-3.5 shadow-xs ${
          netMonthlyBalance >= 0
            ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
            : 'border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20'
        }`}>
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('dashboard.kpi.netMarginTitle')}</span>
            {netMonthlyBalance >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            )}
          </div>
          <div className="mt-1.5">
            <span className={`text-xl font-black tabular-nums ${
              netMonthlyBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            }`}>
              {netMonthlyBalance.toFixed(2)} €
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {netMonthlyBalance >= 0 ? t('dashboard.kpi.surplus') : t('dashboard.kpi.deficit')}
            </p>
          </div>
        </div>
      </div>

      {/* Carrusel horizontal de Notas y comunicados */}
      <NewsCarouselSection />

      {/* Barra de Progreso Financiero del Período */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('dashboard.financialHealth.title', { period: selectedPeriod })}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('dashboard.financialHealth.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              {t('dashboard.financialHealth.collectedLegend', { amount: totalIncomeCollected })}
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500"></span>
              {t('dashboard.financialHealth.teachersLegend', { amount: totalTeacherCosts })}
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400"></span>
              {t('dashboard.financialHealth.expensesLegend', { amount: totalExpenses })}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
          {totalIncomeCollected + totalIncomePending > 0 ? (
            <>
              <div
                style={{
                  width: `${Math.min(100, (totalIncomeCollected / (totalIncomeCollected + totalIncomePending)) * 100)}%`
                }}
                className="bg-emerald-500 h-full transition-all duration-500"
                title={t('dashboard.financialHealth.collectedTooltip', { amount: totalIncomeCollected })}
              />
              <div
                style={{
                  width: `${Math.min(100, (totalIncomePending / (totalIncomeCollected + totalIncomePending)) * 100)}%`
                }}
                className="bg-amber-400 h-full transition-all duration-500"
                title={t('dashboard.financialHealth.pendingTooltip', { amount: totalIncomePending })}
              />
            </>
          ) : (
            <div className="bg-slate-300 w-full h-full" />
          )}
        </div>
      </div>

      {/* Solicitudes de baja de la asociación pendientes de revisión */}
      {pendingWithdrawalRequests.length > 0 && (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-50/70 dark:bg-rose-950/25 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <UserX className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('dashboard.withdrawalRequests.title', {
                  count: pendingWithdrawalRequests.length
                })}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {pendingWithdrawalRequests.map(r => r.userName).join(', ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onReviewWithdrawalRequests
                ? onReviewWithdrawalRequests()
                : onNavigateToTab('admin-users')
            }
            className="shrink-0 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition whitespace-nowrap self-start sm:self-auto"
          >
            {t('dashboard.withdrawalRequests.reviewInUsers')}
          </button>
        </div>
      )}

      {/* Altas rápidas pendientes de validación definitiva por Administrador */}
      {pendingValidationStudents.length > 0 && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-50/60 dark:bg-amber-950/20 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('dashboard.pendingValidations.title', { count: pendingValidationStudents.length })}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {t('dashboard.pendingValidations.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-amber-500/25 bg-white/80 dark:bg-slate-900/60 overflow-hidden">
            <div className="hidden md:grid md:grid-cols-[minmax(150px,1.2fr)_minmax(150px,1.5fr)_130px_190px] items-center gap-3 px-3.5 py-2 bg-amber-100/50 dark:bg-amber-950/40 border-b border-amber-500/20 text-[10px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
              <span>{t('common.columns.student')}</span>
              <span>{t('common.columns.workshops')}</span>
              <span>{t('common.columns.status')}</span>
              <span className="text-right">{t('common.columns.actions')}</span>
            </div>
            <div className="divide-y divide-amber-500/15">
              {pendingValidationStudents.map(st => {
                const enrolledNames = (st.activities || [])
                  .map(enr => activities.find(a => a.id === enr.activityId)?.name)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={st.id}
                    className="px-3.5 py-3 grid grid-cols-1 md:grid-cols-[minmax(150px,1.2fr)_minmax(150px,1.5fr)_130px_190px] items-start md:items-center gap-2.5 md:gap-3 text-xs hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition"
                  >
                    <StudentNameButton
                      name={st.name}
                      phone={st.phone}
                      email={st.email}
                      className="font-bold text-slate-900 dark:text-white text-sm text-left break-words"
                    />

                    <div className="text-slate-600 dark:text-slate-300 break-words">
                      {enrolledNames ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {enrolledNames}
                        </span>
                      ) : (
                        <span className="hidden md:inline text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </div>

                    <div>
                      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                        {t('dashboard.pendingValidations.badge')}
                      </span>
                    </div>

                    <div className="flex items-center md:justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => validatePendingStudent(st.id, false)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 transition whitespace-nowrap"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        <span>{t('dashboard.pendingValidations.reject')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => validatePendingStudent(st.id, true)}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 font-bold text-white hover:bg-emerald-700 shadow-xs transition whitespace-nowrap"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>{t('dashboard.pendingValidations.confirm')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Solicitudes de inscripción a talleres enviadas por alumnos */}
      {pendingEnrollmentRequests.length > 0 && (
        <div className="rounded-2xl border border-indigo-500/35 bg-indigo-50/60 dark:bg-indigo-950/20 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-indigo-500/20">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('dashboard.enrollmentRequests.title', { count: pendingEnrollmentRequests.length })}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {t('dashboard.enrollmentRequests.subtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('admin-users')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline self-start sm:self-auto"
            >
              {t('dashboard.enrollmentRequests.viewInUsers')}
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-indigo-500/25 bg-white/85 dark:bg-slate-900/60 overflow-hidden">
            <div className="hidden md:grid md:grid-cols-[minmax(140px,1.2fr)_minmax(130px,1.2fr)_minmax(110px,1fr)_105px_190px] items-center gap-3 px-3.5 py-2 bg-indigo-100/50 dark:bg-indigo-950/40 border-b border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider text-indigo-800/80 dark:text-indigo-300/80">
              <span>{t('common.columns.student')}</span>
              <span>{t('common.columns.workshop')}</span>
              <span>{t('common.columns.teacher')}</span>
              <span>{t('common.columns.requestedAt')}</span>
              <span className="text-right">{t('common.columns.actions')}</span>
            </div>
            <div className="divide-y divide-indigo-500/15">
              {pendingEnrollmentRequests.map(req => (
                <div
                  key={`${req.student.id}-${req.activityId}`}
                  className="px-3.5 py-3 grid grid-cols-1 md:grid-cols-[minmax(140px,1.2fr)_minmax(130px,1.2fr)_minmax(110px,1fr)_105px_190px] items-start md:items-center gap-2 md:gap-3 text-xs hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition"
                >
                  <StudentNameButton
                    name={req.student.name}
                    phone={req.student.phone}
                    email={req.student.email}
                    subtitle={req.activityName}
                    className="font-bold text-slate-900 dark:text-white text-sm text-left break-words"
                  />

                  <div>
                    <span className="inline-flex items-center rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:text-indigo-300 break-words">
                      {req.activityName}
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 break-words">
                    {req.teacherName}
                  </span>

                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {req.enrolledSince}
                  </span>

                  <div className="flex items-center md:justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => rejectActivityEnrollment(req.student.id, req.activityId)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 transition whitespace-nowrap"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{t('dashboard.enrollmentRequests.reject')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmActivityEnrollment(req.student.id, req.activityId)}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 font-bold text-white hover:bg-emerald-700 shadow-xs transition whitespace-nowrap"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{t('dashboard.enrollmentRequests.confirm')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid de 2 Columnas: Alertas & Acciones Rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna Izquierda: Alumnos con Pago Pendiente */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('dashboard.pendingPayments.title', { count: pendingPayments.length })}
              </h3>
            </div>
            <button
              onClick={() => onNavigateToTab('payments')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {t('dashboard.pendingPayments.viewAll')}
            </button>
          </div>

          <div className="mt-3">
            {pendingPayments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">{t('dashboard.pendingPayments.allUpToDate')}</p>
                <p>{t('dashboard.pendingPayments.emptyForPeriod', { period: selectedPeriod })}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                <div className="hidden sm:grid sm:grid-cols-[minmax(110px,1.2fr)_minmax(95px,1fr)_64px_124px] items-center gap-2.5 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <span>{t('common.columns.student')}</span>
                  <span>{t('common.columns.workshop')}</span>
                  <span className="text-right">{t('common.columns.amount')}</span>
                  <span className="text-right">{t('common.columns.actions')}</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {pendingPayments.map(p => {
                    const student = students.find(s => s.id === p.studentId);
                    return (
                    <div
                      key={p.id}
                      className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(110px,1.2fr)_minmax(95px,1fr)_64px_124px] items-start sm:items-center gap-2 sm:gap-2.5 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                    >
                      <div className="min-w-0">
                        <StudentNameButton
                          name={p.studentName}
                          phone={student?.phone}
                          email={student?.email}
                          subtitle={p.activityName}
                          className="font-semibold text-slate-900 dark:text-white break-words text-left"
                        />
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 break-words min-w-0">
                        {p.activityName}
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap sm:text-right">
                        {p.amount} €
                      </div>
                      <div className="flex items-center sm:justify-end gap-1.5 shrink-0">
                        <button
                          onClick={() => handleWhatsAppReminder(p)}
                          title={t('dashboard.pendingPayments.whatsappTooltip')}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-600 transition"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => markPaymentPaid(p.id)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700 transition shadow-xs text-[11px] whitespace-nowrap"
                        >
                          {t('dashboard.pendingPayments.markPaid')}
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Estado de Monitores & Liquidaciones */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('dashboard.teacherSettlements.title', { period: selectedPeriod })}
              </h3>
            </div>
            <button
              onClick={() => onNavigateToTab('teachers')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {t('dashboard.teacherSettlements.manage')}
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-[minmax(110px,1.2fr)_minmax(100px,1fr)_84px_118px] items-center gap-2.5 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <span>{t('common.columns.teacher')}</span>
              <span>{t('common.columns.classesAndStudents')}</span>
              <span className="text-right">{t('common.columns.collectedInHand')}</span>
              <span className="text-right">{t('common.columns.totalAndPending')}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {teacherSummaries.map(ts => (
                <div
                  key={ts.teacher.id}
                  className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(110px,1.2fr)_minmax(100px,1fr)_84px_118px] items-start sm:items-center gap-1.5 sm:gap-2.5 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                >
                  <div className="min-w-0">
                    <StudentNameButton
                      name={ts.teacher.name}
                      phone={ts.teacher.phone}
                      email={ts.teacher.email}
                      className="font-semibold text-slate-900 dark:text-white break-words text-left"
                    />
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {t('dashboard.teacherSettlements.classesAndStudents', {
                      classes: ts.classesCount,
                      students: ts.studentsCount
                    })}
                  </div>
                  <div className="sm:text-right tabular-nums whitespace-nowrap">
                    {ts.collectedInHand > 0 ? (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                        {ts.collectedInHand.toFixed(2)} €
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">0.00 €</span>
                    )}
                  </div>
                  <div className="sm:text-right shrink-0 tabular-nums">
                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                      {ts.calculatedDue.toFixed(2)} €
                    </div>
                    <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t('dashboard.teacherSettlements.pendingPayout', {
                        amount: ts.balanceToPay.toFixed(2)
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recibos y Movimientos Recientes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('dashboard.recentPayments.title', { period: selectedPeriod })}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('dashboard.recentPayments.subtitle')}
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('payments')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {t('dashboard.recentPayments.viewFullLedger')}
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-2 px-3">{t('dashboard.recentPayments.table.receipt')}</th>
                <th className="py-2 px-3">{t('dashboard.recentPayments.table.student')}</th>
                <th className="py-2 px-3">{t('dashboard.recentPayments.table.activity')}</th>
                <th className="py-2 px-3">{t('dashboard.recentPayments.table.amount')}</th>
                <th className="py-2 px-3">{t('dashboard.recentPayments.table.method')}</th>
                <th className="py-2 px-3 text-right">{t('dashboard.recentPayments.table.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
              {paidPayments.slice(0, 5).map(p => {
                const student = students.find(s => s.id === p.studentId);
                return (
                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    {p.receiptNumber}
                  </td>
                  <td className="py-2.5 px-3">
                    <StudentNameButton
                      name={p.studentName}
                      phone={student?.phone}
                      email={student?.email}
                      subtitle={p.activityName}
                      className="font-medium text-slate-900 dark:text-white text-left"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                    {p.activityName}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                    {p.amount.toFixed(2)} €
                  </td>
                  <td className="py-2.5 px-3 capitalize">
                    {p.paymentMethod} {p.collectedByTeacher && t('dashboard.recentPayments.inHandSuffix')}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('dashboard.recentPayments.statusPaid')}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};