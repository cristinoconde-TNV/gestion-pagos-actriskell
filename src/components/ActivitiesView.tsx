import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { Activity } from '../types';
import {
  Plus,
  Users,
  Clock,
  Edit2,
  Trash2,
  CheckCircle2,
  Send,
  GraduationCap,
  MessageCircle,
  UserMinus,
  AlertTriangle,
  X,
  Check,
  Loader2
} from 'lucide-react';
import { TeacherWorkshopsSection } from './TeacherPortalView';

interface ActivitiesViewProps {
  onOpenAddActivity: (activity?: Activity) => void;
  onOpenAddStudent: () => void;
  onOpenEnrollStudent?: (activityId?: string) => void;
}

export const ActivitiesView: React.FC<ActivitiesViewProps> = ({
  onOpenAddActivity,
  onOpenAddStudent,
  onOpenEnrollStudent
}) => {
  const {
    activities,
    teachers,
    students,
    periodPayments,
    deleteActivity,
    unenrollStudentFromActivity,
    requestActivityEnrollment,
    cancelActivityEnrollmentRequest,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    currentRole,
    currentTeacherId,
    currentStudentId,
    currentUser,
    language
  } = useApp();
  const t = createTranslator(language);

  const currentTeacher = teachers.find(item => item.id === currentTeacherId);

  const currentStudent = useMemo(() => {
    const emailNorm = (currentUser?.email || '').trim().toLowerCase();
    return (
      students.find(
        s =>
          (currentUser?.studentId && s.id === currentUser.studentId) ||
          (currentUser?.id && s.profileId === currentUser.id) ||
          (emailNorm && s.email.trim().toLowerCase() === emailNorm)
      ) ||
      students.find(s => s.id === currentStudentId) ||
      undefined
    );
  }, [students, currentUser, currentStudentId]);

  const isAdmin = currentRole === 'admin';
  const isTeacher = currentRole === 'teacher';
  const isStudent = currentRole === 'student';
  const isSocio = currentRole === 'socio';
  const isUnion = currentRole === 'teacher_student';

  // Filtro interno para monitor-alumno (unión de asignadas + disponibles para solicitar)
  const [unionFilter, setUnionFilter] = useState<'all' | 'assigned' | 'request'>('all');

  const storageKey = `triskell_activity_requests_${currentUser?.id || currentStudentId || 'guest'}`;
  const [legacyRequestedIds, setLegacyRequestedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyActivityKey, setBusyActivityKey] = useState<string | null>(null);
  const [optimisticPendingIds, setOptimisticPendingIds] = useState<Record<string, boolean>>({});
  const [optimisticCancelledIds, setOptimisticCancelledIds] = useState<Record<string, boolean>>({});
  const inFlightRequestRef = useRef<
    Record<string, Promise<{ success: boolean; error?: string; studentId?: string }>>
  >({});
  const resolvedStudentIdsRef = useRef<Record<string, string>>({});
  const [pendingRemoval, setPendingRemoval] = useState<{
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
  } | null>(null);
  const [pendingActivityDelete, setPendingActivityDelete] = useState<Activity | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const removeLegacyRequestId = (actId: string) => {
    setLegacyRequestedIds(prev => {
      const next = prev.filter(id => id !== actId);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignorar
      }
      return next;
    });
  };

  const handleConfirmUnenroll = async () => {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    setErrorMsg(null);
    try {
      const res = await unenrollStudentFromActivity(
        pendingRemoval.studentId,
        pendingRemoval.activityId
      );
      if (res.success) {
        setFeedbackMsg(
          t('activitiesView.removeSuccess', {
            name: pendingRemoval.studentName,
            activity: pendingRemoval.activityName
          })
        );
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('activitiesView.removeErrorFallback'));
      }
      setPendingRemoval(null);
    } finally {
      setIsRemoving(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setLegacyRequestedIds(raw ? JSON.parse(raw) : []);
    } catch {
      setLegacyRequestedIds([]);
    }
  }, [storageKey]);

  const handleRequestEnrollment = async (act: Activity) => {
    // Cambio visual inmediato al pulsar: "Solicitar inscripción" -> "Solicitud pendiente" + botón Cancelar
    setOptimisticPendingIds(prev => ({ ...prev, [act.id]: true }));
    setOptimisticCancelledIds(prev => {
      if (!prev[act.id]) return prev;
      const next = { ...prev };
      delete next[act.id];
      return next;
    });
    setBusyActivityKey(`req:${act.id}`);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const reqPromise = requestActivityEnrollment(act.id, currentStudent?.id);
      inFlightRequestRef.current[act.id] = reqPromise;
      const res = await reqPromise;
      if (res.studentId) {
        resolvedStudentIdsRef.current[act.id] = res.studentId;
      }
      if (res.success) {
        removeLegacyRequestId(act.id);
        setFeedbackMsg(
          t('activitiesView.requestSentSuccess', { activity: act.name })
        );
        setTimeout(() => setFeedbackMsg(null), 5000);
      } else {
        setOptimisticPendingIds(prev => {
          const next = { ...prev };
          delete next[act.id];
          return next;
        });
        setErrorMsg(res.error || t('activitiesView.requestSentError', { activity: act.name }));
      }
    } finally {
      delete inFlightRequestRef.current[act.id];
      setBusyActivityKey(prev => (prev === `req:${act.id}` ? null : prev));
    }
  };

  const handleCancelRequest = async (act: Activity) => {
    setOptimisticCancelledIds(prev => ({ ...prev, [act.id]: true }));
    setOptimisticPendingIds(prev => {
      if (!prev[act.id]) return prev;
      const next = { ...prev };
      delete next[act.id];
      return next;
    });
    setBusyActivityKey(`cancel:${act.id}`);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      let targetStudentId =
        currentStudent?.id || currentStudentId || resolvedStudentIdsRef.current[act.id];

      const inFlight = inFlightRequestRef.current[act.id];
      if (inFlight) {
        const reqRes = await inFlight;
        if (reqRes.studentId) {
          targetStudentId = reqRes.studentId;
          resolvedStudentIdsRef.current[act.id] = reqRes.studentId;
        }
        // Si la petición inicial falló y ni siquiera se guardó en BD, ya quedó cancelada localmente
        if (!reqRes.success) {
          removeLegacyRequestId(act.id);
          return;
        }
      }

      if (targetStudentId) {
        const hasDbPending = (currentStudent?.pendingEnrollments || []).some(
          e => e.activityId === act.id
        );
        if (hasDbPending || Boolean(resolvedStudentIdsRef.current[act.id]) || Boolean(inFlight)) {
          const res = await cancelActivityEnrollmentRequest(targetStudentId, act.id);
          if (!res.success) {
            setOptimisticCancelledIds(prev => {
              const next = { ...prev };
              delete next[act.id];
              return next;
            });
            setErrorMsg(res.error || t('activitiesView.cancelRequestError'));
            return;
          }
        }
      }
      removeLegacyRequestId(act.id);
      setFeedbackMsg(t('activitiesView.cancelRequestSuccess', { activity: act.name }));
      setTimeout(() => setFeedbackMsg(null), 4000);
    } finally {
      setBusyActivityKey(prev => (prev === `cancel:${act.id}` ? null : prev));
    }
  };

  const handleConfirmPendingEnrollment = async (
    studentId: string,
    studentName: string,
    act: Activity
  ) => {
    setBusyActivityKey(`confirm:${studentId}:${act.id}`);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await confirmActivityEnrollment(studentId, act.id);
      if (res.success) {
        setFeedbackMsg(t('activitiesView.confirmSuccess', { name: studentName, activity: act.name }));
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('activitiesView.confirmError'));
      }
    } finally {
      setBusyActivityKey(null);
    }
  };

  const handleRejectPendingEnrollment = async (
    studentId: string,
    studentName: string,
    act: Activity
  ) => {
    setBusyActivityKey(`reject:${studentId}:${act.id}`);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await rejectActivityEnrollment(studentId, act.id);
      if (res.success) {
        setFeedbackMsg(t('activitiesView.rejectSuccess', { name: studentName, activity: act.name }));
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('activitiesView.rejectError'));
      }
    } finally {
      setBusyActivityKey(null);
    }
  };

  // Filtrado de actividades según rol
  const visibleActivities = useMemo(() => {
    if (isAdmin) return activities;
    if (isTeacher) {
      return activities.filter(act => act.teacherId === currentTeacher?.id);
    }
    if (isStudent || isSocio) {
      return activities.filter(act => act.active !== false);
    }
    // teacher_student (unión)
    if (unionFilter === 'assigned') {
      return activities.filter(act => act.teacherId === currentTeacher?.id);
    }
    if (unionFilter === 'request') {
      return activities.filter(act => act.active !== false && act.teacherId !== currentTeacher?.id);
    }
    return activities.filter(act => act.active !== false || act.teacherId === currentTeacher?.id);
  }, [activities, isAdmin, isTeacher, isStudent, isSocio, isUnion, unionFilter, currentTeacher?.id]);

  // Vista dedicada para el Monitor ("Mis talleres & Alumnos")
  if (isTeacher) {
    return (
      <TeacherWorkshopsSection
        onOpenAddActivity={(act) => onOpenAddActivity(act)}
        onOpenAddStudent={onOpenAddStudent}
        onOpenEnrollStudent={onOpenEnrollStudent}
      />
    );
  }

  const headerSubtitle = useMemo(() => {
    if (isAdmin) return t('activitiesView.subtitles.admin');
    if (isTeacher) return t('activitiesView.subtitles.teacher');
    if (isStudent || isSocio) return t('activitiesView.subtitles.student');
    return t('activitiesView.subtitles.union');
  }, [isAdmin, isTeacher, isStudent, isSocio, t]);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t('activitiesView.title', { count: visibleActivities.length })}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {headerSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isUnion && (
            <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">
              {[
                { id: 'all', label: t('activitiesView.unionFilters.all') },
                { id: 'assigned', label: t('activitiesView.unionFilters.assigned') },
                { id: 'request', label: t('activitiesView.unionFilters.request') }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUnionFilter(opt.id as 'all' | 'assigned' | 'request')}
                  className={`rounded-lg px-2.5 py-1 transition whitespace-nowrap ${
                    unionFilter === opt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {isAdmin && (
            <button
              onClick={() => onOpenAddActivity()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>{t('activitiesView.createActivityButton')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmación / Error */}
      {feedbackMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 p-3.5 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Estado vacío */}
      {visibleActivities.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-500 dark:text-slate-400">
          {isTeacher
            ? t('activitiesView.emptyTeacher')
            : t('activitiesView.emptyDefault')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visibleActivities.map(act => {
            const teacher = teachers.find(item => item.id === act.teacherId);
            const isAssignedToMe = act.teacherId === currentTeacher?.id;
            const isEnrolledAsStudent = Boolean(
              currentStudent?.activities.some(a => a.activityId === act.id)
            );
            const isDbRequested = Boolean(
              (currentStudent?.pendingEnrollments || []).some(a => a.activityId === act.id)
            );
            const isRequested = optimisticPendingIds[act.id]
              ? true
              : optimisticCancelledIds[act.id]
              ? false
              : isDbRequested || legacyRequestedIds.includes(act.id);

            const enrolledStudents = students.filter(s =>
              s.activities.some(a => a.activityId === act.id)
            );
            const pendingRequestsForActivity = students.filter(s =>
              (s.pendingEnrollments || []).some(p => p.activityId === act.id)
            );

            // Recaudación mensual visible solo para administración
            const activityRevenue = periodPayments
              .filter(p => p.activityId === act.id && (p.status === 'paid' || p.status === 'partial'))
              .reduce((acc, p) => acc + p.amount, 0);

            const showRosterAndManagement = isAdmin || ((isTeacher || isUnion) && isAssignedToMe);
            const showRequestAction = isStudent || isSocio || (isUnion && !isAssignedToMe);

            return (
              <div
                key={act.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  {/* Cabecera Actividad */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                          {act.category}
                        </span>
                        {(isTeacher || isUnion) && isAssignedToMe && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                            <GraduationCap className="h-3 w-3" />
                            {t('activitiesView.assignedBadge')}
                          </span>
                        )}
                        {showRosterAndManagement && pendingRequestsForActivity.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                            <Clock className="h-3 w-3" />
                            {pendingRequestsForActivity.length === 1
                              ? t('activitiesView.requestSingular', { count: pendingRequestsForActivity.length })
                              : t('activitiesView.requestPlural', { count: pendingRequestsForActivity.length })}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                        {act.name}
                      </h3>
                    </div>

                    {(isAdmin || ((isTeacher || isUnion) && isAssignedToMe)) && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenAddActivity(act)}
                          title={t('activitiesView.editTooltip')}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setPendingActivityDelete(act)}
                            title={t('activitiesView.deleteTooltip')}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {act.description}
                  </p>

                  {/* Detalles clave */}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        {t('activitiesView.monitorLabel')}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                        {teacher?.name || t('activitiesView.noTeacher')}
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        {t('activitiesView.roomLabel')}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                        {act.room}
                      </span>
                    </div>
                  </div>

                  {/* Horarios */}
                  <div className="mt-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      {t('activitiesView.scheduleLabel')}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {act.schedule.map((sch, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                        >
                          <Clock className="h-3 w-3 text-emerald-600" />
                          {sch}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Tarifas (y recaudación solo para Admin) */}
                  <div className="mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 text-[11px]">{t('activitiesView.ratesLabel')}</span>
                      <div className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {t('activitiesView.rateSummary', {
                          monthly: act.defaultPriceMonthly,
                          perClass: act.defaultPricePerClass
                        })}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="text-right">
                        <span className="text-slate-400 text-[11px]">{t('activitiesView.collectedThisMonth')}</span>
                        <div className="font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                          {activityRevenue.toFixed(2)} €
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pie de tarjeta según rol */}
                {showRosterAndManagement && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                    {/* Solicitudes pendientes de confirmación por profesor/admin */}
                    {pendingRequestsForActivity.length > 0 && (
                      <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/25 p-2.5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('activitiesView.pendingRequestsTitle', { count: pendingRequestsForActivity.length })}
                        </span>
                        <div className="space-y-1.5">
                          {pendingRequestsForActivity.map(st => {
                            const confirmKey = `confirm:${st.id}:${act.id}`;
                            const rejectKey = `reject:${st.id}:${act.id}`;
                            const isBusy = busyActivityKey === confirmKey || busyActivityKey === rejectKey;
                            return (
                              <div
                                key={st.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-white/90 dark:bg-slate-900/90 px-2.5 py-1.5 text-xs border border-amber-500/20"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-900 dark:text-white truncate block">
                                    {st.name}
                                  </span>
                                  {(st.phone || st.email) && (
                                    <span className="text-[10px] text-slate-500 truncate block">
                                      {st.phone || st.email}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleConfirmPendingEnrollment(st.id, st.name, act)}
                                    title={t('activitiesView.confirmTooltip')}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                                  >
                                    {busyActivityKey === confirmKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    <span>{t('activitiesView.confirmButton')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleRejectPendingEnrollment(st.id, st.name, act)}
                                    title={t('activitiesView.rejectTooltip')}
                                    aria-label={t('activitiesView.rejectAria', { name: st.name })}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                                  >
                                    {busyActivityKey === rejectKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{t('activitiesView.enrolledCount', { count: enrolledStudents.length })}</span>
                        </span>
                        {(isAdmin || ((isTeacher || isUnion) && isAssignedToMe)) && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenEnrollStudent
                                ? onOpenEnrollStudent(act.id)
                                : onOpenAddStudent()
                            }
                            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            {t('activitiesView.enrollShortButton')}
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {enrolledStudents.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">{t('activitiesView.noStudentsYet')}</span>
                        ) : (
                          enrolledStudents.map(st => {
                            const isPending =
                              st.status === 'pending_validation' || st.validationStatus === 'pending';
                            return (
                              <span
                                key={st.id}
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                                  isPending
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span>{st.name}</span>
                                {isPending && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                    {t('activitiesView.pendingDotBadge')}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPendingRemoval({
                                      studentId: st.id,
                                      studentName: st.name,
                                      activityId: act.id,
                                      activityName: act.name
                                    })
                                  }
                                  title={t('activitiesView.removeStudentTooltip', { name: st.name, activity: act.name })}
                                  className="ml-0.5 rounded p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                                >
                                  <UserMinus className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {showRequestAction && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    {isEnrolledAsStudent ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 w-full justify-center">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t('activitiesView.alreadyEnrolled')}</span>
                      </span>
                    ) : isRequested ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 flex-1 justify-center whitespace-nowrap">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>{t('activitiesView.requestPending')}</span>
                        </span>
                        <button
                          type="button"
                          disabled={busyActivityKey === `cancel:${act.id}`}
                          onClick={() => handleCancelRequest(act)}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition whitespace-nowrap disabled:opacity-50"
                        >
                          {busyActivityKey === `cancel:${act.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          <span>{t('activitiesView.cancelRequestButton')}</span>
                        </button>
                        {teacher?.phone && (
                          <a
                            href={`https://wa.me/${teacher.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              t('activitiesView.whatsappMessage', { teacher: teacher.name, activity: act.name })
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            title={t('activitiesView.whatsappTooltip')}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition whitespace-nowrap"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>{t('activitiesView.whatsapp')}</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busyActivityKey === `req:${act.id}`}
                        onClick={() => handleRequestEnrollment(act)}
                        className="inline-flex items-center justify-center gap-1.5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-60"
                      >
                        {busyActivityKey === `req:${act.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {busyActivityKey === `req:${act.id}` ? t('activitiesView.sendingRequest') : t('activitiesView.requestEnrollment')}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingRemoval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('activitiesView.removalModal.title')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('activitiesView.removalModal.bodyBefore')} <strong>{pendingRemoval.studentName}</strong> {t('activitiesView.removalModal.bodyMiddle')}{' '}
                  <strong>{pendingRemoval.activityName}</strong>{t('activitiesView.removalModal.bodyAfter')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => setPendingRemoval(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('activitiesView.removalModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleConfirmUnenroll}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-60"
              >
                {isRemoving ? t('activitiesView.removalModal.removing') : t('activitiesView.removalModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingActivityDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('activitiesView.deleteModal.title')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('activitiesView.deleteModal.bodyBefore')}{' '}
                  <strong>{pendingActivityDelete.name}</strong>{t('activitiesView.deleteModal.bodyAfter')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingActivityDelete(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('activitiesView.deleteModal.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const idToDelete = pendingActivityDelete.id;
                  setPendingActivityDelete(null);
                  await deleteActivity(idToDelete);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                {t('activitiesView.deleteModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

