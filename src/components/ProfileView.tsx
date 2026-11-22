import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { AppLanguage, UserRole } from '../types';
import {
  AvatarCropOptions,
  PRESET_AVATARS,
  optimizeAvatarToWebP,
  uploadAvatarToStorage
} from '../lib/avatarUpload';
import { AvatarCropModal } from './AvatarCropModal';
import {
  User,
  Camera,
  Check,
  ShieldCheck,
  Sun,
  Moon,
  Fingerprint,
  LogOut,
  GraduationCap,
  BookOpen,
  Crown,
  Mail,
  Phone,
  Sparkles,
  Calendar,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  ChevronDown,
  Languages,
  Image as ImageIcon,
  Loader2,
  Trash2,
  UserX,
  Clock,
  X
} from 'lucide-react';
import { LANGUAGE_OPTIONS, TranslationKey, createTranslator } from '../lib/i18n';
import { MASTER_ADMIN_EMAIL } from '../lib/authRole';
import { formatSocioNumberPadded } from '../lib/memberNumber';

interface ProfileViewProps {
  onNavigate?: (path: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  onNavigate,
  onNavigateToTab
}) => {
  const {
    currentUser,
    setCurrentUser,
    currentRole,
    setCurrentRole,
    logout,
    teachers,
    students,
    activities,
    payments,
    selectedPeriod,
    currentTeacherId,
    currentStudentId,
    updateTeacher,
    updateTeacherAvatar,
    updateUserAvatar,
    updateStudent,
    promoteOrUpdateMemberRole,
    isDarkMode,
    toggleDarkMode,
    language,
    setUserLanguage,
    isBiometricsSupported,
    hasBiometricsEnabled,
    enableBiometrics,
    disableBiometrics,
    changePassword,
    setIsAuthModalOpen,
    membershipWithdrawalRequests,
    requestAssociationWithdrawal,
    cancelAssociationWithdrawalRequest
  } = useApp();

  const t = createTranslator(language);

  const currentTeacher =
    (currentRole !== UserRole.Admin && currentUser
      ? teachers.find(
          t =>
            (currentUser.teacherId && t.id === currentUser.teacherId) ||
            (currentUser.email &&
              t.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined) || teachers.find(t => t.id === currentTeacherId);

  const currentStudent =
    (currentRole !== UserRole.Admin && currentUser
      ? students.find(
          s =>
            (currentUser.studentId && s.id === currentUser.studentId) ||
            s.profileId === currentUser.id ||
            (currentUser.email &&
              s.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined) || students.find(s => s.id === currentStudentId);

  const isTeacherRole = currentRole === UserRole.Monitor || currentRole === UserRole.Hibrido;
  const isStudentRole =
    currentRole === UserRole.Alumno || currentRole === UserRole.Hibrido || currentRole === UserRole.Socio;

  const avatarStorageKey = `triskell_user_avatar_${currentUser?.id || currentUser?.email || currentRole}`;

  const resolveInitialAvatar = () => {
    if (currentUser?.photoURL) {
      return currentUser.photoURL;
    }
    if (isTeacherRole && (currentTeacher?.avatar || currentTeacher?.avatarUrl)) {
      return currentTeacher.avatar || currentTeacher.avatarUrl || '';
    }
    try {
      const saved = localStorage.getItem(avatarStorageKey);
      if (saved) return saved;
    } catch {
      // Ignorar si localStorage no está disponible
    }
    return '';
  };

  const resolveInitialName = () => {
    if (currentRole === UserRole.Monitor && currentTeacher?.name) return currentTeacher.name;
    if ((currentRole === UserRole.Alumno || currentRole === UserRole.Socio) && currentStudent?.name) {
      return currentStudent.name;
    }
    return currentUser?.name || '';
  };

  const resolveInitialPhone = () => {
    if (isTeacherRole && currentTeacher?.phone) return currentTeacher.phone;
    if (isStudentRole && currentStudent?.phone) return currentStudent.phone;
    return '';
  };

  const resolveInitialEmail = () => {
    if (currentRole === UserRole.Monitor && currentTeacher?.email) return currentTeacher.email;
    if ((currentRole === UserRole.Alumno || currentRole === UserRole.Socio) && currentStudent?.email) {
      return currentStudent.email;
    }
    return currentUser?.email || '';
  };

  const [fullName, setFullName] = useState<string>(resolveInitialName);
  const [phone, setPhone] = useState<string>(resolveInitialPhone);
  const [email, setEmail] = useState<string>(resolveInitialEmail);
  const [avatarUrl, setAvatarUrl] = useState<string>(resolveInitialAvatar);
  const [collectionType, setCollectionType] = useState<'personal' | 'association'>(
    currentTeacher?.collectionType || 'personal'
  );

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [biometricMessage, setBiometricMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isBiometricBusy, setIsBiometricBusy] = useState(false);

  // Cambio de contraseña directo desde Seguridad
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassChars, setShowPassChars] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // En móvil ambos bloques inician colapsados; en escritorio (lg+) siempre visibles
  const [isPersonalOpenMobile, setIsPersonalOpenMobile] = useState(false);
  const [isSecurityOpenMobile, setIsSecurityOpenMobile] = useState(false);

  // Cambio dinámico de rol de socio (socio -> student / teacher / teacher_student)
  const [isRoleSwitchBusy, setIsRoleSwitchBusy] = useState(false);
  const [roleSwitchMessage, setRoleSwitchMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Cambio de idioma (Castellano / Galego)
  const [isLanguageBusy, setIsLanguageBusy] = useState(false);
  const [languageMessage, setLanguageMessage] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // Gestión de avatar (galería, cámara y predefinidos)
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropModalError, setCropModalError] = useState<string | null>(null);

  // Solicitud de baja de la asociación
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [isWithdrawalBusy, setIsWithdrawalBusy] = useState(false);
  const [withdrawalFeedback, setWithdrawalFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isMasterAdminUser =
    (currentUser?.email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;
  const userEmailNorm = (currentUser?.email || '').trim().toLowerCase();
  const userWithdrawals = membershipWithdrawalRequests.filter(
    r =>
      (currentUser?.id && (r.profileId === currentUser.id || r.userId === currentUser.id)) ||
      (userEmailNorm && r.userEmail.trim().toLowerCase() === userEmailNorm)
  );
  const pendingWithdrawalRequest = userWithdrawals.find(r => r.status === 'pending');
  const latestWithdrawalRequest = userWithdrawals[0];

  const handleSubmitWithdrawalRequest = async () => {
    setIsWithdrawalBusy(true);
    setWithdrawalFeedback(null);
    try {
      const res = await requestAssociationWithdrawal(withdrawalReason.trim() || undefined);
      if (res.success) {
        setIsWithdrawalModalOpen(false);
        setWithdrawalReason('');
        setWithdrawalFeedback({
          type: 'ok',
          text: t('profile.withdrawal.requestSentSuccess')
        });
      } else {
        setWithdrawalFeedback({
          type: 'err',
          text: res.error || t('profile.withdrawal.requestError')
        });
      }
    } finally {
      setIsWithdrawalBusy(false);
    }
  };

  const handleCancelWithdrawalRequest = async () => {
    if (!pendingWithdrawalRequest) return;
    setIsWithdrawalBusy(true);
    setWithdrawalFeedback(null);
    try {
      const res = await cancelAssociationWithdrawalRequest(pendingWithdrawalRequest.id);
      if (res.success) {
        setWithdrawalFeedback({
          type: 'ok',
          text: t('profile.withdrawal.cancelSuccess')
        });
      } else {
        setWithdrawalFeedback({
          type: 'err',
          text: res.error || t('profile.withdrawal.cancelError')
        });
      }
    } finally {
      setIsWithdrawalBusy(false);
    }
  };

  // Sincronizar campos cuando cambia usuario/rol/datos cargados
  useEffect(() => {
    setFullName(resolveInitialName());
    setPhone(resolveInitialPhone());
    setEmail(resolveInitialEmail());
    setAvatarUrl(resolveInitialAvatar());
    if (currentTeacher?.collectionType) {
      setCollectionType(currentTeacher.collectionType);
    }
  }, [currentRole, currentUser?.id, currentUser?.photoURL, currentTeacher?.id, currentStudent?.id]);

  // Datos específicos del rol
  const teacherActivities = activities.filter(a => a.teacherId === currentTeacher?.id);
  const teacherStudentsCount = students.filter(st =>
    st.activities.some(a => teacherActivities.some(ta => ta.id === a.activityId))
  ).length;

  const studentEnrolledActivities = activities.filter(act =>
    currentStudent?.activities.some(e => e.activityId === act.id)
  );
  const studentAllUnsettledPayments = payments.filter(
    p =>
      p.studentId === currentStudent?.id &&
      (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
  );
  const studentPendingPaymentsCount = studentAllUnsettledPayments.filter(
    p => p.status === 'pending' || p.status === 'overdue'
  ).length;
  const studentPartialPaymentsCount = studentAllUnsettledPayments.filter(
    p => p.status === 'partial'
  ).length;

  const roleLabelKeys: Record<UserRole, TranslationKey> = {
    [UserRole.Admin]: 'profile.roleLabels.admin',
    [UserRole.Monitor]: 'profile.roleLabels.teacher',
    [UserRole.Alumno]: 'profile.roleLabels.student',
    [UserRole.Socio]: 'profile.roleLabels.socio',
    [UserRole.Hibrido]: 'profile.roleLabels.teacher_student'
  };

  const roleBadgeLabel =
    t(roleLabelKeys[currentRole]) || t('profile.common.defaultUser');

  const handleLanguageChange = async (nextLang: AppLanguage) => {
    if (isLanguageBusy || language === nextLang) return;
    setIsLanguageBusy(true);
    setLanguageMessage(null);
    try {
      const res = await setUserLanguage(nextLang);
      const nextT = createTranslator(nextLang);
      const languageNameKeys: Record<AppLanguage, TranslationKey> = {
        es: 'profile.language.names.es',
        gl: 'profile.language.names.gl',
        en: 'profile.language.names.en'
      };
      if (res.success) {
        setLanguageMessage({
          type: 'ok',
          text: nextT('profile.language.savedOk', {
            language: nextT(languageNameKeys[nextLang])
          })
        });
      } else if (res.error === 'missing_language_column') {
        setLanguageMessage({
          type: 'warn',
          text: nextT('profile.language.localOnlyWarn')
        });
      } else {
        setLanguageMessage({
          type: 'err',
          text: res.error || nextT('profile.language.saveError')
        });
      }
      setTimeout(() => setLanguageMessage(null), 4500);
    } finally {
      setIsLanguageBusy(false);
    }
  };

  const handleSelfRoleChange = async (
    targetRole: UserRole.Socio | UserRole.Alumno | UserRole.Monitor | UserRole.Hibrido
  ) => {
    if (isRoleSwitchBusy || targetRole === currentUser?.role) return;
    setIsRoleSwitchBusy(true);
    setRoleSwitchMessage(null);
    try {
      const res = await promoteOrUpdateMemberRole(targetRole);
      if (res.success) {
        const optionKeys: Record<typeof targetRole, TranslationKey> = {
          [UserRole.Socio]: 'profile.roleSwitch.options.socio',
          [UserRole.Alumno]: 'profile.roleSwitch.options.student',
          [UserRole.Monitor]: 'profile.roleSwitch.options.teacher',
          [UserRole.Hibrido]: 'profile.roleSwitch.options.teacher_student'
        };
        setRoleSwitchMessage({
          type: 'ok',
          text: t('profile.roleSwitch.updated', {
            role: t(optionKeys[targetRole])
          })
        });
      } else {
        setRoleSwitchMessage({
          type: 'err',
          text: res.error || t('profile.roleSwitch.error')
        });
      }
    } finally {
      setIsRoleSwitchBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedAvatar = avatarUrl.trim();
    if (!trimmedName) return;

    // 1. Guardar cambios específicos del Monitor si aplica
    if (isTeacherRole && currentTeacher) {
      await updateTeacher(currentTeacher.id, {
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        avatar: trimmedAvatar,
        avatarUrl: trimmedAvatar,
        collectionType
      });
      if (trimmedAvatar) {
        await updateTeacherAvatar(currentTeacher.id, trimmedAvatar);
      }
    }

    // 2. Guardar cambios específicos del Alumno si aplica
    if (isStudentRole && currentStudent) {
      await updateStudent(currentStudent.id, {
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail
      });
    }

    // 3. Sincronizar nombre y avatar en la tabla `profiles` de Supabase (si tiene usuario real)
    if (currentUser?.id && !currentUser.id.startsWith('usr-') && !currentUser.id.startsWith('demo-') && !currentUser.id.startsWith('cached-')) {
      try {
        await supabase
          .from('profiles')
          .update({
            full_name: trimmedName,
            avatar_url: trimmedAvatar || null
          })
          .eq('id', currentUser.id);
      } catch {
        // Ignorar si no aplica en entorno offline/demo
      }
    }

    // 4. Persistir avatar local y actualizar sesión actual
    try {
      if (trimmedAvatar) {
        localStorage.setItem(avatarStorageKey, trimmedAvatar);
      } else {
        localStorage.removeItem(avatarStorageKey);
      }
    } catch {
      // Ignorar si almacenamiento no está disponible
    }

    if (currentUser) {
      setCurrentUser({
        ...currentUser,
        name: trimmedName,
        email: trimmedEmail || currentUser.email,
        photoURL: trimmedAvatar || currentUser.photoURL
      });
    }

    setSaveMessage(t('profile.personal.savedSuccess'));
    setTimeout(() => setSaveMessage(null), 3500);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword.trim().length < 6) {
      setPasswordMessage({ type: 'err', text: t('profile.password.minLengthError') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'err', text: t('profile.password.mismatchError') });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await changePassword(newPassword);
      if (res.success) {
        setPasswordMessage({ type: 'ok', text: t('profile.password.updatedSuccess') });
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      } else {
        setPasswordMessage({ type: 'err', text: res.error || t('profile.password.updateError') });
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleToggleBiometrics = async () => {
    setBiometricMessage(null);
    if (hasBiometricsEnabled) {
      disableBiometrics();
      setBiometricMessage({
        type: 'ok',
        text: t('profile.biometrics.disabledSuccess')
      });
      return;
    }
    setIsBiometricBusy(true);
    try {
      const ok = await enableBiometrics();
      if (ok) {
        setBiometricMessage({
          type: 'ok',
          text: t('profile.biometrics.enabledSuccess')
        });
      } else {
        setBiometricMessage({
          type: 'err',
          text: t('profile.biometrics.registerError')
        });
      }
    } catch (err: any) {
      setBiometricMessage({
        type: 'err',
        text: err?.message || t('profile.biometrics.browserError')
      });
    } finally {
      setIsBiometricBusy(false);
    }
  };

  const handleSelectPresetAvatar = async (presetPath: string) => {
    if (isAvatarBusy) return;
    setIsAvatarBusy(true);
    setAvatarFeedback(null);
    try {
      setAvatarUrl(presetPath);
      const res = await updateUserAvatar(presetPath);
      if (res.success) {
        setAvatarFeedback({
          type: 'ok',
          text: t('profile.personal.avatarPresetSaved')
        });
      } else {
        setAvatarFeedback({
          type: 'err',
          text: t('profile.personal.avatarUploadError', { error: res.error || '' })
        });
      }
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const handleClearAvatar = async () => {
    if (isAvatarBusy) return;
    setIsAvatarBusy(true);
    setAvatarFeedback(null);
    try {
      const res = await updateUserAvatar(null);
      if (res.success) {
        setAvatarUrl('');
        setAvatarFeedback({
          type: 'ok',
          text: t('profile.personal.avatarRemoved')
        });
      } else {
        setAvatarFeedback({
          type: 'err',
          text: t('profile.personal.avatarUploadError', { error: res.error || '' })
        });
      }
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isAvatarBusy) return;

    setAvatarFeedback(null);
    setCropModalError(null);

    if (file.type && !file.type.startsWith('image/')) {
      setAvatarFeedback({
        type: 'err',
        text: t('profile.personal.avatarInvalidImage')
      });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData?.session?.user?.id;
    const isRealProfile =
      Boolean(authUserId) &&
      Boolean(currentUser?.id) &&
      !currentUser!.id.startsWith('usr-') &&
      !currentUser!.id.startsWith('demo-') &&
      !currentUser!.id.startsWith('cached-');

    if (!isRealProfile || !authUserId) {
      setAvatarFeedback({
        type: 'err',
        text: t('profile.personal.avatarAuthRequired')
      });
      return;
    }

    setCropFile(file);
  };

  const handleConfirmCroppedAvatar = async (crop: AvatarCropOptions) => {
    if (!cropFile || isAvatarBusy) return;

    setAvatarFeedback(null);
    setCropModalError(null);
    setIsAvatarBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData?.session?.user?.id;
      const isRealProfile =
        Boolean(authUserId) &&
        Boolean(currentUser?.id) &&
        !currentUser!.id.startsWith('usr-') &&
        !currentUser!.id.startsWith('demo-') &&
        !currentUser!.id.startsWith('cached-');

      if (!isRealProfile || !authUserId) {
        setCropModalError(t('profile.personal.avatarAuthRequired'));
        return;
      }

      // 1. Optimización obligatoria en cliente con recorte/zoom/centrado: 400x400px + WebP (quality 0.8, objetivo <50KB)
      const optimized = await optimizeAvatarToWebP(cropFile, crop);

      // 2. Subida a Supabase Storage: avatars/{user_id}/avatar.webp con upsert: true
      const publicUrlWithTs = await uploadAvatarToStorage(authUserId, optimized.blob);

      // 3. Guardar URL pública con ?t={timestamp} en profiles (y teachers si aplica)
      const saveRes = await updateUserAvatar(publicUrlWithTs);
      if (!saveRes.success) {
        setCropModalError(t('profile.personal.avatarUploadError', { error: saveRes.error || '' }));
        return;
      }

      setAvatarUrl(publicUrlWithTs);
      const sizeKb = Math.max(1, Math.round(optimized.sizeBytes / 1024));
      setAvatarFeedback({
        type: 'ok',
        text: t('profile.personal.avatarUploadSuccess', { sizeKb })
      });
      setCropFile(null);
    } catch (err: any) {
      const code = err?.message || '';
      if (code === 'unsupported_file_type' || code === 'invalid_image') {
        setCropModalError(t('profile.personal.avatarInvalidImage'));
      } else if (code === 'webp_not_supported' || code === 'webp_encode_failed') {
        setCropModalError(t('profile.personal.avatarWebpUnsupported'));
      } else {
        setCropModalError(
          t('profile.personal.avatarUploadError', {
            error: err?.message || 'Storage error'
          })
        );
      }
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const displayAvatar = avatarUrl || currentUser?.photoURL || '';
  const displayInitial = (fullName || currentUser?.name || t('profile.common.defaultInitial')).charAt(0).toUpperCase();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Cabecera Universal del Perfil */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt={fullName || currentUser?.name || t('profile.common.defaultUser')}
                className="h-16 w-16 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-sm shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-2xl shadow-sm shrink-0">
                {displayInitial}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('profile.header.userProfileTag')}
                </span>
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  {roleBadgeLabel}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate mt-0.5">
                {fullName || currentUser?.name || t('profile.common.defaultDisplayName')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {email || currentUser?.email || t('profile.header.activeSessionFallback')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await logout();
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition min-h-[40px] shrink-0"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('profile.header.logout')}</span>
          </button>
        </div>

        {/* Selector de perspectiva para roles con múltiples vistas (Admin / Híbrido) */}
        {(currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Hibrido) && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {t('profile.header.activePerspective')}
            </span>
            <div className="flex flex-wrap gap-2">
              {currentUser?.role === UserRole.Admin && (
                <button
                  type="button"
                  onClick={() => setCurrentRole(UserRole.Admin)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                    currentRole === UserRole.Admin
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  <span>{t('profile.perspectiveLabels.admin')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCurrentRole(UserRole.Monitor)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                  currentRole === UserRole.Monitor
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>{t('profile.perspectiveLabels.teacher')}</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentRole(UserRole.Alumno)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                  currentRole === UserRole.Alumno
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{t('profile.perspectiveLabels.student')}</span>
              </button>
              {currentUser?.role === UserRole.Hibrido && (
                <button
                  type="button"
                  onClick={() => setCurrentRole(UserRole.Hibrido)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                    currentRole === UserRole.Hibrido
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t('profile.perspectiveLabels.teacher_student')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Participación / Cambio dinámico de estado de Socio
        {/*{currentUser && currentUser.role !== UserRole.Admin && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mi Participación en la Asociación
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Actualiza tu rol entre Socio, Alumno, Monitor o Híbrido
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: UserRole.Socio, label: 'Socio (Solo portal)' },
                  { id: UserRole.Alumno, label: 'Alumno' },
                  { id: UserRole.Monitor, label: 'Monitor' },
                  { id: UserRole.Hibrido, label: 'Híbrido' }
                ] as const
              ).map(opt => {
                const isActive = currentUser.role === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isRoleSwitchBusy || isActive}
                    onClick={() => handleSelfRoleChange(opt.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition whitespace-nowrap disabled:opacity-75 ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-300'
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {roleSwitchMessage && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs font-semibold flex items-center gap-2 ${
                  roleSwitchMessage.type === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                }`}
              >
                {roleSwitchMessage.type === 'ok' ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{roleSwitchMessage.text}</span>
              </div>
            )}
          </div>
        )}*/}
      </div>

      {/* Información Específica del Rol */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {currentRole === UserRole.Admin && (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.admin.activeTeachers')}
              </span>
              <div className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
                {teachers.filter(t => t.active).length}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('profile.stats.admin.registeredTeachingTeam')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.admin.registeredStudents')}
              </span>
              <div className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
                {students.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('profile.stats.admin.activeAndTrialMembers')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.admin.classesWorkshops')}
              </span>
              <div className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
                {activities.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('profile.stats.admin.currentTrainingOffer')}
              </p>
            </div>
          </>
        )}

        {isTeacherRole && currentTeacher && (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.teacher.assignedWorkshops')}
              </span>
              <div className="mt-1 text-xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
                {teacherActivities.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t(
                  teacherStudentsCount === 1
                    ? 'profile.stats.teacher.studentsEnrolledSingular'
                    : 'profile.stats.teacher.studentsEnrolledPlural',
                  { count: teacherStudentsCount }
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.teacher.feeScheme')}
              </span>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                {currentTeacher.paymentScheme === 'per_class' &&
                  t('profile.stats.teacher.perClassRate', { amount: currentTeacher.ratePerClass })}
                {currentTeacher.paymentScheme === 'monthly_fixed' &&
                  t('profile.stats.teacher.monthlyFixedRate', {
                    amount: currentTeacher.fixedMonthlyRate
                  })}
                {currentTeacher.paymentScheme === 'revenue_share' &&
                  t('profile.stats.teacher.revenueShareRate', {
                    percent: currentTeacher.revenueSharePercent
                  })}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('profile.stats.teacher.assignedSettlementMode')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.teacher.collectionMode')}
              </span>
              <div className="mt-1 text-sm font-black text-emerald-600 dark:text-emerald-400">
                {collectionType === 'personal'
                  ? t('profile.stats.teacher.personalDirect')
                  : t('profile.stats.teacher.association')}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {onNavigateToTab ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab('teacher-payouts')}
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                  >
                    {t('profile.stats.teacher.viewMyPayouts')}
                  </button>
                ) : (
                  t('profile.stats.teacher.preferenceInClasses')
                )}
              </p>
            </div>
          </>
        )}

        {(currentRole === UserRole.Alumno || currentRole === UserRole.Socio) && (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.student.enrolledWorkshops')}
              </span>
              <div className="mt-1 text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                {studentEnrolledActivities.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {studentEnrolledActivities.map(a => a.name).join(', ') ||
                  t('profile.stats.student.noAssignedWorkshops')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.student.feesStatusWithPeriod', { period: selectedPeriod })}
              </span>
              <div
                className={`mt-1 text-sm font-black ${
                  studentPendingPaymentsCount === 0 && studentPartialPaymentsCount === 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : studentPartialPaymentsCount > 0 && studentPendingPaymentsCount === 0
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {studentPendingPaymentsCount === 0 && studentPartialPaymentsCount === 0
                  ? t('profile.stats.student.upToDate')
                  : [
                      studentPendingPaymentsCount > 0
                        ? t(
                            studentPendingPaymentsCount > 1
                              ? 'profile.stats.student.pendingPlural'
                              : 'profile.stats.student.pendingSingular',
                            { count: studentPendingPaymentsCount }
                          )
                        : null,
                      studentPartialPaymentsCount > 0
                        ? t(
                            studentPartialPaymentsCount > 1
                              ? 'profile.stats.student.partialPlural'
                              : 'profile.stats.student.partialSingular',
                            { count: studentPartialPaymentsCount }
                          )
                        : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentRole === UserRole.Socio
                  ? t('profile.stats.student.socioActivitiesHint')
                  : t('profile.stats.student.studentPortalHint')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('profile.stats.student.memberSince')}
              </span>
              <div className="mt-1 text-sm font-black tabular-nums text-slate-900 dark:text-white flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  {currentStudent?.startDate ||
                    currentStudent?.registeredAt ||
                    currentUser?.startDate ||
                    '—'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {(currentStudent?.memberNumber || currentUser?.memberNumber) &&
                  `${t('profile.stats.student.memberNumberPrefix', {
                    number:
                      formatSocioNumberPadded(
                        currentStudent?.memberNumber || currentUser?.memberNumber
                      ) || ''
                  })} · `}
                {t('profile.stats.student.statusLabel', {
                  status: currentStudent?.status || t('profile.stats.student.defaultStatusActive')
                })}
                {(currentStudent?.endDate || currentUser?.endDate) &&
                  ` · ${t('profile.stats.student.leaveDatePrefix', {
                    date: currentStudent?.endDate || currentUser?.endDate || ''
                  })}`}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Dos cuadros principales: colapsables en móvil y siempre visibles lado a lado en escritorio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-6">
      {/* Formulario Unificado: Datos Personales, Foto/Avatar y Ajustes del Rol */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs"
      >
        <button
          type="button"
          onClick={() => setIsPersonalOpenMobile(v => !v)}
          aria-expanded={isPersonalOpenMobile}
          className={`w-full text-left flex items-center justify-between gap-3 lg:cursor-default ${
            isPersonalOpenMobile ? 'border-b border-slate-100 dark:border-slate-800 pb-3' : ''
          } lg:border-b lg:border-slate-100 lg:dark:border-slate-800 lg:pb-3`}
        >
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('profile.personal.sectionTitle')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('profile.personal.sectionSubtitle')}
            </p>
          </div>
          <span className="lg:hidden rounded-lg p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 shrink-0">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isPersonalOpenMobile ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        <div className={`${isPersonalOpenMobile ? 'block' : 'hidden'} lg:block pt-5 space-y-5`}>
        {saveMessage && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* Foto Actual, Subida (Galería / Cámara) y Avatares Predefinidos */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={fullName}
                  className="h-full w-full rounded-2xl object-cover border-2 border-emerald-500/60 shadow-sm bg-white dark:bg-slate-900"
                />
              ) : (
                <div className="h-full w-full rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-2xl shadow-sm">
                  {displayInitial}
                </div>
              )}
              {isAvatarBusy && (
                <div className="absolute inset-0 rounded-2xl bg-slate-900/65 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}
            </div>

            <div className="space-y-2 min-w-0 flex-1">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {t('profile.personal.avatarTitle')}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isTeacherRole
                    ? t('profile.personal.avatarTeacherHint')
                    : t('profile.personal.avatarUserHint')}
                </p>
              </div>

              {/* Inputs ocultos para galería y cámara frontal (capture="user") */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleAvatarFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={isAvatarBusy}
                  onClick={() => galleryInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition min-h-[38px] disabled:opacity-60"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{t('profile.personal.chooseFromGallery')}</span>
                </button>

                <button
                  type="button"
                  disabled={isAvatarBusy}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition min-h-[38px] disabled:opacity-60"
                >
                  <Camera className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{t('profile.personal.takeCameraPhoto')}</span>
                </button>

                {displayAvatar && (
                  <button
                    type="button"
                    disabled={isAvatarBusy}
                    onClick={handleClearAvatar}
                    title={t('profile.personal.removeAvatar')}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-2.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition min-h-[38px] disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('profile.personal.removeAvatar')}</span>
                  </button>
                )}
              </div>

              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                {isAvatarBusy
                  ? t('profile.personal.avatarOptimizing')
                  : t('profile.personal.avatarOptimizationHint')}
              </p>
            </div>
          </div>

          {avatarFeedback && (
            <div
              className={`rounded-xl border px-3 py-2 text-xs font-semibold flex items-center gap-2 ${
                avatarFeedback.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {avatarFeedback.type === 'ok' ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{avatarFeedback.text}</span>
            </div>
          )}

          {/* Avatares predefinidos (activos estáticos locales, sin subida a Storage) */}
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
            <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-2">
              {t('profile.personal.presetsLabel')}
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_AVATARS.map((preset, i) => {
                const isSelected = avatarUrl === preset.path;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isAvatarBusy}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectPresetAvatar(preset.path)}
                    title={t('profile.personal.presetAvatarAlt', { index: i + 1 })}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-500/30 scale-105 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 opacity-85 hover:opacity-100 hover:border-emerald-400'
                    }`}
                  >
                    <img
                      src={preset.path}
                      alt={t('profile.personal.presetAvatarAlt', { index: i + 1 })}
                      className="h-full w-full object-cover"
                    />
                    {isSelected && (
                      <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>{t('profile.personal.fullNameLabel')}</span>
              </span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <span>{t('profile.personal.phoneLabel')}</span>
              </span>
            </label>
            <input
              type="tel"
              placeholder={t('profile.personal.phonePlaceholder')}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>{t('profile.personal.emailLabel')}</span>
            </span>
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
          />
        </div>

        {/* Configuración específica para Monitor: Tipo de cobro por defecto */}
        {isTeacherRole && currentTeacher && (
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 space-y-2">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 block">
              {t('profile.personal.teacherCollectionTitle')}
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('profile.personal.teacherCollectionDesc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                  collectionType === 'personal'
                    ? 'border-indigo-600 bg-white dark:bg-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="profileCollectionType"
                  checked={collectionType === 'personal'}
                  onChange={() => setCollectionType('personal')}
                  className="text-indigo-600"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {t('profile.personal.collectionPersonal')}
                </span>
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                  collectionType === 'association'
                    ? 'border-indigo-600 bg-white dark:bg-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="profileCollectionType"
                  checked={collectionType === 'association'}
                  onChange={() => setCollectionType('association')}
                  className="text-indigo-600"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {t('profile.personal.collectionAssociation')}
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition min-h-[44px]"
          >
            <Check className="h-4 w-4" />
            <span>{t('profile.personal.saveButton')}</span>
          </button>
        </div>
        </div>
      </form>

      {/* Solicitud de baja de la asociación (dentro de la columna de Datos Personales) */}
      {currentUser && !isMasterAdminUser && (
        <div
          className={`rounded-2xl border p-5 shadow-xs space-y-3 ${
            pendingWithdrawalRequest
              ? 'border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                  pendingWithdrawalRequest
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                {pendingWithdrawalRequest ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <UserX className="h-4 w-4" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('profile.withdrawal.sectionTitle')}
                  </h3>
                  {pendingWithdrawalRequest && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
                      {t('profile.withdrawal.pendingBadge')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {pendingWithdrawalRequest
                    ? t('profile.withdrawal.pendingDescription', {
                        date: pendingWithdrawalRequest.createdAt.split('T')[0]
                      })
                    : t('profile.withdrawal.sectionSubtitle')}
                </p>
              </div>
            </div>

            {pendingWithdrawalRequest ? (
              <button
                type="button"
                disabled={isWithdrawalBusy}
                onClick={handleCancelWithdrawalRequest}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400 dark:border-amber-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/40 transition whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {isWithdrawalBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{t('profile.withdrawal.cancelRequestButton')}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isWithdrawalBusy}
                onClick={() => {
                  setWithdrawalReason('');
                  setWithdrawalFeedback(null);
                  setIsWithdrawalModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <UserX className="h-3.5 w-3.5" />
                <span>{t('profile.withdrawal.requestButton')}</span>
              </button>
            )}
          </div>

          {pendingWithdrawalRequest?.reason && (
            <div className="rounded-xl border border-amber-500/25 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t('profile.withdrawal.yourReasonLabel')}
              </span>
              <p className="italic mt-0.5">"{pendingWithdrawalRequest.reason}"</p>
            </div>
          )}

          {!pendingWithdrawalRequest && latestWithdrawalRequest?.status === 'rejected' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">
                {t('profile.withdrawal.previousRejectedNotice', {
                  date: (latestWithdrawalRequest.resolvedAt || latestWithdrawalRequest.createdAt).split('T')[0]
                })}
              </span>
              {latestWithdrawalRequest.resolutionNotes && (
                <p className="mt-0.5 italic text-slate-500 dark:text-slate-400">
                  {latestWithdrawalRequest.resolutionNotes}
                </p>
              )}
            </div>
          )}

          {withdrawalFeedback && (
            <div
              className={`rounded-xl border p-2.5 text-xs font-semibold flex items-center gap-2 ${
                withdrawalFeedback.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {withdrawalFeedback.type === 'ok' ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{withdrawalFeedback.text}</span>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Preferencias Personales & Seguridad */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
        <button
          type="button"
          onClick={() => setIsSecurityOpenMobile(v => !v)}
          aria-expanded={isSecurityOpenMobile}
          className={`w-full text-left flex items-center justify-between gap-3 lg:cursor-default ${
            isSecurityOpenMobile ? 'border-b border-slate-100 dark:border-slate-800 pb-3' : ''
          } lg:border-b lg:border-slate-100 lg:dark:border-slate-800 lg:pb-3`}
        >
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('profile.preferences.sectionTitle')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('profile.preferences.sectionSubtitle')}
            </p>
          </div>
          <span className="lg:hidden rounded-lg p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 shrink-0">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isSecurityOpenMobile ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        <div className={`${isSecurityOpenMobile ? 'block' : 'hidden'} lg:block pt-4 space-y-4`}>

        {/* Idioma de la aplicación (Castellano / Galego) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Languages className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {t('profile.language.title')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('profile.language.subtitle')}
                </div>
              </div>
            </div>

            <div
              role="group"
              aria-label={t('profile.language.title')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1 shrink-0 self-start sm:self-auto"
            >
              {LANGUAGE_OPTIONS.map(opt => {
                const isSelected = language === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    disabled={isLanguageBusy}
                    aria-pressed={isSelected}
                    onClick={() => handleLanguageChange(opt.code)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition whitespace-nowrap min-h-[32px] disabled:opacity-70 ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {languageMessage && (
            <div
              className={`rounded-xl border p-2.5 text-xs font-semibold flex items-center gap-2 ${
                languageMessage.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                  : languageMessage.type === 'warn'
                  ? 'border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {languageMessage.type === 'ok' ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{languageMessage.text}</span>
            </div>
          )}
        </div>

        {/* Apariencia: Modo Claro / Oscuro */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-amber-400">
              {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t('profile.theme.title')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {isDarkMode ? t('profile.theme.darkActive') : t('profile.theme.lightActive')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            {isDarkMode ? t('profile.theme.switchToLight') : t('profile.theme.switchToDark')}
          </button>
        </div>

        {/* Desbloqueo Biométrico */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Fingerprint className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t('profile.biometrics.title')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {!isBiometricsSupported
                  ? t('profile.biometrics.unsupported')
                  : hasBiometricsEnabled
                  ? t('profile.biometrics.enabledDesc')
                  : t('profile.biometrics.disabledDesc')}
              </div>
            </div>
          </div>

          {isBiometricsSupported && (
            <button
              type="button"
              disabled={isBiometricBusy}
              onClick={handleToggleBiometrics}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                hasBiometricsEnabled
                  ? 'border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isBiometricBusy
                ? t('profile.biometrics.busy')
                : hasBiometricsEnabled
                ? t('profile.biometrics.disable')
                : t('profile.biometrics.enable')}
            </button>
          )}
        </div>

        {biometricMessage && (
          <div
            className={`rounded-xl border p-3 text-xs font-semibold flex items-center gap-2 ${
              biometricMessage.type === 'ok'
                ? 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            {biometricMessage.type === 'ok' ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{biometricMessage.text}</span>
          </div>
        )}

        {/* Seguridad de la Cuenta: Cambiar Contraseña */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {t('profile.password.title')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('profile.password.subtitle')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(v => !v);
                setPasswordMessage(null);
              }}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition whitespace-nowrap"
            >
              {showPasswordForm ? t('profile.password.cancel') : t('profile.password.change')}
            </button>
          </div>

          {showPasswordForm && (
            <form onSubmit={handleChangePassword} className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="relative">
                <input
                  type={showPassChars ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder={t('profile.password.newPlaceholder')}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassChars(v => !v)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  {showPassChars ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <input
                type={showPassChars ? 'text' : 'password'}
                required
                minLength={6}
                placeholder={t('profile.password.confirmPlaceholder')}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {t('profile.password.openTriskellAccess')}
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {isUpdatingPassword ? t('profile.password.saving') : t('profile.password.updateButton')}
                </button>
              </div>
            </form>
          )}

          {passwordMessage && (
            <div
              className={`rounded-xl border p-2.5 text-xs font-semibold flex items-center gap-2 ${
                passwordMessage.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {passwordMessage.type === 'ok' ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{passwordMessage.text}</span>
            </div>
          )}
        </div>

        {/* Enlaces legales rápidos */}
        {onNavigate && (
          <div className="pt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => onNavigate('/privacidad')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4"
            >
              {t('profile.legal.privacyPolicy')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/condiciones')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4"
            >
              {t('profile.legal.termsOfService')}
            </button>
          </div>
        )}
        </div>
      </div>
      </div>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          language={language}
          isProcessing={isAvatarBusy}
          errorMessage={cropModalError}
          onCancel={() => {
            if (!isAvatarBusy) {
              setCropFile(null);
              setCropModalError(null);
            }
          }}
          onConfirm={handleConfirmCroppedAvatar}
        />
      )}

      {/* Modal de Confirmación: Solicitar baja de la asociación */}
      {isWithdrawalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <UserX className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('profile.withdrawal.modalTitle')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('profile.withdrawal.modalSubtitle')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isWithdrawalBusy}
                onClick={() => setIsWithdrawalModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('profile.withdrawal.modalInfo')}
            </div>

            {studentAllUnsettledPayments.length > 0 && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold">
                  {t('profile.withdrawal.unsettledPaymentsNotice', {
                    count: studentAllUnsettledPayments.length,
                    amount: studentAllUnsettledPayments
                      .reduce((sum, p) => sum + p.amount, 0)
                      .toFixed(2)
                  })}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('profile.withdrawal.reasonLabel')}
              </label>
              <textarea
                rows={3}
                value={withdrawalReason}
                onChange={e => setWithdrawalReason(e.target.value)}
                placeholder={t('profile.withdrawal.reasonPlaceholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-rose-500"
              />
            </div>

            {withdrawalFeedback?.type === 'err' && (
              <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{withdrawalFeedback.text}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isWithdrawalBusy}
                onClick={() => setIsWithdrawalModalOpen(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('profile.withdrawal.modalCancel')}
              </button>
              <button
                type="button"
                disabled={isWithdrawalBusy}
                onClick={handleSubmitWithdrawalRequest}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-50"
              >
                {isWithdrawalBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isWithdrawalBusy
                    ? t('profile.withdrawal.submitting')
                    : t('profile.withdrawal.modalConfirm')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
