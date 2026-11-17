import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { NewsCarouselSection } from './NewsCarouselSection';
import { createTranslator } from '../lib/i18n';
import {
  Sparkles,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  GraduationCap,
  BookOpen,
  IdCard,
  X,
  MapPin,
  Camera
} from 'lucide-react';

interface SocioPortalViewProps {
  onNavigateToTab: (tab: string) => void;
  onNavigateHome?: () => void;
}

export const SocioPortalView: React.FC<SocioPortalViewProps> = ({
  onNavigateToTab,
  onNavigateHome
}) => {
  const {
    currentUser,
    currentRole,
    students,
    activities,
    teachers,
    cancelActivityEnrollmentRequest,
    promoteOrUpdateMemberRole,
    language
  } = useApp();
  const t = createTranslator(language);

  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);
  const [roleSwitchBusy, setRoleSwitchBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Control de acceso estricto: exclusivo para usuarios con role === 'socio' en public.profiles
  const isStrictSocio = Boolean(currentUser && currentUser.role === 'socio' && currentRole === 'socio');

  if (!isStrictSocio) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-500/30 bg-white dark:bg-slate-900 p-6 text-center shadow-sm space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
          {t('socioPortal.restrictedTitle')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {t('socioPortal.restrictedDescPart1')}{' '}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono font-bold">
            socio
          </code>{' '}
          {t('socioPortal.restrictedDescPart2')}{' '}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">public.profiles</code>.
        </p>
        {onNavigateHome && (
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
          >
            <span>{t('socioPortal.backToPortal')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  const emailNorm = (currentUser?.email || '').trim().toLowerCase();
  const linkedStudent = students.find(
    s =>
      (currentUser?.studentId && s.id === currentUser.studentId) ||
      s.profileId === currentUser?.id ||
      (emailNorm && s.email.trim().toLowerCase() === emailNorm)
  );

  const memberNumber = currentUser?.memberNumber || linkedStudent?.memberNumber;
  const startDate =
    currentUser?.startDate || linkedStudent?.startDate || linkedStudent?.registeredAt;
  const membershipStatus = linkedStudent?.status || 'active';

  const activeActivities = activities.filter(a => a.active);
  const pendingRequestedActivities = (linkedStudent?.pendingEnrollments || [])
    .map(enr => ({
      enrollment: enr,
      activity: activities.find(a => a.id === enr.activityId)
    }))
    .filter((item): item is { enrollment: NonNullable<typeof item.enrollment>; activity: NonNullable<typeof item.activity> } =>
      Boolean(item.activity)
    );

  const handleCancelRequest = async (activityId: string) => {
    if (!linkedStudent || cancellingActivityId) return;
    setCancellingActivityId(activityId);
    setFeedback(null);
    try {
      const res = await cancelActivityEnrollmentRequest(linkedStudent.id, activityId);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: t('socioPortal.cancelSuccess')
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || t('socioPortal.cancelErrorFallback')
        });
      }
    } finally {
      setCancellingActivityId(null);
    }
  };

  const handlePromoteRole = async (targetRole: 'student' | 'teacher' | 'teacher_student') => {
    if (roleSwitchBusy) return;
    setRoleSwitchBusy(targetRole);
    setFeedback(null);
    try {
      const res = await promoteOrUpdateMemberRole(targetRole);
      if (res.success) {
        onNavigateHome?.();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || t('socioPortal.promoteErrorFallback')
        });
      }
    } finally {
      setRoleSwitchBusy(null);
    }
  };

  const statusBadge =
    membershipStatus === 'active'
      ? {
          label: t('socioPortal.statuses.active'),
          cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
        }
      : membershipStatus === 'trial'
      ? {
          label: t('socioPortal.statuses.trial'),
          cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
        }
      : membershipStatus === 'pending_validation'
      ? {
          label: t('socioPortal.statuses.pendingValidation'),
          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
        }
      : {
          label: t('socioPortal.statuses.inactive'),
          cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'
        };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner de Bienvenida del Socio */}
      <div className="rounded-2xl border border-teal-500/25 bg-gradient-to-r from-teal-950/15 via-emerald-950/10 to-slate-900/15 dark:from-teal-950/40 dark:via-slate-900/60 dark:to-emerald-950/30 p-4 sm:p-5 shadow-xs backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative group shrink-0">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name}
                  className="h-14 w-14 rounded-2xl object-cover border-2 border-teal-500/40 shadow-md group-hover:border-teal-400 transition bg-white dark:bg-slate-900"
                />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-teal-600/20 border-2 border-teal-500/40 flex items-center justify-center text-teal-700 dark:text-teal-300 font-extrabold text-xl shadow-md group-hover:border-teal-400 transition">
                  {(currentUser?.name || 'S').charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => onNavigateToTab('profile')}
                title={t('socioPortal.changeAvatarTooltip')}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-xs hover:bg-teal-700 transition"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-300 tracking-wider">
                  {t('socioPortal.portalEyebrow')}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}
                >
                  {statusBadge.label}
                </span>
                {memberNumber && (
                  <span className="rounded-full bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">
                    {t('socioPortal.memberNumberBadge', { number: memberNumber })}
                  </span>
                )}
              </div>
              <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white truncate mt-0.5">
                {t('socioPortal.greeting', { name: currentUser?.name || '' })}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {startDate
                  ? t('socioPortal.subtitleWithDate', { date: startDate })
                  : t('socioPortal.subtitleDefault')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab('activities')}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('socioPortal.exploreWorkshops')}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPIs rápidos del Socio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('socioPortal.kpiMembershipTitle')}
            </span>
            <IdCard className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          </div>
          <p className="mt-1.5 text-lg font-black text-slate-900 dark:text-white">
            {memberNumber
              ? t('socioPortal.kpiMembershipNumber', { number: memberNumber })
              : t('socioPortal.kpiMembershipAssociated')}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {startDate
              ? t('socioPortal.kpiMembershipStartDate', { date: startDate })
              : t('socioPortal.kpiMembershipActiveDefault')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateToTab('activities')}
          className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs hover:border-emerald-400/60 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('socioPortal.kpiActiveWorkshopsTitle')}
            </span>
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
            {activeActivities.length}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            {t('socioPortal.kpiActiveWorkshopsHint')}
          </p>
        </button>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('socioPortal.kpiPendingRequestsTitle')}
            </span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
            {pendingRequestedActivities.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {pendingRequestedActivities.length === 0
              ? t('socioPortal.kpiPendingNone')
              : t('socioPortal.kpiPendingWaiting')}
          </p>
        </div>
      </div>

      {/* Solicitudes pendientes del socio (si ha solicitado plaza en talleres) */}
      {pendingRequestedActivities.length > 0 && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2 className="text-sm font-bold text-amber-950 dark:text-amber-200">
              {t('socioPortal.pendingRequestsSectionTitle', { count: pendingRequestedActivities.length })}
            </h2>
          </div>
          <div className="space-y-2">
            {pendingRequestedActivities.map(({ enrollment, activity }) => {
              const teacher = teachers.find(item => item.id === activity.teacherId);
              return (
                <div
                  key={activity.id}
                  className="rounded-xl border border-amber-500/25 bg-white dark:bg-slate-900 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        {activity.name}
                      </span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        {t('socioPortal.pendingConfirmBadge')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('socioPortal.requestMeta', {
                        teacher: teacher?.name || t('socioPortal.teacherUnassigned'),
                        date: enrollment.enrolledSince
                      })}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={cancellingActivityId === activity.id}
                    onClick={() => handleCancelRequest(activity.id)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition whitespace-nowrap disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>
                      {cancellingActivityId === activity.id
                        ? t('socioPortal.cancelling')
                        : t('socioPortal.cancelRequestButton')}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Accesos rápidos de navegación */}
      {/*<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigateToTab('calendar')}
          className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs hover:border-emerald-400/60 transition flex items-start gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Calendario y Horarios
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Consulta las sesiones programadas, horarios y eventos del centro.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab('activities')}
          className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs hover:border-emerald-400/60 transition flex items-start gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Clases y Talleres
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Descubre los talleres disponibles y solicita inscripción cuando quieras.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab('profile')}
          className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs hover:border-emerald-400/60 transition flex items-start gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Mi Perfil y Seguridad
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Edita tus datos, contraseña, biometría o cambia tu tipo de participación.
            </p>
          </div>
        </button>
      </div>*/}

      {/* Actividades destacadas de la asociación */}
      {/*<div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Talleres y Actividades en A.C.TRISKELL</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Al inscribirte en un taller, tu perfil pasará automáticamente a incluir tu acceso de Alumno.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('activities')}
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            Ver todos →
          </button>
        </div>

        {activeActivities.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Actualmente no hay talleres activos publicados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeActivities.slice(0, 4).map(act => {
              const teacher = teachers.find(t => t.id === act.teacherId);
              return (
                <div
                  key={act.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {act.name}
                      </h3>
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        {act.billingMode === 'per_class'
                          ? `${act.defaultPricePerClass}€/clase`
                          : `${act.defaultPriceMonthly}€/mes`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                      <span>Monitor: {teacher?.name || 'Por asignar'}</span>
                      {act.room && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" /> {act.room}
                        </span>
                      )}
                    </p>
                    {act.schedule.length > 0 && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                        {act.schedule.join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>*/}

      {/* Autogestión rápida de participación */}
      {/*<div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Participación en la Asociación
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ¿Quieres asistir a clases o impartir un taller? Actualiza tu perfil en un clic.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={Boolean(roleSwitchBusy)}
            onClick={() => handlePromoteRole('student')}
            className="rounded-xl border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-left hover:border-emerald-500 transition disabled:opacity-60"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <BookOpen className="h-4 w-4" />
              <span>{roleSwitchBusy === 'student' ? 'Activando...' : 'Pasar a Alumno'}</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Accede al Portal de Alumno para ver tus cuotas e inscripciones.
            </p>
          </button>

          <button
            type="button"
            disabled={Boolean(roleSwitchBusy)}
            onClick={() => handlePromoteRole('teacher')}
            className="rounded-xl border border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 p-3 text-left hover:border-indigo-500 transition disabled:opacity-60"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300">
              <GraduationCap className="h-4 w-4" />
              <span>{roleSwitchBusy === 'teacher' ? 'Activando...' : 'Pasar a Monitor'}</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Habilita tu ficha de monitor para gestionar clases y grupos.
            </p>
          </button>

          <button
            type="button"
            disabled={Boolean(roleSwitchBusy)}
            onClick={() => handlePromoteRole('teacher_student')}
            className="rounded-xl border border-sky-500/30 bg-sky-50/70 dark:bg-sky-950/30 p-3 text-left hover:border-sky-500 transition disabled:opacity-60"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800 dark:text-sky-300">
              <Sparkles className="h-4 w-4" />
              <span>
                {roleSwitchBusy === 'teacher_student' ? 'Activando...' : 'Monitor-Alumno'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Combina ambos portales si impartes talleres y también asistes a clases.
            </p>
          </button>
        </div>
      </div>*/}

      {/* Notas y Comunicados */}
      <NewsCarouselSection />
    </div>
  );
};
