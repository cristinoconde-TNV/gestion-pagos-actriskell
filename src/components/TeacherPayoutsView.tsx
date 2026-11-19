import React from 'react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { createTranslator } from '../lib/i18n';
import { CheckCircle2, Clock, DollarSign, Calendar } from 'lucide-react';

export const TeacherPayoutsView: React.FC = () => {
  const {
    currentTeacherId,
    setCurrentTeacherId,
    teachers,
    activities,
    selectedPeriod,
    teacherSummaries,
    sessions,
    payouts,
    currentRole,
    language
  } = useApp();
  const t = createTranslator(language);

  const currentTeacher = teachers.find(t => t.id === currentTeacherId) || teachers[0];
  const teacherSummary = teacherSummaries.find(ts => ts.teacher.id === currentTeacher?.id);

  const teacherSessions = sessions.filter(
    s => s.teacherId === currentTeacher?.id && s.date.startsWith(selectedPeriod)
  );

  const teacherPayoutHistory = payouts.filter(
    p => p.teacherId === currentTeacher?.id
  );

  return (
    <div className="space-y-6">
      {/* Cabecera Mis Liquidaciones */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {t('teacherPayouts.title', { period: selectedPeriod })}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('teacherPayouts.subtitle', { name: currentTeacher?.name || t('teacherPayouts.defaultTeacherName') })}
            </p>
          </div>
        </div>

        {currentRole === UserRole.Admin && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('teacherPayouts.teacherSelectLabel')}</span>
            <select
              value={currentTeacherId}
              onChange={e => setCurrentTeacherId(e.target.value)}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500"
            >
              {teachers.map(teacher => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tarjetas KPI de Liquidación */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            {t('teacherPayouts.kpiEarnedTitle')}
          </span>
          <div className="mt-2">
            <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">
              {(teacherSummary?.calculatedDue ?? 0).toFixed(2)} €
            </span>
            <p className="text-xs text-indigo-500 font-medium mt-0.5">
              {currentTeacher?.paymentScheme === 'per_class' && t('teacherPayouts.schemePerClass', { rate: currentTeacher.ratePerClass })}
              {currentTeacher?.paymentScheme === 'monthly_fixed' && t('teacherPayouts.schemeMonthlyFixed', { rate: currentTeacher.fixedMonthlyRate })}
              {currentTeacher?.paymentScheme === 'revenue_share' && t('teacherPayouts.schemeRevenueShare', { percent: currentTeacher.revenueSharePercent })}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            {t('teacherPayouts.kpiCollectedInHandTitle')}
          </span>
          <div className="mt-2">
            <span className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
              {(teacherSummary?.collectedInHand ?? 0).toFixed(2)} €
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('teacherPayouts.kpiCollectedInHandDesc')}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            {t('teacherPayouts.kpiTransferredTitle')}
          </span>
          <div className="mt-2">
            <span className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
              {(teacherSummary?.alreadySettled ?? 0).toFixed(2)} €
            </span>
            <p className="text-xs text-emerald-500 mt-0.5">
              {t('teacherPayouts.kpiTransferredDesc')}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-300 tracking-wider">
            {t('teacherPayouts.kpiPendingTitle')}
          </span>
          <div className="mt-2">
            <span className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {(teacherSummary?.balanceToPay ?? 0).toFixed(2)} €
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {(teacherSummary?.balanceToPay ?? 0) === 0
                ? t('teacherPayouts.kpiPendingUpToDate')
                : t('teacherPayouts.kpiPendingDue')}
            </p>
          </div>
        </div>
      </div>

      {/* Historial de Liquidaciones / Abonos de la Asociación */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
          {t('teacherPayouts.historyTitle')}
        </h2>
        {teacherPayoutHistory.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            {t('teacherPayouts.historyEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {teacherPayoutHistory.map(payout => (
              <div key={payout.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    {t('teacherPayouts.periodPrefix', { period: payout.periodMonth })}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {payout.settledDate ? t('teacherPayouts.settledOn', { date: payout.settledDate }) : t('teacherPayouts.inProgress')} ·{' '}
                    <span className="capitalize">{payout.paymentMethod}</span>
                    {payout.notes ? ` · ${payout.notes}` : ''}
                  </span>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-black tabular-nums text-sm text-slate-900 dark:text-white block">
                    {payout.totalSettled.toFixed(2)} €
                  </span>
                  {payout.status === 'settled' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('teacherPayouts.statusSettled')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5" />
                      {t('teacherPayouts.statusPending')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de Sesiones Registradas este mes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <span>{t('teacherPayouts.sessionsTitle', { period: selectedPeriod })}</span>
        </h2>
        {teacherSessions.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            {t('teacherPayouts.sessionsEmpty', { period: selectedPeriod })}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {teacherSessions.map(ses => {
              const act = activities.find(a => a.id === ses.activityId);
              return (
                <div key={ses.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {act?.name || t('teacherPayouts.defaultActivityName')} · {ses.date}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {ses.topic || t('teacherPayouts.noTopic')} · {t('teacherPayouts.durationMinutes', { minutes: ses.durationMinutes })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {t('teacherPayouts.attendeesCount', { count: ses.attendeesCount })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
