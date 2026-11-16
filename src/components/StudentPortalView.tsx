import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  MapPin,
  ChevronDown,
  ChevronUp,
  Info,
  Smartphone,
  Copy,
  Check,
  X
} from 'lucide-react';
import { Activity } from '../types';
import { NewsCarouselSection } from './NewsCarouselSection';

interface StudentPortalViewProps {}

export const StudentPortalView: React.FC<StudentPortalViewProps> = () => {
  const {
    students,
    activities,
    teachers,
    payments,
    selectedPeriod,
    currentStudentId,
    setCurrentStudentId,
    currentRole,
    currentUser,
    cancelActivityEnrollmentRequest,
    language
  } = useApp();
  const t = createTranslator(language);

  // Estado del acordeón único "Cuotas" (replegado por defecto)
  const [isCuotasOpen, setIsCuotasOpen] = useState(false);
  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);

  // Modal / Detalle de "Datos actividad"
  const [selectedActivityForModal, setSelectedActivityForModal] = useState<Activity | null>(null);
  const [copiedBizum, setCopiedBizum] = useState(false);

  const currentStudent =
    (currentRole !== 'admin' && currentUser
      ? students.find(
          s =>
            (currentUser.studentId && s.id === currentUser.studentId) ||
            s.profileId === currentUser.id ||
            (currentUser.email &&
              s.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined) ||
    students.find(s => s.id === currentStudentId) ||
    students[0];

  // Actividades en las que está matriculado este alumno
  const enrolledActivities = activities.filter(act =>
    currentStudent?.activities.some(enroll => enroll.activityId === act.id)
  );

  // Solicitudes de inscripción pendientes enviadas por este alumno
  const pendingRequestedActivities = (currentStudent?.pendingEnrollments || [])
    .map(enr => ({
      enrollment: enr,
      activity: activities.find(a => a.id === enr.activityId)
    }))
    .filter(item => Boolean(item.activity));

  // Pagos del alumno en todos los períodos y en el período actual
  const myAllPayments = payments.filter(p => p.studentId === currentStudent?.id);
  const myPeriodPayments = myAllPayments.filter(p => p.periodMonth === selectedPeriod);
  const periodPendingCount = myPeriodPayments.filter(
    p => p.status === 'pending' || p.status === 'overdue'
  ).length;
  const periodPartialCount = myPeriodPayments.filter(p => p.status === 'partial').length;
  const globalPendingCount = myAllPayments.filter(
    p => p.status === 'pending' || p.status === 'overdue'
  ).length;
  const globalPartialCount = myAllPayments.filter(p => p.status === 'partial').length;

  const pendingCount = globalPendingCount;
  const partialCount = globalPartialCount;
  const otherPeriodUnsettled = myAllPayments.filter(
    p =>
      p.periodMonth !== selectedPeriod &&
      (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
  );

  // Historial completo de recibos liquidados
  const myAllPaidPayments = myAllPayments.filter(p => p.status === 'paid');

  const handleCopyBizum = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedBizum(true);
    setTimeout(() => setCopiedBizum(false), 2000);
  };

  const getActivityPaymentBadge = (activityId: string) => {
    const actPayments = myPeriodPayments.filter(p => p.activityId === activityId);
    if (actPayments.some(p => p.status === 'overdue')) {
      return {
        label: t('studentPortal.badges.overdue'),
        className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        icon: 'alert' as const
      };
    }
    if (actPayments.some(p => p.status === 'partial')) {
      return {
        label: t('studentPortal.badges.partial'),
        className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
        icon: 'partial' as const
      };
    }
    if (actPayments.some(p => p.status === 'pending')) {
      return {
        label: t('studentPortal.badges.pending'),
        className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        icon: 'clock' as const
      };
    }
    if (actPayments.some(p => p.status === 'paid')) {
      return {
        label: t('studentPortal.badges.paid'),
        className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        icon: 'paid' as const
      };
    }
    return {
      label: t('studentPortal.badges.none'),
      className: 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/60 dark:border-slate-700',
      icon: 'none' as const
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner de Bienvenida del Alumno */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-slate-900/40 to-emerald-900/10 p-3.5 sm:p-5 shadow-xs backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-extrabold text-lg sm:text-xl shadow-xs shrink-0">
              {currentStudent?.name.charAt(0) || 'A'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                  {t('studentPortal.portalTitle')}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {enrolledActivities.length === 1
                    ? t('studentPortal.workshopSingular', { count: enrolledActivities.length })
                    : t('studentPortal.workshopPlural', { count: enrolledActivities.length })}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {t('studentPortal.greeting', { name: currentStudent?.name || '' })}
              </h2>
              <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
                {t('studentPortal.greetingSubtitle')}
              </p>
            </div>
          </div>

          {/* Selector de alumno para simulación rápida (solo Administrador) */}
          {currentRole === 'admin' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentPortal.viewAs')}</span>
              <select
                value={currentStudentId}
                onChange={e => setCurrentStudentId(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN 1: Tus Actividades (Matriculadas + Solicitudes Pendientes agrupadas) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-5 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{t('studentPortal.yourActivitiesTitle')}</span>
                <span className="hidden sm:inline">{t('studentPortal.yourActivitiesSchedules')}</span>
              </h3>
              <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
                {t('studentPortal.yourActivitiesSubtitle')}
              </p>
            </div>

            {pendingRequestedActivities.length > 0 && (
              <span className="sm:hidden inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap shrink-0">
                <Clock className="h-3 w-3" />
                {pendingRequestedActivities.length === 1
                  ? t('studentPortal.pendingCountMobileOne', { count: pendingRequestedActivities.length })
                  : t('studentPortal.pendingCountMobileMany', { count: pendingRequestedActivities.length })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {pendingRequestedActivities.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                <Clock className="h-3 w-3" />
                {pendingRequestedActivities.length === 1
                  ? t('studentPortal.pendingCountDesktopOne', { count: pendingRequestedActivities.length })
                  : t('studentPortal.pendingCountDesktopMany', { count: pendingRequestedActivities.length })}
              </span>
            )}
            <span className="hidden sm:inline text-[11px] text-slate-400 font-medium">
              {t('studentPortal.tapActivityDataHint')}
            </span>
          </div>
        </div>

        {enrolledActivities.length === 0 && pendingRequestedActivities.length === 0 ? (
          <div className="py-6 sm:py-8 text-center text-xs text-slate-400">
            {t('studentPortal.noEnrolledActivities')}
          </div>
        ) : (
          <div className="space-y-4">
            {enrolledActivities.length > 0 && (
              <>
                {/* Vista Móvil Simplificada (2 líneas por actividad) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 -mx-1">
                  {enrolledActivities.map(act => {
                    const teacher = teachers.find(item => item.id === act.teacherId);
                    const paymentBadge = getActivityPaymentBadge(act.id);
                    const scheduleSummary = act.schedule.length > 0 ? act.schedule.join(', ') : t('studentPortal.noSchedule');

                    return (
                      <div key={act.id} className="py-3 px-1 space-y-1.5">
                        {/* Línea 1: Actividad - Profesor y botón Info */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 text-xs leading-snug truncate">
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              {act.name}
                            </span>
                            <span className="mx-1.5 text-slate-400">-</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {teacher?.name || t('studentPortal.noTeacher')}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedActivityForModal(act)}
                            title={t('studentPortal.activityDataButton')}
                            aria-label={t('studentPortal.activityDataAria', { name: act.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition shrink-0 active:scale-95"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Línea 2: Ubicación - Horario y estado de pago */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="truncate">
                              <strong className="font-semibold text-slate-700 dark:text-slate-300">
                                {act.room || t('studentPortal.noRoom')}
                              </strong>
                              <span className="mx-1 text-slate-400">-</span>
                              <span>{scheduleSummary}</span>
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 whitespace-nowrap ${paymentBadge.className}`}
                          >
                            {paymentBadge.icon === 'paid' && <CheckCircle2 className="h-3 w-3" />}
                            {paymentBadge.icon === 'partial' && <Clock className="h-3 w-3" />}
                            {paymentBadge.icon === 'alert' && <AlertCircle className="h-3 w-3" />}
                            {paymentBadge.icon === 'clock' && <Clock className="h-3 w-3" />}
                            <span>{paymentBadge.label}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Vista Escritorio Completa */}
                <div className="hidden md:grid grid-cols-2 gap-4">
                  {enrolledActivities.map(act => {
                    const teacher = teachers.find(item => item.id === act.teacherId);
                    return (
                      <div
                        key={act.id}
                        className="rounded-xl border border-slate-200/90 dark:border-slate-800 p-4 bg-slate-50/60 dark:bg-slate-800/30 hover:border-emerald-500/40 transition space-y-3.5"
                      >
                        {/* Encabezado actividad */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                              {act.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                {act.billingMode === 'per_class' ? t('studentPortal.billingPerClass') : t('studentPortal.billingMonthly')}
                              </span>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {t('studentPortal.roomPrefix')} <strong className="text-slate-700 dark:text-slate-300">{act.room}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed line-clamp-2">
                          {act.description}
                        </p>

                        {/* Monitor asignado con Foto/Avatar visible */}
                        <div className="rounded-xl bg-white dark:bg-slate-800/80 p-2.5 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            {(teacher?.avatarUrl || teacher?.avatar) ? (
                              <img
                                src={teacher.avatarUrl || teacher.avatar}
                                alt={teacher.name}
                                className="h-10 w-10 rounded-full object-cover border-2 border-emerald-500/50 shadow-xs"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                                {teacher?.name.charAt(0) || 'M'}
                              </div>
                            )}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                {t('studentPortal.responsibleTeacher')}
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {teacher?.name}
                              </span>
                              {teacher?.phone && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                  {teacher.phone}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Botón "Datos actividad" */}
                          <button
                            onClick={() => setSelectedActivityForModal(act)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 dark:hover:text-white px-3 py-1.5 text-xs font-bold transition min-h-[38px] active:scale-95"
                          >
                            <Info className="h-3.5 w-3.5" />
                            <span>{t('studentPortal.activityDataButton')}</span>
                          </button>
                        </div>

                        {/* Horarios de asistencia */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-slate-400 font-medium mr-1">{t('studentPortal.schedulePrefix')}</span>
                          {act.schedule.map((sch, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                            >
                              <Clock className="h-3 w-3" />
                              {sch}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Sub-bloque agrupado: Solicitudes de inscripción pendientes */}
            {pendingRequestedActivities.length > 0 && currentStudent && (
              <div
                className={`${
                  enrolledActivities.length > 0 ? 'pt-3 border-t border-slate-100 dark:border-slate-800' : ''
                }`}
              >
                <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 p-3 sm:p-3.5 space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{t('studentPortal.pendingConfirmTitle', { count: pendingRequestedActivities.length })}</span>
                  </h4>
                  <div className="divide-y divide-amber-500/20">
                    {pendingRequestedActivities.map(({ enrollment, activity }) => {
                      if (!activity) return null;
                      const teacherItem = teachers.find(tc => tc.id === activity.teacherId);
                      const isBusy = cancellingActivityId === activity.id;
                      return (
                        <div
                          key={activity.id}
                          className="py-2 first:pt-1 last:pb-0 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 dark:text-white truncate block">
                              {activity.name}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                              {teacherItem?.name ? `${teacherItem.name} · ` : ''}{t('studentPortal.requestedOn', { date: enrollment.enrolledSince })}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setCancellingActivityId(activity.id);
                              try {
                                await cancelActivityEnrollmentRequest(currentStudent.id, activity.id);
                              } finally {
                                setCancellingActivityId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0 whitespace-nowrap disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>{isBusy ? t('studentPortal.cancelling') : t('studentPortal.cancel')}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: Acordeón Único "Cuotas" (replegado por defecto con Estado de tus cuotas + Histórico de pagos) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsCuotasOpen(!isCuotasOpen)}
          aria-expanded={isCuotasOpen}
          aria-label={isCuotasOpen ? t('studentPortal.feesAccordionCollapseAria') : t('studentPortal.feesAccordionExpandAria')}
          className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
              💳
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('studentPortal.feesTitle')}
                </h3>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {pendingCount === 1
                      ? t('studentPortal.pendingCountMobileOne', { count: pendingCount })
                      : t('studentPortal.pendingCountMobileMany', { count: pendingCount })}
                  </span>
                )}
                {partialCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {partialCount === 1
                      ? t('studentPortal.partialCountOne', { count: partialCount })
                      : t('studentPortal.partialCountMany', { count: partialCount })}
                  </span>
                )}
                {pendingCount === 0 && partialCount === 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {t('studentPortal.upToDate')}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                  {myAllPaidPayments.length === 1
                    ? t('studentPortal.receiptSingular', { count: myAllPaidPayments.length })
                    : t('studentPortal.receiptPlural', { count: myAllPaidPayments.length })}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {isCuotasOpen
                  ? t('studentPortal.feesSubtitleOpen', { period: selectedPeriod })
                  : t('studentPortal.feesSubtitleClosed', { period: selectedPeriod })}
              </p>
            </div>
          </div>

          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
          >
            {isCuotasOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </span>
        </button>

        {isCuotasOpen && (
          <div className="p-3.5 sm:p-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-6">
            {/* Bloque 1: Estado de tus cuotas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('studentPortal.feesStatusHeading', { period: selectedPeriod })}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {myPeriodPayments.length === 0 ? (
                  <div className="col-span-full py-5 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    {t('studentPortal.noFeesThisMonth')}
                  </div>
                ) : (
                  myPeriodPayments.map(p => {
                    const isPaid = p.status === 'paid';
                    const isPartial = p.status === 'partial';
                    const act = activities.find(a => a.id === p.activityId);

                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-4 transition ${
                          isPaid
                            ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : isPartial
                            ? 'border-orange-500/30 bg-orange-50/40 dark:bg-orange-950/20'
                            : 'border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[10px] text-slate-400 font-semibold block">
                              {p.receiptNumber}
                            </span>
                            <h5 className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
                              {p.activityName}
                            </h5>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t('studentPortal.monthLabel', { month: p.periodMonth })}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xl font-black text-slate-900 dark:text-white block whitespace-nowrap">
                              {p.amount.toFixed(2)} €
                            </span>
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs whitespace-nowrap">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                {t('studentPortal.statusPaid')}
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center gap-1 font-bold text-orange-600 dark:text-orange-400 text-xs whitespace-nowrap">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                {t('studentPortal.statusPartial')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 text-xs whitespace-nowrap">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                {t('studentPortal.statusPending')}
                              </span>
                            )}
                          </div>
                        </div>

                        {isPaid ? (
                          <div className="mt-4 pt-3 border-t border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-600 dark:text-slate-300 text-xs font-medium min-w-0">
                              {t('studentPortal.paidOnLabel', {
                                date: p.paymentDate || '',
                                method: p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod || '',
                                teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                              })}
                            </span>
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs whitespace-nowrap shrink-0">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              {t('studentPortal.verifiedBadge')}
                            </span>
                          </div>
                        ) : isPartial ? (
                          <div className="mt-4 pt-3 border-t border-orange-200/60 dark:border-orange-800/40 text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-orange-800 dark:text-orange-300 font-medium">
                              <span className="min-w-0">
                                {t('studentPortal.partialOnLabel', {
                                  date: p.paymentDate || '—',
                                  method: p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod || '',
                                  teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                                })}
                              </span>
                              <span className="font-bold whitespace-nowrap shrink-0">{t('studentPortal.remainderPending')}</span>
                            </div>
                            {p.notes && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.notes}</p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 text-xs space-y-2">
                            <p className="text-amber-800 dark:text-amber-300 font-medium">
                              {t('studentPortal.paymentInstructions')}
                            </p>

                            {act?.bizum_enabled && act.bizum_phone ? (
                              <div className="rounded-lg bg-white/90 dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-amber-300 dark:border-amber-800 flex items-center justify-between">
                                <div>
                                  <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-sans font-bold">
                                    {t('studentPortal.directWorkshopBizum')}
                                  </span>
                                  <strong>{act.bizum_phone}</strong> ({act.bizum_concept || p.receiptNumber})
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyBizum(act.bizum_phone!)}
                                  className="p-1 text-slate-500 hover:text-slate-900"
                                  title={t('studentPortal.copyBizumTooltip')}
                                >
                                  {copiedBizum ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            ) : (
                              <div className="rounded-lg bg-white/80 dark:bg-slate-900/60 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200 dark:border-amber-800">
                                {t('studentPortal.associationBizumPrefix')} <strong>+34 600 123 456</strong> ({t('studentPortal.conceptPrefix')} {p.receiptNumber})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {otherPeriodUnsettled.length > 0 && (
                <div className="pt-3 space-y-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {t('studentPortal.otherPeriodsHeading', { count: otherPeriodUnsettled.length })}
                  </h5>
                  <div className="divide-y divide-amber-500/20 rounded-xl border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/15 px-3 text-xs">
                    {otherPeriodUnsettled.map(p => (
                      <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white block truncate">
                            {p.activityName} · {p.periodMonth}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {p.receiptNumber}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-slate-900 dark:text-white block whitespace-nowrap">
                            {p.amount.toFixed(2)} €
                          </span>
                          <span
                            className={`text-[10px] font-bold whitespace-nowrap ${
                              p.status === 'partial'
                                ? 'text-orange-600 dark:text-orange-400'
                                : p.status === 'overdue'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {p.status === 'partial'
                              ? t('studentPortal.badges.partial')
                              : p.status === 'overdue'
                              ? t('studentPortal.badges.overdue')
                              : t('studentPortal.badges.pending')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bloque 2: Histórico de pagos */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('studentPortal.paymentHistoryTitle')}
                </h4>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap">
                  {myAllPaidPayments.length === 1
                    ? t('studentPortal.receiptSingular', { count: myAllPaidPayments.length })
                    : t('studentPortal.receiptPlural', { count: myAllPaidPayments.length })}
                </span>
              </div>

              {myAllPaidPayments.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  {t('studentPortal.noHistoricalPayments')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {myAllPaidPayments.map(p => (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold block">
                          {p.receiptNumber}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white block truncate">
                          {p.activityName} · {p.periodMonth}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {t('studentPortal.historicalPaidOn', {
                            date: p.paymentDate || '',
                            method: p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod || '',
                            teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                          {p.amount.toFixed(2)} €
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          {t('studentPortal.settledBadge')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 3: Notas y comunicados en carrusel horizontal */}
      <NewsCarouselSection compact />

      {/* Modal / Ficha Informativa "Datos Actividad" (Revela Importe y Datos de Bizum) */}
      {selectedActivityForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('studentPortal.modal.cardBadge')}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {selectedActivityForModal.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedActivityForModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Importe desglosado */}
            <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-500/20 p-4">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">
                {t('studentPortal.modal.officialFee')}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {(selectedActivityForModal.billingMode === 'per_class'
                    ? selectedActivityForModal.defaultPricePerClass
                    : selectedActivityForModal.defaultPriceMonthly
                  ).toFixed(2)} €
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {selectedActivityForModal.billingMode === 'per_class'
                    ? t('studentPortal.modal.unitPerClass')
                    : t('studentPortal.modal.unitPerMonth')}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                {t('studentPortal.modal.modalityLabel')}{' '}
                <strong>
                  {selectedActivityForModal.billingMode === 'per_class'
                    ? t('studentPortal.modal.modalityPerClass')
                    : t('studentPortal.modal.modalityMonthly')}
                </strong>
              </p>
            </div>

            {/* Parámetros Bizum si están activos */}
            {selectedActivityForModal.bizum_enabled && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 font-bold text-xs">
                  <Smartphone className="h-4 w-4" />
                  <span>{t('studentPortal.modal.directBizumTitle')}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">{t('studentPortal.modal.bizumNumberLabel')}</span>
                    <strong className="text-slate-900 dark:text-white font-mono text-sm">
                      {selectedActivityForModal.bizum_phone || t('studentPortal.modal.askTeacher')}
                    </strong>
                  </div>
                  {selectedActivityForModal.bizum_phone && (
                    <button
                      onClick={() => handleCopyBizum(selectedActivityForModal.bizum_phone!)}
                      className="inline-flex items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-900/60 px-2 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300"
                    >
                      {copiedBizum ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedBizum ? t('studentPortal.modal.copied') : t('studentPortal.modal.copy')}</span>
                    </button>
                  )}
                </div>
                {selectedActivityForModal.bizum_concept && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('studentPortal.modal.recommendedConcept')} <strong>{selectedActivityForModal.bizum_concept}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Datos de la sala y monitor */}
            <div className="text-xs space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>{t('studentPortal.modal.locationRoomLabel')}</span>
                <strong className="text-slate-800 dark:text-slate-200">{selectedActivityForModal.room}</strong>
              </div>
              <div className="flex justify-between">
                <span>{t('studentPortal.modal.schedulesLabel')}</span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {selectedActivityForModal.schedule.join(' | ')}
                </strong>
              </div>
              {(() => {
                const teacherItem = teachers.find(tch => tch.id === selectedActivityForModal.teacherId);
                return (
                  <div className="flex justify-between items-center pt-1">
                    <span>{t('studentPortal.modal.teacherLabel')}</span>
                    <strong className="text-slate-800 dark:text-slate-200">{teacherItem?.name}</strong>
                  </div>
                );
              })()}
            </div>

            <button
              onClick={() => setSelectedActivityForModal(null)}
              className="w-full rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 text-xs transition"
            >
              {t('studentPortal.modal.closeCard')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
