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
    payments,
    deleteActivity,
    unenrollStudentFromActivity,
    requestActivityEnrollment,
    cancelActivityEnrollmentRequest,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    requestActivityUnenrollment,
    cancelActivityUnenrollmentRequest,
    approveActivityUnenrollment,
    rejectActivityUnenrollment,
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
  const [toggleOverrideByActivity, setToggleOverrideByActivity] = useState<Record<string, boolean>>({});
  const desiredRequestedRef = useRef<Record<string, boolean>>({});
  const activeOpsCountRef = useRef<Record<string, number>>({});
  const requestQueueRef = useRef<Record<string, Promise<void>>>({});
  const dbRequestedRef = useRef<Record<string, boolean>>({});
  const resolvedStudentIdsRef = useRef<Record<string, string>>({});
  const currentStudentRef = useRef(currentStudent);
  currentStudentRef.current = currentStudent;
  const [pendingRemoval, setPendingRemoval] = useState<{
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
    isSelf?: boolean;
  } | null>(null);
  const [dropReason, setDropReason] = useState('');
  const [pendingActivityDelete, setPendingActivityDelete] = useState<Activity | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const [dropModerationTarget, setDropModerationTarget] = useState<{
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
    dropRequestedAt?: string;
    dropReason?: string;
  } | null>(null);
  const [dropDebtsChecked, setDropDebtsChecked] = useState(false);
  const [dropMaterialsChecked, setDropMaterialsChecked] = useState(false);
  const [isModeratingDrop, setIsModeratingDrop] = useState(false);

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
    const removalSnapshot = pendingRemoval;
    try {
      if (removalSnapshot.isSelf) {
        const res = await requestActivityUnenrollment(
          removalSnapshot.studentId,
          removalSnapshot.activityId,
          dropReason.trim() || undefined
        );
        if (res.success) {
          setFeedbackMsg(
            t('activitiesView.dropRequestSentSuccess', {
              activity: removalSnapshot.activityName
            })
          );
          setTimeout(() => setFeedbackMsg(null), 5000);
          setPendingRemoval(null);
          setDropReason('');
        } else {
          setErrorMsg(res.error || t('activitiesView.dropRequestError'));
        }
      } else {
        const res = await unenrollStudentFromActivity(
          removalSnapshot.studentId,
          removalSnapshot.activityId
        );
        if (res.success) {
          setFeedbackMsg(
            t('activitiesView.removeSuccess', {
              name: removalSnapshot.studentName,
              activity: removalSnapshot.activityName
            })
          );
          setTimeout(() => setFeedbackMsg(null), 4000);
        } else {
          setErrorMsg(res.error || t('activitiesView.removeErrorFallback'));
        }
        setPendingRemoval(null);
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCancelPendingDrop = async (studentId: string, act: Activity) => {
    setBusyActivityKey(`cancelDrop:${studentId}:${act.id}`);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await cancelActivityUnenrollmentRequest(studentId, act.id);
      if (res.success) {
        setFeedbackMsg(
          t('activitiesView.dropRequestCancelledSuccess', { activity: act.name })
        );
        setTimeout(() => setFeedbackMsg(null), 4500);
      } else {
        setErrorMsg(res.error || t('activitiesView.dropRequestError'));
      }
    } finally {
      setBusyActivityKey(null);
    }
  };

  const openDropModerationModal = (target: {
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
    dropRequestedAt?: string;
    dropReason?: string;
  }) => {
    setDropDebtsChecked(false);
    setDropMaterialsChecked(false);
    setDropModerationTarget(target);
  };

  const handleApproveDrop = async () => {
    if (!dropModerationTarget || !dropDebtsChecked || !dropMaterialsChecked) return;
    setIsModeratingDrop(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    const snapshot = dropModerationTarget;
    try {
      const res = await approveActivityUnenrollment(snapshot.studentId, snapshot.activityId, {
        debtsChecked: dropDebtsChecked,
        materialsChecked: dropMaterialsChecked
      });
      if (res.success) {
        setDropModerationTarget(null);
        setFeedbackMsg(
          t('activitiesView.dropApprovedSuccess', {
            name: snapshot.studentName,
            activity: snapshot.activityName
          })
        );
        setTimeout(() => setFeedbackMsg(null), 4500);
      } else {
        setErrorMsg(res.error || t('activitiesView.dropApproveError'));
      }
    } finally {
      setIsModeratingDrop(false);
    }
  };

  const handleRejectDrop = async (
    studentId: string,
    studentName: string,
    activityId: string,
    activityName: string
  ) => {
    setBusyActivityKey(`rejectDrop:${studentId}:${activityId}`);
    setIsModeratingDrop(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await rejectActivityUnenrollment(studentId, activityId);
      if (res.success) {
        if (
          dropModerationTarget?.studentId === studentId &&
          dropModerationTarget?.activityId === activityId
        ) {
          setDropModerationTarget(null);
        }
        setFeedbackMsg(
          t('activitiesView.dropRejectedSuccess', {
            name: studentName,
            activity: activityName
          })
        );
        setTimeout(() => setFeedbackMsg(null), 4500);
      } else {
        setErrorMsg(res.error || t('activitiesView.dropRejectError'));
      }
    } finally {
      setBusyActivityKey(null);
      setIsModeratingDrop(false);
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

  const handleToggleEnrollmentRequest = (act: Activity, currentRequested: boolean) => {
    const nextRequested = !currentRequested;
    desiredRequestedRef.current[act.id] = nextRequested;
    setToggleOverrideByActivity(prev => ({ ...prev, [act.id]: nextRequested }));
    activeOpsCountRef.current[act.id] = (activeOpsCountRef.current[act.id] || 0) + 1;
    setErrorMsg(null);
    setFeedbackMsg(null);

    const prevQueue = requestQueueRef.current[act.id] ?? Promise.resolve();
    const nextQueue = prevQueue
      .catch(() => undefined)
      .then(async () => {
        const latestStudent = currentStudentRef.current;

        if (nextRequested) {
          const res = await requestActivityEnrollment(act.id, latestStudent?.id);
          if (res.studentId) {
            resolvedStudentIdsRef.current[act.id] = res.studentId;
          }
          if (res.success) {
            dbRequestedRef.current[act.id] = true;
            removeLegacyRequestId(act.id);
            if (desiredRequestedRef.current[act.id] === true) {
              setFeedbackMsg(
                t('activitiesView.requestSentSuccess', { activity: act.name })
              );
              setTimeout(() => setFeedbackMsg(null), 5000);
            }
          } else if (desiredRequestedRef.current[act.id] === true) {
            desiredRequestedRef.current[act.id] = false;
            setErrorMsg(res.error || t('activitiesView.requestSentError', { activity: act.name }));
          }
        } else {
          const targetStudentId =
            latestStudent?.id || currentStudentId || resolvedStudentIdsRef.current[act.id];
          const hasDbPending =
            Boolean(dbRequestedRef.current[act.id]) ||
            Boolean((latestStudent?.pendingEnrollments || []).some(e => e.activityId === act.id));

          if (targetStudentId && hasDbPending) {
            const res = await cancelActivityEnrollmentRequest(targetStudentId, act.id);
            if (!res.success) {
              if (desiredRequestedRef.current[act.id] === false) {
                desiredRequestedRef.current[act.id] = true;
                setErrorMsg(res.error || t('activitiesView.cancelRequestError'));
              }
              return;
            }
          }

          dbRequestedRef.current[act.id] = false;
          removeLegacyRequestId(act.id);
          if (desiredRequestedRef.current[act.id] === false) {
            setFeedbackMsg(t('activitiesView.cancelRequestSuccess', { activity: act.name }));
            setTimeout(() => setFeedbackMsg(null), 4000);
          }
        }
      })
      .finally(() => {
        const remaining = Math.max(0, (activeOpsCountRef.current[act.id] || 1) - 1);
        activeOpsCountRef.current[act.id] = remaining;
        if (remaining === 0) {
          setToggleOverrideByActivity(prev => {
            if (!(act.id in prev)) return prev;
            const next = { ...prev };
            delete next[act.id];
            return next;
          });
        }
      });

    requestQueueRef.current[act.id] = nextQueue;
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
            const myEnrollment = currentStudent?.activities.find(a => a.activityId === act.id);
            const isEnrolledAsStudent = Boolean(myEnrollment);
            const isMyDropPending = myEnrollment?.status === 'pending_unenroll';
            const isDbRequested = Boolean(
              (currentStudent?.pendingEnrollments || []).some(a => a.activityId === act.id)
            );
            if (!activeOpsCountRef.current[act.id]) {
              dbRequestedRef.current[act.id] = isDbRequested;
            }
            const isRequested =
              act.id in toggleOverrideByActivity
                ? toggleOverrideByActivity[act.id]
                : isDbRequested || legacyRequestedIds.includes(act.id);

            const enrolledStudents = students.filter(s =>
              s.activities.some(a => a.activityId === act.id)
            );
            const pendingRequestsForActivity = students.filter(s =>
              (s.pendingEnrollments || []).some(p => p.activityId === act.id)
            );
            const pendingDropsForActivity = students.filter(s =>
              s.activities.some(a => a.activityId === act.id && a.status === 'pending_unenroll')
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

                    {/* Solicitudes de baja pendientes de revisión por profesor/admin */}
                    {pendingDropsForActivity.length > 0 && (
                      <div className="rounded-xl border border-rose-500/35 bg-rose-50/60 dark:bg-rose-950/20 p-2.5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {t('activitiesView.pendingDropsTitle', { count: pendingDropsForActivity.length })}
                        </span>
                        <div className="space-y-1.5">
                          {pendingDropsForActivity.map(st => {
                            const dropEnr = st.activities.find(a => a.activityId === act.id);
                            const rejectDropKey = `rejectDrop:${st.id}:${act.id}`;
                            const isBusy = busyActivityKey === rejectDropKey || isModeratingDrop;
                            const unpaidCount = payments.filter(
                              p =>
                                p.studentId === st.id &&
                                p.activityId === act.id &&
                                (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
                            ).length;
                            return (
                              <div
                                key={st.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/90 dark:bg-slate-900/90 px-2.5 py-2 text-xs border border-rose-500/20"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-900 dark:text-white truncate">
                                      {st.name}
                                    </span>
                                    {unpaidCount > 0 && (
                                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-300">
                                        ! {unpaidCount}
                                      </span>
                                    )}
                                  </div>
                                  {dropEnr?.dropReason && (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block">
                                      {dropEnr.dropReason}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      openDropModerationModal({
                                        studentId: st.id,
                                        studentName: st.name,
                                        activityId: act.id,
                                        activityName: act.name,
                                        dropRequestedAt: dropEnr?.dropRequestedAt,
                                        dropReason: dropEnr?.dropReason
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition disabled:opacity-50"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>{t('activitiesView.reviewDropButton')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleRejectDrop(st.id, st.name, act.id, act.name)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                                  >
                                    {busyActivityKey === rejectDropKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    <span>{t('activitiesView.rejectDropButton')}</span>
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
                            const enrItem = st.activities.find(a => a.activityId === act.id);
                            const isDropPending = enrItem?.status === 'pending_unenroll';
                            return (
                              <span
                                key={st.id}
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                                  isDropPending
                                    ? 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30'
                                    : isPending
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
                                {isDropPending && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                                    {t('activitiesView.dropPendingTag')}
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
                      isMyDropPending ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300 flex-1 min-w-[170px]">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span>{t('activitiesView.dropPendingBadge')}</span>
                          </span>
                          {currentStudent && (
                            <button
                              type="button"
                              disabled={busyActivityKey === `cancelDrop:${currentStudent.id}:${act.id}`}
                              onClick={() => handleCancelPendingDrop(currentStudent.id, act)}
                              title={t('activitiesView.cancelDropTooltip')}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 transition shadow-xs whitespace-nowrap active:scale-[0.99] disabled:opacity-50"
                            >
                              {busyActivityKey === `cancelDrop:${currentStudent.id}:${act.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : (
                                <X className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>{t('activitiesView.cancelDropButton')}</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex-1 min-w-[160px]">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{t('activitiesView.alreadyEnrolled')}</span>
                          </span>
                          {currentStudent && (
                            <button
                              type="button"
                              onClick={() => {
                                setDropReason('');
                                setPendingRemoval({
                                  studentId: currentStudent.id,
                                  studentName: currentStudent.name,
                                  activityId: act.id,
                                  activityName: act.name,
                                  isSelf: true
                                });
                              }}
                              title={t('activitiesView.selfUnenrollTooltip', { activity: act.name })}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white transition shadow-xs whitespace-nowrap active:scale-[0.99]"
                            >
                              <UserMinus className="h-3.5 w-3.5 shrink-0" />
                              <span>{t('activitiesView.selfUnenrollButton')}</span>
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                        <button
                          type="button"
                          aria-pressed={isRequested}
                          title={isRequested ? t('activitiesView.cancelRequestButton') : undefined}
                          onClick={() => handleToggleEnrollmentRequest(act, isRequested)}
                          className={
                            isRequested
                              ? 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition shadow-xs flex-1 whitespace-nowrap active:scale-[0.99]'
                              : 'inline-flex items-center justify-center gap-1.5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs active:scale-[0.99]'
                          }
                        >
                          {isRequested ? (
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Send className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>
                            {isRequested
                              ? t('activitiesView.requestPending')
                              : t('activitiesView.requestEnrollment')}
                          </span>
                        </button>
                        {isRequested && teacher?.phone && (
                          <a
                            href={`https://wa.me/${teacher.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              t('activitiesView.whatsappMessage', { teacher: teacher.name, activity: act.name })
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            title={t('activitiesView.whatsappTooltip')}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition whitespace-nowrap"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>{t('activitiesView.whatsapp')}</span>
                          </a>
                        )}
                      </div>
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
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                  pendingRemoval.isSelf
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {pendingRemoval.isSelf
                    ? t('activitiesView.selfRemovalModal.title')
                    : t('activitiesView.removalModal.title')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {pendingRemoval.isSelf ? (
                    <>
                      {t('activitiesView.selfRemovalModal.bodyBefore')}{' '}
                      <strong>{pendingRemoval.activityName}</strong>
                      {t('activitiesView.selfRemovalModal.bodyAfter')}
                    </>
                  ) : (
                    <>
                      {t('activitiesView.removalModal.bodyBefore')} <strong>{pendingRemoval.studentName}</strong>{' '}
                      {t('activitiesView.removalModal.bodyMiddle')}{' '}
                      <strong>{pendingRemoval.activityName}</strong>
                      {t('activitiesView.removalModal.bodyAfter')}
                    </>
                  )}
                </p>
              </div>
            </div>

            {pendingRemoval.isSelf && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('activitiesView.selfRemovalModal.reasonLabel')}
                </label>
                <textarea
                  rows={2}
                  value={dropReason}
                  onChange={e => setDropReason(e.target.value)}
                  placeholder={t('activitiesView.selfRemovalModal.reasonPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-amber-500 resize-none"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => {
                  setPendingRemoval(null);
                  setDropReason('');
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {pendingRemoval.isSelf
                  ? t('activitiesView.selfRemovalModal.cancel')
                  : t('activitiesView.removalModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleConfirmUnenroll}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${
                  pendingRemoval.isSelf
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isRemoving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isRemoving
                    ? pendingRemoval.isSelf
                      ? t('activitiesView.selfRemovalModal.removing')
                      : t('activitiesView.removalModal.removing')
                    : pendingRemoval.isSelf
                    ? t('activitiesView.selfRemovalModal.confirm')
                    : t('activitiesView.removalModal.confirm')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {dropModerationTarget && (() => {
        const unpaidPayments = payments.filter(
          p =>
            p.studentId === dropModerationTarget.studentId &&
            p.activityId === dropModerationTarget.activityId &&
            (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
        );
        const unpaidTotal = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
        const canApprove = dropDebtsChecked && dropMaterialsChecked && !isModeratingDrop;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t('activitiesView.dropModerationModal.title')}
                    </h4>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                      {dropModerationTarget.studentName} · {dropModerationTarget.activityName}
                    </p>
                    {dropModerationTarget.dropRequestedAt && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {t('activitiesView.dropModerationModal.requestedOnLabel', {
                          date: dropModerationTarget.dropRequestedAt.split('T')[0]
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isModeratingDrop}
                  onClick={() => setDropModerationTarget(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {dropModerationTarget.dropReason && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {t('activitiesView.dropModerationModal.reasonLabel')}
                  </span>
                  <p className="text-slate-700 dark:text-slate-200 italic">
                    "{dropModerationTarget.dropReason}"
                  </p>
                </div>
              )}

              <div
                className={`rounded-xl border p-3 text-xs ${
                  unpaidPayments.length > 0
                    ? 'border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                    : 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <p className="font-bold">
                  {unpaidPayments.length > 0
                    ? t('activitiesView.dropModerationModal.debtsAlert', {
                        count: unpaidPayments.length,
                        amount: unpaidTotal.toFixed(2)
                      })
                    : t('activitiesView.dropModerationModal.debtsClear')}
                </p>
                {unpaidPayments.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] font-mono">
                    {unpaidPayments.map(p => (
                      <li key={p.id}>
                        {p.periodMonth} · {p.receiptNumber} · {p.amount.toFixed(2)} € ({p.status})
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dropDebtsChecked}
                    onChange={e => setDropDebtsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t('activitiesView.dropModerationModal.checkDebts')}</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dropMaterialsChecked}
                    onChange={e => setDropMaterialsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t('activitiesView.dropModerationModal.checkMaterials')}</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isModeratingDrop}
                  onClick={() => setDropModerationTarget(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {t('activitiesView.dropModerationModal.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isModeratingDrop}
                  onClick={() =>
                    handleRejectDrop(
                      dropModerationTarget.studentId,
                      dropModerationTarget.studentName,
                      dropModerationTarget.activityId,
                      dropModerationTarget.activityName
                    )
                  }
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {t('activitiesView.dropModerationModal.rejectButton')}
                </button>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={handleApproveDrop}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isModeratingDrop && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {isModeratingDrop
                      ? t('activitiesView.dropModerationModal.processing')
                      : t('activitiesView.dropModerationModal.approveButton')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

