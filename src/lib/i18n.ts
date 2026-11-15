import { AppLanguage, UserRole } from '../types';

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: 'es' | 'gl';
  label: string;
  nativeName: string;
}> = [
  { code: 'es', label: 'Castellano', nativeName: 'Castellano' },
  { code: 'gl', label: 'Galego', nativeName: 'Galego' },
  { code: 'en', label: 'Inglés', nativeName: 'Inglés' }
];

export const normalizeAppLanguage = (raw?: string | null): AppLanguage => {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'gl' || val.startsWith('gl-')) return 'gl';
  if (val === 'en' || val.startsWith('en-')) return 'en';
  return 'es';
};

export interface ProfileTranslations {
  userProfileTag: string;
  activeSessionFallback: string;
  logout: string;
  activePerspective: string;
  roleLabels: Record<UserRole, string>;
  perspectiveLabels: {
    admin: string;
    teacher: string;
    student: string;
    teacher_student: string;
  };
  personalSectionTitle: string;
  personalSectionSubtitle: string;
  avatarTitle: string;
  avatarTeacherHint: string;
  avatarUserHint: string;
  presetsLabel: string;
  avatarUrlLabel: string;
  fullNameLabel: string;
  phoneLabel: string;
  emailLabel: string;
  teacherCollectionTitle: string;
  teacherCollectionDesc: string;
  collectionPersonal: string;
  collectionAssociation: string;
  saveProfileButton: string;
  profileSavedSuccess: string;
  prefsSectionTitle: string;
  prefsSectionSubtitle: string;
  languageTitle: string;
  languageSubtitle: string;
  languageSavedOk: (lang: AppLanguage) => string;
  languageLocalOnlyWarn: string;
  themeTitle: string;
  themeDarkActive: string;
  themeLightActive: string;
  switchToLight: string;
  switchToDark: string;
  biometricsTitle: string;
  biometricsUnsupported: string;
  biometricsEnabledDesc: string;
  biometricsDisabledDesc: string;
  biometricsBusy: string;
  biometricsDisable: string;
  biometricsEnable: string;
  passwordTitle: string;
  passwordSubtitle: string;
  cancel: string;
  change: string;
  newPasswordPlaceholder: string;
  confirmPasswordPlaceholder: string;
  openTriskellAccess: string;
  saving: string;
  updatePassword: string;
  privacyPolicy: string;
  termsOfService: string;
  memberSinceLabel: string;
  memberNumberPrefix: string;
  statusPrefix: string;
  leaveDatePrefix: string;
  enrolledWorkshopsLabel: string;
  noAssignedWorkshops: string;
  feesStatusLabel: string;
  upToDate: string;
  assignedWorkshopsLabel: string;
  studentsEnrolledSuffix: string;
  feeSchemeLabel: string;
  assignedSettlementMode: string;
  collectionModeLabel: string;
  personalDirect: string;
  association: string;
  viewMyPayouts: string;
  preferenceInClasses: string;
  activeTeachersLabel: string;
  registeredTeachingTeam: string;
  registeredStudentsLabel: string;
  activeAndTrialMembers: string;
  classesWorkshopsLabel: string;
  currentTrainingOffer: string;
}

