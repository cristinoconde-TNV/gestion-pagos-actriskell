import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { createTranslator } from '../lib/i18n';
import { getStoredSupabaseConfig, supabase } from '../lib/supabase';
import { Activity, ClassSession, Student, StudentAbsence, UserRole } from '../types';

export interface ClassParticipant {
  studentId: string;
  studentName: string;
  attendanceState: 'attending' | 'absent';
  statusSource: 'session' | 'absence' | 'enrolled';
  isSelf: boolean;
}

export interface ClassParticipantsTriggerProps {
  activity: Pick<Activity, 'id' | 'name' | 'category' | 'teacherId'>;
  sessionDate: string;
  currentStudentId?: string;
  variant?: 'modal' | 'collapsible';
  className?: string;
}

function normalizeDateKey(value?: string | null): string {
  return (value || '').trim().slice(0, 10);
}

function isRpcMissingError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = (error.code || '').toUpperCase();
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('could not find the function') ||
    msg.includes('get_class_participants')
  );
}

function buildLocalClassParticipants(params: {
  activityId: string;
  sessionDate: string;
  currentStudentId?: string;
  students: Student[];
  sessions: ClassSession[];
  studentAbsences: StudentAbsence[];
}): ClassParticipant[] {
  const { activityId, sessionDate, currentStudentId, students, sessions, studentAbsences } = params;
  const targetDate = normalizeDateKey(sessionDate);

  const matchingSession = sessions.find(
    sess => sess.activityId === activityId && normalizeDateKey(sess.date) === targetDate
  );

  const sessionMap = new Map<string, { studentName: string; attendance: 'present' | 'absent' | 'partial' }>();
  if (matchingSession?.attendanceRecords) {
    for (const rec of matchingSession.attendanceRecords) {
      if (!rec.studentId) continue;
      sessionMap.set(rec.studentId, {
        studentName: rec.studentName || '',
        attendance: rec.attendance
      });
    }
  }

  const confirmedAbsenceIds = new Set<string>();
  for (const abs of studentAbsences) {
    if (
      abs.activityId === activityId &&
      normalizeDateKey(abs.sessionDate) === targetDate &&
      (abs.status === 'reported' || abs.status === 'approved')
    ) {
      confirmedAbsenceIds.add(abs.studentId);
    }
  }

  const byId = new Map<string, ClassParticipant>();

  for (const stu of students) {
    if (stu.status === 'inactive') continue;
    const hasActiveEnrollment = stu.activities.some(
      a =>
        a.activityId === activityId &&
        a.active !== false &&
        a.status !== 'inactive' &&
        a.status !== 'pending' &&
        a.status !== 'pending_enrollment' &&
        a.status !== 'rejected'
    );
    if (!hasActiveEnrollment && !sessionMap.has(stu.id)) continue;

    const sessionRecord = sessionMap.get(stu.id);
    const hasConfirmedAbsence = confirmedAbsenceIds.has(stu.id);

    let attendanceState: 'attending' | 'absent' = 'attending';
    let statusSource: 'session' | 'absence' | 'enrolled' = 'enrolled';

    if (sessionRecord) {
      attendanceState = sessionRecord.attendance === 'absent' ? 'absent' : 'attending';
      statusSource = 'session';
    } else if (hasConfirmedAbsence) {
      attendanceState = 'absent';
      statusSource = 'absence';
    }

    byId.set(stu.id, {
      studentId: stu.id,
      studentName: stu.name || sessionRecord?.studentName || 'Alumno',
      attendanceState,
      statusSource,
      isSelf: Boolean(currentStudentId && stu.id === currentStudentId)
    });
  }

  for (const [stuId, rec] of sessionMap.entries()) {
    if (byId.has(stuId)) continue;
    byId.set(stuId, {
      studentId: stuId,
      studentName: rec.studentName || 'Alumno',
      attendanceState: rec.attendance === 'absent' ? 'absent' : 'attending',
      statusSource: 'session',
      isSelf: Boolean(currentStudentId && stuId === currentStudentId)
    });
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.studentName.localeCompare(b.studentName, undefined, { sensitivity: 'base' });
  });
}

