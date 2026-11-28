import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Activity,
  ClassClosedBy,
  ClassSession,
  MemberStatusHistoryEntry,
  MemberType,
  NewsNote,
  PaymentMethod,
  Student,
  StudentAbsence,
  Teacher,
  UserRole
} from '../types';
import {
  getOverdueUnrecordedScheduledSessions,
  parseClassAutoCloseConfig,
  shouldAutoCloseSession
} from '../lib/classClosure';
import {
  evaluateWorkshopNoteGraceStatus,
  getStoredActivityEndedAtMap,
  isNewsNoteExpiredByDate,
  parseNewsFinishedWorkshopGraceConfig,
  setStoredActivityEndedAt
} from '../lib/newsConfig';
import {
  mapActivityToDb,
  mapDbActivityToActivity,
  mapDbHistoryToHistory,
  mapDbSessionToSession,
  mapDbStudentToStudent,
  mapDbTeacherToTeacher,
  mapTeacherToDb,
  supabase
} from '../lib/supabase';
import { getMadridDateIso } from '../lib/date';
import { normalizePhoneForStorage } from '../lib/phone';
import {
  INITIAL_ACTIVITIES,
  INITIAL_EXPENSES,
  INITIAL_NEWS_NOTES,
  INITIAL_STUDENTS,
  INITIAL_TEACHERS
} from '../data/initialData';
import { useAuth } from './AuthContext';

export interface AcademyDataContextType {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  studentAbsences: StudentAbsence[];
  setStudentAbsences: React.Dispatch<React.SetStateAction<StudentAbsence[]>>;
  memberStatusHistory: MemberStatusHistoryEntry[];
  setMemberStatusHistory: React.Dispatch<React.SetStateAction<MemberStatusHistoryEntry[]>>;
  sessions: ClassSession[];
  setSessions: React.Dispatch<React.SetStateAction<ClassSession[]>>;
  newsNotes: NewsNote[];
  setNewsNotes: React.Dispatch<React.SetStateAction<NewsNote[]>>;
  readNewsNoteIds: string[];
  setReadNewsNoteIds: React.Dispatch<React.SetStateAction<string[]>>;

  addStatusHistoryEntry: (
    entry: Omit<MemberStatusHistoryEntry, 'id' | 'changedAt'>
  ) => Promise<{ success: boolean; error?: string }>;
  deleteStatusHistoryEntry: (id: string) => Promise<{ success: boolean; error?: string }>;

  addTeacher: (
    teacher: Omit<Teacher, 'id'>
  ) => Promise<{ success: boolean; error?: string; teacherId?: string }>;
  updateTeacher: (
    id: string,
    updates: Partial<Teacher>
  ) => Promise<{ success: boolean; error?: string }>;
  deleteTeacher: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateTeacherAvatar: (teacherId: string, avatarUrl: string) => Promise<void>;

  addActivity: (activity: Omit<Activity, 'id'>) => Promise<void>;
  updateActivity: (id: string, updates: Partial<Activity>) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  upsertEnrollmentRow: (
    studentId: string,
    activityId: string,
    customPrice?: number,
    billingMode?: 'monthly' | 'per_class',
    enrolledSince?: string,
    status?: 'active' | 'pending' | 'rejected',
    extraFields?: Record<string, any>
  ) => Promise<{ data?: any; error: any }>;
  softDeleteEnrollmentRow: (
    studentId: string,
    activityId: string,
    options?: { targetStatus?: 'inactive' | 'rejected'; extraAudit?: Record<string, any> }
  ) => Promise<{ data: any[] | null; error: any }>;