const PROFILE_ES: ProfileTranslations = {
  userProfileTag: 'Perfil de Usuario',
  activeSessionFallback: 'Sesión activa en A.C. Triskell',
  logout: 'Cerrar sesión',
  activePerspective: 'Perspectiva activa de la aplicación',
  roleLabels: {
    admin: 'Administrador',
    teacher: 'Monitor / Profesor',
    student: 'Alumno / Socio',
    socio: 'Socio (Portal)',
    teacher_student: 'Monitor-Alumno'
  },
  perspectiveLabels: {
    admin: 'Administrador',
    teacher: 'Monitor',
    student: 'Alumno',
    teacher_student: 'Monitor-Alumno'
  },
  personalSectionTitle: 'Datos Personales y Foto de Perfil',
  personalSectionSubtitle: 'Actualiza tu imagen, datos de contacto y configuración de perfil',
  avatarTitle: 'Avatar / Imagen de Perfil',
  avatarTeacherHint: 'Visible para alumnos en sus talleres y en la cabecera de la aplicación.',
  avatarUserHint: 'Se mostrará en tu barra de navegación y cabecera personal.',
  presetsLabel: 'Predefinidos:',
  avatarUrlLabel: 'Enlace a tu foto (URL de imagen)',
  fullNameLabel: 'Nombre Completo *',
  phoneLabel: 'Teléfono / WhatsApp',
  emailLabel: 'Correo Electrónico',
  teacherCollectionTitle: 'Tipo de Cobro por Defecto de tus Clases',
  teacherCollectionDesc:
    'Define si cobras directamente al alumno en clase o si la asociación gestiona el cobro primero.',
  collectionPersonal: 'Personal (Cobro directo alumno ➜ monitor)',
  collectionAssociation: 'Asociación (El centro recauda primero)',
  saveProfileButton: 'Guardar Cambios de Perfil',
  profileSavedSuccess: 'Perfil y preferencias guardados correctamente.',
  prefsSectionTitle: 'Preferencias Personales y Seguridad',
  prefsSectionSubtitle: 'Idioma, apariencia de la interfaz y acceso rápido en este dispositivo',
  languageTitle: 'Idioma de la aplicación',
  languageSubtitle: 'Elige entre Castellano o Galego para tu cuenta',
  languageSavedOk: lang =>
    lang === 'gl'
      ? 'Idioma cambiado a Galego e gardado no teu perfil.'
      : 'Idioma cambiado a Castellano y guardado en tu perfil.',
  languageLocalOnlyWarn:
    'Preferencia aplicada en este dispositivo. Ejecuta el SQL de la columna "language" en Supabase para sincronizarla en la nube.',
  themeTitle: 'Tema de la aplicación',
  themeDarkActive: 'Modo oscuro activado',
  themeLightActive: 'Modo claro activado',
  switchToLight: 'Cambiar a Claro',
  switchToDark: 'Cambiar a Oscuro',
  biometricsTitle: 'Acceso Biométrico (Face ID / Huella / Passkey)',
  biometricsUnsupported: 'No compatible en este navegador o entorno',
  biometricsEnabledDesc: 'Activado en este dispositivo para acceso rápido',
  biometricsDisabledDesc: 'Desactivado · Actívalo para desbloquear sin contraseña',
  biometricsBusy: 'Procesando...',
  biometricsDisable: 'Desactivar',
  biometricsEnable: 'Activar',
  passwordTitle: 'Contraseña de Acceso',
  passwordSubtitle: 'Actualiza tu clave personal de acceso',
  cancel: 'Cancelar',
  change: 'Cambiar',
  newPasswordPlaceholder: 'Nueva contraseña (mín. 6 caracteres)',
  confirmPasswordPlaceholder: 'Confirmar nueva contraseña',
  openTriskellAccess: 'Abrir Acceso TRISKELL',
  saving: 'Guardando...',
  updatePassword: 'Actualizar contraseña',
  privacyPolicy: 'Política de Privacidad',
  termsOfService: 'Condiciones del Servicio',
  memberSinceLabel: 'Socio Desde',
  memberNumberPrefix: 'Nº Socio:',
  statusPrefix: 'Estado:',
  leaveDatePrefix: 'Baja:',
  enrolledWorkshopsLabel: 'Talleres Matriculados',
  noAssignedWorkshops: 'Sin talleres asignados',
  feesStatusLabel: 'Estado de Cuotas',
  upToDate: 'Al día',
  assignedWorkshopsLabel: 'Tus Talleres Asignados',
  studentsEnrolledSuffix: 'alumnos inscritos',
  feeSchemeLabel: 'Esquema de Honorarios',
  assignedSettlementMode: 'Modalidad de liquidación asignada',
  collectionModeLabel: 'Modo de Cobro',
  personalDirect: 'Personal (Directo)',
  association: 'Asociación',
  viewMyPayouts: 'Ver mis liquidaciones →',
  preferenceInClasses: 'Preferencia en tus clases',
  activeTeachersLabel: 'Monitores Activos',
  registeredTeachingTeam: 'Equipo docente registrado',
  registeredStudentsLabel: 'Alumnos Censados',
  activeAndTrialMembers: 'Socios activos y en prueba',
  classesWorkshopsLabel: 'Clases / Talleres',
  currentTrainingOffer: 'Oferta formativa vigente'
};

