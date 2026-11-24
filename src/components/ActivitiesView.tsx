import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { Activity, UserRole } from '../types';
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
import { ActivityHistoryDropdown } from './ActivityHistoryDropdown';
import { ContactQuickActions, CompactCommunicationButton, StudentContactDetails } from './ContactQuickActions';

interface ActivitiesViewProps {
  onOpenAddActivity: (activity?: Activity) => void;
  onOpenAddStudent: () => void;
  onOpenEnrollStudent?: (activityId?: string) => void;
}

export type EnrollmentButtonStatus =
  | null
  | 'pending_enrollment'
  | 'approved'
  | 'pending_withdrawal';

interface EnrollmentButtonLabels {
  requestEnrollment: string;
  pendingEnrollment: string;
  requestWithdrawal: string;
  pendingWithdrawal: string;
  pendingEnrollmentTitle?: string;
  requestWithdrawalTitle?: string;
  pendingWithdrawalTitle?: string;
}

interface EnrollmentButtonProps {
  status: EnrollmentButtonStatus;
  isLoading: boolean;
  onClick: () => void | Promise<void>;
  fullWidth?: boolean;
  responsiveFullWidth?: boolean;
  labels: EnrollmentButtonLabels;
}

const AMBER_PENDING_BUTTON_CLASSES =
  'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20';

