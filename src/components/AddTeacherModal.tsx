import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { supabase, normalizeUserRole } from '../lib/supabase';
import { ROLE_I18N_KEY_MAP } from '../lib/authRole';
import { MemberType, Teacher, TeacherPaymentScheme, PaymentMethod, UserRole } from '../types';
import { createTranslator, TranslationKey } from '../lib/i18n';
import {
  X,
  Check,
  AlertCircle,
  History,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  Wand2,
  Copy,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  GraduationCap
} from 'lucide-react';

interface AddTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherToEdit?: Teacher | null;
}

interface LiveProfileRow {
  id: string;
  name: string;
  email: string;
  role: UserRole | '';
  teacherId?: string;
  studentId?: string;
  memberNumber?: string;
  memberType?: MemberType;
  startDate?: string;
  active?: boolean;
}

interface MemberCandidate {
  key: string;
  profileId?: string;
  studentId?: string;
  name: string;
  email: string;
  phone: string;
  role?: UserRole | '';
  memberNumber?: string;
  memberType?: MemberType;
  startDate?: string;
  alreadyTeacher: boolean;
  isAdmin: boolean;
}

function generateStrongPassword(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const suffix =
    chars[Math.floor(Math.random() * chars.length)] +
    chars[Math.floor(Math.random() * chars.length)];
  return `Triskell${digits}${suffix}!`;
}