const PROFILE_GL: ProfileTranslations = {
  userProfileTag: 'Perfil do Usuario',
  activeSessionFallback: 'Sesión activa en A.C. Triskell',
  logout: 'Pechar sesión',
  activePerspective: 'Perspectiva activa da aplicación',
  roleLabels: {
    admin: 'Administrador',
    teacher: 'Monitor / Profesor',
    student: 'Alumno / Socio',
    socio: 'Socio (Portal)',
    teacher_student: 'Monitor-Alumno'
  },
  perspectiveLabels: {
    admin: 'Administrador',
    teacher: 'Monitor',
    student: 'Alumno',
    teacher_student: 'Monitor-Alumno'
  },
  personalSectionTitle: 'Datos Persoais e Foto de Perfil',
  personalSectionSubtitle: 'Actualiza a túa imaxe, datos de contacto e configuración do perfil',
  avatarTitle: 'Avatar / Imaxe de Perfil',
  avatarTeacherHint: 'Visible para o alumnado nos seus obradoiros e na cabeceira da aplicación.',
  avatarUserHint: 'Amosarase na túa barra de navegación e cabeceira persoal.',
  presetsLabel: 'Predefinidos:',
  avatarUrlLabel: 'Ligazón á túa foto (URL da imaxe)',
  fullNameLabel: 'Nome Completo *',
  phoneLabel: 'Teléfono / WhatsApp',
  emailLabel: 'Correo Electrónico',
  teacherCollectionTitle: 'Tipo de Cobro por Defecto das túas Clases',
  teacherCollectionDesc:
    'Define se cobras directamente ao alumno na clase ou se a asociación xestiona o cobro primeiro.',
  collectionPersonal: 'Persoal (Cobro directo alumno ➜ monitor)',
  collectionAssociation: 'Asociación (O centro recada primeiro)',
  saveProfileButton: 'Gardar Cambios do Perfil',
  profileSavedSuccess: 'Perfil e preferencias gardados correctamente.',
  prefsSectionTitle: 'Preferencias Persoais e Seguridade',
  prefsSectionSubtitle: 'Idioma, aparencia da interface e acceso rápido neste dispositivo',
  languageTitle: 'Idioma da aplicación',
  languageSubtitle: 'Escolle entre Castellano ou Galego para a túa conta',
  languageSavedOk: lang =>
    lang === 'gl'
      ? 'Idioma cambiado a Galego e gardado no teu perfil.'
      : 'Idioma cambiado a Castellano y guardado en tu perfil.',
  languageLocalOnlyWarn:
    'Preferencia aplicada neste dispositivo. Executa o SQL da columna "language" en Supabase para sincronizala na nube.',
  themeTitle: 'Tema da aplicación',
  themeDarkActive: 'Modo escuro activado',
  themeLightActive: 'Modo claro activado',
  switchToLight: 'Cambiar a Claro',
  switchToDark: 'Cambiar a Escuro',
  biometricsTitle: 'Acceso Biométrico (Face ID / Pegada / Passkey)',
  biometricsUnsupported: 'Non compatible neste navegador ou contorna',
  biometricsEnabledDesc: 'Activado neste dispositivo para acceso rápido',
  biometricsDisabledDesc: 'Desactivado · Actívao para desbloquear sen contrasinal',
  biometricsBusy: 'Procesando...',
  biometricsDisable: 'Desactivar',
  biometricsEnable: 'Activar',
  passwordTitle: 'Contrasinal de Acceso',
  passwordSubtitle: 'Actualiza a túa clave persoal de acceso',
  cancel: 'Cancelar',
  change: 'Cambiar',
  newPasswordPlaceholder: 'Novo contrasinal (mín. 6 caracteres)',
  confirmPasswordPlaceholder: 'Confirmar novo contrasinal',
  openTriskellAccess: 'Abrir Acceso TRISKELL',
  saving: 'Gardando...',
  updatePassword: 'Actualizar contrasinal',
  privacyPolicy: 'Política de Privacidade',
  termsOfService: 'Condicións do Servizo',
  memberSinceLabel: 'Socio Dende',
  memberNumberPrefix: 'Nº Socio:',
  statusPrefix: 'Estado:',
  leaveDatePrefix: 'Baixa:',
  enrolledWorkshopsLabel: 'Obradoiros Matriculados',
  noAssignedWorkshops: 'Sen obradoiros asignados',
  feesStatusLabel: 'Estado das Cotas',
  upToDate: 'Ao día',
  assignedWorkshopsLabel: 'Os teus Obradoiros Asignados',
  studentsEnrolledSuffix: 'alumnos inscritos',
  feeSchemeLabel: 'Esquema de Honorarios',
  assignedSettlementMode: 'Modalidade de liquidación asignada',
  collectionModeLabel: 'Modo de Cobro',
  personalDirect: 'Persoal (Directo)',
  association: 'Asociación',
  viewMyPayouts: 'Ver as miñas liquidacións →',
  preferenceInClasses: 'Preferencia nas túas clases',
  activeTeachersLabel: 'Monitores Activos',
  registeredTeachingTeam: 'Equipo docente rexistrado',
  registeredStudentsLabel: 'Alumnos Censados',
  activeAndTrialMembers: 'Socios activos e en proba',
  classesWorkshopsLabel: 'Clases / Obradoiros',
  currentTrainingOffer: 'Oferta formativa vixente'
};