const EnrollmentButton: React.FC<EnrollmentButtonProps> = ({
  status,
  isLoading,
  onClick,
  fullWidth = false,
  responsiveFullWidth = false,
  labels
}) => {
  const buttonConfig: {
    text: string;
    title?: string;
    icon: React.ReactNode;
    styleClasses: string;
  } = (() => {
    switch (status) {
      case 'pending_enrollment':
        return {
          text: labels.pendingEnrollment,
          title: labels.pendingEnrollmentTitle,
          icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
          styleClasses: AMBER_PENDING_BUTTON_CLASSES
        };
      case 'approved':
        return {
          text: labels.requestWithdrawal,
          title: labels.requestWithdrawalTitle,
          icon: <UserMinus className="h-3.5 w-3.5 shrink-0" />,
          styleClasses:
            'border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white'
        };
      case 'pending_withdrawal':
        return {
          text: labels.pendingWithdrawal,
          title: labels.pendingWithdrawalTitle,
          icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
          styleClasses: AMBER_PENDING_BUTTON_CLASSES
        };
      default:
        return {
          text: labels.requestEnrollment,
          icon: <Send className="h-3.5 w-3.5 shrink-0" />,
          styleClasses:
            'border border-transparent bg-emerald-600 text-white hover:bg-emerald-700'
        };
    }
  })();

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={onClick}
      title={buttonConfig.title}
      aria-busy={isLoading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition shadow-xs whitespace-nowrap active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
        fullWidth ? 'w-full' : responsiveFullWidth ? 'sm:w-full' : ''
      } ${buttonConfig.styleClasses}`}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        buttonConfig.icon
      )}
      <span>{buttonConfig.text}</span>
    </button>
  );
};

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

  const isAdmin = currentRole === UserRole.Admin;
  const isTeacher = currentRole === UserRole.Monitor;
  const isStudent = currentRole === UserRole.Alumno;
  const isSocio = currentRole === UserRole.Socio;
  const isUnion = currentRole === UserRole.Hibrido;

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
  const [loadingByActivity, setLoadingByActivity] = useState<Record<string, boolean>>({});
  const [statusOverrideByActivity, setStatusOverrideByActivity] = useState<
    Record<string, EnrollmentButtonStatus>
  >({});
  const resolvedStudentIdsRef = useRef<Record<string, string>>({});
  const currentStudentRef = useRef(currentStudent);
  currentStudentRef.current = currentStudent;
  const [pendingRemoval, setPendingRemoval] = useState<{
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
  } | null>(null);
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
    } finally {
      setIsRemoving(false);
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

  useEffect(() => {
    setStatusOverrideByActivity(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const actId of keys) {
        if (loadingByActivity[actId]) continue;
        const myEnrollment = currentStudent?.activities.find(a => a.activityId === actId);
        const myPending = (currentStudent?.pendingEnrollments || []).find(
          a => a.activityId === actId
        );
        const derived: EnrollmentButtonStatus = myEnrollment
          ? myEnrollment.status === 'pending_unenroll' ||
            myEnrollment.status === 'pending_withdrawal'
            ? 'pending_withdrawal'
            : 'approved'
          : myPending || legacyRequestedIds.includes(actId)
          ? 'pending_enrollment'
          : null;
        if (derived === prev[actId]) {
          delete next[actId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentStudent, legacyRequestedIds, loadingByActivity]);

  const handleEnrollmentButtonAction = async (
    act: Activity,
    currentStatus: EnrollmentButtonStatus
  ): Promise<void> => {
    if (loadingByActivity[act.id]) return;

    setLoadingByActivity(prev => ({ ...prev, [act.id]: true }));
    setErrorMsg(null);
    setFeedbackMsg(null);

    try {
      const latestStudent = currentStudentRef.current;
      const targetStudentId =
        latestStudent?.id || currentStudentId || resolvedStudentIdsRef.current[act.id];

      if (currentStatus === null) {
        const res = await requestActivityEnrollment(act.id, latestStudent?.id);
        if (res.studentId) {
          resolvedStudentIdsRef.current[act.id] = res.studentId;
        }
        if (res.success) {
          removeLegacyRequestId(act.id);
          setStatusOverrideByActivity(prev => ({ ...prev, [act.id]: 'pending_enrollment' }));
          setFeedbackMsg(t('activitiesView.requestSentSuccess', { activity: act.name }));
          setTimeout(() => setFeedbackMsg(null), 5000);
        } else {
          setErrorMsg(res.error || t('activitiesView.requestSentError', { activity: act.name }));
        }
        return;
      }

      if (currentStatus === 'pending_enrollment') {
        const hasDbPending = Boolean(
          (latestStudent?.pendingEnrollments || []).some(e => e.activityId === act.id) ||
            resolvedStudentIdsRef.current[act.id]
        );
        if (targetStudentId && hasDbPending) {
          const res = await cancelActivityEnrollmentRequest(targetStudentId, act.id);
          if (!res.success) {
            setErrorMsg(res.error || t('activitiesView.cancelRequestError'));
            return;
          }
        }
        removeLegacyRequestId(act.id);
        setStatusOverrideByActivity(prev => ({ ...prev, [act.id]: null }));
        setFeedbackMsg(t('activitiesView.cancelRequestSuccess', { activity: act.name }));
        setTimeout(() => setFeedbackMsg(null), 4000);
        return;
      }

      if (currentStatus === 'approved') {
        if (!targetStudentId) {
          setErrorMsg(t('activitiesView.dropRequestError'));
          return;
        }
        const res = await requestActivityUnenrollment(targetStudentId, act.id);
        if (res.success) {
          setStatusOverrideByActivity(prev => ({ ...prev, [act.id]: 'pending_withdrawal' }));
          setFeedbackMsg(t('activitiesView.dropRequestSentSuccess', { activity: act.name }));
          setTimeout(() => setFeedbackMsg(null), 5000);
        } else {
          setErrorMsg(res.error || t('activitiesView.dropRequestError'));
        }
        return;
      }

      if (currentStatus === 'pending_withdrawal') {
        if (!targetStudentId) {
          setErrorMsg(t('activitiesView.dropRequestError'));
          return;
        }
        const res = await cancelActivityUnenrollmentRequest(targetStudentId, act.id);
        if (res.success) {
          setStatusOverrideByActivity(prev => ({ ...prev, [act.id]: 'approved' }));
          setFeedbackMsg(
            t('activitiesView.dropRequestCancelledSuccess', { activity: act.name })
          );
          setTimeout(() => setFeedbackMsg(null), 4500);
        } else {
          setErrorMsg(res.error || t('activitiesView.dropRequestError'));
        }
      }
    } finally {
      setLoadingByActivity(prev => ({ ...prev, [act.id]: false }));
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5">
          {visibleActivities.map(act => {
            const teacher = teachers.find(item => item.id === act.teacherId);
            const isAssignedToMe = act.teacherId === currentTeacher?.id;
            const myEnrollment = currentStudent?.activities.find(a => a.activityId === act.id);
            const myPendingEnrollment = (currentStudent?.pendingEnrollments || []).find(
              a => a.activityId === act.id
            );
            const derivedButtonStatus: EnrollmentButtonStatus = myEnrollment
              ? myEnrollment.status === 'pending_unenroll' ||
                myEnrollment.status === 'pending_withdrawal'
                ? 'pending_withdrawal'
                : 'approved'
              : myPendingEnrollment || legacyRequestedIds.includes(act.id)
              ? 'pending_enrollment'
              : null;
            const enrollmentButtonStatus: EnrollmentButtonStatus =
              act.id in statusOverrideByActivity
                ? statusOverrideByActivity[act.id]
                : derivedButtonStatus;
            const isButtonLoading = Boolean(loadingByActivity[act.id]);

            const enrolledStudents = students.filter(s =>
              s.activities.some(a => a.activityId === act.id)
            );
            const pendingRequestsForActivity = students.filter(s =>
              (s.pendingEnrollments || []).some(p => p.activityId === act.id)
            );
            const pendingDropsForActivity = students.filter(s =>
              s.activities.some(
                a =>
                  a.activityId === act.id &&
                  (a.status === 'pending_unenroll' || a.status === 'pending_withdrawal')
              )
            );

            // Recaudación mensual visible solo para administración
            const activityRevenue = periodPayments
              .filter(p => p.activityId === act.id && (p.status === 'paid' || p.status === 'partial'))
              .reduce((acc, p) => acc + p.amount, 0);

            const showRosterAndManagement = isAdmin || ((isTeacher || isUnion) && isAssignedToMe);
            const showRequestAction = isStudent || isSocio || (isUnion && !isAssignedToMe);
            const buttonLabels: EnrollmentButtonLabels = {
              requestEnrollment: t('activitiesView.requestEnrollment'),
              pendingEnrollment: t('activitiesView.requestPending'),
              requestWithdrawal: t('activitiesView.selfUnenrollButton'),
              pendingWithdrawal: t('activitiesView.withdrawalPending'),
              pendingEnrollmentTitle: t('activitiesView.cancelRequestButton'),
              requestWithdrawalTitle: t('activitiesView.selfUnenrollTooltip', {
                activity: act.name
              }),
              pendingWithdrawalTitle: t('activitiesView.cancelDropTooltip')
            };

            return (
              <div
                key={act.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  {/* Distribución unificada móvil y escritorio (2x2 + barra inferior Tarifas / Acción) */}
                  {/* Fila 1: Categoría + Nombre | Monitor responsable */}
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            {act.category}
                          </span>
                          {showRequestAction && enrollmentButtonStatus === 'approved' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              {t('activitiesView.alreadyEnrolled')}
                            </span>
                          )}
                          {(isTeacher || isUnion) && isAssignedToMe && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                              <GraduationCap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              {t('activitiesView.assignedBadge')}
                            </span>
                          )}
                        </div>
                        {(isAdmin || ((isTeacher || isUnion) && isAssignedToMe)) && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOpenAddActivity(act)}
                              title={t('activitiesView.editTooltip')}
                              className="rounded-lg p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setPendingActivityDelete(act)}
                                title={t('activitiesView.deleteTooltip')}
                                className="rounded-lg p-1 sm:p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800"
                              >
                                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white leading-tight break-words">
                        {act.name}
                      </h3>
                      {showRosterAndManagement && pendingRequestsForActivity.length > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-800 dark:text-amber-300">
                          <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          {pendingRequestsForActivity.length === 1
                            ? t('activitiesView.requestSingular', { count: pendingRequestsForActivity.length })
                            : t('activitiesView.requestPlural', { count: pendingRequestsForActivity.length })}
                        </span>
                      )}
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.monitorLabel')}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                        {teacher?.name || t('activitiesView.noTeacher')}
                      </span>
                    </div>
                  </div>

                  {/* Fila 2: Espacio / Sala | Horarios de clase */}
                  <div className="mt-3 grid grid-cols-2 gap-3 items-start">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.roomLabel')}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                        {act.room}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
                        {t('activitiesView.scheduleLabel')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {act.schedule.map((sch, i) => (
                          <span
                            key={i}
                            className="inline-flex max-w-full items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            <Clock className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>{sch}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {act.description && (
                    <p className="mt-2.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                      {act.description}
                    </p>
                  )}
                </div>

                {/* Fila inferior: Tarifas a la izquierda + Botón/recaudación a la derecha */}
                <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="min-w-0 shrink-0">
                    <span className="text-slate-400 text-[11px] block leading-tight">
                      {t('activitiesView.ratesLabel')}
                    </span>
                    <div className="text-xs font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {t('activitiesView.rateSummary', {
                        monthly: act.defaultPriceMonthly,
                        perClass: act.defaultPricePerClass
                      })}
                    </div>
                  </div>

                  {showRequestAction ? (
                    <div className="flex items-center justify-end gap-1.5 sm:flex-1 min-w-0">
                      <div className="sm:flex-1 min-w-0">
                        <EnrollmentButton
                          status={enrollmentButtonStatus}
                          isLoading={isButtonLoading}
                          onClick={() =>
                            handleEnrollmentButtonAction(act, enrollmentButtonStatus)
                          }
                          responsiveFullWidth
                          labels={buttonLabels}
                        />
                      </div>
                      {enrollmentButtonStatus === 'pending_enrollment' && teacher?.phone && (
                        <a
                          href={`https://wa.me/${teacher.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            t('activitiesView.whatsappMessage', {
                              teacher: teacher.name,
                              activity: act.name
                            })
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          title={t('activitiesView.whatsappTooltip')}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 sm:px-3 sm:py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition whitespace-nowrap shrink-0"
                        >
                          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="hidden sm:inline">{t('activitiesView.whatsapp')}</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    isAdmin && (
                      <div className="text-right shrink-0">
                        <span className="text-slate-400 text-[11px]">{t('activitiesView.collectedThisMonth')}</span>
                        <div className="font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                          {activityRevenue.toFixed(2)} €
                        </div>
                      </div>
                    )
                  )}
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
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-white/90 dark:bg-slate-900/90 px-2.5 py-2 text-xs border border-amber-500/20"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-900 dark:text-white truncate block">
                                    {st.name}
                                  </span>
                                  <StudentContactDetails
                                    phone={st.phone}
                                    email={st.email}
                                    fallbackText={t('teacherStudents.noContact')}
                                    className="mt-0.5"
                                  />
                                </div>
                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                                  <div className="flex items-center gap-1 order-1 sm:order-2">
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
                                  {/*<ContactQuickActions
                                    className="order-2 sm:order-1"
                                    phone={st.phone}
                                    email={st.email}
                                    callLabel={t('teacherStudents.callStudent', { name: st.name })}
                                    emailLabel={t('teacherStudents.emailStudent', { name: st.name })}
                                    whatsappLabel={t('teacherStudents.whatsappStudent', { name: st.name })}
                                  />*/}
                                  <CompactCommunicationButton
                                    className="order-2 sm:order-1"
                                    phone={st.phone}
                                    email={st.email}
                                    studentName={st.name}
                                    callLabel={t('teacherStudents.callStudent', { name: st.name })}
                                    emailLabel={t('teacherStudents.emailStudent', { name: st.name })}
                                    whatsappLabel={t('teacherStudents.whatsappStudent', { name: st.name })}
                                  />                                  
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
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-white/90 dark:bg-slate-900/90 px-2.5 py-2 text-xs border border-rose-500/20"
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
                                  <StudentContactDetails
                                    phone={st.phone}
                                    email={st.email}
                                    fallbackText={t('teacherStudents.noContact')}
                                    className="mt-0.5"
                                  />
                                  {dropEnr?.dropReason && (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block mt-0.5">
                                      {dropEnr.dropReason}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                                  <div className="flex items-center gap-1 order-1 sm:order-2">
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
                                  {/*<ContactQuickActions
                                    className="order-2 sm:order-1"
                                    phone={st.phone}
                                    email={st.email}
                                    callLabel={t('teacherStudents.callStudent', { name: st.name })}
                                    emailLabel={t('teacherStudents.emailStudent', { name: st.name })}
                                    whatsappLabel={t('teacherStudents.whatsappStudent', { name: st.name })}
                                  />*/}
                                  <CompactCommunicationButton
                                    className="order-2 sm:order-1"
                                    phone={st.phone}
                                    email={st.email}
                                    studentName={st.name}
                                    callLabel={t('teacherStudents.callStudent', { name: st.name })}
                                    emailLabel={t('teacherStudents.emailStudent', { name: st.name })}
                                    whatsappLabel={t('teacherStudents.whatsappStudent', { name: st.name })}
                                  />
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

                      {enrolledStudents.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">{t('activitiesView.noStudentsYet')}</span>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {enrolledStudents.map(st => {
                            const isPending =
                              st.status === 'pending_validation' || st.validationStatus === 'pending';
                            const enrItem = st.activities.find(a => a.activityId === act.id);
                            const isDropPending =
                              enrItem?.status === 'pending_unenroll' ||
                              enrItem?.status === 'pending_withdrawal';
                            return (
                              <div
                                key={st.id}
                                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                      {st.name}
                                    </span>
                                    {isPending && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 shrink-0">
                                        {t('activitiesView.pendingDotBadge')}
                                      </span>
                                    )}
                                    {isDropPending && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300 shrink-0">
                                        {t('activitiesView.dropPendingTag')}
                                      </span>
                                    )}
                                  </div>
                                  <StudentContactDetails
                                    phone={st.phone}
                                    email={st.email}
                                    fallbackText={t('teacherStudents.noContact')}
                                    className="mt-0.5"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-1.5 shrink-0">
                                  {/*<ContactQuickActions
                                    phone={st.phone}
                                    email={st.email}
                                    callLabel={t('teacherStudents.callStudent', { name: st.name })}
                                    emailLabel={t('teacherStudents.emailStudent', { name: st.name })}
                                    whatsappLabel={t('teacherStudents.whatsappStudent', { name: st.name })}
                                  />*/}
                                  <CompactCommunicationButton
                                    phone={st.phone}
                                    email={st.email}
                                    studentName={st.name}
                                    callLabel={t('teacherStudents.callStudent', { name: st.name })}
                                    emailLabel={t('teacherStudents.emailStudent', { name: st.name })}
                                    whatsappLabel={t('teacherStudents.whatsappStudent', { name: st.name })}
                                  />                                  
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
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition"
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Desplegable de historial de sesiones agrupado por fecha */}
                    <ActivityHistoryDropdown activity={act} />
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('activitiesView.removalModal.title')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('activitiesView.removalModal.bodyBefore')} <strong>{pendingRemoval.studentName}</strong>{' '}
                  {t('activitiesView.removalModal.bodyMiddle')}{' '}
                  <strong>{pendingRemoval.activityName}</strong>
                  {t('activitiesView.removalModal.bodyAfter')}
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
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 bg-rose-600 hover:bg-rose-700"
              >
                {isRemoving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isRemoving
                    ? t('activitiesView.removalModal.removing')
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