interface ClassParticipantsBodyProps {
  participants: ClassParticipant[];
  isLoading: boolean;
  errorMsg: string | null;
  onRetry: () => void;
  t: ReturnType<typeof createTranslator>;
}

const ClassParticipantsBody: React.FC<ClassParticipantsBodyProps> = ({
  participants,
  isLoading,
  errorMsg,
  onRetry,
  t
}) => {
  const attending = useMemo(
    () => participants.filter(p => p.attendanceState === 'attending'),
    [participants]
  );
  const absent = useMemo(
    () => participants.filter(p => p.attendanceState === 'absent'),
    [participants]
  );

  if (isLoading && participants.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
        <span>{t('classParticipants.loading')}</span>
      </div>
    );
  }

  if (errorMsg && participants.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="leading-relaxed">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-slate-800 transition whitespace-nowrap cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span>{t('classParticipants.retryButton')}</span>
        </button>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <Users className="h-6 w-6 mx-auto text-slate-300 dark:text-slate-600" />
        <p className="font-medium">{t('classParticipants.emptyTotal')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen numérico limpio */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
          <Users className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
          <span>{t('classParticipants.summaryTotal', { count: participants.length })}</span>
        </span>
        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
          ·
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
          <UserCheck className="h-3.5 w-3.5 shrink-0" />
          <span>{t('classParticipants.summaryAttending', { count: attending.length })}</span>
        </span>
        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
          ·
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
          <UserX className="h-3.5 w-3.5 shrink-0" />
          <span>{t('classParticipants.summaryAbsent', { count: absent.length })}</span>
        </span>
      </div>

      {/* Grupo 1: Asistirán */}
      <section className="space-y-1.5">
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
          <span>{t('classParticipants.attendingSectionTitle')}</span>
          <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {attending.length}
          </span>
        </h5>
        {attending.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            {t('classParticipants.emptyAttending')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            {attending.map(person => (
              <li
                key={person.studentId}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {person.studentName}
                  </span>
                  {person.isSelf && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 shrink-0">
                      {t('classParticipants.youTag')}
                    </span>
                  )}
                </div>
                {person.statusSource === 'session' && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                    {t('classParticipants.statusConfirmedSession')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Grupo 2: Se ausentarán (sin motivo) */}
      <section className="space-y-1.5">
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
          <span>{t('classParticipants.absentSectionTitle')}</span>
          <span className="font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
            {absent.length}
          </span>
        </h5>
        {absent.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            {t('classParticipants.emptyAbsent')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
            {absent.map(person => (
              <li
                key={person.studentId}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <UserX className="h-3.5 w-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                    {person.studentName}
                  </span>
                  {person.isSelf && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-500/12 text-rose-700 dark:text-rose-300 shrink-0">
                      {t('classParticipants.youTag')}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                  {person.statusSource === 'session'
                    ? t('classParticipants.statusConfirmedSession')
                    : t('classParticipants.statusAbsentNotice')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
        <span>{t('classParticipants.privacyNote')}</span>
      </div>
    </div>
  );
};

export const ClassParticipantsTrigger: React.FC<ClassParticipantsTriggerProps> = ({
  activity,
  sessionDate,
  currentStudentId,
  variant = 'modal',
  className = ''
}) => {
  const { currentRole, currentTeacherId, language } = useAuth();
  const { students, sessions, studentAbsences } = useAcademyData();
  const t = useMemo(() => createTranslator(language), [language]);
  const titleId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedCount, setHasLoadedCount] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawParticipants, setRawParticipants] = useState<ClassParticipant[]>([]);

  const studentsRef = useRef(students);
  studentsRef.current = students;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const studentAbsencesRef = useRef(studentAbsences);
  studentAbsencesRef.current = studentAbsences;

  const normalizedDate = normalizeDateKey(sessionDate);

  const hasFullLocalRoster = useMemo(() => {
    if (currentRole === UserRole.Admin) return true;
    if (
      (currentRole === UserRole.Monitor || currentRole === UserRole.Hibrido) &&
      currentTeacherId &&
      activity.teacherId === currentTeacherId
    ) {
      return true;
    }
    return false;
  }, [currentRole, currentTeacherId, activity.teacherId]);

  const selfSyncSignature = useMemo(() => {
    if (!currentStudentId) return '';
    const selfAbs = studentAbsences.find(
      a =>
        a.studentId === currentStudentId &&
        a.activityId === activity.id &&
        normalizeDateKey(a.sessionDate) === normalizedDate &&
        a.status !== 'cancelled'
    );
    const matchingSess = sessions.find(
      s => s.activityId === activity.id && normalizeDateKey(s.date) === normalizedDate
    );
    const selfRec = matchingSess?.attendanceRecords?.find(r => r.studentId === currentStudentId);
    return `${selfAbs?.status || 'none'}:${selfRec?.attendance || 'none'}`;
  }, [currentStudentId, studentAbsences, sessions, activity.id, normalizedDate]);

  const fetchParticipants = useCallback(async () => {
    if (!activity.id || !normalizedDate) return;

    const sbCfg = getStoredSupabaseConfig();
    if (!sbCfg.isEnabled) {
      if (hasFullLocalRoster) {
        setRawParticipants(
          buildLocalClassParticipants({
            activityId: activity.id,
            sessionDate: normalizedDate,
            currentStudentId,
            students: studentsRef.current,
            sessions: sessionsRef.current,
            studentAbsences: studentAbsencesRef.current
          })
        );
        setErrorMsg(null);
        setHasLoadedCount(true);
      } else {
        setRawParticipants([]);
        setErrorMsg(t('classParticipants.rpcMissingError'));
        setHasLoadedCount(false);
      }
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.rpc('get_class_participants', {
        p_activity_id: activity.id,
        p_session_date: normalizedDate
      });

      if (error) {
        if (hasFullLocalRoster && isRpcMissingError(error)) {
          setRawParticipants(
            buildLocalClassParticipants({
              activityId: activity.id,
              sessionDate: normalizedDate,
              currentStudentId,
              students: studentsRef.current,
              sessions: sessionsRef.current,
              studentAbsences: studentAbsencesRef.current
            })
          );
          setErrorMsg(null);
          setHasLoadedCount(true);
          return;
        }
        setErrorMsg(
          isRpcMissingError(error)
            ? t('classParticipants.rpcMissingError')
            : error.message || t('classParticipants.loadError')
        );
        setHasLoadedCount(false);
        return;
      }

      const mapped: ClassParticipant[] = Array.isArray(data)
        ? data.map((row: any) => ({
            studentId: String(row.student_id || ''),
            studentName: String(row.student_name || 'Alumno'),
            attendanceState: row.attendance_state === 'absent' ? 'absent' : 'attending',
            statusSource:
              row.status_source === 'session'
                ? 'session'
                : row.status_source === 'absence'
                ? 'absence'
                : 'enrolled',
            isSelf: Boolean(row.is_self) || Boolean(currentStudentId && row.student_id === currentStudentId)
          }))
        : [];

      mapped.sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
        return a.studentName.localeCompare(b.studentName, undefined, { sensitivity: 'base' });
      });

      setRawParticipants(mapped);
      setHasLoadedCount(true);
    } catch {
      if (hasFullLocalRoster) {
        setRawParticipants(
          buildLocalClassParticipants({
            activityId: activity.id,
            sessionDate: normalizedDate,
            currentStudentId,
            students: studentsRef.current,
            sessions: sessionsRef.current,
            studentAbsences: studentAbsencesRef.current
          })
        );
        setErrorMsg(null);
        setHasLoadedCount(true);
      } else {
        setErrorMsg(t('classParticipants.loadError'));
        setHasLoadedCount(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    activity.id,
    normalizedDate,
    hasFullLocalRoster,
    currentStudentId,
    t
  ]);

  useEffect(() => {
    void fetchParticipants();
  }, [fetchParticipants, selfSyncSignature]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchParticipants();
  }, [isOpen, fetchParticipants]);

  useEffect(() => {
    if (!isOpen || variant !== 'modal') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, variant]);

  // Reflejar al instante cambios locales del propio alumno (al avisar o cancelar ausencia)
  const participants = useMemo(() => {
    if (!currentStudentId || rawParticipants.length === 0) return rawParticipants;

    const matchingSess = sessions.find(
      s => s.activityId === activity.id && normalizeDateKey(s.date) === normalizedDate
    );
    const selfSessRec = matchingSess?.attendanceRecords?.find(r => r.studentId === currentStudentId);
    const selfAbsence = studentAbsences.find(
      a =>
        a.studentId === currentStudentId &&
        a.activityId === activity.id &&
        normalizeDateKey(a.sessionDate) === normalizedDate &&
        (a.status === 'reported' || a.status === 'approved')
    );

    return rawParticipants.map((item): ClassParticipant => {
      if (item.studentId !== currentStudentId) return item;
      if (selfSessRec) {
        return {
          ...item,
          isSelf: true,
          attendanceState: selfSessRec.attendance === 'absent' ? 'absent' : 'attending',
          statusSource: 'session'
        };
      }
      if (selfAbsence) {
        return {
          ...item,
          isSelf: true,
          attendanceState: 'absent',
          statusSource: 'absence'
        };
      }
      return {
        ...item,
        isSelf: true,
        attendanceState: 'attending',
        statusSource: 'enrolled'
      };
    });
  }, [rawParticipants, currentStudentId, sessions, studentAbsences, activity.id, normalizedDate]);

  const formattedDate = useMemo(() => {
    const [y, m, d] = normalizedDate.split('-').map(Number);
    if (!y || !m || !d) return normalizedDate;
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    const locale = language === 'gl' ? 'gl-ES' : language === 'en' ? 'en-US' : 'es-ES';
    return dt.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }, [normalizedDate, language]);

  const showCountOnTrigger = hasLoadedCount && !errorMsg;
  const count = participants.length;

  if (variant === 'collapsible') {
    return (
      <div className={`w-full ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          aria-expanded={isOpen}
          aria-label={t('classParticipants.buttonAria', { name: activity.name })}
          className="w-full inline-flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 min-h-[40px] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums">
            <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {isOpen
                ? showCountOnTrigger
                  ? t('classParticipants.collapseLabelWithCount', { count })
                  : t('classParticipants.collapseLabel')
                : showCountOnTrigger
                ? t('classParticipants.expandLabelWithCount', { count })
                : t('classParticipants.expandLabel')}
            </span>
          </span>
          {isOpen ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
        </button>

        {isOpen && (
          <div className="mt-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <ClassParticipantsBody
              participants={participants}
              isLoading={isLoading}
              errorMsg={errorMsg}
              onRetry={() => void fetchParticipants()}
              t={t}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t('classParticipants.buttonAria', { name: activity.name })}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 min-h-[38px] text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition shadow-xs whitespace-nowrap shrink-0 tabular-nums active:scale-[0.99] cursor-pointer ${className}`}
      >
        <Users className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          {showCountOnTrigger
            ? t('classParticipants.buttonLabelWithCount', { count })
            : t('classParticipants.buttonLabel')}
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={() => setIsOpen(false)}
          >
            <div
              className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Cabecera */}
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h4
                      id={titleId}
                      className="text-sm font-extrabold text-slate-900 dark:text-white truncate"
                    >
                      {t('classParticipants.modalTitle')}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {activity.name}
                    <span aria-hidden="true"> · </span>
                    <span className="capitalize">{formattedDate}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label={t('classParticipants.closeButton')}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Cuerpo */}
              <div className="p-5 overflow-y-auto flex-1">
                <ClassParticipantsBody
                  participants={participants}
                  isLoading={isLoading}
                  errorMsg={errorMsg}
                  onRetry={() => void fetchParticipants()}
                  t={t}
                />
              </div>

              {/* Pie */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
                <button
                  type="button"
                  onClick={() => void fetchParticipants()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{t('classParticipants.retryButton')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-emerald-600 px-4 py-1.5 min-h-[36px] text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-700 transition whitespace-nowrap cursor-pointer"
                >
                  {t('classParticipants.closeButton')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