export const getProfileTexts = (lang?: AppLanguage): ProfileTranslations => {
  return lang === 'gl' ? PROFILE_GL : PROFILE_ES;
};

export interface NavTranslations {
  adminPortal: string;
  adminPortalShort: string;
  usersAndMembers: string;
  usersShort: string;
  calendar: string;
  calendarShort: string;
  payments: string;
  paymentsShort: string;
  teachers: string;
  activities: string;
  activitiesShort: string;
  expenses: string;
  config: string;
  teacherPortal: string;
  studentPortal: string;
  socioPortal: string;
  portal: string;
  students: string;
  myPayouts: string;
  payoutsShort: string;
  profile: string;
  newButton: string;
  darkMode: string;
  lightMode: string;
}

const NAV_ES: NavTranslations = {
  adminPortal: 'Portal del Administrador',
  adminPortalShort: 'Portal Admin',
  usersAndMembers: 'Usuarios y Socios',
  usersShort: 'Usuarios',
  calendar: 'Calendario',
  calendarShort: 'Agenda',
  payments: 'Cuotas y Cobros',
  paymentsShort: 'Cuotas',
  teachers: 'Monitores',
  activities: 'Clases/Taller',
  activitiesShort: 'Talleres',
  expenses: 'Gastos',
  config: 'Configuración',
  teacherPortal: 'Portal Monitor',
  studentPortal: 'Portal Alumno',
  socioPortal: 'Portal Socio',
  portal: 'Portal',
  students: 'Alumnos',
  myPayouts: 'Mis liquidaciones',
  payoutsShort: 'Liquidac.',
  profile: 'Perfil',
  newButton: 'Nuevo',
  darkMode: 'Modo Oscuro',
  lightMode: 'Modo Claro'
};

const NAV_GL: NavTranslations = {
  adminPortal: 'Portal do Administrador',
  adminPortalShort: 'Portal Admin',
  usersAndMembers: 'Usuarios e Socios',
  usersShort: 'Usuarios',
  calendar: 'Calendario',
  calendarShort: 'Axenda',
  payments: 'Cotas e Cobros',
  paymentsShort: 'Cotas',
  teachers: 'Monitores',
  activities: 'Clases/Obradoiro',
  activitiesShort: 'Obradoiros',
  expenses: 'Gastos',
  config: 'Configuración',
  teacherPortal: 'Portal Monitor',
  studentPortal: 'Portal Alumno',
  socioPortal: 'Portal Socio',
  portal: 'Portal',
  students: 'Alumnado',
  myPayouts: 'As miñas liquidacións',
  payoutsShort: 'Liquidac.',
  profile: 'Perfil',
  newButton: 'Novo',
  darkMode: 'Modo Escuro',
  lightMode: 'Modo Claro'
};

export const getNavTexts = (lang?: AppLanguage): NavTranslations => {
  return lang === 'gl' ? NAV_GL : NAV_ES;
};