export const AddTeacherModal: React.FC<AddTeacherModalProps> = ({ isOpen, onClose, teacherToEdit }) => {
  const {
    teachers,
    students,
    profiles: contextProfiles,
    addTeacher,
    updateTeacher,
    createUserByAdmin,
    updateUserProfileByAdmin,
    memberStatusHistory,
    addStatusHistoryEntry,
    deleteStatusHistoryEntry,
    language
  } = useApp();
  const t = createTranslator(language);
  const getRoleLabel = (r: UserRole) =>
    t(`common.roles.${ROLE_I18N_KEY_MAP[r]}` as TranslationKey);
  const todayDefault = new Date().toISOString().split('T')[0];

  // Modo de creación cuando !teacherToEdit: 'existing' (socio/usuario) vs 'new' (nuevo usuario)
  const [createMode, setCreateMode] = useState<'existing' | 'new'>('existing');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string>('');
  const [existingAccountRole, setExistingAccountRole] = useState<UserRole.Monitor | UserRole.Hibrido>(UserRole.Monitor);
  const [liveProfiles, setLiveProfiles] = useState<LiveProfileRow[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  // Credenciales para modo 'new'
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState<UserRole.Monitor | UserRole.Hibrido>(UserRole.Monitor);
  const [alsoCreateStudent, setAlsoCreateStudent] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    role: UserRole.Monitor | UserRole.Hibrido;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Campos de ficha de monitor
  const [name, setName] = useState(teacherToEdit?.name || '');
  const [email, setEmail] = useState(teacherToEdit?.email || '');
  const [phone, setPhone] = useState(teacherToEdit?.phone || '');
  const [paymentScheme, setPaymentScheme] = useState<TeacherPaymentScheme>(
    teacherToEdit?.paymentScheme || 'per_class'
  );
  const [ratePerClass, setRatePerClass] = useState<number>(teacherToEdit?.ratePerClass || 30);
  const [fixedMonthlyRate, setFixedMonthlyRate] = useState<number>(teacherToEdit?.fixedMonthlyRate || 400);
  const [revenueSharePercent, setRevenueSharePercent] = useState<number>(teacherToEdit?.revenueSharePercent || 60);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod>(
    teacherToEdit?.preferredPaymentMethod || 'cash'
  );
  const [collectionType, setCollectionType] = useState<'personal' | 'association'>(
    teacherToEdit?.collectionType || 'personal'
  );
  const [bankAccount, setBankAccount] = useState(teacherToEdit?.bankAccount || '');
  const [active, setActive] = useState<boolean>(teacherToEdit?.active ?? true);
  const [memberNumber, setMemberNumber] = useState(teacherToEdit?.memberNumber || '');
  const [memberType, setMemberType] = useState<MemberType>(teacherToEdit?.memberType || 'socio');
  const [startDate, setStartDate] = useState(teacherToEdit?.startDate || todayDefault);
  const [endDate, setEndDate] = useState(teacherToEdit?.endDate || '');
  const [notes, setNotes] = useState(teacherToEdit?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showAddCycle, setShowAddCycle] = useState(false);
  const [cycleStatus, setCycleStatus] = useState<'active' | 'inactive'>('active');
  const [cycleMemberType, setCycleMemberType] = useState<MemberType>('socio');
  const [cycleStart, setCycleStart] = useState(todayDefault);
  const [cycleEnd, setCycleEnd] = useState('');
  const [cycleNotes, setCycleNotes] = useState('');
  const [isAddingCycle, setIsAddingCycle] = useState(false);

  const teacherHistory = useMemo(
    () =>
      teacherToEdit
        ? memberStatusHistory.filter(
            h => h.entityType === 'teacher' && h.entityId === teacherToEdit.id
          )
        : [],
    [memberStatusHistory, teacherToEdit]
  );

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date().toISOString().split('T')[0];

    setCreateMode('existing');
    setMemberSearch('');
    setSelectedCandidateKey('');
    setExistingAccountRole(UserRole.Monitor);
    setNewUserPassword(generateStrongPassword());
    setShowPassword(false);
    setNewUserRole(UserRole.Monitor);
    setAlsoCreateStudent(false);
    setCreatedCredentials(null);
    setCopiedCreds(false);

    setName(teacherToEdit?.name || '');
    setEmail(teacherToEdit?.email || '');
    setPhone(teacherToEdit?.phone || '');
    setPaymentScheme(teacherToEdit?.paymentScheme || 'per_class');
    setRatePerClass(teacherToEdit?.ratePerClass ?? 30);
    setFixedMonthlyRate(teacherToEdit?.fixedMonthlyRate ?? 400);
    setRevenueSharePercent(teacherToEdit?.revenueSharePercent ?? 60);
    setPreferredPaymentMethod(teacherToEdit?.preferredPaymentMethod || 'cash');
    setCollectionType(teacherToEdit?.collectionType || 'personal');
    setBankAccount(teacherToEdit?.bankAccount || '');
    setActive(teacherToEdit?.active ?? true);
    setMemberNumber(teacherToEdit?.memberNumber || '');
    setMemberType(teacherToEdit?.memberType || 'socio');
    setStartDate(teacherToEdit?.startDate || today);
    setEndDate(teacherToEdit?.endDate || '');
    setNotes(teacherToEdit?.notes || '');
    setIsSaving(false);
    setErrorMsg(null);
    setShowAddCycle(false);
    setCycleStart(today);
    setCycleEnd('');
    setCycleNotes('');

    if (teacherToEdit) return;

    let mounted = true;
    const fetchProfiles = async () => {
      setIsLoadingCandidates(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, teacher_id, student_id, member_number, member_type, start_date, active')
          .order('full_name', { ascending: true });

        if (!mounted) return;
        if (!error && data) {
          setLiveProfiles(
            data.map((row: any) => ({
              id: row.id,
              name: row.full_name || row.email || '',
              email: row.email || '',
              role: row.role ? normalizeUserRole(row.role) : '',
              teacherId: row.teacher_id || undefined,
              studentId: row.student_id || undefined,
              memberNumber: row.member_number || undefined,
              memberType: (row.member_type as MemberType) || undefined,
              startDate: row.start_date || undefined,
              active: row.active ?? undefined
            }))
          );
        }
      } catch {
        // Fallback a contextProfiles
      } finally {
        if (mounted) setIsLoadingCandidates(false);
      }
    };

    fetchProfiles();
    return () => {
      mounted = false;
    };
  }, [isOpen, teacherToEdit]);

  const candidates = useMemo<MemberCandidate[]>(() => {
    if (teacherToEdit) return [];

    const mergedProfiles = new Map<string, LiveProfileRow>();
    contextProfiles.forEach(p => {
      mergedProfiles.set(p.id, {
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        teacherId: p.teacherId,
        studentId: p.studentId,
        memberNumber: p.memberNumber,
        memberType: p.memberType,
        startDate: p.startDate,
        active: p.active
      });
    });
    liveProfiles.forEach(p => {
      mergedProfiles.set(p.id, p);
    });

    const teacherEmailSet = new Set(
      teachers.map(tr => tr.email.trim().toLowerCase()).filter(Boolean)
    );
    const teacherIdSet = new Set(teachers.map(tr => tr.id));

    const matchedStudentIds = new Set<string>();
    const list: MemberCandidate[] = [];

    mergedProfiles.forEach(p => {
      const emailNorm = p.email.trim().toLowerCase();
      const linkedStudent = students.find(
        s =>
          (p.studentId && s.id === p.studentId) ||
          s.profileId === p.id ||
          (emailNorm && s.email.trim().toLowerCase() === emailNorm)
      );
      if (linkedStudent) {
        matchedStudentIds.add(linkedStudent.id);
      }

      const alreadyTeacher = Boolean(
        (p.teacherId && teacherIdSet.has(p.teacherId)) ||
          (emailNorm && teacherEmailSet.has(emailNorm))
      );

      list.push({
        key: `profile:${p.id}`,
        profileId: p.id,
        studentId: linkedStudent?.id || p.studentId,
        name: p.name || linkedStudent?.name || p.email,
        email: p.email || linkedStudent?.email || '',
        phone: linkedStudent?.phone || '',
        role: p.role,
        memberNumber: p.memberNumber || linkedStudent?.memberNumber,
        memberType: p.memberType || linkedStudent?.memberType || 'socio',
        startDate: p.startDate || linkedStudent?.startDate,
        alreadyTeacher,
        isAdmin: p.role === UserRole.Admin
      });
    });

    students.forEach(s => {
      if (matchedStudentIds.has(s.id)) return;
      const emailNorm = s.email.trim().toLowerCase();
      const alreadyTeacher = Boolean(emailNorm && teacherEmailSet.has(emailNorm));
      list.push({
        key: `student:${s.id}`,
        profileId: s.profileId,
        studentId: s.id,
        name: s.name,
        email: s.email || '',
        phone: s.phone || '',
        role: s.profileId ? UserRole.Alumno : '',
        memberNumber: s.memberNumber,
        memberType: s.memberType || 'socio',
        startDate: s.startDate,
        alreadyTeacher,
        isAdmin: false
      });
    });

    return list.sort((a, b) => {
      if (a.alreadyTeacher !== b.alreadyTeacher) return a.alreadyTeacher ? 1 : -1;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [teacherToEdit, contextProfiles, liveProfiles, students, teachers]);

  const filteredCandidates = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.memberNumber || '').toLowerCase().includes(q)
    );
  }, [candidates, memberSearch]);

  const selectedCandidate = useMemo(
    () => candidates.find(c => c.key === selectedCandidateKey) || null,
    [candidates, selectedCandidateKey]
  );

  if (!isOpen) return null;

  const handleSelectCandidate = (candidate: MemberCandidate) => {
    if (candidate.alreadyTeacher) return;
    setSelectedCandidateKey(candidate.key);
    setErrorMsg(null);
    setName(candidate.name || '');
    setEmail(candidate.email || '');
    setPhone(candidate.phone || '');
    setMemberNumber(candidate.memberNumber || '');
    setMemberType(candidate.memberType || 'socio');
    setStartDate(candidate.startDate || todayDefault);

    if (
      candidate.studentId ||
      candidate.role === UserRole.Alumno ||
      candidate.role === UserRole.Socio ||
      candidate.role === UserRole.Hibrido
    ) {
      setExistingAccountRole(UserRole.Hibrido);
    } else {
      setExistingAccountRole(UserRole.Monitor);
    }
  };

  const handleSwitchMode = (mode: 'existing' | 'new') => {
    setCreateMode(mode);
    setErrorMsg(null);
    if (mode === 'new') {
      setSelectedCandidateKey('');
      if (!newUserPassword) {
        setNewUserPassword(generateStrongPassword());
      }
    }
  };

  const handleAddCycle = async () => {
    if (!teacherToEdit || !cycleStart || isAddingCycle) return;
    setIsAddingCycle(true);
    setErrorMsg(null);
    try {
      const res = await addStatusHistoryEntry({
        entityType: 'teacher',
        entityId: teacherToEdit.id,
        status: cycleStatus,
        memberType: cycleMemberType,
        startDate: cycleStart,
        endDate: cycleEnd || undefined,
        notes: cycleNotes.trim() || undefined
      });
      if (!res.success) {
        setErrorMsg(res.error || t('addTeacherModal.cycleErrorFallback'));
        return;
      }
      setShowAddCycle(false);
      setCycleEnd('');
      setCycleNotes('');
    } finally {
      setIsAddingCycle(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!createdCredentials) return;
    const text = `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2500);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setErrorMsg(null);

    // 1. Modo Edición (existente)
    if (teacherToEdit) {
      if (!name.trim()) return;
      setIsSaving(true);
      try {
        const res = await updateTeacher(teacherToEdit.id, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          paymentScheme,
          ratePerClass: Number(ratePerClass),
          fixedMonthlyRate: Number(fixedMonthlyRate),
          revenueSharePercent: Number(revenueSharePercent),
          preferredPaymentMethod,
          collectionType,
          bankAccount: bankAccount.trim(),
          active,
          memberNumber: memberNumber.trim() || undefined,
          memberType,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes.trim()
        });
        if (!res.success) {
          setErrorMsg(res.error || t('addTeacherModal.saveErrorFallback'));
          return;
        }
        onClose();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t('addTeacherModal.unexpectedErrorFallback'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // 2. Modo Nuevo Monitor -> Pestaña 1: Seleccionar socio / usuario existente
    if (createMode === 'existing') {
      if (!selectedCandidate) {
        setErrorMsg(t('addTeacherModal.errors.selectMemberRequired'));
        return;
      }
      if (!name.trim()) return;

      setIsSaving(true);
      try {
        const res = await addTeacher({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          paymentScheme,
          ratePerClass: Number(ratePerClass),
          fixedMonthlyRate: Number(fixedMonthlyRate),
          revenueSharePercent: Number(revenueSharePercent),
          preferredPaymentMethod,
          collectionType,
          bankAccount: bankAccount.trim(),
          active,
          memberNumber: memberNumber.trim() || undefined,
          memberType,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes.trim()
        });

        if (!res.success) {
          setErrorMsg(res.error || t('addTeacherModal.saveErrorFallback'));
          return;
        }

        if (selectedCandidate.profileId && res.teacherId) {
          const profileRes = await updateUserProfileByAdmin(selectedCandidate.profileId, {
            teacherId: res.teacherId,
            ...(selectedCandidate.isAdmin ? {} : { role: existingAccountRole }),
            memberNumber: memberNumber.trim() || null,
            memberType,
            startDate: startDate || null,
            active
          });
          if (!profileRes.success) {
            setErrorMsg(profileRes.error || t('addTeacherModal.errors.linkProfileFailed'));
            return;
          }
        }

        onClose();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t('addTeacherModal.unexpectedErrorFallback'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // 3. Modo Nuevo Monitor -> Pestaña 2: Crear nuevo usuario con rol monitor
    const emailClean = email.trim().toLowerCase();
    const passClean = newUserPassword.trim();
    if (!emailClean || !emailClean.includes('@')) {
      setErrorMsg(t('addTeacherModal.errors.emailRequiredForNewUser'));
      return;
    }
    if (passClean.length < 6) {
      setErrorMsg(t('addTeacherModal.errors.passwordMinLength'));
      return;
    }
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const res = await createUserByAdmin({
        email: emailClean,
        fullName: name.trim(),
        role: newUserRole,
        password: passClean,
        memberNumber: memberNumber.trim() || undefined,
        memberType,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        createTeacherProfile: true,
        createStudentProfile: newUserRole === UserRole.Hibrido && alsoCreateStudent,
        teacherProfileData: {
          phone: phone.trim(),
          paymentScheme,
          ratePerClass: Number(ratePerClass),
          fixedMonthlyRate: Number(fixedMonthlyRate),
          revenueSharePercent: Number(revenueSharePercent),
          preferredPaymentMethod,
          collectionType,
          bankAccount: bankAccount.trim(),
          active,
          notes: notes.trim()
        }
      });

      if (!res.success) {
        setErrorMsg(res.error || t('addTeacherModal.errors.createAuthUserFailed'));
        return;
      }

      setCreatedCredentials({
        name: name.trim(),
        email: emailClean,
        password: res.tempPassword || passClean,
        role: newUserRole
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('addTeacherModal.unexpectedErrorFallback'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija con botón táctil de 44px */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {teacherToEdit ? t('addTeacherModal.editTitle') : t('addTeacherModal.newTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('addTeacherModal.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('addTeacherModal.closeAria')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Vista de confirmación de credenciales cuando se crea un nuevo usuario */}
        {createdCredentials ? (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  {t('addTeacherModal.createdSuccess.title')}
                </h3>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                  {t('addTeacherModal.createdSuccess.subtitle', { name: createdCredentials.name })}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {t('addTeacherModal.createdSuccess.emailLabel')}
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white select-all">
                  {createdCredentials.email}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {t('addTeacherModal.createdSuccess.passwordLabel')}
                </span>
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 select-all">
                  {createdCredentials.password}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {t('addTeacherModal.createdSuccess.roleLabel')}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {getRoleLabel(createdCredentials.role)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                <Copy className="h-4 w-4" />
                <span>
                  {copiedCreds
                    ? t('addTeacherModal.createdSuccess.copied')
                    : t('addTeacherModal.createdSuccess.copyCredentials')}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px]"
              >
                <Check className="h-4 w-4" />
                <span>{t('addTeacherModal.createdSuccess.done')}</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            {/* Pestañas de flujo en Creación (!teacherToEdit) */}
            {!teacherToEdit && (
              <div className="px-5 pt-3.5 pb-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60 shrink-0">
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('existing')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition min-h-[38px] ${
                      createMode === 'existing'
                        ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t('addTeacherModal.modes.existing')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('new')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition min-h-[38px] ${
                      createMode === 'new'
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t('addTeacherModal.modes.new')}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
              {errorMsg && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 px-3 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>
              )}

              {/* Pestaña 1: Buscador y selección de miembro existente */}
              {!teacherToEdit && createMode === 'existing' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {t('addTeacherModal.existingMode.searchLabel')}
                    </label>
                    {selectedCandidate && (
                      <button
                        type="button"
                        onClick={() => setSelectedCandidateKey('')}
                        className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        {t('addTeacherModal.existingMode.changeMember')}
                      </button>
                    )}
                  </div>

                  {selectedCandidate ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 truncate">
                            {t('addTeacherModal.existingMode.selectedBanner', { name: selectedCandidate.name })}
                          </p>
                          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 truncate">
                            {selectedCandidate.email || t('addTeacherModal.existingMode.noEmail')}
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      </div>

                      {selectedCandidate.profileId ? (
                        selectedCandidate.isAdmin ? (
                          <div className="rounded-lg border border-indigo-300/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2 text-[11px] text-indigo-800 dark:text-indigo-200 flex items-start gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{t('addTeacherModal.existingMode.adminRolePreserved')}</span>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              {t('addTeacherModal.existingMode.accountRoleLabel')}
                            </label>
                            <select
                              value={existingAccountRole}
                              onChange={e => setExistingAccountRole(e.target.value as UserRole.Monitor | UserRole.Hibrido)}
                              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                            >
                              <option value={UserRole.Monitor}>{getRoleLabel(UserRole.Monitor)}</option>
                              <option value={UserRole.Hibrido}>{getRoleLabel(UserRole.Hibrido)}</option>
                            </select>
                          </div>
                        )
                      ) : (
                        <div className="rounded-lg border border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{t('addTeacherModal.existingMode.noAccountWarning')}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          placeholder={t('addTeacherModal.existingMode.searchPlaceholder')}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                        />
                      </div>

                      <div className="max-h-44 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        {isLoadingCandidates && candidates.length === 0 ? (
                          <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t('addTeacherModal.existingMode.loading')}</span>
                          </div>
                        ) : filteredCandidates.length === 0 ? (
                          <p className="p-4 text-center text-xs text-slate-400 italic">
                            {t('addTeacherModal.existingMode.emptySearch')}
                          </p>
                        ) : (
                          filteredCandidates.map(c => (
                            <button
                              key={c.key}
                              type="button"
                              disabled={c.alreadyTeacher}
                              onClick={() => handleSelectCandidate(c)}
                              className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition ${
                                c.alreadyTeacher
                                  ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/40'
                                  : 'hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {c.name}
                                  {c.memberNumber ? (
                                    <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-500">
                                      #{c.memberNumber}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {c.email || t('addTeacherModal.existingMode.noEmail')}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1">
                                {c.alreadyTeacher ? (
                                  <span className="rounded-md bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                                    {t('addTeacherModal.existingMode.alreadyTeacherBadge')}
                                  </span>
                                ) : c.isAdmin ? (
                                  <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                                    {t('addTeacherModal.existingMode.adminBadge')}
                                  </span>
                                ) : c.studentId ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                    <GraduationCap className="h-3 w-3" />
                                    {t('addTeacherModal.existingMode.studentBadge')}
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                                    {t('addTeacherModal.existingMode.userBadge')}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Pestaña 2: Credenciales de acceso para nuevo usuario */}
              {!teacherToEdit && createMode === 'new' && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>{t('addTeacherModal.newMode.accessSectionTitle')}</span>
                  </span>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.newMode.emailRequiredLabel')}
                    </label>
                    <input
                      type="email"
                      required
                      placeholder={t('addTeacherModal.emailPlaceholder')}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.newMode.passwordLabel')}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          placeholder={t('addTeacherModal.newMode.passwordPlaceholder')}
                          value={newUserPassword}
                          onChange={e => setNewUserPassword(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          aria-label={t('addTeacherModal.newMode.showPasswordAria')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewUserPassword(generateStrongPassword())}
                        className="inline-flex items-center gap-1 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition shrink-0"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        <span>{t('addTeacherModal.newMode.generatePassword')}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.newMode.roleLabel')}
                    </label>
                    <select
                      value={newUserRole}
                      onChange={e => {
                        const r = e.target.value as UserRole.Monitor | UserRole.Hibrido;
                        setNewUserRole(r);
                        if (r === UserRole.Hibrido) setAlsoCreateStudent(true);
                      }}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-indigo-500"
                    >
                      <option value={UserRole.Monitor}>{getRoleLabel(UserRole.Monitor)}</option>
                      <option value={UserRole.Hibrido}>{getRoleLabel(UserRole.Hibrido)}</option>
                    </select>
                  </div>

                  {newUserRole === UserRole.Hibrido && (
                    <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none pt-0.5">
                      <input
                        type="checkbox"
                        checked={alsoCreateStudent}
                        onChange={e => setAlsoCreateStudent(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{t('addTeacherModal.newMode.alsoCreateStudentLabel')}</span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.fullNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('addTeacherModal.fullNamePlaceholder')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>

              {/* Teléfono y (en edición o selección existente) Correo */}
              <div className={`grid grid-cols-1 ${teacherToEdit || createMode === 'existing' ? 'sm:grid-cols-2' : ''} gap-3`}>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.phoneLabel')}
                  </label>
                  <input
                    type="tel"
                    placeholder={t('addTeacherModal.phonePlaceholder')}
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  />
                </div>
                {(teacherToEdit || createMode === 'existing') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.emailLabel')}
                    </label>
                    <input
                      type="email"
                      placeholder={t('addTeacherModal.emailPlaceholder')}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Membresía y Fechas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.memberTypeLabel')}
                  </label>
                  <select
                    value={memberType}
                    onChange={e => setMemberType(e.target.value as MemberType)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                  >
                    <option value="socio">{t('addTeacherModal.memberTypes.socio')}</option>
                    <option value="monitor_no_socio">{t('addTeacherModal.memberTypes.monitor_no_socio')}</option>
                    <option value="alumno_no_socio">{t('addTeacherModal.memberTypes.alumno_no_socio')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.memberNumberLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('addTeacherModal.memberNumberPlaceholder')}
                    value={memberNumber}
                    onChange={e => setMemberNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.startDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.endDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  />
                </div>
              </div>

              {/* Esquema Salarial */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                  {t('addTeacherModal.remunerationTitle')}
                </span>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.contractTypeLabel')}
                  </label>
                  <select
                    value={paymentScheme}
                    onChange={e => setPaymentScheme(e.target.value as TeacherPaymentScheme)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                  >
                    <option value="per_class">{t('addTeacherModal.schemes.per_class')}</option>
                    <option value="monthly_fixed">{t('addTeacherModal.schemes.monthly_fixed')}</option>
                    <option value="revenue_share">{t('addTeacherModal.schemes.revenue_share')}</option>
                  </select>
                </div>

                {paymentScheme === 'per_class' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.ratePerClassLabel')}
                    </label>
                    <div className="relative max-w-[160px]">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={ratePerClass}
                        onChange={e => setRatePerClass(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2 text-base font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">€</span>
                    </div>
                  </div>
                )}

                {paymentScheme === 'monthly_fixed' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.fixedMonthlyRateLabel')}
                    </label>
                    <div className="relative max-w-[160px]">
                      <input
                        type="number"
                        step="5"
                        min="0"
                        value={fixedMonthlyRate}
                        onChange={e => setFixedMonthlyRate(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2 text-base font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">€</span>
                    </div>
                  </div>
                )}

                {paymentScheme === 'revenue_share' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addTeacherModal.revenueShareLabel')}
                    </label>
                    <div className="relative max-w-[160px]">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={revenueSharePercent}
                        onChange={e => setRevenueSharePercent(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2 text-base font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.preferredMethodLabel')}
                  </label>
                  <select
                    value={preferredPaymentMethod}
                    onChange={e => setPreferredPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  >
                    <option value="cash">{t('common.paymentMethods.cash')}</option>
                    <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                    <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.ibanLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('addTeacherModal.ibanPlaceholder')}
                    value={bankAccount}
                    onChange={e => setBankAccount(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.defaultCollectionLabel')}
                  </label>
                  <select
                    value={collectionType}
                    onChange={e => setCollectionType(e.target.value as 'personal' | 'association')}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  >
                    <option value="personal">{t('addTeacherModal.collectionPersonal')}</option>
                    <option value="association">{t('addTeacherModal.collectionAssociation')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.centerStatusLabel')}
                  </label>
                  <select
                    value={active ? 'active' : 'inactive'}
                    onChange={e => setActive(e.target.value === 'active')}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                  >
                    <option value="active">{t('addTeacherModal.statusActiveExercise')}</option>
                    <option value="inactive">{t('addTeacherModal.statusInactive')}</option>
                  </select>
                </div>
              </div>

              {/* Historial de Estados / Reincorporaciones (solo al editar) */}
              {teacherToEdit && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <History className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{t('addTeacherModal.history.title', { count: teacherHistory.length })}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddCycle(v => !v)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/10 px-2 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600/20 transition"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{showAddCycle ? t('addTeacherModal.history.close') : t('addTeacherModal.history.addCycle')}</span>
                    </button>
                  </div>

                  {showAddCycle && (
                    <div className="rounded-lg border border-indigo-500/30 bg-white dark:bg-slate-900 p-2.5 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={cycleStatus}
                          onChange={e => setCycleStatus(e.target.value as 'active' | 'inactive')}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-semibold"
                        >
                          <option value="active">{t('addTeacherModal.history.cycleActive')}</option>
                          <option value="inactive">{t('addTeacherModal.history.cycleInactive')}</option>
                        </select>
                        <select
                          value={cycleMemberType}
                          onChange={e => setCycleMemberType(e.target.value as MemberType)}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-semibold"
                        >
                          <option value="socio">{t('addTeacherModal.memberTypes.socio')}</option>
                          <option value="monitor_no_socio">{t('addTeacherModal.memberTypes.monitor_no_socio')}</option>
                          <option value="alumno_no_socio">{t('addTeacherModal.memberTypes.alumno_no_socio')}</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={cycleStart}
                          onChange={e => setCycleStart(e.target.value)}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                        />
                        <input
                          type="date"
                          value={cycleEnd}
                          onChange={e => setCycleEnd(e.target.value)}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t('addTeacherModal.history.notesPlaceholder')}
                          value={cycleNotes}
                          onChange={e => setCycleNotes(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                        />
                        <button
                          type="button"
                          disabled={isAddingCycle}
                          onClick={handleAddCycle}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {isAddingCycle ? t('addTeacherModal.history.saving') : t('addTeacherModal.history.save')}
                        </button>
                      </div>
                    </div>
                  )}

                  {teacherHistory.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">
                      {t('addTeacherModal.history.empty')}
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60 max-h-36 overflow-y-auto text-[11px]">
                      {teacherHistory.map(h => (
                        <div key={h.id} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold mr-1.5 ${
                                h.status === 'active'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {h.status === 'active' ? t('addTeacherModal.history.badgeActive') : t('addTeacherModal.history.badgeInactive')}
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                              {h.startDate} {h.endDate ? `→ ${h.endDate}` : t('addTeacherModal.history.currentSuffix')}
                            </span>
                            {h.notes && (
                              <span className="block text-slate-500 dark:text-slate-400 truncate">
                                {h.notes}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteStatusHistoryEntry(h.id)}
                            title={t('addTeacherModal.history.deleteTooltip')}
                            className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.notesLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('addTeacherModal.notesPlaceholder')}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Barra Inferior Fija: Siempre a la vista */}
            <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-end gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                className="flex-1 sm:flex-none rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] flex items-center justify-center disabled:opacity-50"
              >
                {t('addTeacherModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px] disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                <span>
                  {isSaving
                    ? t('addTeacherModal.saving')
                    : teacherToEdit
                    ? t('addTeacherModal.updateButton')
                    : createMode === 'new'
                    ? t('addTeacherModal.createUserAndTeacherButton')
                    : t('addTeacherModal.createButton')}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
