import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Activity,
  CalendarEventItem,
  StudentAbsence,
  UserRole
} from '../types';
import { createTranslator } from '../lib/i18n';
import {
  canStudentCancelAbsence,
  isClassSessionClosedOrPast
} from '../lib/absences';
import {
  Calendar as CalendarIcon,
  CalendarX2,
  Clock,
  MapPin,
  User,
  Plus,
  ChevronLeft,
  ChevronRight,
  Info,
  Send,
  UserMinus,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X
} from 'lucide-react';

interface CalendarViewProps {
  onOpenAddSession?: () => void;
  onNavigateToActivities?: () => void;
}

const MADRID_TIMEZONE = 'Europe/Madrid';

function toMadridIsoDate(dateObj: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

function getMadridTodayDate(): Date {
  const todayIso = toMadridIsoDate(new Date());
  const [ty, tm, td] = todayIso.split('-').map(Number);
  return new Date(ty, tm - 1, td, 12, 0, 0);
}

function getMondayIndex(dateObj: Date): number {
  return (dateObj.getDay() + 6) % 7;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  onOpenAddSession,
  onNavigateToActivities
}) => {
  const {
    activities,
    teachers,
    sessions,
    students,
    studentAbsences,
    requestActivityEnrollment,
    cancelActivityEnrollmentRequest,
    requestActivityUnenrollment,
    cancelActivityUnenrollmentRequest,
    reportStudentAbsence,
    cancelStudentAbsence,
    currentRole,
    currentTeacherId,
    currentStudentId,
    currentUser,
    language
  } = useApp();
  const t = useCallback(createTranslator(language), [language]);

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

  const isStudent = currentRole === UserRole.Alumno;
  const isSocio = currentRole === UserRole.Socio;
  const isUnion = currentRole === UserRole.Hibrido;

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
  const [loadingByActivity, setLoadingByActivity] = useState<Record<string, boolean>>({});
  const [statusOverrideByActivity, setStatusOverrideByActivity] = useState<
    Record<string, 'pending_enrollment' | 'approved' | 'pending_withdrawal' | null>
  >({});
  const [absenceModalActivity, setAbsenceModalActivity] = useState<Activity | null>(null);
  const [absenceDate, setAbsenceDate] = useState<string>('');
  const [absenceReason, setAbsenceReason] = useState<string>('');
  const [isReportingAbsence, setIsReportingAbsence] = useState(false);
  const [cancellingAbsenceId, setCancellingAbsenceId] = useState<string | null>(null);
  const resolvedStudentIdsRef = useRef<Record<string, string>>({});
  const currentStudentRef = useRef(currentStudent);
  currentStudentRef.current = currentStudent;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setLegacyRequestedIds(raw ? JSON.parse(raw) : []);
    } catch {
      setLegacyRequestedIds([]);
    }
  }, [storageKey]);

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
        const derived = myEnrollment
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
    currentStatus: 'pending_enrollment' | 'approved' | 'pending_withdrawal' | null
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

  const isTargetAbsenceClosedOrPast = useMemo(() => {
    if (!absenceModalActivity || !absenceDate) return false;
    return isClassSessionClosedOrPast({
      activity: absenceModalActivity,
      sessionDate: absenceDate,
      sessions
    });
  }, [absenceModalActivity, absenceDate, sessions]);

  const openReportAbsenceModal = (act: Activity, defaultDate: string) => {
    setErrorMsg(null);
    setAbsenceDate(defaultDate);
    setAbsenceReason('');
    setAbsenceModalActivity(act);
  };

  const handleConfirmReportAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetStudentId = currentStudentRef.current?.id || currentStudentId;
    if (!targetStudentId || !absenceModalActivity || !absenceDate) return;

    setIsReportingAbsence(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    const targetAct = absenceModalActivity;
    const chosenDate = absenceDate;
    const sendAsRequest = isClassSessionClosedOrPast({
      activity: targetAct,
      sessionDate: chosenDate,
      sessions
    });

    try {
      const res = await reportStudentAbsence({
        studentId: targetStudentId,
        activityId: targetAct.id,
        sessionDate: chosenDate,
        reason: absenceReason.trim() || undefined,
        asRequest: sendAsRequest
      });
      setAbsenceModalActivity(null);
      setAbsenceReason('');
      if (res.success) {
        const isPendingRequest = res.status === 'pending' || sendAsRequest;
        setFeedbackMsg(
          isPendingRequest
            ? t('studentPortal.absenceRequestSubmittedSuccess', {
                activity: targetAct.name,
                date: chosenDate
              })
            : t('studentPortal.absenceReportedSuccess', {
                activity: targetAct.name,
                date: chosenDate
              })
        );
        setTimeout(() => setFeedbackMsg(null), 5500);
      } else {
        setErrorMsg(res.error || t('studentPortal.absenceReportError'));
      }
    } finally {
      setIsReportingAbsence(false);
    }
  };

  const handleCancelAbsenceNotice = async (absenceId: string, actName: string) => {
    setCancellingAbsenceId(absenceId);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await cancelStudentAbsence(absenceId);
      if (res.success) {
        setFeedbackMsg(t('studentPortal.absenceCancelledSuccess', { activity: actName }));
        setTimeout(() => setFeedbackMsg(null), 4500);
      } else {
        setErrorMsg(res.error || t('studentPortal.absenceReportError'));
      }
    } finally {
      setCancellingAbsenceId(null);
    }
  };


  // Semanas naturales estrictas (Lunes = índice 0 a Domingo = índice 6)
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() =>
    getMondayIndex(getMadridTodayDate())
  );

  const todayMondayIndex = useMemo(
    () => getMondayIndex(getMadridTodayDate()),
    [weekOffset]
  );

  // Generar la tira de 7 días de lunes a domingo según weekOffset
  const sevenDays = useMemo(() => {
    const madridToday = getMadridTodayDate();
    const todayIso = toMadridIsoDate(madridToday);

    const yesterdayDate = new Date(madridToday);
    yesterdayDate.setDate(madridToday.getDate() - 1);
    const yesterdayIso = toMadridIsoDate(yesterdayDate);

    const daysSinceMonday = getMondayIndex(madridToday);
    const baseStartOffset = -daysSinceMonday + weekOffset * 7;

    const days = [];

    const dayNamesShort = [
      t('common.daysShort.d0'),
      t('common.daysShort.d1'),
      t('common.daysShort.d2'),
      t('common.daysShort.d3'),
      t('common.daysShort.d4'),
      t('common.daysShort.d5'),
      t('common.daysShort.d6')
    ];
    const monthNamesShort = [
      t('common.monthsShort.m01'),
      t('common.monthsShort.m02'),
      t('common.monthsShort.m03'),
      t('common.monthsShort.m04'),
      t('common.monthsShort.m05'),
      t('common.monthsShort.m06'),
      t('common.monthsShort.m07'),
      t('common.monthsShort.m08'),
      t('common.monthsShort.m09'),
      t('common.monthsShort.m10'),
      t('common.monthsShort.m11'),
      t('common.monthsShort.m12')
    ];

    for (let i = 0; i < 7; i++) {
      const offset = baseStartOffset + i;
      const d = new Date(madridToday);
      d.setDate(madridToday.getDate() + offset);

      const dayOfWeekNum = d.getDay();
      const dayOfMonth = d.getDate();
      const monthNum = d.getMonth();
      const isoDate = toMadridIsoDate(d);

      let tag = '';
      if (isoDate === todayIso) {
        tag = t('calendarView.todayTag');
      }

      days.push({
        index: i,
        offset,
        dateObj: d,
        isoDate,
        dayOfWeekNum,
        dayName: dayNamesShort[dayOfWeekNum],
        sublabel: `${dayOfMonth} ${monthNamesShort[monthNum]}`,
        tag,
        isToday: isoDate === todayIso,
        isWeekend: dayOfWeekNum === 0 || dayOfWeekNum === 6
      });
    }

    return days;
  }, [weekOffset, t]);

  const selectedDay = sevenDays[selectedDayIndex] || sevenDays[0];

  // Mapear actividades locales y sesiones registradas para una fecha concreta
  const getEventsForDay = useCallback(
    (dayInfo: (typeof sevenDays)[number]) => {
      const dayOfWeek = dayInfo.dayOfWeekNum;
      const dayNamesSpanish = [
        'domingo',
        'lunes',
        'martes',
        'miércoles',
        'jueves',
        'viernes',
        'sábado'
      ];
      const targetDayName = dayNamesSpanish[dayOfWeek];

      const result: CalendarEventItem[] = [];

      // 1. Actividades locales configuradas en el centro
      activities.forEach(act => {
        if (!act.active) return;
        const teacher = teachers.find(t => t.id === act.teacherId);

        const matchesSchedule = act.schedule.some(s => {
          const sLower = s.toLowerCase();
          if (targetDayName === 'miércoles') {
            return sLower.includes('miercoles') || sLower.includes('miércoles');
          }
          if (targetDayName === 'sábado') {
            return sLower.includes('sabado') || sLower.includes('sábado');
          }
          return sLower.includes(targetDayName);
        });

        if (matchesSchedule) {
          let startTime = '18:00';
          let endTime = '19:30';

          const scheduleStr = act.schedule[0] || '';
          const timeMatch = scheduleStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
          if (timeMatch) {
            startTime = timeMatch[1].padStart(5, '0');
            endTime = timeMatch[2].padStart(5, '0');
          }

          result.push({
            id: `act-${act.id}-${dayInfo.isoDate}`,
            title: act.name,
            startTime,
            endTime,
            date: dayInfo.isoDate,
            teacherName: teacher?.name || t('calendarView.defaultTeacherTriskell'),
            room: act.room,
            activityName: act.name,
            category: act.category,
            billingMode: act.billingMode,
            price:
              act.billingMode === 'per_class'
                ? act.defaultPricePerClass
                : act.defaultPriceMonthly,
            description: act.description,
            activityId: act.id
          });
        }
      });

      // 2. Sesiones registradas en el centro para esa fecha exacta
      sessions
        .filter(s => s.date === dayInfo.isoDate)
        .forEach(sess => {
          const act = activities.find(a => a.id === sess.activityId);
          const teacher = teachers.find(item => item.id === sess.teacherId);
          if (!result.some(r => r.id === `sess-${sess.id}`)) {
            result.push({
              id: `sess-${sess.id}`,
              title: sess.topic || act?.name || t('calendarView.defaultSessionTitle'),
              startTime: '19:00',
              endTime: '20:15',
              date: sess.date,
              teacherName: teacher?.name || t('calendarView.defaultTeacher'),
              room: act?.room || t('calendarView.defaultRoom'),
              category: act?.category || t('calendarView.defaultCategory'),
              description: t('calendarView.sessionDescription', {
                minutes: sess.durationMinutes,
                count: sess.attendeesCount
              })
            });
          }
        });

      return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    [activities, teachers, sessions, t]
  );

  const eventsForSelectedDay = useMemo(
    () => getEventsForDay(selectedDay),
    [getEventsForDay, selectedDay]
  );

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* =========================================================================
          SECCIÓN SUPERIOR: CALENDARIO LOCAL + TIRA DE 7 DÍAS
          ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-3 sm:p-5 shadow-xs space-y-2.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('calendarView.title')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('calendarView.subtitle', { timezone: MADRID_TIMEZONE })}
            </p>
          </div>

          {onOpenAddSession && (currentRole === UserRole.Admin || currentRole === UserRole.Monitor || currentRole === UserRole.Hibrido) && (
            <button
              type="button"
              onClick={onOpenAddSession}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold transition shadow-xs active:scale-95 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              <span>{t('calendarView.addSessionButton')}</span>
            </button>
          )}
        </div>

        {/* Controles de navegación semanal para la tira de 7 días */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 w-full">
          <button
            type="button"
            onClick={() => {
              setWeekOffset(prev => prev - 1);
              setSelectedDayIndex(0);
            }}
            className="inline-flex items-center justify-center gap-0.5 sm:gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap flex-1 sm:flex-initial min-w-0"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('calendarView.prevWeek')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWeekOffset(0);
              setSelectedDayIndex(getMondayIndex(getMadridTodayDate()));
            }}
            className={`inline-flex items-center justify-center rounded-xl px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0 active:scale-95 ${
              weekOffset !== 0 || selectedDayIndex !== todayMondayIndex
                ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            {t('calendarView.backToToday')}
          </button>

          <button
            type="button"
            onClick={() => {
              setWeekOffset(prev => prev + 1);
              setSelectedDayIndex(0);
            }}
            className="inline-flex items-center justify-center gap-0.5 sm:gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap flex-1 sm:flex-initial min-w-0"
          >
            <span className="truncate">{t('calendarView.nextWeek')}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>

        {/* LA TIRA DE 7 DÍAS (Lunes a Domingo) */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2.5 py-0.5 px-0.5 sm:py-1 sm:px-0">
          {sevenDays.map((day, idx) => {
            const isSelected = selectedDayIndex === idx;
            const dayTotalEvents = getEventsForDay(day).length;

            return (
              <button
                key={day.isoDate}
                type="button"
                onClick={() => setSelectedDayIndex(idx)}
                className={`relative grid grid-rows-[14px_1fr_14px] items-center justify-items-center w-full min-w-0 h-[66px] sm:h-[84px] py-1 px-0.5 sm:py-1.5 sm:px-2 rounded-xl sm:rounded-2xl transition-all active:scale-95 text-center whitespace-nowrap overflow-hidden ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-slate-900'
                    : day.isToday
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-2 border-emerald-500/40 hover:bg-emerald-100/60'
                    : day.isWeekend
                    ? 'bg-slate-100/70 dark:bg-slate-950/45 text-slate-500 dark:text-slate-400 border border-slate-200/55 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {/* Franja superior fija (14px exactos) para HOY/Ayer o mes */}
                <span className="h-[14px] w-full flex items-center justify-center overflow-hidden px-0.5">
                  {day.tag ? (
                    <span
                      className={`inline-flex items-center justify-center max-w-full truncate rounded-full px-1 h-[13px] text-[7.5px] sm:text-[9px] font-black uppercase tracking-tight leading-none whitespace-nowrap ${
                        isSelected
                          ? 'bg-white text-emerald-700'
                          : day.isToday
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {day.tag}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center h-[13px] text-[8.5px] sm:text-[10px] font-semibold uppercase tracking-wide leading-none whitespace-nowrap ${
                        isSelected
                          ? 'text-emerald-100'
                          : day.isWeekend
                          ? 'text-slate-400/90 dark:text-slate-400/80'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {day.sublabel.split(' ')[1]}
                    </span>
                  )}
                </span>

                {/* Día de semana y número centrados de forma uniforme */}
                <div className="flex flex-col items-center justify-center leading-none">
                  <span
                    className={`text-[9px] sm:text-[10.5px] font-bold uppercase tracking-wider leading-none whitespace-nowrap ${
                      isSelected
                        ? 'text-emerald-100'
                        : day.isWeekend && !day.isToday
                        ? 'text-slate-400 dark:text-slate-400/85'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {day.dayName}
                  </span>
                  <span className="text-[15px] sm:text-xl font-black mt-0.5 leading-none tabular-nums whitespace-nowrap">
                    {day.dateObj.getDate()}
                  </span>
                </div>

                {/* Franja inferior fija (14px exactos) para contador de eventos centrado */}
                <span className="h-[14px] w-full flex items-center justify-center">
                  {dayTotalEvents > 0 && (
                    <span
                      className={`inline-flex items-center justify-center rounded-full min-w-[14px] h-[13px] sm:min-w-[16px] sm:h-[14px] px-1 text-[8px] sm:text-[9px] font-black leading-none tabular-nums whitespace-nowrap ${
                        isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {dayTotalEvents}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECCIÓN CENTRAL: VISTA DIARIA PARA EL DÍA SELECCIONADO
          ========================================================================= */}
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {t('calendarView.dailySchedulePrefix')}
              </span>
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-xs font-black text-emerald-800 dark:text-emerald-300 capitalize">
                {selectedDay.dateObj.toLocaleDateString(
                  language === 'gl' ? 'gl-ES' : language === 'en' ? 'en-US' : 'es-ES',
                  {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  }
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('calendarView.scheduledCount', { count: eventsForSelectedDay.length })}
            </p>
          </div>
        </div>

        {eventsForSelectedDay.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <Info className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">
              {t('calendarView.emptyTitle')}
            </p>
            <p>{t('calendarView.emptySubtitle')}</p>
            {onNavigateToActivities && (
              <button
                type="button"
                onClick={onNavigateToActivities}
                className="mt-3 inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                {t('calendarView.viewAllActivities')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3.5">
            {eventsForSelectedDay.map(event => (
              <div
                key={event.id}
                className="min-w-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-emerald-500/40 p-4 flex flex-col justify-between gap-3 shadow-xs transition-all"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-2.5 py-1 text-xs font-black shadow-xs shrink-0">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {event.startTime} - {event.endTime}
                      </span>
                    </span>

                    {event.category && (
                      <span className="max-w-full rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 border border-emerald-500/20 uppercase tracking-wide">
                        {event.category}
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight break-words">
                    {event.title}
                  </h4>

                  {event.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3 whitespace-pre-line break-words">
                      {event.description}
                    </p>
                  )}
                </div>

                {/* Metadatos móvil: cajas 2 columnas */}
                {(event.teacherName || event.room) && (
                  <div className="sm:hidden grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    <div className="rounded-xl bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.monitorLabel')}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                        {event.teacherName || t('calendarView.defaultTeacherTriskell')}
                      </span>
                    </div>

                    <div className="rounded-xl bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.roomLabel')}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                        {event.room || t('calendarView.defaultRoom')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Metadatos escritorio / tablet (sm+) */}
                <div className="hidden sm:flex pt-2 border-t border-slate-200/70 dark:border-slate-800 flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
                    {event.teacherName && (
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-indigo-500" />
                        <span className="font-semibold">{event.teacherName}</span>
                      </div>
                    )}
                    {event.room && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span>{event.room}</span>
                      </div>
                    )}
                  </div>
                </div>
                {(() => {
                const matchedActivity = event.activityId
                  ? activities.find(a => a.id === event.activityId)
                  : undefined;
                const eventTeacher = matchedActivity
                  ? teachers.find(item => item.id === matchedActivity.teacherId)
                  : undefined;
                const isAssignedToMe = matchedActivity
                  ? matchedActivity.teacherId === currentTeacher?.id
                  : false;
                const showRequestAction =
                  Boolean(matchedActivity) &&
                  (isStudent || isSocio || (isUnion && !isAssignedToMe));

                if (!matchedActivity || !showRequestAction) return null;

                const myEnrollment = currentStudent?.activities.find(
                  a => a.activityId === matchedActivity.id
                );
                const myPendingEnrollment = (currentStudent?.pendingEnrollments || []).find(
                  a => a.activityId === matchedActivity.id
                );
                const derivedStatus = myEnrollment
                  ? myEnrollment.status === 'pending_unenroll' ||
                    myEnrollment.status === 'pending_withdrawal'
                    ? 'pending_withdrawal'
                    : 'approved'
                  : myPendingEnrollment || legacyRequestedIds.includes(matchedActivity.id)
                  ? 'pending_enrollment'
                  : null;
                const status =
                  matchedActivity.id in statusOverrideByActivity
                    ? statusOverrideByActivity[matchedActivity.id]
                    : derivedStatus;
                const isLoading = Boolean(loadingByActivity[matchedActivity.id]);

                const btnText =
                  status === 'pending_enrollment'
                    ? t('activitiesView.requestPending')
                    : status === 'approved'
                    ? t('activitiesView.selfUnenrollButton')
                    : status === 'pending_withdrawal'
                    ? t('activitiesView.withdrawalPending')
                    : t('activitiesView.requestEnrollment');

                const btnTitle =
                  status === 'pending_enrollment'
                    ? t('activitiesView.cancelRequestButton')
                    : status === 'approved'
                    ? t('activitiesView.selfUnenrollTooltip', { activity: matchedActivity.name })
                    : status === 'pending_withdrawal'
                    ? t('activitiesView.cancelDropTooltip')
                    : undefined;

                const btnStyle =
                  status === 'pending_enrollment' || status === 'pending_withdrawal'
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                    : status === 'approved'
                    ? 'border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white'
                    : 'border border-transparent bg-emerald-600 text-white hover:bg-emerald-700';

                const existingAbsenceForDay: StudentAbsence | undefined = currentStudent
                  ? studentAbsences.find(
                      abs =>
                        abs.studentId === currentStudent.id &&
                        abs.activityId === matchedActivity.id &&
                        abs.sessionDate?.slice(0, 10) === selectedDay.isoDate &&
                        abs.status !== 'cancelled'
                    )
                  : undefined;
                const canCancelExistingAbsence = existingAbsenceForDay
                  ? canStudentCancelAbsence(existingAbsenceForDay, sessions)
                  : false;
                const isCancellingThisAbsence = Boolean(
                  existingAbsenceForDay && cancellingAbsenceId === existingAbsenceForDay.id
                );

                return (
                  <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 space-y-2">
                    {existingAbsenceForDay && (
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                            existingAbsenceForDay.status === 'pending'
                              ? 'border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                              : existingAbsenceForDay.status === 'approved'
                              ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : existingAbsenceForDay.status === 'rejected'
                              ? 'border-rose-500/35 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'border-sky-500/35 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          <CalendarX2 className="h-3 w-3 shrink-0" />
                          <span>
                            {existingAbsenceForDay.status === 'pending'
                              ? t('studentPortal.absenceStatus.pending')
                              : existingAbsenceForDay.status === 'approved'
                              ? t('studentPortal.absenceStatus.approved')
                              : existingAbsenceForDay.status === 'rejected'
                              ? t('studentPortal.absenceStatus.rejected')
                              : t('studentPortal.absenceStatus.reported')}
                          </span>
                        </span>
                        {existingAbsenceForDay.reason && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                            {existingAbsenceForDay.reason}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {status === 'approved' && currentStudent && (
                        existingAbsenceForDay && canCancelExistingAbsence ? (
                          <button
                            type="button"
                            disabled={isCancellingThisAbsence}
                            onClick={() =>
                              handleCancelAbsenceNotice(existingAbsenceForDay.id, matchedActivity.name)
                            }
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shadow-xs whitespace-nowrap active:scale-[0.99] disabled:opacity-60"
                          >
                            {isCancellingThisAbsence ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span>{t('studentPortal.cancelAbsenceButton')}</span>
                          </button>
                        ) : !existingAbsenceForDay ? (
                          <button
                            type="button"
                            onClick={() => openReportAbsenceModal(matchedActivity, selectedDay.isoDate)}
                            aria-label={t('studentPortal.reportAbsenceAria', {
                              name: matchedActivity.name
                            })}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/25 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-600 hover:text-white dark:hover:bg-sky-600 dark:hover:text-white transition shadow-xs whitespace-nowrap active:scale-[0.99] cursor-pointer"
                          >
                            <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
                            <span>{t('studentPortal.reportAbsenceButton')}</span>
                          </button>
                        ) : null
                      )}

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleEnrollmentButtonAction(matchedActivity, status)}
                        title={btnTitle}
                        aria-busy={isLoading}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs whitespace-nowrap active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${btnStyle}`}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : status === 'approved' ? (
                          <UserMinus className="h-3.5 w-3.5 shrink-0" />
                        ) : status === 'pending_enrollment' || status === 'pending_withdrawal' ? (
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Send className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{btnText}</span>
                      </button>

                      {status === 'pending_enrollment' && eventTeacher?.phone && (
                        <a
                          href={`https://wa.me/${eventTeacher.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            t('activitiesView.whatsappMessage', {
                              teacher: eventTeacher.name,
                              activity: matchedActivity.name
                            })
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          title={t('activitiesView.whatsappTooltip')}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 sm:px-3 sm:py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition whitespace-nowrap shrink-0"
                        >
                          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="hidden sm:inline">{t('activitiesView.whatsapp')}</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })()}  
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal para avisar o solicitar ausencia desde el calendario */}
      {absenceModalActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmReportAbsence}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                    isTargetAbsenceClosedOrPast
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                  }`}
                >
                  <CalendarX2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isTargetAbsenceClosedOrPast
                      ? t('studentPortal.absenceModal.requestTitle')
                      : t('studentPortal.absenceModal.title')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {absenceModalActivity.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isReportingAbsence}
                onClick={() => setAbsenceModalActivity(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isTargetAbsenceClosedOrPast && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-[11px] font-medium text-amber-800 dark:text-amber-200 flex items-start gap-2 leading-relaxed">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>{t('studentPortal.absenceModal.closedOrPastNotice')}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('studentPortal.absenceModal.dateLabel')}
              </label>
              <input
                type="date"
                required
                value={absenceDate}
                onChange={e => setAbsenceDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-sky-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('studentPortal.absenceModal.reasonLabel')}
              </label>
              <textarea
                rows={2}
                value={absenceReason}
                onChange={e => setAbsenceReason(e.target.value)}
                placeholder={t('studentPortal.absenceModal.reasonPlaceholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-sky-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isReportingAbsence}
                onClick={() => {
                  setAbsenceModalActivity(null);
                  setAbsenceReason('');
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                {t('studentPortal.absenceModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isReportingAbsence || !absenceDate}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${
                  isTargetAbsenceClosedOrPast
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {isReportingAbsence && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isReportingAbsence
                    ? t('studentPortal.absenceModal.submitting')
                    : isTargetAbsenceClosedOrPast
                    ? t('studentPortal.absenceModal.submitRequest')
                    : t('studentPortal.absenceModal.submit')}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