  addStudent: (
    student: Omit<Student, 'id' | 'registeredAt'>
  ) => Promise<{ success: boolean; error?: string }>;
  updateStudent: (
    id: string,
    updates: Partial<Student>
  ) => Promise<{ success: boolean; error?: string }>;
  deleteStudent: (id: string) => Promise<void>;
  enrollStudentInActivity: (
    studentId: string,
    activityId: string,
    customPrice?: number
  ) => Promise<{ success: boolean; error?: string }>;
  updateStudentEnrollment: (params: {
    studentId: string;
    activityId: string;
    newActivityId?: string;
    customPrice?: number | null;
    billingMode?: 'monthly' | 'per_class';
    enrolledSince?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  unenrollStudentFromActivity: (
    studentId: string,
    activityId: string
  ) => Promise<{ success: boolean; error?: string }>;
  resolveStudentIdForCurrentUser: (
    explicitStudentId?: string
  ) => Promise<{ studentId?: string; error?: string }>;
  enrollUserFromProfile: (params: {
    profile: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      studentId?: string;
      teacherId?: string;
    };
    activityId: string;
    customPrice?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  quickCreateAndEnrollStudent: (params: {
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    activityId: string;
    customPrice?: number;
  }) => Promise<{ success: boolean; studentId?: string; error?: string }>;

  addClassSession: (session: Omit<ClassSession, 'id'>) => Promise<void>;
  deleteClassSession: (id: string) => Promise<void>;
  closeClassSession: (params: {
    sessionId?: string;
    activityId: string;
    teacherId: string;
    date: string;
    closedBy: ClassClosedBy;
    attendeesCount?: number;
    durationMinutes?: number;
    topic?: string;
    attendanceRecords?: ClassSession['attendanceRecords'];
  }) => Promise<{ success: boolean; error?: string }>;
  reopenClassSession: (params: {
    sessionId?: string;
    activityId: string;
    teacherId: string;
    date: string;
    reason: string;
    reopenedBy: 'profesor' | 'administrador';
  }) => Promise<{ success: boolean; error?: string }>;
  upsertSessionAttendance: (params: {
    activityId: string;
    teacherId: string;
    date: string;
    studentId: string;
    studentName: string;
    attendance: 'present' | 'absent' | 'partial';
    durationMinutes?: number;
    topic?: string;
    paid?: boolean;
    paidAmount?: number;
    paymentMethod?: PaymentMethod;
    paymentId?: string;
    enrolledStudents?: Array<{ id: string; name: string }>;
  }) => Promise<{ success: boolean; error?: string }>;

  addNewsNote: (note: Omit<NewsNote, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateNewsNote: (
    id: string,
    updates: {
      title: string;
      content: string;
      category: 'aviso' | 'taller' | 'noticia' | 'general';
      pinned?: boolean;
      activityId?: string;
      activityName?: string;
      expiresAt?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  deleteNewsNote: (id: string) => Promise<{ success: boolean; error?: string }>;
  restoreNewsNote: (id: string) => Promise<{ success: boolean; error?: string }>;
  permanentlyDeleteNewsNote: (id: string) => Promise<{ success: boolean; error?: string }>;
  markNewsNoteRead: (noteId: string, isRead?: boolean) => Promise<void>;

  seedInitialDataToSupabase: () => Promise<void>;
  resetToInitialData: () => Promise<void>;
}

const AcademyDataContext = createContext<AcademyDataContextType | undefined>(undefined);

export const AcademyDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    currentUserRef,
    currentRole,
    currentTeacherId,
    setCurrentStudentId,
    setCurrentUser,
    isStrictAdminSession,
    profiles,
    appConfigs,
    dbSyncVersion,
    setIsLoadingDb,
    setDbError,
    clearDbError,
    handleSupabaseError,
    refreshFromSupabase,
    recordStatusHistoryCycle,
    reevaluateUserOperationalRole,
    t
  } = useAuth();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentAbsences, setStudentAbsences] = useState<StudentAbsence[]>([]);
  const [memberStatusHistory, setMemberStatusHistory] = useState<MemberStatusHistoryEntry[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);

  const [newsNotes, setNewsNotes] = useState<NewsNote[]>(() => {
    try {
      const local = localStorage.getItem('triskell_news_notes');
      return local ? JSON.parse(local) : INITIAL_NEWS_NOTES;
    } catch {
      return INITIAL_NEWS_NOTES;
    }
  });
  const [readNewsNoteIds, setReadNewsNoteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser?.id) {
      setReadNewsNoteIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`triskell_news_reads_${currentUser.id}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setReadNewsNoteIds(
        Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
      );
    } catch {
      setReadNewsNoteIds([]);
    }
  }, [currentUser?.id]);

  // Historial de Estados
  const addStatusHistoryEntry: AcademyDataContextType['addStatusHistoryEntry'] = async entry => {
    clearDbError();
    try {
      const payload = {
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        status: entry.status,
        member_type: entry.memberType || null,
        start_date: entry.startDate,
        end_date: entry.endDate || null,
        notes: entry.notes || null,
        changed_by: entry.changedBy || currentUser?.id || null
      };
      const { data, error } = await supabase
        .from('member_status_history')
        .insert([payload])
        .select('*')
        .single();
      if (error) {
        if (error.code === '42P01') {
          return {
            success: false,
            error: t('appContext.historyTableMissing')
          };
        }
        handleSupabaseError(t('appContext.actions.addHistoryCycle'), error);
        return { success: false, error: error.message };
      }
      if (data) {
        setMemberStatusHistory(prev => [mapDbHistoryToHistory(data), ...prev]);
      }
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || t('appContext.historyAddError') };
    }
  };

  const deleteStatusHistoryEntry: AcademyDataContextType['deleteStatusHistoryEntry'] = async id => {
    clearDbError();
    try {
      const { error } = await supabase.from('member_status_history').delete().eq('id', id);
      if (error) {
        handleSupabaseError(t('appContext.actions.deleteHistoryEntry'), error);
        return { success: false, error: error.message };
      }
      setMemberStatusHistory(prev => prev.filter(h => h.id !== id));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || t('appContext.historyDeleteError') };
    }
  };

  // Monitores
  const addTeacher: AcademyDataContextType['addTeacher'] = async teacher => {
    clearDbError();
    const todayStr = getMadridDateIso();
    const resolvedIsSocio =
      teacher.isSocio !== undefined
        ? teacher.isSocio
        : teacher.memberType !== 'monitor_no_socio' && teacher.memberType !== 'alumno_no_socio';
    const resolvedMemberType: MemberType =
      teacher.memberType || (resolvedIsSocio ? 'socio' : 'monitor_no_socio');
    const teacherWithDefaults: Omit<Teacher, 'id'> = {
      ...teacher,
      phone: normalizePhoneForStorage(teacher.phone),
      isSocio: resolvedIsSocio,
      memberType: resolvedMemberType,
      startDate: teacher.startDate || todayStr,
      endDate: teacher.active ? teacher.endDate : teacher.endDate || todayStr
    };
    const dbPayload = mapTeacherToDb(teacherWithDefaults);
    let insertRes = await supabase.from('teachers').insert([dbPayload]).select().single();

    if (
      insertRes.error &&
      (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
    ) {
      const { is_socio: _s0, ...withoutSocio } = dbPayload;
      insertRes = await supabase.from('teachers').insert([withoutSocio]).select().single();
      if (
        insertRes.error &&
        (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
      ) {
        const {
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...legacyPayload
        } = withoutSocio;
        insertRes = await supabase.from('teachers').insert([legacyPayload]).select().single();
      }
    }

    if (insertRes.error) {
      handleSupabaseError(t('appContext.actions.createTeacher'), insertRes.error);
      return { success: false, error: insertRes.error.message };
    }
    let createdTeacherId: string | undefined;
    if (insertRes.data) {
      const newTeacher = mapDbTeacherToTeacher(insertRes.data);
      createdTeacherId = newTeacher.id;
      setTeachers(prev => [...prev, newTeacher]);
      await recordStatusHistoryCycle({
        entityType: 'teacher',
        entityId: newTeacher.id,
        status: newTeacher.active ? 'active' : 'inactive',
        startDate: newTeacher.startDate || todayStr,
        endDate: newTeacher.endDate,
        notes: t('appContext.notes.teacherCreated')
      });
      if (newTeacher.email) {
        await reevaluateUserOperationalRole({ teacherId: newTeacher.id, email: newTeacher.email });
      }
    }
    await refreshFromSupabase();
    return { success: true, teacherId: createdTeacherId };
  };

  const updateTeacher: AcademyDataContextType['updateTeacher'] = async (id, updates) => {
    clearDbError();
    const current = teachers.find(teacherItem => teacherItem.id === id);
    if (!current) {
      return { success: false, error: t('appContext.teacherNotFound') };
    }
    const todayStr = getMadridDateIso();
    const resolvedIsSocio =
      updates.isSocio !== undefined
        ? updates.isSocio
        : updates.memberType !== undefined
        ? updates.memberType !== 'monitor_no_socio' && updates.memberType !== 'alumno_no_socio'
        : current.isSocio ??
          (current.memberType !== 'monitor_no_socio' && current.memberType !== 'alumno_no_socio');
    const resolvedMemberType: MemberType =
      updates.memberType !== undefined
        ? updates.memberType
        : updates.isSocio !== undefined
        ? updates.isSocio
          ? 'socio'
          : 'monitor_no_socio'
        : current.memberType || (resolvedIsSocio ? 'socio' : 'monitor_no_socio');

    const normalizedUpdates =
      updates.phone !== undefined
        ? { ...updates, phone: normalizePhoneForStorage(updates.phone) }
        : updates;

    const merged: Teacher = {
      ...current,
      ...normalizedUpdates,
      isSocio: resolvedIsSocio,
      memberType: resolvedMemberType
    };
    if (updates.active !== undefined && updates.active !== current.active) {
      if (!updates.active && !merged.endDate) {
        merged.endDate = todayStr;
      } else if (updates.active && updates.endDate === undefined) {
        merged.endDate = undefined;
      }
    }

    const dbPayload = mapTeacherToDb(merged);
    let updateRes = await supabase.from('teachers').update(dbPayload).eq('id', id).select('*');

    if (
      updateRes.error &&
      (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
    ) {
      const { is_socio: _s0, ...withoutSocio } = dbPayload;
      updateRes = await supabase.from('teachers').update(withoutSocio).eq('id', id).select('*');
      if (
        updateRes.error &&
        (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))
      ) {
        const {
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...legacyPayload
        } = withoutSocio;
        updateRes = await supabase.from('teachers').update(legacyPayload).eq('id', id).select('*');
      }
    }

    if (updateRes.error) {
      handleSupabaseError(t('appContext.actions.updateTeacher'), updateRes.error);
      return { success: false, error: updateRes.error.message };
    }

    if (updates.active !== undefined && updates.active !== current.active) {
      await recordStatusHistoryCycle({
        entityType: 'teacher',
        entityId: id,
        status: merged.active ? 'active' : 'inactive',
        startDate: todayStr,
        endDate: merged.active ? undefined : merged.endDate || todayStr,
        notes: merged.active
          ? t('appContext.notes.teacherReactivated')
          : t('appContext.notes.teacherDeactivated')
      });
    }

    if (updates.isSocio !== undefined || updates.memberType !== undefined) {
      const emailNorm = (merged.email || current.email)?.toLowerCase().trim();
      const linkedProfs = profiles.filter(
        p => p.teacherId === id || (emailNorm && p.email.toLowerCase().trim() === emailNorm)
      );
      for (const prof of linkedProfs) {
        const pRes = await supabase
          .from('profiles')
          .update({ is_socio: resolvedIsSocio, member_type: resolvedMemberType })
          .eq('id', prof.id);
        if (pRes.error && (pRes.error.code === '42703' || pRes.error.message?.includes('column'))) {
          await supabase
            .from('profiles')
            .update({ member_type: resolvedMemberType })
            .eq('id', prof.id);
        }
      }
    }

    setTeachers(prev => prev.map(teacherItem => (teacherItem.id === id ? merged : teacherItem)));
    if (
      (updates.active !== undefined && updates.active !== current.active) ||
      (updates.memberType !== undefined && updates.memberType !== current.memberType) ||
      updates.isSocio !== undefined ||
      (updates.email !== undefined && updates.email !== current.email)
    ) {
      await reevaluateUserOperationalRole({ teacherId: id, email: merged.email });
    }
    await refreshFromSupabase();
    return { success: true };
  };

  const deleteTeacher: AcademyDataContextType['deleteTeacher'] = async id => {
    clearDbError();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const authErr = new Error(t('appContext.deleteTeacherSessionRequired'));
        handleSupabaseError(t('appContext.actions.deleteTeacher'), authErr);
        return { success: false, error: authErr.message };
      }

      const targetTeacher = teachers.find(tc => tc.id === id);
      const affectedProfileIds = profiles
        .filter(
          p =>
            p.teacherId === id ||
            (targetTeacher?.email &&
              p.email.toLowerCase().trim() === targetTeacher.email.toLowerCase().trim())
        )
        .map(p => p.id);

      await Promise.allSettled([
        supabase.from('profiles').update({ teacher_id: null }).eq('teacher_id', id),
        supabase
          .from('payments')
          .update({ collected_by_teacher_id: null })
          .eq('collected_by_teacher_id', id),
        supabase.from('activities').update({ teacher_id: null }).eq('teacher_id', id),
        supabase.from('class_sessions').update({ teacher_id: null }).eq('teacher_id', id),
        supabase.from('teacher_payouts').update({ teacher_id: null }).eq('teacher_id', id),
        supabase
          .from('member_status_history')
          .delete()
          .eq('entity_type', 'teacher')
          .eq('entity_id', id)
      ]);

      const { data: deletedRows, error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        let friendlyMsg = error.message;
        if (error.code === '23503') {
          friendlyMsg = t('appContext.deleteTeacherFkRestricted');
        }
        const errObj = new Error(friendlyMsg);
        handleSupabaseError(t('appContext.actions.deleteTeacher'), errObj);
        return { success: false, error: friendlyMsg };
      }

      if (!deletedRows || deletedRows.length === 0) {
        const { data: stillExists } = await supabase
          .from('teachers')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        const rlsMsg = stillExists
          ? t('appContext.deleteTeacherRlsZero')
          : t('appContext.deleteTeacherNotFound');
        const rlsErr = new Error(rlsMsg);
        handleSupabaseError(t('appContext.actions.deleteTeacher'), rlsErr);
        return { success: false, error: rlsMsg };
      }

      setTeachers(prev => prev.filter(teacherItem => teacherItem.id !== id));
      for (const profId of affectedProfileIds) {
        await reevaluateUserOperationalRole({ profileId: profId });
      }
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.deleteTeacherError');
      handleSupabaseError(t('appContext.actions.deleteTeacher'), err);
      return { success: false, error: msg };
    }
  };

  const updateTeacherAvatar = async (teacherId: string, avatarUrl: string) => {
    await updateTeacher(teacherId, { avatarUrl, avatar: avatarUrl });
  };

  // Talleres / Actividades
  const addActivity = async (activity: Omit<Activity, 'id'>) => {
    clearDbError();
    const dbPayload = mapActivityToDb(activity);
    const { data, error } = await supabase.from('activities').insert([dbPayload]).select().single();
    if (error) {
      handleSupabaseError(t('appContext.actions.createActivity'), error);
      return;
    }
    if (data) {
      const newAct = mapDbActivityToActivity(data);
      setActivities(prev => [...prev, newAct]);
      if (newAct.teacherId && newAct.active !== false) {
        await reevaluateUserOperationalRole({ teacherId: newAct.teacherId });
      }
    }
    await refreshFromSupabase();
  };

  const updateActivity = async (id: string, updates: Partial<Activity>) => {
    clearDbError();
    const current = activities.find(a => a.id === id);
    if (!current) return;
    const prevTeacherId = current.teacherId;
    const prevActive = current.active;
    const nowIso = new Date().toISOString();
    const nextActive =
      updates.active !== undefined
        ? updates.active
        : updates.status === 'inactive'
        ? false
        : updates.status === 'active'
        ? true
        : current.active;
    const nextStatus =
      updates.status !== undefined
        ? updates.status
        : nextActive === false
        ? 'inactive'
        : 'active';
    const nextEndedAt =
      nextActive === false || nextStatus === 'inactive'
        ? updates.endedAt || current.endedAt || nowIso
        : undefined;

    const merged: Activity = {
      ...current,
      ...updates,
      active: nextActive,
      status: nextStatus,
      endedAt: nextEndedAt
    };

    if (nextActive === false || nextStatus === 'inactive') {
      setStoredActivityEndedAt(id, nextEndedAt || nowIso);
    } else {
      setStoredActivityEndedAt(id, null);
    }

    const basePayload = mapActivityToDb(merged);
    const extendedPayload = {
      ...basePayload,
      status: nextStatus,
      ended_at: nextEndedAt || null
    };
    let { error } = await supabase.from('activities').update(extendedPayload).eq('id', id);
    if (
      error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message?.toLowerCase().includes('column'))
    ) {
      const fallbackRes = await supabase.from('activities').update(basePayload).eq('id', id);
      error = fallbackRes.error;
    }
    if (error) {
      handleSupabaseError(t('appContext.actions.updateActivity'), error);
      return;
    }
    setActivities(prev => prev.map(a => (a.id === id ? merged : a)));

    if (merged.teacherId !== prevTeacherId) {
      if (prevTeacherId) {
        await reevaluateUserOperationalRole({ teacherId: prevTeacherId });
      }
      if (merged.teacherId) {
        await reevaluateUserOperationalRole({ teacherId: merged.teacherId });
      }
    } else if (merged.active !== prevActive && merged.teacherId) {
      await reevaluateUserOperationalRole({ teacherId: merged.teacherId });
    }

    if (merged.active !== prevActive) {
      const enrolledStudents = students.filter(s =>
        s.activities.some(e => e.activityId === id)
      );
      for (const st of enrolledStudents) {
        await reevaluateUserOperationalRole({ studentId: st.id, email: st.email });
      }
    }

    await refreshFromSupabase();
  };

  const deleteActivity = async (id: string) => {
    clearDbError();
    const targetAct = activities.find(a => a.id === id);
    const affectedStudents = students.filter(
      s =>
        s.activities.some(e => e.activityId === id) ||
        (s.pendingEnrollments || []).some(e => e.activityId === id)
    );

    await supabase.from('student_enrollments').delete().eq('activity_id', id);

    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteActivity'), error);
      return;
    }
    setActivities(prev => prev.filter(a => a.id !== id));
    setStudents(prev =>
      prev.map(s => ({
        ...s,
        activities: s.activities.filter(e => e.activityId !== id),
        pendingEnrollments: (s.pendingEnrollments || []).filter(e => e.activityId !== id)
      }))
    );

    if (targetAct?.teacherId) {
      await reevaluateUserOperationalRole({ teacherId: targetAct.teacherId });
    }
    for (const st of affectedStudents) {
      await reevaluateUserOperationalRole({ studentId: st.id, email: st.email });
    }

    await refreshFromSupabase();
  };

  // Alumnos y Matrículas
  const upsertEnrollmentRow: AcademyDataContextType['upsertEnrollmentRow'] = async (
    studentId,
    activityId,
    customPrice,
    billingMode,
    enrolledSince,
    status = 'active',
    extraFields
  ) => {
    const act = activities.find(a => a.id === activityId);
    const basePayload = {
      student_id: studentId,
      activity_id: activityId,
      custom_price: customPrice !== undefined ? customPrice : null,
      billing_mode: billingMode || act?.billingMode || 'monthly',
      enrolled_since: enrolledSince || getMadridDateIso()
    };
    const isPendingOrRejectedStatus = status === 'rejected' || status === 'pending';
    const activePayload = { ...basePayload, active: !isPendingOrRejectedStatus };
    const reactivatedCleanup =
      status !== 'rejected'
        ? {
            deleted_at: null,
            ended_at: null,
            drop_requested_at: null,
            drop_reason: null
          }
        : {};
    const fullPayload = {
      ...activePayload,
      status,
      ...reactivatedCleanup,
      ...(extraFields || {})
    };

    const tryUpsert = async (payload: Record<string, any>) => {
      const res = await supabase
        .from('student_enrollments')
        .upsert(payload, { onConflict: 'student_id,activity_id' })
        .select('*');

      if (
        res.error &&
        (res.error.code === '42P10' || res.error.message?.includes('no unique or exclusion constraint'))
      ) {
        const { data: existing } = await supabase
          .from('student_enrollments')
          .select('id')
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .maybeSingle();

        if (existing?.id) {
          return await supabase
            .from('student_enrollments')
            .update(payload)
            .eq('id', existing.id)
            .select('*');
        }
        return await supabase.from('student_enrollments').insert([payload]).select('*');
      }
      return res;
    };

    let res = await tryUpsert(fullPayload);
    if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
      res = await tryUpsert({ ...activePayload, status, ...(extraFields || {}) });
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await tryUpsert({ ...activePayload, status });
      }
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        if (status === 'pending') {
          return {
            error: new Error(t('appContext.missingEnrollmentStatusColumn'))
          };
        }
        res = await tryUpsert(activePayload);
        if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
          res = await tryUpsert(basePayload);
        }
      }
    }
    return res;
  };

  const softDeleteEnrollmentRow: AcademyDataContextType['softDeleteEnrollmentRow'] = async (
    studentId,
    activityId,
    options
  ) => {
    const nowIso = new Date().toISOString();
    const todayStr = getMadridDateIso(new Date(nowIso));
    const desiredStatus = options?.targetStatus || 'inactive';

    const runUpdate = async (payload: Record<string, any>) =>
      await supabase
        .from('student_enrollments')
        .update(payload)
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .select('id');

    const fullPayload = {
      active: false,
      status: desiredStatus,
      deleted_at: nowIso,
      ended_at: todayStr,
      ...(options?.extraAudit || {})
    };

    let res = await runUpdate(fullPayload);

    if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
      res = await runUpdate({ active: false, status: desiredStatus });
    }

    if (
      res.error &&
      desiredStatus === 'inactive' &&
      (res.error.code === '23514' || res.error.message?.includes('status'))
    ) {
      res = await runUpdate({
        active: false,
        status: 'rejected',
        deleted_at: nowIso,
        ended_at: todayStr
      });
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await runUpdate({ active: false, status: 'rejected' });
      }
    }

    if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
      res = await runUpdate({ active: false });
    }

    return { data: res.data, error: res.error };
  };

  const addStudent: AcademyDataContextType['addStudent'] = async student => {
    clearDbError();
    const todayStr = getMadridDateIso();
    const effectiveStartDate = student.startDate || todayStr;
    const isPending = student.status === 'pending_validation';
    const resolvedIsSocio =
      student.isSocio !== undefined
        ? student.isSocio
        : student.memberType !== 'alumno_no_socio' && student.memberType !== 'monitor_no_socio';
    const resolvedMemberType: MemberType =
      student.memberType || (resolvedIsSocio ? 'socio' : 'alumno_no_socio');

    const baseStudentDb: Record<string, any> = {
      name: student.name,
      email: student.email || null,
      phone: normalizePhoneForStorage(student.phone) || null,
      status: student.status,
      registered_at: effectiveStartDate,
      notes: student.notes || null
    };
    const extendedNoSocioDb: Record<string, any> = {
      ...baseStudentDb,
      validation_status: isPending ? 'pending' : student.status === 'inactive' ? 'rejected' : 'validated',
      registered_by: currentUser?.id || null,
      member_number: student.memberNumber || null,
      member_type: resolvedMemberType,
      start_date: effectiveStartDate,
      end_date: student.endDate || (student.status === 'inactive' ? todayStr : null)
    };
    const extendedStudentDb: Record<string, any> = {
      ...extendedNoSocioDb,
      is_socio: resolvedIsSocio
    };

    let insertRes = await supabase
      .from('students')
      .insert([extendedStudentDb])
      .select()
      .single();

    if (
      insertRes.error &&
      (insertRes.error.code === '42703' ||
        insertRes.error.code === '23503' ||
        insertRes.error.code === '22P02' ||
        insertRes.error.message?.includes('column'))
    ) {
      insertRes = await supabase
        .from('students')
        .insert([extendedNoSocioDb])
        .select()
        .single();
      if (
        insertRes.error &&
        (insertRes.error.code === '42703' ||
          insertRes.error.code === '23503' ||
          insertRes.error.code === '22P02' ||
          insertRes.error.message?.includes('column'))
      ) {
        insertRes = await supabase
          .from('students')
          .insert([baseStudentDb])
          .select()
          .single();
      }
    }

    if (
      insertRes.error &&
      isPending &&
      (insertRes.error.message?.includes('students_status_check') || insertRes.error.code === '23514')
    ) {
      const markedNotes = baseStudentDb.notes?.includes('[Pendiente validación]')
        ? baseStudentDb.notes
        : `[Pendiente validación] ${baseStudentDb.notes || ''}`.trim();
      insertRes = await supabase
        .from('students')
        .insert([{ ...baseStudentDb, status: 'trial', notes: markedNotes }])
        .select()
        .single();
    }

    if (insertRes.error) {
      handleSupabaseError(t('appContext.actions.createStudent'), insertRes.error);
      return { success: false, error: insertRes.error.message };
    }

    const newStudentRow = insertRes.data;
    if (newStudentRow) {
      await recordStatusHistoryCycle({
        entityType: 'student',
        entityId: newStudentRow.id,
        status: student.status,
        startDate: effectiveStartDate,
        endDate: student.endDate || (student.status === 'inactive' ? todayStr : undefined),
        notes: t('appContext.notes.studentCreated')
      });

      if (student.activities && student.activities.length > 0) {
        for (const act of student.activities) {
          await upsertEnrollmentRow(
            newStudentRow.id,
            act.activityId,
            act.customPrice,
            act.billingMode,
            act.enrolledSince
          );
        }
      }
      if (student.email) {
        await reevaluateUserOperationalRole({
          studentId: newStudentRow.id,
          email: student.email
        });
      }
      await refreshFromSupabase();
    }
    return { success: true };
  };

  const updateStudent: AcademyDataContextType['updateStudent'] = async (id, updates) => {
    clearDbError();
    const todayStr = getMadridDateIso();
    const existingStudent = students.find(s => s.id === id);
    const studentDb: Record<string, any> = {};

    let resolvedIsSocio: boolean | undefined = updates.isSocio;
    let resolvedMemberType: MemberType | undefined = updates.memberType;
    if (updates.isSocio !== undefined && updates.memberType === undefined) {
      resolvedMemberType = updates.isSocio ? 'socio' : 'alumno_no_socio';
    } else if (updates.memberType !== undefined && updates.isSocio === undefined) {
      resolvedIsSocio =
        updates.memberType !== 'alumno_no_socio' && updates.memberType !== 'monitor_no_socio';
    }

    if (updates.name !== undefined) studentDb.name = updates.name;
    if (updates.email !== undefined) studentDb.email = updates.email || null;
    if (updates.phone !== undefined) studentDb.phone = normalizePhoneForStorage(updates.phone) || null;
    if (updates.memberNumber !== undefined) studentDb.member_number = updates.memberNumber || null;
    if (resolvedMemberType !== undefined) studentDb.member_type = resolvedMemberType || 'socio';
    if (resolvedIsSocio !== undefined) studentDb.is_socio = resolvedIsSocio;
    if (updates.startDate !== undefined) studentDb.start_date = updates.startDate || null;
    if (updates.endDate !== undefined) studentDb.end_date = updates.endDate || null;

    if (updates.status !== undefined) {
      studentDb.status = updates.status;
      if (updates.status === 'pending_validation') {
        studentDb.validation_status = 'pending';
      } else if (updates.status === 'inactive') {
        studentDb.validation_status = 'rejected';
        if (updates.endDate === undefined && !existingStudent?.endDate) {
          studentDb.end_date = todayStr;
        }
      } else {
        studentDb.validation_status = 'validated';
        if (updates.endDate === undefined && existingStudent?.status === 'inactive') {
          studentDb.end_date = null;
        }
      }
    }

    if (updates.notes !== undefined) {
      const rawNotes = updates.notes || '';
      if (updates.status && updates.status !== 'pending_validation') {
        const cleaned = rawNotes.replace(/\[Pendiente validación\]\s*/g, '').trim();
        studentDb.notes = cleaned || null;
      } else {
        studentDb.notes = rawNotes || null;
      }
    } else if (
      updates.status &&
      updates.status !== 'pending_validation' &&
      existingStudent?.notes?.includes('[Pendiente validación]')
    ) {
      const cleaned = existingStudent.notes.replace(/\[Pendiente validación\]\s*/g, '').trim();
      studentDb.notes = cleaned || null;
    }

    let updatedRow: any = null;
    if (Object.keys(studentDb).length > 0) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        const authErr = new Error(t('appContext.updateStudentSessionRequired'));
        handleSupabaseError(t('appContext.actions.updateStudent'), authErr);
        return { success: false, error: authErr.message };
      }

      let res = await supabase
        .from('students')
        .update(studentDb)
        .eq('id', id)
        .select('*');

      if (
        res.error &&
        (res.error.code === '42703' || res.error.message?.includes('column'))
      ) {
        const { is_socio: _s0, ...withoutSocioDb } = studentDb;
        res = await supabase
          .from('students')
          .update(withoutSocioDb)
          .eq('id', id)
          .select('*');

        if (
          res.error &&
          (res.error.code === '42703' || res.error.message?.includes('column'))
        ) {
          const {
            validation_status: _ignored,
            member_number: _m1,
            member_type: _m2,
            start_date: _m3,
            end_date: _m4,
            ...fallbackDb
          } = withoutSocioDb;
          if (Object.keys(fallbackDb).length > 0) {
            res = await supabase
              .from('students')
              .update(fallbackDb)
              .eq('id', id)
              .select('*');
          } else {
            res = await supabase.from('students').select('*').eq('id', id);
          }
        }
      }

      if (
        res.error &&
        updates.status === 'pending_validation' &&
        (res.error.message?.includes('students_status_check') || res.error.code === '23514')
      ) {
        const baseNotes = (studentDb.notes ?? existingStudent?.notes ?? '') as string;
        const markedNotes = baseNotes.includes('[Pendiente validación]')
          ? baseNotes
          : `[Pendiente validación] ${baseNotes}`.trim();
        const {
          validation_status: _ignored,
          is_socio: _s0,
          member_number: _m1,
          member_type: _m2,
          start_date: _m3,
          end_date: _m4,
          ...rest
        } = studentDb;
        res = await supabase
          .from('students')
          .update({ ...rest, status: 'trial', notes: markedNotes })
          .eq('id', id)
          .select('*');
      }

      if (res.error) {
        handleSupabaseError(t('appContext.actions.updateStudent'), res.error);
        return { success: false, error: res.error.message };
      }

      if (!res.data || res.data.length === 0) {
        const { data: existingRow } = await supabase
          .from('students')
          .select('id')
          .eq('id', id)
          .maybeSingle();

        const rlsErr = new Error(
          existingRow
            ? t('appContext.updateStudentRlsZero')
            : t('appContext.updateStudentNotFound')
        );
        handleSupabaseError(t('appContext.actions.updateStudent'), rlsErr);
        return { success: false, error: rlsErr.message };
      }

      updatedRow = res.data[0];
    }

    if (updates.status !== undefined && existingStudent && updates.status !== existingStudent.status) {
      await recordStatusHistoryCycle({
        entityType: 'student',
        entityId: id,
        status: updates.status,
        startDate: updates.startDate || todayStr,
        endDate: updates.status === 'inactive' ? updates.endDate || todayStr : undefined,
        notes:
          updates.status === 'active' && existingStudent.status === 'inactive'
            ? t('appContext.notes.studentReinstated')
            : updates.status === 'inactive'
            ? t('appContext.notes.studentDeactivated')
            : t('appContext.notes.studentStatusChanged', { status: updates.status })
      });
    }

    if (resolvedIsSocio !== undefined || resolvedMemberType !== undefined) {
      const studentEmailNorm = (updates.email ?? existingStudent?.email)?.toLowerCase().trim();
      const matchingProfiles = profiles.filter(
        p =>
          p.studentId === id ||
          (existingStudent?.profileId && p.id === existingStudent.profileId) ||
          (studentEmailNorm && p.email.toLowerCase().trim() === studentEmailNorm)
      );
      for (const prof of matchingProfiles) {
        const profPayload: Record<string, any> = {};
        if (resolvedIsSocio !== undefined) profPayload.is_socio = resolvedIsSocio;
        if (resolvedMemberType !== undefined) profPayload.member_type = resolvedMemberType;
        const pRes = await supabase.from('profiles').update(profPayload).eq('id', prof.id);
        if (
          pRes.error &&
          (pRes.error.code === '42703' || pRes.error.message?.includes('column')) &&
          resolvedMemberType !== undefined
        ) {
          await supabase
            .from('profiles')
            .update({ member_type: resolvedMemberType })
            .eq('id', prof.id);
        }
      }
    }

    if (updates.activities) {
      const desiredIds = new Set(updates.activities.map(a => a.activityId));
      const previousIds = (existingStudent?.activities || []).map(a => a.activityId);
      const removedIds = previousIds.filter(actId => !desiredIds.has(actId));

      for (const act of updates.activities) {
        const { error: upsertErr } = await upsertEnrollmentRow(
          id,
          act.activityId,
          act.customPrice,
          act.billingMode,
          act.enrolledSince
        );
        if (upsertErr) {
          handleSupabaseError(t('appContext.actions.updateEnrollment'), upsertErr);
          return { success: false, error: upsertErr.message };
        }
      }

      for (const removedActId of removedIds) {
        const { data: softRows, error: softErr } = await softDeleteEnrollmentRow(id, removedActId, {
          targetStatus: 'inactive'
        });

        if (softErr || !softRows || softRows.length === 0) {
          handleSupabaseError(
            t('appContext.actions.removeEnrollment'),
            softErr || new Error(t('appContext.unenrollRlsDenied'))
          );
          return {
            success: false,
            error: (softErr || new Error(t('appContext.unenrollRlsDenied'))).message
          };
        }
      }
    }

    if (updatedRow) {
      setStudents(prev =>
        prev.map(s => {
          if (s.id !== id) return s;
          const mapped = mapDbStudentToStudent(updatedRow, []);
          return {
            ...mapped,
            activities: updates.activities ?? s.activities
          };
        })
      );
    }

    if (
      updates.activities !== undefined ||
      updates.memberType !== undefined ||
      updates.isSocio !== undefined ||
      updates.status !== undefined ||
      (updates.email !== undefined && updates.email !== existingStudent?.email)
    ) {
      await reevaluateUserOperationalRole({
        studentId: id,
        email: updates.email ?? existingStudent?.email
      });
    }

    await refreshFromSupabase();
    return { success: true };
  };

  const deleteStudent = async (id: string) => {
    clearDbError();
    const targetStudent = students.find(s => s.id === id);
    const affectedProfileIds = profiles
      .filter(
        p =>
          p.studentId === id ||
          (targetStudent?.profileId && p.id === targetStudent.profileId) ||
          (targetStudent?.email &&
            p.email.toLowerCase().trim() === targetStudent.email.toLowerCase().trim())
      )
      .map(p => p.id);

    await supabase.from('profiles').update({ student_id: null }).eq('student_id', id);

    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteStudent'), error);
      return;
    }
    setStudents(prev => prev.filter(s => s.id !== id));
    for (const profId of affectedProfileIds) {
      await reevaluateUserOperationalRole({ profileId: profId });
    }
    await refreshFromSupabase();
  };

  const enrollStudentInActivity = async (
    studentId: string,
    activityId: string,
    customPrice?: number
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const existingStudent = students.find(s => s.id === studentId);
    if (existingStudent && existingStudent.status === 'inactive') {
      const reactivateRes = await supabase
        .from('students')
        .update({ status: 'active', end_date: null })
        .eq('id', studentId);
      if (
        reactivateRes.error &&
        (reactivateRes.error.code === '42703' || reactivateRes.error.message?.includes('column'))
      ) {
        await supabase.from('students').update({ status: 'active' }).eq('id', studentId);
      }
    }

    const { error } = await upsertEnrollmentRow(studentId, activityId, customPrice);

    if (error) {
      handleSupabaseError(t('appContext.actions.enrollStudent'), error);
      return { success: false, error: error.message };
    }
    await reevaluateUserOperationalRole({ studentId, email: existingStudent?.email });
    await refreshFromSupabase();
    return { success: true };
  };

  const updateStudentEnrollment: AcademyDataContextType['updateStudentEnrollment'] = async ({
    studentId,
    activityId,
    newActivityId,
    customPrice,
    billingMode,
    enrolledSince
  }) => {
    clearDbError();
    try {
      const existingStudent = students.find(s => s.id === studentId);
      const targetActivityId =
        newActivityId && newActivityId !== activityId ? newActivityId : activityId;
      const isChangingActivity = targetActivityId !== activityId;

      if (isChangingActivity) {
        const alreadyActiveInTarget = existingStudent?.activities.some(
          a => a.activityId === targetActivityId && a.active !== false && a.status !== 'inactive'
        );
        if (alreadyActiveInTarget) {
          return {
            success: false,
            error: t('appContext.enrollmentAlreadyActiveInTarget')
          };
        }

        const { error: softErr } = await softDeleteEnrollmentRow(studentId, activityId, {
          targetStatus: 'inactive'
        });
        if (softErr) {
          handleSupabaseError(t('appContext.actions.updateEnrollment'), softErr);
          return { success: false, error: softErr.message };
        }
      }

      if (existingStudent && existingStudent.status === 'inactive') {
        const reactivateRes = await supabase
          .from('students')
          .update({ status: 'active', end_date: null })
          .eq('id', studentId);
        if (
          reactivateRes.error &&
          (reactivateRes.error.code === '42703' || reactivateRes.error.message?.includes('column'))
        ) {
          await supabase.from('students').update({ status: 'active' }).eq('id', studentId);
        }
      }

      const existingEnr =
        existingStudent?.activities.find(a => a.activityId === activityId) ||
        existingStudent?.pendingEnrollments?.find(a => a.activityId === activityId) ||
        existingStudent?.inactiveEnrollments?.find(a => a.activityId === activityId);
      const isPendingEnr = Boolean(
        existingStudent?.pendingEnrollments?.some(a => a.activityId === activityId)
      );

      const resolvedCustomPrice =
        customPrice === null
          ? undefined
          : customPrice !== undefined
          ? customPrice
          : existingEnr?.customPrice;
      const resolvedBillingMode =
        billingMode ||
        existingEnr?.billingMode ||
        activities.find(a => a.id === targetActivityId)?.billingMode ||
        'monthly';
      const resolvedEnrolledSince =
        enrolledSince || existingEnr?.enrolledSince || getMadridDateIso();

      const { error } = await upsertEnrollmentRow(
        studentId,
        targetActivityId,
        resolvedCustomPrice,
        resolvedBillingMode,
        resolvedEnrolledSince,
        isPendingEnr ? 'pending' : 'active'
      );

      if (error) {
        handleSupabaseError(t('appContext.actions.updateEnrollment'), error);
        return { success: false, error: error.message };
      }

      await reevaluateUserOperationalRole({ studentId, email: existingStudent?.email });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.actions.updateEnrollment');
      handleSupabaseError(t('appContext.actions.updateEnrollment'), err);
      return { success: false, error: msg };
    }
  };

  const unenrollStudentFromActivity = async (
    studentId: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    try {
      const targetStudent = students.find(s => s.id === studentId);
      const { data: softRows, error: softErr } = await softDeleteEnrollmentRow(
        studentId,
        activityId,
        { targetStatus: 'inactive' }
      );

      let removed = !softErr && Array.isArray(softRows) && softRows.length > 0;

      if (!removed) {
        const activeUser = currentUserRef.current;
        const isSelfUnenroll = Boolean(
          activeUser &&
            (activeUser.studentId === studentId ||
              targetStudent?.profileId === activeUser.id ||
              (targetStudent?.email &&
                targetStudent.email.trim().toLowerCase() ===
                  activeUser.email.trim().toLowerCase()))
        );

        let rpcErr: any = null;
        if (isSelfUnenroll) {
          const rpcRes = await supabase.rpc('self_unenroll_from_activity', {
            p_activity_id: activityId
          });
          if (!rpcRes.error && rpcRes.data?.success !== false) {
            removed = true;
          } else if (rpcRes.error) {
            rpcErr = rpcRes.error;
          } else if (rpcRes.data?.error) {
            rpcErr = new Error(rpcRes.data.error);
          }
        }

        if (!removed) {
          const finalErr =
            rpcErr ||
            softErr ||
            new Error(t('appContext.unenrollRlsDenied'));
          handleSupabaseError(t('appContext.actions.unenrollStudent'), finalErr);
          return { success: false, error: finalErr.message };
        }
      }

      const nowIso = new Date().toISOString();
      const todayStr = getMadridDateIso(new Date(nowIso));
      setStudents(prev =>
        prev.map(s => {
          if (s.id !== studentId) return s;
          const removedEnr = s.activities.find(a => a.activityId === activityId);
          const nextInactive = removedEnr
            ? [
                ...(s.inactiveEnrollments || []).filter(e => e.activityId !== activityId),
                {
                  ...removedEnr,
                  active: false,
                  status: 'inactive' as const,
                  deletedAt: nowIso,
                  endedAt: todayStr
                }
              ]
            : s.inactiveEnrollments;
          return {
            ...s,
            activities: s.activities.filter(a => a.activityId !== activityId),
            pendingEnrollments: (s.pendingEnrollments || []).filter(
              a => a.activityId !== activityId
            ),
            inactiveEnrollments: nextInactive
          };
        })
      );
      await reevaluateUserOperationalRole({ studentId, email: targetStudent?.email });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || t('appContext.unenrollError');
      handleSupabaseError(t('appContext.actions.unenrollStudent'), err);
      return { success: false, error: msg };
    }
  };

  const resolveStudentIdForCurrentUser = async (
    explicitStudentId?: string
  ): Promise<{ studentId?: string; error?: string }> => {
    if (explicitStudentId) {
      return { studentId: explicitStudentId };
    }
    if (!currentUser) {
      return {
        error: t('appContext.requestEnrollmentLoginRequired')
      };
    }

    const emailNorm = (currentUser.email || '').trim().toLowerCase();
    const matchedLocal = students.find(
      s =>
        (currentUser.studentId && s.id === currentUser.studentId) ||
        s.profileId === currentUser.id ||
        (emailNorm && s.email.trim().toLowerCase() === emailNorm)
    );
    if (matchedLocal) {
      return { studentId: matchedLocal.id };
    }

    if (currentUser.studentId) {
      return { studentId: currentUser.studentId };
    }

    const { data: existingByProfile } = await supabase
      .from('students')
      .select('id')
      .eq('profile_id', currentUser.id)
      .maybeSingle();
    if (existingByProfile?.id) {
      setCurrentStudentId(existingByProfile.id);
      return { studentId: existingByProfile.id };
    }

    if (emailNorm) {
      const { data: existingByEmail } = await supabase
        .from('students')
        .select('id')
        .ilike('email', emailNorm)
        .maybeSingle();
      if (existingByEmail?.id) {
        setCurrentStudentId(existingByEmail.id);
        return { studentId: existingByEmail.id };
      }
    }

    const baseStudent = {
      name: currentUser.name || emailNorm.split('@')[0] || t('appContext.fallbackStudent'),
      email: emailNorm || null,
      phone: '',
      status: 'active',
      notes: t('appContext.notes.autoStudentOnRequest')
    };
    const extStudent = {
      ...baseStudent,
      profile_id: currentUser.id,
      validation_status: 'validated',
      registered_by: currentUser.id
    };

    let insertRes = await supabase.from('students').insert([extStudent]).select().single();
    if (
      insertRes.error &&
      (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
    ) {
      insertRes = await supabase.from('students').insert([baseStudent]).select().single();
    }

    if (insertRes.error || !insertRes.data) {
      return {
        error:
          insertRes.error?.message ||
          t('appContext.createStudentRlsError')
      };
    }

    const newStudentId = insertRes.data.id as string;
    const mappedNewStudent = mapDbStudentToStudent(insertRes.data, []);
    setStudents(prev => (prev.some(s => s.id === newStudentId) ? prev : [...prev, mappedNewStudent]));
    setCurrentStudentId(newStudentId);
    setCurrentUser(prev => (prev ? { ...prev, studentId: newStudentId } : prev));
    try {
      await supabase
        .from('profiles')
        .update({ student_id: newStudentId })
        .eq('id', currentUser.id);
    } catch {
      // Best-effort
    }

    return { studentId: newStudentId };
  };

  const enrollUserFromProfile: AcademyDataContextType['enrollUserFromProfile'] = async ({
    profile,
    activityId,
    customPrice
  }) => {
    clearDbError();
    try {
      const emailNorm = (profile.email || '').trim().toLowerCase();

      let resolvedStudent = students.find(
        s =>
          (profile.studentId && s.id === profile.studentId) ||
          s.profileId === profile.id ||
          (emailNorm && s.email.toLowerCase().trim() === emailNorm)
      );

      let resolvedStudentId = resolvedStudent?.id || profile.studentId;

      if (!resolvedStudentId && emailNorm) {
        const { data: existingByEmail } = await supabase
          .from('students')
          .select('id')
          .ilike('email', emailNorm)
          .maybeSingle();
        if (existingByEmail?.id) {
          resolvedStudentId = existingByEmail.id;
        }
      }

      if (!resolvedStudentId) {
        const todayStr = getMadridDateIso();
        const basePayload = {
          name: profile.name,
          email: emailNorm || null,
          phone: null,
          status: 'active',
          registered_at: todayStr,
          notes:
            profile.role === UserRole.Monitor || profile.role === UserRole.Hibrido
              ? t('appContext.notes.teacherEnrolledAsStudent')
              : null
        };

        const extendedPayload = {
          ...basePayload,
          profile_id: profile.id,
          validation_status: 'validated',
          registered_by: currentUser?.id || null,
          member_type: 'socio',
          start_date: todayStr
        };

        let insertRes = await supabase
          .from('students')
          .insert([extendedPayload])
          .select()
          .single();

        if (
          insertRes.error &&
          (insertRes.error.code === '42703' || insertRes.error.message?.includes('column'))
        ) {
          insertRes = await supabase
            .from('students')
            .insert([basePayload])
            .select()
            .single();
        }

        if (insertRes.error || !insertRes.data) {
          const msg = insertRes.error?.message || t('appContext.createStudentProfileError');
          handleSupabaseError(t('appContext.actions.linkUserAsStudent'), insertRes.error || new Error(msg));
          return { success: false, error: msg };
        }

        resolvedStudentId = insertRes.data.id;

        try {
          await supabase.from('profiles').update({ student_id: resolvedStudentId }).eq('id', profile.id);
        } catch {
          // Best-effort
        }
      } else {
        if (resolvedStudent && resolvedStudent.status === 'inactive') {
          const stReactivate = await supabase
            .from('students')
            .update({ status: 'active', end_date: null })
            .eq('id', resolvedStudentId!);
          if (
            stReactivate.error &&
            (stReactivate.error.code === '42703' || stReactivate.error.message?.includes('column'))
          ) {
            await supabase.from('students').update({ status: 'active' }).eq('id', resolvedStudentId!);
          }
        }
        const promoUpdates: Record<string, any> = {};
        if (!profile.studentId || profile.studentId !== resolvedStudentId) {
          promoUpdates.student_id = resolvedStudentId;
        }
        if (!resolvedStudent?.profileId) {
          try {
            await supabase.from('students').update({ profile_id: profile.id }).eq('id', resolvedStudentId);
          } catch {
            // Ignorar si la columna profile_id aún no existe
          }
        }
        if (Object.keys(promoUpdates).length > 0) {
          try {
            await supabase.from('profiles').update(promoUpdates).eq('id', profile.id);
          } catch {
            // Best-effort
          }
        }
      }

      const { error: enrollErr } = await upsertEnrollmentRow(resolvedStudentId!, activityId, customPrice);
      if (enrollErr) {
        handleSupabaseError(t('appContext.actions.registerUserEnrollment'), enrollErr);
        return { success: false, error: enrollErr.message };
      }

      await reevaluateUserOperationalRole({
        profileId: profile.id,
        studentId: resolvedStudentId
      });
      await refreshFromSupabase();
      return { success: true };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.enrollExistingUser'), err);
      return { success: false, error: err?.message || t('appContext.enrollUserError') };
    }
  };

  const quickCreateAndEnrollStudent: AcademyDataContextType['quickCreateAndEnrollStudent'] = async ({
    name,
    email,
    phone,
    notes,
    activityId,
    customPrice
  }) => {
    clearDbError();
    try {
      const cleanName = name.trim();
      const cleanEmail = email?.trim().toLowerCase() || null;
      const cleanPhone = normalizePhoneForStorage(phone) || null;
      const cleanNotes = notes?.trim() || t('appContext.notes.quickCreatePending');
      const todayStr = getMadridDateIso();

      let targetStudentId: string | undefined;
      if (cleanEmail) {
        const localExisting = students.find(
          s => (s.email || '').trim().toLowerCase() === cleanEmail
        );
        if (localExisting) {
          targetStudentId = localExisting.id;
        } else {
          const { data: dbExisting } = await supabase
            .from('students')
            .select('id, status')
            .ilike('email', cleanEmail)
            .maybeSingle();
          if (dbExisting?.id) {
            targetStudentId = dbExisting.id;
          }
        }
      }

      let rlsBlockedDirect = false;

      if (!targetStudentId) {
        const basePendingPayload = {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          status: 'pending_validation',
          registered_at: todayStr,
          notes: cleanNotes
        };

        const extendedPendingPayload = {
          ...basePendingPayload,
          validation_status: 'pending',
          registered_by: currentUser?.id || null,
          member_type: 'socio',
          start_date: todayStr
        };

        let createRes = await supabase
          .from('students')
          .insert([extendedPendingPayload])
          .select()
          .single();

        if (
          createRes.error &&
          (createRes.error.code === '42703' ||
            createRes.error.code === '23503' ||
            createRes.error.code === '22P02' ||
            createRes.error.message?.includes('column'))
        ) {
          createRes = await supabase
            .from('students')
            .insert([basePendingPayload])
            .select()
            .single();
        }

        if (
          createRes.error &&
          (createRes.error.message?.includes('students_status_check') || createRes.error.code === '23514')
        ) {
          const markedNotes = cleanNotes.includes('[Pendiente validación]')
            ? cleanNotes
            : `[Pendiente validación] ${cleanNotes}`;
          const fallbackTrialExtended = {
            ...extendedPendingPayload,
            status: 'trial',
            notes: markedNotes
          };
          createRes = await supabase
            .from('students')
            .insert([fallbackTrialExtended])
            .select()
            .single();

          if (
            createRes.error &&
            (createRes.error.code === '42703' ||
              createRes.error.code === '23503' ||
              createRes.error.code === '22P02' ||
              createRes.error.message?.includes('column'))
          ) {
            createRes = await supabase
              .from('students')
              .insert([{ ...basePendingPayload, status: 'trial', notes: markedNotes }])
              .select()
              .single();
          }
        }

        if (createRes.error || !createRes.data) {
          const msgLower = (createRes.error?.message || '').toLowerCase();
          if (createRes.error?.code === '42501' || msgLower.includes('row-level security')) {
            rlsBlockedDirect = true;
          } else {
            const rawMsg = createRes.error?.message || t('appContext.quickCreateProvisionalError');
            const friendlyMsg = rawMsg.includes('students_status_check')
              ? t('appContext.quickCreateStatusCheck')
              : rawMsg;
            handleSupabaseError(
              t('appContext.actions.quickCreatePending'),
              createRes.error || new Error(friendlyMsg)
            );
            return { success: false, error: friendlyMsg };
          }
        } else {
          targetStudentId = createRes.data.id;
        }
      }

      if (targetStudentId) {
        const { error: enrollErr } = await upsertEnrollmentRow(
          targetStudentId,
          activityId,
          customPrice
        );
        if (!enrollErr) {
          await refreshFromSupabase();
          return { success: true, studentId: targetStudentId };
        }
        const enrollMsgLower = (enrollErr?.message || '').toLowerCase();
        if (enrollErr?.code === '42501' || enrollMsgLower.includes('row-level security')) {
          rlsBlockedDirect = true;
        } else {
          handleSupabaseError(t('appContext.actions.enrollNewStudent'), enrollErr);
          await refreshFromSupabase();
          return { success: false, studentId: targetStudentId, error: enrollErr.message };
        }
      }

      if (rlsBlockedDirect) {
        const rpcRes = await supabase.rpc('quick_create_and_enroll_student', {
          p_name: cleanName,
          p_email: cleanEmail,
          p_phone: cleanPhone,
          p_notes: cleanNotes,
          p_activity_id: activityId,
          p_custom_price: customPrice !== undefined ? customPrice : null
        });
        if (!rpcRes.error && rpcRes.data?.success !== false && rpcRes.data?.student_id) {
          await refreshFromSupabase();
          return { success: true, studentId: String(rpcRes.data.student_id) };
        }
        const finalErr =
          rpcRes.error ||
          (rpcRes.data?.error ? new Error(rpcRes.data.error) : null) ||
          new Error(t('appContext.quickCreateProvisionalError'));
        handleSupabaseError(t('appContext.actions.quickCreateAndEnroll'), finalErr);
        return { success: false, error: finalErr.message };
      }

      return { success: false, error: t('appContext.quickCreateProvisionalError') };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.quickCreateAndEnroll'), err);
      return { success: false, error: err?.message || t('appContext.quickCreateUnexpectedError') };
    }
  };

  // Clases Impartidas y Asistencias
  const sessionSyncLockRef = useRef<Record<string, Promise<string | null>>>({});

  const upsertSessionAttendance: AcademyDataContextType['upsertSessionAttendance'] = async params => {
    clearDbError();
    const existingClosedSession = sessions.find(
      s =>
        s.activityId === params.activityId &&
        s.date?.slice(0, 10) === params.date.slice(0, 10) &&
        s.teacherId === params.teacherId
    );
    if (existingClosedSession?.isClosed) {
      const msg = t('appContext.classClosedReadOnlyError');
      setDbError(msg);
      return { success: false, error: msg };
    }

    const sessionKey = `${params.activityId}::${params.teacherId}::${params.date}`;
    const tempSessionId = `temp-ses-${sessionKey}`;
    const defaultTopic = params.topic?.trim() || '';
    const defaultDuration = params.durationMinutes || 75;

    const cleanDate = params.date.slice(0, 10);
    const absentStudentIdsForDate = new Set(
      studentAbsences
        .filter(
          a =>
            a.activityId === params.activityId &&
            a.sessionDate?.slice(0, 10) === cleanDate &&
            (a.status === 'reported' || a.status === 'approved')
        )
        .map(a => a.studentId)
    );

    setSessions(prev => {
      const existingIdx = prev.findIndex(
        s =>
          s.activityId === params.activityId &&
          s.date === params.date &&
          s.teacherId === params.teacherId
      );

      if (existingIdx !== -1) {
        const current = prev[existingIdx];
        const prevRecords = current.attendanceRecords || [];
        const hasRec = prevRecords.some(r => r.studentId === params.studentId);
        const nextRecords = hasRec
          ? prevRecords.map(r =>
              r.studentId === params.studentId
                ? {
                    ...r,
                    attendance: params.attendance,
                    ...(params.paid !== undefined ? { paid: params.paid } : {}),
                    ...(params.paidAmount !== undefined ? { paidAmount: params.paidAmount } : {}),
                    ...(params.paymentMethod !== undefined ? { paymentMethod: params.paymentMethod } : {}),
                    ...(params.paymentId !== undefined ? { paymentId: params.paymentId || undefined } : {})
                  }
                : r
            )
          : [
              ...prevRecords,
              {
                studentId: params.studentId,
                studentName: params.studentName,
                attendance: params.attendance,
                paid: Boolean(params.paid),
                paidAmount: params.paidAmount,
                paymentMethod: params.paymentMethod || 'cash',
                paymentId: params.paymentId
              }
            ];

        const nextCount = nextRecords.filter(r => r.attendance !== 'absent').length;
        const updatedSession: ClassSession = {
          ...current,
          attendanceRecords: nextRecords,
          attendeesCount: nextCount
        };
        return prev.map((s, idx) => (idx === existingIdx ? updatedSession : s));
      }

      const initialRecords = (params.enrolledStudents && params.enrolledStudents.length > 0
        ? params.enrolledStudents
        : [{ id: params.studentId, name: params.studentName }]
      ).map(st => ({
        studentId: st.id,
        studentName: st.name,
        attendance: (st.id === params.studentId
          ? params.attendance
          : absentStudentIdsForDate.has(st.id)
          ? 'absent'
          : 'present') as 'present' | 'absent' | 'partial',
        paid: st.id === params.studentId ? Boolean(params.paid) : false,
        paidAmount: st.id === params.studentId ? params.paidAmount : undefined,
        paymentMethod: (st.id === params.studentId ? params.paymentMethod : 'cash') || 'cash',
        paymentId: st.id === params.studentId ? params.paymentId : undefined
      }));

      const newLocalSession: ClassSession = {
        id: tempSessionId,
        activityId: params.activityId,
        teacherId: params.teacherId,
        date: params.date,
        attendeesCount: initialRecords.filter(r => r.attendance !== 'absent').length,
        durationMinutes: defaultDuration,
        topic: defaultTopic,
        attendanceRecords: initialRecords
      };
      return [newLocalSession, ...prev];
    });

    const ensureSessionId = async (): Promise<string | null> => {
      const localReal = sessions.find(
        s =>
          s.activityId === params.activityId &&
          s.date === params.date &&
          s.teacherId === params.teacherId &&
          !s.id.startsWith('temp-ses-')
      );
      if (localReal) return localReal.id;

      const { data: existingRow, error: lookupErr } = await supabase
        .from('class_sessions')
        .select('id')
        .eq('activity_id', params.activityId)
        .eq('teacher_id', params.teacherId)
        .eq('date', params.date)
        .limit(1)
        .maybeSingle();

      if (lookupErr) {
        handleSupabaseError(t('appContext.actions.findSession'), lookupErr);
        return null;
      }
      if (existingRow?.id) return existingRow.id;

      const initialAttendees =
        params.enrolledStudents && params.enrolledStudents.length > 0
          ? params.enrolledStudents.filter(st =>
              st.id === params.studentId
                ? params.attendance !== 'absent'
                : !absentStudentIdsForDate.has(st.id)
            ).length
          : params.attendance !== 'absent'
          ? 1
          : 0;

      const { data: insertedRow, error: insertErr } = await supabase
        .from('class_sessions')
        .insert([
          {
            activity_id: params.activityId,
            teacher_id: params.teacherId,
            date: params.date,
            attendees_count: initialAttendees,
            duration_minutes: defaultDuration,
            topic: defaultTopic || null
          }
        ])
        .select('id')
        .single();

      if (insertErr || !insertedRow?.id) {
        handleSupabaseError(
          t('appContext.actions.createAttendanceSession'),
          insertErr || new Error(t('appContext.noSessionId'))
        );
        return null;
      }

      if (params.enrolledStudents && params.enrolledStudents.length > 1) {
        const seedRows = params.enrolledStudents
          .filter(st => st.id !== params.studentId)
          .map(st => ({
            session_id: insertedRow.id,
            student_id: st.id,
            attendance: absentStudentIdsForDate.has(st.id) ? 'absent' : 'present',
            paid: false,
            paid_amount: 0,
            payment_method: 'cash',
            payment_id: null
          }));
        if (seedRows.length > 0) {
          await supabase.from('session_attendances').insert(seedRows);
        }
      }

      setSessions(prev =>
        prev.map(s => (s.id === tempSessionId ? { ...s, id: insertedRow.id } : s))
      );
      return insertedRow.id;
    };

    try {
      const pendingLock = sessionSyncLockRef.current[sessionKey];
      const resolveSessionPromise = pendingLock
        ? pendingLock.catch(() => null).then(() => ensureSessionId())
        : ensureSessionId();
      sessionSyncLockRef.current[sessionKey] = resolveSessionPromise;

      const realSessionId = await resolveSessionPromise;
      if (!realSessionId) {
        return { success: false, error: t('appContext.sessionObtainError') };
      }

      const { data: existingAtt, error: attLookupErr } = await supabase
        .from('session_attendances')
        .select('id')
        .eq('session_id', realSessionId)
        .eq('student_id', params.studentId)
        .limit(1)
        .maybeSingle();

      if (attLookupErr) {
        handleSupabaseError(t('appContext.actions.queryAttendance'), attLookupErr);
        return { success: false, error: attLookupErr.message };
      }

      if (existingAtt?.id) {
        const updateFields: Record<string, any> = {
          attendance: params.attendance
        };
        if (params.paid !== undefined) updateFields.paid = params.paid;
        if (params.paidAmount !== undefined) updateFields.paid_amount = params.paidAmount;
        if (params.paymentMethod !== undefined) updateFields.payment_method = params.paymentMethod;
        if (params.paymentId !== undefined) updateFields.payment_id = params.paymentId || null;

        const { error: updateAttErr } = await supabase
          .from('session_attendances')
          .update(updateFields)
          .eq('id', existingAtt.id);
        if (updateAttErr) {
          handleSupabaseError(t('appContext.actions.updateAttendance'), updateAttErr);
          return { success: false, error: updateAttErr.message };
        }
      } else {
        const { error: insertAttErr } = await supabase
          .from('session_attendances')
          .insert([
            {
              session_id: realSessionId,
              student_id: params.studentId,
              attendance: params.attendance,
              paid: Boolean(params.paid),
              paid_amount: params.paidAmount || 0,
              payment_method: params.paymentMethod || 'cash',
              payment_id: params.paymentId || null
            }
          ]);
        if (insertAttErr) {
          handleSupabaseError(t('appContext.actions.recordAttendance'), insertAttErr);
          return { success: false, error: insertAttErr.message };
        }
      }

      const { data: allSessionAtts } = await supabase
        .from('session_attendances')
        .select('attendance')
        .eq('session_id', realSessionId);

      if (allSessionAtts) {
        const nextAttendeesCount = allSessionAtts.filter(r => r.attendance !== 'absent').length;
        await supabase
          .from('class_sessions')
          .update({ attendees_count: nextAttendeesCount })
          .eq('id', realSessionId);
      }

      return { success: true };
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.syncAttendance'), err);
      return { success: false, error: err?.message || t('appContext.saveAttendanceError') };
    }
  };

  const addClassSession = async (session: Omit<ClassSession, 'id'>) => {
    clearDbError();
    const sessionKey = `${session.activityId}::${session.teacherId}::${session.date}`;
    const normalizedTopic = session.topic?.trim() || '';
    const existingLocal = sessions.find(
      s =>
        s.activityId === session.activityId &&
        s.teacherId === session.teacherId &&
        s.date === session.date
    );

    if (existingLocal?.isClosed) {
      if (session.isClosed === false) {
        if (!session.reopenReason?.trim()) {
          setDbError(t('appContext.reopenReasonRequired'));
          return;
        }
      } else {
        setDbError(t('appContext.classClosedReadOnlyError'));
        return;
      }
    }

    const resolvedIsClosed =
      session.isClosed !== undefined ? session.isClosed : existingLocal?.isClosed;
    const resolvedClosedAt =
      resolvedIsClosed === true
        ? session.closedAt || existingLocal?.closedAt || new Date().toISOString()
        : resolvedIsClosed === false
        ? undefined
        : existingLocal?.closedAt;
    const resolvedClosedBy =
      resolvedIsClosed === true
        ? session.closedBy ||
          existingLocal?.closedBy ||
          (currentRole === UserRole.Admin ? 'administrador' : 'profesor')
        : resolvedIsClosed === false
        ? undefined
        : existingLocal?.closedBy;
    const resolvedClosedByUserId =
      resolvedIsClosed === true
        ? session.closedByUserId || existingLocal?.closedByUserId || currentUser?.id
        : resolvedIsClosed === false
        ? undefined
        : existingLocal?.closedByUserId;
    const resolvedReopenReason =
      resolvedIsClosed === false
        ? session.reopenReason?.trim() || existingLocal?.reopenReason
        : session.reopenReason ?? existingLocal?.reopenReason;
    const resolvedReopenedAt =
      resolvedIsClosed === false
        ? session.reopenedAt || new Date().toISOString()
        : session.reopenedAt ?? existingLocal?.reopenedAt;
    const resolvedReopenedBy =
      resolvedIsClosed === false
        ? session.reopenedBy ||
          (currentRole === UserRole.Admin ? 'administrador' : 'profesor')
        : session.reopenedBy ?? existingLocal?.reopenedBy;

    setSessions(prev => {
      const existingIdx = prev.findIndex(
        s =>
          s.activityId === session.activityId &&
          s.teacherId === session.teacherId &&
          s.date === session.date
      );
      if (existingIdx !== -1) {
        return prev.map((s, idx) =>
          idx === existingIdx
            ? {
                ...s,
                attendeesCount: session.attendeesCount,
                durationMinutes: session.durationMinutes,
                topic: normalizedTopic,
                isClosed: resolvedIsClosed,
                closedAt: resolvedClosedAt,
                closedBy: resolvedClosedBy,
                closedByUserId: resolvedClosedByUserId,
                reopenReason: resolvedReopenReason,
                reopenedAt: resolvedReopenedAt,
                reopenedBy: resolvedReopenedBy,
                attendanceRecords: session.attendanceRecords
              }
            : s
        );
      }
      return [
        {
          id: `temp-ses-${sessionKey}`,
          ...session,
          topic: normalizedTopic,
          isClosed: resolvedIsClosed,
          closedAt: resolvedClosedAt,
          closedBy: resolvedClosedBy,
          closedByUserId: resolvedClosedByUserId,
          reopenReason: resolvedReopenReason,
          reopenedAt: resolvedReopenedAt,
          reopenedBy: resolvedReopenedBy
        },
        ...prev
      ];
    });

    const pendingLock = sessionSyncLockRef.current[sessionKey];
    if (pendingLock) {
      await pendingLock.catch(() => null);
    }

    const { data: existingSession } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('activity_id', session.activityId)
      .eq('teacher_id', session.teacherId)
      .eq('date', session.date)
      .limit(1)
      .maybeSingle();

    const baseSessionDb = {
      activity_id: session.activityId,
      teacher_id: session.teacherId,
      date: session.date,
      attendees_count: session.attendeesCount,
      duration_minutes: session.durationMinutes,
      topic: normalizedTopic || null
    };
    const sessionDbBasicClose =
      resolvedIsClosed !== undefined
        ? {
            ...baseSessionDb,
            is_closed: resolvedIsClosed,
            closed_at: resolvedIsClosed ? resolvedClosedAt || new Date().toISOString() : null
          }
        : baseSessionDb;
    const sessionDbWithCloseAudit =
      resolvedIsClosed !== undefined
        ? {
            ...sessionDbBasicClose,
            closed_by: resolvedIsClosed ? resolvedClosedBy || null : null,
            closed_by_user_id:
              resolvedIsClosed && resolvedClosedBy !== 'automatica'
                ? resolvedClosedByUserId || null
                : null,
            ...(resolvedIsClosed === false
              ? {
                  reopen_reason: resolvedReopenReason || null,
                  reopened_at: resolvedReopenedAt || new Date().toISOString(),
                  reopened_by: resolvedReopenedBy || null
                }
              : {})
          }
        : baseSessionDb;

    let targetSessionId = existingSession?.id || '';

    if (targetSessionId) {
      let { error: updateErr } = await supabase
        .from('class_sessions')
        .update(sessionDbWithCloseAudit)
        .eq('id', targetSessionId);
      if (
        updateErr &&
        (updateErr.code === '42703' || updateErr.message?.includes('column'))
      ) {
        const basicRes = await supabase
          .from('class_sessions')
          .update(sessionDbBasicClose)
          .eq('id', targetSessionId);
        updateErr = basicRes.error;
        if (
          updateErr &&
          (updateErr.code === '42703' || updateErr.message?.includes('column'))
        ) {
          const fallbackUpdate = await supabase
            .from('class_sessions')
            .update(baseSessionDb)
            .eq('id', targetSessionId);
          updateErr = fallbackUpdate.error;
        }
      }
      if (updateErr) {
        handleSupabaseError(t('appContext.actions.updateSession'), updateErr);
        return;
      }
      await supabase.from('session_attendances').delete().eq('session_id', targetSessionId);
    } else {
      let { data: newSessionRow, error: sessionErr } = await supabase
        .from('class_sessions')
        .insert([sessionDbWithCloseAudit])
        .select()
        .single();

      if (
        sessionErr &&
        (sessionErr.code === '42703' || sessionErr.message?.includes('column'))
      ) {
        const basicInsert = await supabase
          .from('class_sessions')
          .insert([sessionDbBasicClose])
          .select()
          .single();
        newSessionRow = basicInsert.data;
        sessionErr = basicInsert.error;
        if (
          sessionErr &&
          (sessionErr.code === '42703' || sessionErr.message?.includes('column'))
        ) {
          const fallbackInsert = await supabase
            .from('class_sessions')
            .insert([baseSessionDb])
            .select()
            .single();
          newSessionRow = fallbackInsert.data;
          sessionErr = fallbackInsert.error;
        }
      }

      if (sessionErr) {
        handleSupabaseError(t('appContext.actions.createSession'), sessionErr);
        return;
      }
      targetSessionId = newSessionRow?.id || '';
    }

    if (targetSessionId && session.attendanceRecords && session.attendanceRecords.length > 0) {
      const attendanceDb = session.attendanceRecords.map(rec => ({
        session_id: targetSessionId,
        student_id: rec.studentId,
        attendance: rec.attendance,
        paid: rec.paid,
        paid_amount: rec.paidAmount || 0,
        payment_method: rec.paymentMethod || 'cash',
        payment_id: rec.paymentId || null
      }));
      await supabase.from('session_attendances').insert(attendanceDb);
    }

    await refreshFromSupabase();
  };

  const closeClassSession: AcademyDataContextType['closeClassSession'] = async params => {
    clearDbError();
    const nowIso = new Date().toISOString();
    const existingLocal =
      (params.sessionId ? sessions.find(s => s.id === params.sessionId) : undefined) ||
      sessions.find(
        s =>
          s.activityId === params.activityId &&
          s.teacherId === params.teacherId &&
          s.date === params.date
      );

    if (existingLocal?.isClosed) {
      return { success: true };
    }

    if (!existingLocal || params.attendanceRecords !== undefined) {
      await addClassSession({
        activityId: params.activityId,
        teacherId: params.teacherId,
        date: params.date,
        attendeesCount: params.attendeesCount ?? existingLocal?.attendeesCount ?? 0,
        durationMinutes: params.durationMinutes ?? existingLocal?.durationMinutes ?? 75,
        topic: params.topic ?? existingLocal?.topic ?? '',
        isClosed: true,
        closedAt: nowIso,
        closedBy: params.closedBy,
        closedByUserId: params.closedBy === 'automatica' ? undefined : currentUser?.id,
        attendanceRecords: params.attendanceRecords ?? existingLocal?.attendanceRecords
      });
      return { success: true };
    }

    setSessions(prev =>
      prev.map(s =>
        s.id === existingLocal.id
          ? {
              ...s,
              isClosed: true,
              closedAt: nowIso,
              closedBy: params.closedBy,
              closedByUserId: params.closedBy === 'automatica' ? undefined : currentUser?.id
            }
          : s
      )
    );

    const basicPayload = {
      is_closed: true,
      closed_at: nowIso
    };
    const auditPayload = {
      ...basicPayload,
      closed_by: params.closedBy,
      closed_by_user_id: params.closedBy === 'automatica' ? null : currentUser?.id || null
    };

    let { error } = await supabase
      .from('class_sessions')
      .update(auditPayload)
      .eq('id', existingLocal.id);

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      const fallback = await supabase
        .from('class_sessions')
        .update(basicPayload)
        .eq('id', existingLocal.id);
      error = fallback.error;
    }

    if (error) {
      handleSupabaseError(t('appContext.actions.closeSession'), error);
      return { success: false, error: error.message };
    }

    await refreshFromSupabase();
    return { success: true };
  };

  const reopenClassSession: AcademyDataContextType['reopenClassSession'] = async params => {
    clearDbError();
    const trimmedReason = (params.reason || '').trim();
    if (!trimmedReason) {
      const msg = t('appContext.reopenReasonRequired');
      setDbError(msg);
      return { success: false, error: msg };
    }

    const nowIso = new Date().toISOString();
    const existingLocal =
      (params.sessionId ? sessions.find(s => s.id === params.sessionId) : undefined) ||
      sessions.find(
        s =>
          s.activityId === params.activityId &&
          s.teacherId === params.teacherId &&
          s.date === params.date
      );

    if (!existingLocal) {
      return { success: false, error: t('appContext.sessionObtainError') };
    }

    setSessions(prev =>
      prev.map(s =>
        s.id === existingLocal.id
          ? {
              ...s,
              isClosed: false,
              closedAt: undefined,
              closedBy: undefined,
              closedByUserId: undefined,
              reopenReason: trimmedReason,
              reopenedAt: nowIso,
              reopenedBy: params.reopenedBy
            }
          : s
      )
    );

    const basicPayload = {
      is_closed: false,
      closed_at: null
    };
    const auditPayload = {
      ...basicPayload,
      closed_by: null,
      closed_by_user_id: null,
      reopen_reason: trimmedReason,
      reopened_at: nowIso,
      reopened_by: params.reopenedBy
    };

    let { error } = await supabase
      .from('class_sessions')
      .update(auditPayload)
      .eq('id', existingLocal.id);

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      const fallback = await supabase
        .from('class_sessions')
        .update(basicPayload)
        .eq('id', existingLocal.id);
      error = fallback.error;
    }

    if (error) {
      handleSupabaseError(t('appContext.actions.reopenSession'), error);
      return { success: false, error: error.message };
    }

    await refreshFromSupabase();
    return { success: true };
  };

  const deleteClassSession = async (id: string) => {
    clearDbError();
    const target = sessions.find(s => s.id === id);
    if (target?.isClosed) {
      setDbError(t('appContext.classClosedReadOnlyError'));
      return;
    }
    const { error } = await supabase.from('class_sessions').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteSession'), error);
      return;
    }
    setSessions(prev => prev.filter(s => s.id !== id));
    await refreshFromSupabase();
  };

  // Cierre automático de clases tras el retraso configurable en app_config
  const autoCloseInFlightRef = useRef(false);
  const lastAutoCloseRunAtRef = useRef(0);
  const autoCloseContextRef = useRef({
    appConfigs,
    sessions,
    activities,
    students,
    currentUser,
    currentRole,
    currentTeacherId
  });
  autoCloseContextRef.current = {
    appConfigs,
    sessions,
    activities,
    students,
    currentUser,
    currentRole,
    currentTeacherId
  };

  const autoCloseCfg = useMemo(() => parseClassAutoCloseConfig(appConfigs), [appConfigs]);

  useEffect(() => {
    if (dbSyncVersion === 0) return;
    if (!autoCloseCfg.enabled) return;
    if (!currentUser) return;

    const runAutoClose = async () => {
      if (autoCloseInFlightRef.current) return;

      const ctx = autoCloseContextRef.current;
      const cfg = parseClassAutoCloseConfig(ctx.appConfigs);
      if (!cfg.enabled || !ctx.currentUser) return;

      const isAdminUser = ctx.currentUser.role === UserRole.Admin;
      const effectiveTeacherId =
        ctx.currentUser.teacherId ||
        (ctx.currentRole === UserRole.Monitor || ctx.currentRole === UserRole.Hibrido
          ? ctx.currentTeacherId
          : '');
      const isTeacherUser =
        !isAdminUser &&
        Boolean(effectiveTeacherId) &&
        (ctx.currentUser.role === UserRole.Monitor ||
          ctx.currentUser.role === UserRole.Hibrido ||
          ctx.currentRole === UserRole.Monitor ||
          ctx.currentRole === UserRole.Hibrido);

      if (!isAdminUser && !isTeacherUser) return;

      const now = new Date();
      const nowIso = now.toISOString();

      const openCandidates = ctx.sessions.filter(ses => {
        const act = ctx.activities.find(a => a.id === ses.activityId);
        if (
          !shouldAutoCloseSession({
            session: ses,
            activity: act,
            delayHours: cfg.delayHours,
            now
          })
        ) {
          return false;
        }
        if (isAdminUser) return true;
        return Boolean(effectiveTeacherId && ses.teacherId === effectiveTeacherId);
      });

      const overdueUnrecordedDrafts = getOverdueUnrecordedScheduledSessions({
        activities: ctx.activities,
        sessions: ctx.sessions,
        students: ctx.students,
        delayHours: cfg.delayHours,
        isAdminUser,
        effectiveTeacherId,
        now
      });

      lastAutoCloseRunAtRef.current = Date.now();
      if (openCandidates.length === 0 && overdueUnrecordedDrafts.length === 0) return;

      autoCloseInFlightRef.current = true;
      const closedIdsConfirmed = new Set<string>();
      const upsertedNewSessions: ClassSession[] = [];

      const isColumnOrCheckError = (err: { code?: string; message?: string } | null) =>
        Boolean(
          err &&
            (err.code === '42703' ||
              err.code === 'PGRST204' ||
              err.code === '23514' ||
              err.message?.includes('column') ||
              err.message?.includes('closed_by'))
        );

      const closeExistingRowWithFallback = async (sessionId: string): Promise<boolean> => {
        let { error } = await supabase
          .from('class_sessions')
          .update({
            is_closed: true,
            closed_at: nowIso,
            closed_by: 'automatica',
            closed_by_user_id: null
          })
          .eq('id', sessionId);

        if (error && isColumnOrCheckError(error)) {
          const midRes = await supabase
            .from('class_sessions')
            .update({
              is_closed: true,
              closed_at: nowIso,
              closed_by: 'automatica'
            })
            .eq('id', sessionId);
          error = midRes.error;

          if (error && isColumnOrCheckError(error)) {
            const basicRes = await supabase
              .from('class_sessions')
              .update({
                is_closed: true,
                closed_at: nowIso
              })
              .eq('id', sessionId);
            error = basicRes.error;
          }
        }

        if (error) {
          console.warn(`Auto-close class_sessions (${sessionId}) warning:`, error.message);
          return false;
        }
        return true;
      };

      try {
        if (openCandidates.length > 0) {
          const candidateIds = openCandidates.map(c => c.id);
          let { error } = await supabase
            .from('class_sessions')
            .update({
              is_closed: true,
              closed_at: nowIso,
              closed_by: 'automatica',
              closed_by_user_id: null
            })
            .in('id', candidateIds);

          if (error && isColumnOrCheckError(error)) {
            const midRes = await supabase
              .from('class_sessions')
              .update({
                is_closed: true,
                closed_at: nowIso,
                closed_by: 'automatica'
              })
              .in('id', candidateIds);
            error = midRes.error;

            if (error && isColumnOrCheckError(error)) {
              const basicRes = await supabase
                .from('class_sessions')
                .update({
                  is_closed: true,
                  closed_at: nowIso
                })
                .in('id', candidateIds);
              error = basicRes.error;
            }
          }

          if (!error) {
            candidateIds.forEach(id => closedIdsConfirmed.add(id));
          } else {
            for (const id of candidateIds) {
              const ok = await closeExistingRowWithFallback(id);
              if (ok) closedIdsConfirmed.add(id);
            }
          }
        }

        for (const draft of overdueUnrecordedDrafts) {
          const baseRow = {
            activity_id: draft.activityId,
            teacher_id: draft.teacherId,
            date: draft.date,
            attendees_count: 0,
            duration_minutes: draft.durationMinutes,
            topic: null,
            is_closed: true,
            closed_at: nowIso
          };

          let { data: insertedRow, error: insertErr } = await supabase
            .from('class_sessions')
            .insert([
              {
                ...baseRow,
                closed_by: 'automatica',
                closed_by_user_id: null
              }
            ])
            .select('*')
            .single();

          if (insertErr && isColumnOrCheckError(insertErr)) {
            const midInsert = await supabase
              .from('class_sessions')
              .insert([{ ...baseRow, closed_by: 'automatica' }])
              .select('*')
              .single();
            insertedRow = midInsert.data;
            insertErr = midInsert.error;

            if (insertErr && isColumnOrCheckError(insertErr)) {
              const basicInsert = await supabase
                .from('class_sessions')
                .insert([baseRow])
                .select('*')
                .single();
              insertedRow = basicInsert.data;
              insertErr = basicInsert.error;
            }
          }

          if (insertErr && insertErr.code === '23505') {
            const { data: existingDbRow } = await supabase
              .from('class_sessions')
              .select('*')
              .eq('activity_id', draft.activityId)
              .eq('date', draft.date)
              .limit(1)
              .maybeSingle();
            if (existingDbRow?.id) {
              if (existingDbRow.is_closed !== true) {
                const ok = await closeExistingRowWithFallback(existingDbRow.id);
                if (ok) {
                  upsertedNewSessions.push({
                    ...mapDbSessionToSession(existingDbRow, []),
                    isClosed: true,
                    closedAt: nowIso,
                    closedBy: 'automatica',
                    closedByUserId: undefined
                  });
                }
              } else {
                upsertedNewSessions.push(mapDbSessionToSession(existingDbRow, []));
              }
            }
            continue;
          }

          if (insertErr) {
            console.warn(
              `Auto-close scheduled session (${draft.activityId} @ ${draft.date}) warning:`,
              insertErr.message
            );
            continue;
          }

          if (insertedRow) {
            upsertedNewSessions.push(mapDbSessionToSession(insertedRow, []));
          }
        }

        if (closedIdsConfirmed.size > 0 || upsertedNewSessions.length > 0) {
          setSessions(prev => {
            let next = prev.map(s =>
              closedIdsConfirmed.has(s.id)
                ? {
                    ...s,
                    isClosed: true,
                    closedAt: nowIso,
                    closedBy: 'automatica' as const,
                    closedByUserId: undefined
                  }
                : s
            );
            for (const created of upsertedNewSessions) {
              const existingIdx = next.findIndex(
                s =>
                  s.id === created.id ||
                  (s.activityId === created.activityId &&
                    s.date?.slice(0, 10) === created.date?.slice(0, 10))
              );
              if (existingIdx !== -1) {
                next = next.map((s, idx) => (idx === existingIdx ? created : s));
              } else {
                next = [created, ...next];
              }
            }
            return next;
          });
        }
      } catch (err) {
        console.warn('Auto-close error:', err);
      } finally {
        autoCloseInFlightRef.current = false;
      }
    };

    void runAutoClose();

    const AUTO_CLOSE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
    const VISIBILITY_THROTTLE_MS = 30 * 60 * 1000;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastAutoCloseRunAtRef.current >= VISIBILITY_THROTTLE_MS) {
          void runAutoClose();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      void runAutoClose();
    }, AUTO_CLOSE_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [dbSyncVersion, currentUser?.id, autoCloseCfg.enabled, autoCloseCfg.delayHours]);

  // Últimas notas / Comunicados
  const addNewsNote = async (
    note: Omit<NewsNote, 'id'>
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const isWorkshopNote = note.category === 'taller';
    const safeActivityId = isWorkshopNote && note.activityId ? note.activityId : undefined;
    const safeActivityName = isWorkshopNote && note.activityName ? note.activityName : undefined;
    const safeExpiresAt = note.expiresAt?.trim() ? note.expiresAt.trim().slice(0, 10) : undefined;

    const tempId = `note-${Date.now()}`;
    const optimisticNote: NewsNote = {
      ...note,
      id: tempId,
      activityId: safeActivityId,
      activityName: safeActivityName,
      expiresAt: safeExpiresAt,
      isDeleted: false
    };

    const isColumnError = (err: { code?: string; message?: string } | null) =>
      Boolean(
        err &&
          (err.code === '42703' ||
            err.code === 'PGRST204' ||
            err.message?.toLowerCase().includes('column'))
      );

    const extractMissingColumn = (msg?: string): string | null => {
      if (!msg) return null;
      const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i);
      if (pgrstMatch?.[1]) return pgrstMatch[1];
      const pgMatch = msg.match(/column "([^"]+)" of relation/i);
      if (pgMatch?.[1]) return pgMatch[1];
      return null;
    };

    const optionalExtendedColumns = new Set([
      'activity_id',
      'activity_name',
      'expires_at',
      'is_deleted',
      'deleted_at',
      'deleted_by',
      'author',
      'pinned'
    ]);

    const payload: Record<string, any> = {
      id: tempId,
      title: optimisticNote.title,
      content: optimisticNote.content,
      date: optimisticNote.date,
      category: optimisticNote.category,
      author: optimisticNote.author || null,
      pinned: Boolean(optimisticNote.pinned),
      activity_id: optimisticNote.activityId || null,
      activity_name: optimisticNote.activityName || null,
      expires_at: optimisticNote.expiresAt || null,
      is_deleted: false
    };

    try {
      let insertedRow: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < 9; attempt++) {
        const res = await supabase.from('news_notes').insert([payload]).select('*').single();
        if (!res.error) {
          insertedRow = res.data;
          lastError = null;
          break;
        }
        lastError = res.error;

        if (res.error.code === '22P02' && 'id' in payload) {
          delete payload.id;
          continue;
        }

        if (isColumnError(res.error)) {
          const missingCol = extractMissingColumn(res.error.message);
          if (missingCol && missingCol in payload) {
            delete payload[missingCol];
            continue;
          }
          let strippedAny = false;
          for (const optCol of [
            'activity_id',
            'activity_name',
            'expires_at',
            'is_deleted',
            'author',
            'pinned'
          ]) {
            if (optCol in payload && optionalExtendedColumns.has(optCol)) {
              delete payload[optCol];
              strippedAny = true;
            }
          }
          if (strippedAny) continue;
        }

        break;
      }

      if (lastError) {
        const msg = handleSupabaseError(t('appContext.actions.createNewsNote'), lastError);
        return { success: false, error: msg };
      }

      const savedNote: NewsNote = insertedRow
        ? {
            id: insertedRow.id,
            title: insertedRow.title,
            content: insertedRow.content,
            date: insertedRow.date,
            category: insertedRow.category || optimisticNote.category || 'general',
            author: insertedRow.author ?? optimisticNote.author,
            pinned:
              insertedRow.pinned !== undefined
                ? Boolean(insertedRow.pinned)
                : Boolean(optimisticNote.pinned),
            activityId: isWorkshopNote
              ? insertedRow.activity_id || optimisticNote.activityId || undefined
              : undefined,
            activityName: isWorkshopNote
              ? insertedRow.activity_name || optimisticNote.activityName || undefined
              : undefined,
            expiresAt:
              typeof insertedRow.expires_at === 'string' && insertedRow.expires_at
                ? insertedRow.expires_at.slice(0, 10)
                : optimisticNote.expiresAt,
            isDeleted: Boolean(insertedRow.is_deleted || insertedRow.deleted_at),
            deletedAt: insertedRow.deleted_at || undefined,
            deletedBy: insertedRow.deleted_by || undefined
          }
        : optimisticNote;

      setNewsNotes(prev => {
        const updated = [savedNote, ...prev.filter(n => n.id !== savedNote.id)];
        localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
        return updated;
      });

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      const msg = handleSupabaseError(t('appContext.actions.createNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const updateNewsNote = async (
    id: string,
    updates: {
      title: string;
      content: string;
      category: 'aviso' | 'taller' | 'noticia' | 'general';
      pinned?: boolean;
      activityId?: string;
      activityName?: string;
      expiresAt?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    if (!isStrictAdminSession) {
      return { success: false, error: t('appContext.actions.updateNewsNote') };
    }

    const isWorkshopNote = updates.category === 'taller';
    const safeActivityId = isWorkshopNote && updates.activityId ? updates.activityId : undefined;
    const safeActivityName = isWorkshopNote && updates.activityName ? updates.activityName : undefined;
    const safeExpiresAt = updates.expiresAt?.trim() ? updates.expiresAt.trim().slice(0, 10) : undefined;

    const previousNotes = newsNotes;
    setNewsNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              title: updates.title,
              content: updates.content,
              category: updates.category,
              pinned: Boolean(updates.pinned),
              activityId: safeActivityId,
              activityName: safeActivityName,
              expiresAt: safeExpiresAt
            }
          : n
      );
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    const isColumnError = (err: { code?: string; message?: string } | null) =>
      Boolean(
        err &&
          (err.code === '42703' ||
            err.code === 'PGRST204' ||
            err.message?.toLowerCase().includes('column'))
      );

    const extractMissingColumn = (msg?: string): string | null => {
      if (!msg) return null;
      const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i);
      if (pgrstMatch?.[1]) return pgrstMatch[1];
      const pgMatch = msg.match(/column "([^"]+)" of relation/i);
      if (pgMatch?.[1]) return pgMatch[1];
      return null;
    };

    const optionalExtendedColumns = new Set([
      'expires_at',
      'activity_id',
      'activity_name',
      'pinned'
    ]);

    const payload: Record<string, any> = {
      title: updates.title,
      content: updates.content,
      category: updates.category,
      pinned: Boolean(updates.pinned),
      activity_id: safeActivityId || null,
      activity_name: safeActivityName || null,
      expires_at: safeExpiresAt || null
    };

    try {
      let updatedRow: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await supabase
          .from('news_notes')
          .update(payload)
          .eq('id', id)
          .select('*')
          .single();
        if (!res.error) {
          updatedRow = res.data;
          lastError = null;
          break;
        }
        lastError = res.error;

        if (isColumnError(res.error)) {
          const missingCol = extractMissingColumn(res.error.message);
          if (missingCol && missingCol in payload) {
            delete payload[missingCol];
            continue;
          }
          let strippedAny = false;
          for (const optCol of ['expires_at', 'activity_id', 'activity_name', 'pinned']) {
            if (optCol in payload && optionalExtendedColumns.has(optCol)) {
              delete payload[optCol];
              strippedAny = true;
            }
          }
          if (strippedAny) continue;
        }

        break;
      }

      if (lastError) {
        setNewsNotes(previousNotes);
        localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
        const msg = handleSupabaseError(t('appContext.actions.updateNewsNote'), lastError);
        return { success: false, error: msg };
      }

      if (updatedRow) {
        setNewsNotes(prev => {
          const updated = prev.map(n =>
            n.id === id
              ? {
                  ...n,
                  title: updatedRow.title ?? updates.title,
                  content: updatedRow.content ?? updates.content,
                  category: updatedRow.category || updates.category,
                  pinned:
                    updatedRow.pinned !== undefined
                      ? Boolean(updatedRow.pinned)
                      : Boolean(updates.pinned),
                  activityId: isWorkshopNote
                    ? updatedRow.activity_id || safeActivityId || undefined
                    : undefined,
                  activityName: isWorkshopNote
                    ? updatedRow.activity_name || safeActivityName || undefined
                    : undefined,
                  expiresAt:
                    typeof updatedRow.expires_at === 'string' && updatedRow.expires_at
                      ? updatedRow.expires_at.slice(0, 10)
                      : safeExpiresAt
                }
              : n
          );
          localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
          return updated;
        });
      }

      await refreshFromSupabase();
      return { success: true };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.updateNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const deleteNewsNote = async (id: string): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const nowIso = new Date().toISOString();
    const actor = currentUser?.email || currentUser?.name || 'admin';
    const previousNotes = newsNotes;

    setNewsNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              isDeleted: true,
              deletedAt: nowIso,
              deletedBy: actor
            }
          : n
      );
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase
        .from('news_notes')
        .update({
          is_deleted: true,
          deleted_at: nowIso,
          deleted_by: actor
        })
        .eq('id', id);
      if (!error) {
        await refreshFromSupabase();
        return { success: true };
      }
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), error);
      return { success: false, error: msg };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const restoreNewsNote = async (id: string): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const previousNotes = newsNotes;
    const target = newsNotes.find(n => n.id === id);
    const shouldClearExpiredDate = Boolean(target && isNewsNoteExpiredByDate(target.expiresAt));

    setNewsNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              isDeleted: false,
              deletedAt: undefined,
              deletedBy: undefined,
              ...(shouldClearExpiredDate ? { expiresAt: undefined } : {})
            }
          : n
      );
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const updatePayload: Record<string, any> = {
        is_deleted: false,
        deleted_at: null,
        deleted_by: null
      };
      if (shouldClearExpiredDate) {
        updatePayload.expires_at = null;
      }

      let { error } = await supabase.from('news_notes').update(updatePayload).eq('id', id);
      if (
        error &&
        shouldClearExpiredDate &&
        (error.code === '42703' ||
          error.code === 'PGRST204' ||
          error.message?.toLowerCase().includes('expires_at'))
      ) {
        delete updatePayload.expires_at;
        ({ error } = await supabase.from('news_notes').update(updatePayload).eq('id', id));
      }

      if (!error) {
        await refreshFromSupabase();
        return { success: true };
      }
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.restoreNewsNote'), error);
      return { success: false, error: msg };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.restoreNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const permanentlyDeleteNewsNote = async (
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    clearDbError();
    const previousNotes = newsNotes;
    setNewsNotes(prev => {
      const updated = prev.filter(n => n.id !== id);
      localStorage.setItem('triskell_news_notes', JSON.stringify(updated));
      return updated;
    });

    try {
      const { error } = await supabase.from('news_notes').delete().eq('id', id);
      if (!error) {
        await refreshFromSupabase();
        return { success: true };
      }
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), error);
      return { success: false, error: msg };
    } catch (e: any) {
      setNewsNotes(previousNotes);
      localStorage.setItem('triskell_news_notes', JSON.stringify(previousNotes));
      const msg = handleSupabaseError(t('appContext.actions.deleteNewsNote'), e);
      return { success: false, error: msg };
    }
  };

  const markNewsNoteRead = async (noteId: string, isRead: boolean = true) => {
    if (!currentUser?.id) return;
    const uid = currentUser.id;
    setReadNewsNoteIds(prev => {
      const nextSet = new Set(prev);
      if (isRead) {
        nextSet.add(noteId);
      } else {
        nextSet.delete(noteId);
      }
      const nextArr = Array.from(nextSet);
      try {
        localStorage.setItem(`triskell_news_reads_${uid}`, JSON.stringify(nextArr));
      } catch {
        // ignore storage quota errors
      }
      return nextArr;
    });

    try {
      if (isRead) {
        const { error } = await supabase
          .from('news_note_reads')
          .upsert(
            {
              note_id: noteId,
              user_id: uid,
              read_at: new Date().toISOString()
            },
            { onConflict: 'note_id,user_id' }
          );
        if (error) {
          console.warn('news_note_reads upsert error:', error.message);
        }
      } else {
        const { error } = await supabase
          .from('news_note_reads')
          .delete()
          .eq('note_id', noteId)
          .eq('user_id', uid);
        if (error) {
          console.warn('news_note_reads delete error:', error.message);
        }
      }
    } catch (e) {
      console.warn('news_note_reads mutation error:', e);
    }
  };

  const newsGraceCfg = useMemo(
    () => parseNewsFinishedWorkshopGraceConfig(appConfigs),
    [appConfigs]
  );
  const newsGraceRef = useRef({
    newsNotes,
    activities,
    readNewsNoteIds,
    newsGraceCfg,
    isStrictAdminSession,
    currentUser
  });
  newsGraceRef.current = {
    newsNotes,
    activities,
    readNewsNoteIds,
    newsGraceCfg,
    isStrictAdminSession,
    currentUser
  };

  useEffect(() => {
    if (dbSyncVersion === 0) return;
    if (!currentUser?.id) return;

    const runNewsWorkshopGraceCheck = async () => {
      const ctx = newsGraceRef.current;
      if (!ctx.currentUser?.id) return;
      const now = new Date();
      const endedAtMap = getStoredActivityEndedAtMap();

      for (const note of ctx.newsNotes) {
        if (note.isDeleted || note.deletedAt) continue;

        if (isNewsNoteExpiredByDate(note.expiresAt, now)) {
          if (ctx.isStrictAdminSession) {
            await deleteNewsNote(note.id);
          }
          continue;
        }

        if (!ctx.newsGraceCfg.enabled || !note.activityId) continue;
        const linkedActivity = ctx.activities.find(a => a.id === note.activityId);
        const evaluation = evaluateWorkshopNoteGraceStatus({
          note,
          activity: linkedActivity,
          config: ctx.newsGraceCfg,
          endedAtFallbackMap: endedAtMap,
          now
        });
        if (!evaluation.isExpired) continue;

        if (ctx.newsGraceCfg.action === 'mark_read') {
          if (!ctx.readNewsNoteIds.includes(note.id)) {
            await markNewsNoteRead(note.id, true);
          }
        } else if (ctx.newsGraceCfg.action === 'delete' && ctx.isStrictAdminSession) {
          await deleteNewsNote(note.id);
        }
      }
    };

    void runNewsWorkshopGraceCheck();
    const intervalId = window.setInterval(() => {
      void runNewsWorkshopGraceCheck();
    }, 15 * 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    dbSyncVersion,
    currentUser?.id,
    isStrictAdminSession,
    newsGraceCfg.enabled,
    newsGraceCfg.graceHours,
    newsGraceCfg.action,
    activities,
    newsNotes
  ]);

  // Sembrador / Inicializador de datos en Supabase (bloqueado en producción)
  const seedInitialDataToSupabase = async () => {
    if (import.meta.env.PROD || currentUserRef.current?.role !== UserRole.Admin) {
      return;
    }
    clearDbError();
    setIsLoadingDb(true);
    try {
      const teachersPayload = INITIAL_TEACHERS.map(teacherItem => ({
        name: teacherItem.name,
        email: teacherItem.email,
        phone: teacherItem.phone,
        avatar_url: teacherItem.avatarUrl || teacherItem.avatar,
        payment_scheme: teacherItem.paymentScheme,
        rate_per_class: teacherItem.ratePerClass,
        fixed_monthly_rate: teacherItem.fixedMonthlyRate,
        revenue_share_percent: teacherItem.revenueSharePercent,
        preferred_payment_method: teacherItem.preferredPaymentMethod,
        collection_type: teacherItem.collectionType || 'personal',
        bank_account: teacherItem.bankAccount,
        active: teacherItem.active,
        notes: teacherItem.notes
      }));
      const { data: createdTeachers, error: tErr } = await supabase
        .from('teachers')
        .insert(teachersPayload)
        .select();
      if (tErr) throw tErr;

      const tMap: Record<string, string> = {};
      createdTeachers?.forEach((ct, idx) => {
        tMap[INITIAL_TEACHERS[idx].id] = ct.id;
      });

      const activitiesPayload = INITIAL_ACTIVITIES.map(a => ({
        name: a.name,
        description: a.description,
        teacher_id: tMap[a.teacherId] || createdTeachers?.[0]?.id,
        category: a.category,
        color: a.color,
        schedule: a.schedule,
        default_price_monthly: a.defaultPriceMonthly,
        default_price_per_class: a.defaultPricePerClass,
        billing_mode: a.billingMode,
        bizum_enabled: a.bizum_enabled,
        bizum_phone: a.bizum_phone,
        bizum_concept: a.bizum_concept,
        room: a.room,
        active: a.active
      }));
      const { data: createdActivities, error: aErr } = await supabase
        .from('activities')
        .insert(activitiesPayload)
        .select();
      if (aErr) throw aErr;

      const aMap: Record<string, string> = {};
      createdActivities?.forEach((ca, idx) => {
        aMap[INITIAL_ACTIVITIES[idx].id] = ca.id;
      });

      const studentsPayload = INITIAL_STUDENTS.map(s => ({
        name: s.name,
        email: s.email,
        phone: s.phone,
        status: s.status,
        registered_at: s.registeredAt,
        notes: s.notes
      }));
      const { data: createdStudents, error: sErr } = await supabase
        .from('students')
        .insert(studentsPayload)
        .select();
      if (sErr) throw sErr;

      const enrollmentsPayload: any[] = [];
      INITIAL_STUDENTS.forEach((origS, sIdx) => {
        const newStudentId = createdStudents?.[sIdx]?.id;
        if (newStudentId && origS.activities) {
          origS.activities.forEach(enr => {
            const newActId = aMap[enr.activityId];
            if (newActId) {
              enrollmentsPayload.push({
                student_id: newStudentId,
                activity_id: newActId,
                custom_price: enr.customPrice || null,
                billing_mode: enr.billingMode || 'monthly',
                enrolled_since: enr.enrolledSince
              });
            }
          });
        }
      });
      if (enrollmentsPayload.length > 0) {
        await supabase.from('student_enrollments').insert(enrollmentsPayload);
      }

      const expensesPayload = INITIAL_EXPENSES.map(e => ({
        title: e.title,
        category: e.category,
        amount: e.amount,
        date: e.date,
        period_month: e.periodMonth,
        payment_method: e.paymentMethod,
        status: e.status,
        invoice_number: e.invoiceNumber,
        notes: e.notes
      }));
      await supabase.from('center_expenses').insert(expensesPayload);

      await refreshFromSupabase();
    } catch (err: any) {
      handleSupabaseError(t('appContext.actions.seedInitialData'), err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  const resetToInitialData = async () => {
    if (import.meta.env.PROD || currentUserRef.current?.role !== UserRole.Admin) {
      return;
    }
    await seedInitialDataToSupabase();
  };

  return (
    <AcademyDataContext.Provider
      value={{
        teachers,
        setTeachers,
        activities,
        setActivities,
        students,
        setStudents,
        studentAbsences,
        setStudentAbsences,
        memberStatusHistory,
        setMemberStatusHistory,
        sessions,
        setSessions,
        newsNotes,
        setNewsNotes,
        readNewsNoteIds,
        setReadNewsNoteIds,
        addStatusHistoryEntry,
        deleteStatusHistoryEntry,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        updateTeacherAvatar,
        addActivity,
        updateActivity,
        deleteActivity,
        upsertEnrollmentRow,
        softDeleteEnrollmentRow,
        addStudent,
        updateStudent,
        deleteStudent,
        enrollStudentInActivity,
        updateStudentEnrollment,
        unenrollStudentFromActivity,
        resolveStudentIdForCurrentUser,
        enrollUserFromProfile,
        quickCreateAndEnrollStudent,
        addClassSession,
        deleteClassSession,
        closeClassSession,
        reopenClassSession,
        upsertSessionAttendance,
        addNewsNote,
        updateNewsNote,
        deleteNewsNote,
        restoreNewsNote,
        permanentlyDeleteNewsNote,
        markNewsNoteRead,
        seedInitialDataToSupabase,
        resetToInitialData
      }}
    >
      {children}
    </AcademyDataContext.Provider>
  );
};

export const useAcademyData = () => {
  const context = useContext(AcademyDataContext);
  if (!context) {
    throw new Error('useAcademyData must be used within an AcademyDataProvider');
  }
  return context;
};
