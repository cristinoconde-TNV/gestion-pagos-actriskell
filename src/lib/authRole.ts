import { OperationalRole, UserRole } from '../types';

export const MASTER_ADMIN_EMAIL = 'cristino.conde@actriskell.org';

export const USER_ROLE_VALUES: UserRole[] = [
  UserRole.Admin,
  UserRole.Monitor,
  UserRole.Alumno,
  UserRole.Hibrido,
  UserRole.Socio
];

export type RoleI18nKey = 'admin' | 'teacher' | 'student' | 'teacher_student' | 'socio';

export const ROLE_I18N_KEY_MAP: Record<UserRole, RoleI18nKey> = {
  [UserRole.Admin]: 'admin',
  [UserRole.Monitor]: 'teacher',
  [UserRole.Alumno]: 'student',
  [UserRole.Hibrido]: 'teacher_student',
  [UserRole.Socio]: 'socio'
};

const CANONICAL_USER_ROLES = new Set<string>([
  UserRole.Admin,
  UserRole.Monitor,
  UserRole.Alumno,
  UserRole.Hibrido,
  UserRole.Socio
]);

function stripRoleDiacritics(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapRawRoleToCanonical(rawRole?: string | null): UserRole | null {
  if (!rawRole) return null;
  const trimmed = String(rawRole).trim();
  if (CANONICAL_USER_ROLES.has(trimmed)) {
    return trimmed as UserRole;
  }

  const normalized = stripRoleDiacritics(trimmed);
  switch (normalized) {
    case 'admin':
    case 'administrador':
    case 'administrator':
      return UserRole.Admin;
    case 'monitor':
    case 'teacher':
    case 'profesor':
    case 'profesora':
    case 'monitora':
    case 'instructor':
    case 'monitor / profesor':
      return UserRole.Monitor;
    case 'alumno':
    case 'alumna':
    case 'student':
    case 'alumno / socio':
      return UserRole.Alumno;
    case 'hybrid':
    case 'hibrido':
    case 'hibrida':
    case 'teacher_student':
    case 'monitor-alumno':
    case 'instructor-student':
    case 'profesor-alumno':
      return UserRole.Hibrido;
    case 'member':
    case 'socio':
    case 'socia':
    case 'socio (portal)':
      return UserRole.Socio;
    default:
      return null;
  }
}

export function isValidUserRole(rawRole?: string | null): boolean {
  return mapRawRoleToCanonical(rawRole) !== null;
}

export function normalizeUserRole(
  rawRole?: string | null,
  fallback: UserRole = UserRole.Socio
): UserRole {
  const mapped = mapRawRoleToCanonical(rawRole);
  if (mapped) return mapped;
  return mapRawRoleToCanonical(fallback) ?? UserRole.Socio;
}

export function toCanonicalProfileRole(
  rawRole?: string | null,
  fallback: UserRole = UserRole.Socio
): UserRole {
  return normalizeUserRole(rawRole, fallback);
}

export function deriveOperationalRoleFromAssignments(
  hasActiveStudentAssignment: boolean,
  hasActiveTeacherAssignment: boolean
): OperationalRole {
  if (hasActiveTeacherAssignment && hasActiveStudentAssignment) return 'hibrido';
  if (hasActiveStudentAssignment) return 'alumno';
  if (hasActiveTeacherAssignment) return 'profesor';
  return 'vacio';
}

export function isExpiredProfileEndDate(row: any): boolean {
  const todayStr = new Date().toISOString().split('T')[0];
  return Boolean(
    typeof row?.end_date === 'string' &&
      row.end_date.length > 0 &&
      row.end_date <= todayStr &&
      (!row?.start_date || row.end_date >= row.start_date)
  );
}

export type ProfileAccessStatus = 'pending' | 'approved' | 'rejected';

export function normalizeProfileAccessStatus(raw: unknown): ProfileAccessStatus | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'pending' || trimmed === 'approved' || trimmed === 'rejected') {
    return trimmed;
  }
  return null;
}

export function resolveProfileAccessStatus(row: any): ProfileAccessStatus | null {
  if (!row) return null;
  return (
    normalizeProfileAccessStatus(row.accessStatus ?? row.access_status) ??
    normalizeProfileAccessStatus(row.approvalStatus ?? row.approval_status)
  );
}

export function deriveAccessFromRow(row: any, emailOverride?: string | null): boolean {
  const normalizedEmail = (emailOverride || row?.email || '').trim().toLowerCase();
  if (normalizedEmail === MASTER_ADMIN_EMAIL) return true;

  const status = resolveProfileAccessStatus(row);
  if (status === 'rejected') return false;

  if (typeof row?.access === 'boolean') return row.access;
  if (typeof row?.active === 'boolean') return row.active;

  if (status === 'pending') return false;

  if (row?.role === null || row?.role === '') return false;

  if (isExpiredProfileEndDate(row)) {
    return false;
  }

  return true;
}

export const DEFAULT_BASE_USER_ROLE: UserRole = UserRole.Socio;

export function isProfileExplicitlyAuthorized(
  row: any,
  emailOverride?: string | null
): boolean {
  const normalizedEmail = (emailOverride || row?.email || '').trim().toLowerCase();
  if (normalizedEmail === MASTER_ADMIN_EMAIL) return true;
  if (!row || !isValidUserRole(row.role)) return false;
  if (isExpiredProfileEndDate(row)) return false;

  const status = resolveProfileAccessStatus(row);
  if (status === 'rejected' || status === 'pending') return false;

  if (typeof row.access === 'boolean') return row.access === true;
  if (typeof row.active === 'boolean') return row.active === true;

  return false;
}

export function isRejectedProfile(row: any, emailOverride?: string | null): boolean {
  const normalizedEmail = (emailOverride || row?.email || '').trim().toLowerCase();
  if (normalizedEmail === MASTER_ADMIN_EMAIL) return false;
  if (!row) return false;
  return resolveProfileAccessStatus(row) === 'rejected';
}

export function isPendingApprovalProfile(row: {
  email?: string | null;
  access?: boolean | null;
  active?: boolean | null;
  role?: string | null;
  hasExplicitRole?: boolean;
  accessStatus?: ProfileAccessStatus | null;
  access_status?: ProfileAccessStatus | null;
  approvalStatus?: ProfileAccessStatus | null;
  approval_status?: ProfileAccessStatus | null;
  endDate?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  start_date?: string | null;
}): boolean {
  const normalizedEmail = (row?.email || '').trim().toLowerCase();
  if (normalizedEmail === MASTER_ADMIN_EMAIL) return false;

  const status = resolveProfileAccessStatus(row);
  if (status === 'rejected') return false;

  const hasAccess = deriveAccessFromRow(row, normalizedEmail);
  const hasRole =
    row.hasExplicitRole !== undefined ? row.hasExplicitRole : isValidUserRole(row.role);

  if (status === 'pending') {
    return true;
  }

  if (status === 'approved' && hasAccess && hasRole) {
    return false;
  }

  if (!hasAccess && !(row.endDate || row.end_date)) {
    return true;
  }

  return false;
}

const PLACEHOLDER_PROFILE_NAMES = new Set([
  'aaa',
  'usuario',
  'user',
  'sin nombre',
  'no name',
  'placeholder',
  'test'
]);

export function isPlaceholderProfileName(name?: string | null): boolean {
  if (typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_PROFILE_NAMES.has(trimmed.toLowerCase());
}

export function extractGoogleProfileMetadata(
  userMeta: any,
  authenticatedEmail?: string | null
): { email: string; fullName: string; avatarUrl: string | null } {
  const email = (authenticatedEmail || '').trim().toLowerCase();
  const fullNameMeta =
    typeof userMeta?.full_name === 'string' ? userMeta.full_name.trim() : '';
  const nameMeta = typeof userMeta?.name === 'string' ? userMeta.name.trim() : '';
  const givenFamily = [userMeta?.given_name, userMeta?.family_name]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim())
    .join(' ');
  const firstLast = [userMeta?.first_name, userMeta?.last_name]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim())
    .join(' ');
  const emailLocal = email.includes('@') ? email.split('@')[0].trim() : '';

  const fullName =
    (!isPlaceholderProfileName(fullNameMeta) ? fullNameMeta : '') ||
    (!isPlaceholderProfileName(nameMeta) ? nameMeta : '') ||
    givenFamily ||
    firstLast ||
    emailLocal ||
    '';

  const avatarUrl =
    (typeof userMeta?.avatar_url === 'string' && userMeta.avatar_url.trim()) ||
    (typeof userMeta?.picture === 'string' && userMeta.picture.trim()) ||
    null;

  return { email, fullName, avatarUrl };
}

export type AuthAccessCategory =
  | 'admin'
  | 'socio'
  | 'alumno'
  | 'profesor'
  | 'hibrido'
  | 'baja';

export interface CalculateUserAuthStateInput {
  currentRole?: UserRole | string | null;
  email?: string | null;
  hasActiveStudentAssignment: boolean;
  hasActiveTeacherAssignment: boolean;
  isSocio: boolean;
  manualAccess?: boolean;
  preserveExplicitRoleOnCreation?: boolean;
}

export interface CalculatedUserAuthState {
  access: boolean;
  active: boolean;
  role: UserRole;
  isSocio: boolean;
  status: 'active' | 'inactive';
  operationalRole: OperationalRole;
  category: AuthAccessCategory;
}

/**
 * Centralized calculation function for `access`, `role`, `isSocio`, and `status`.
 * Must be used whenever a user, member, enrollment, or workshop assignment is created or edited.
 */
export function calculateUserAuthState(
  input: CalculateUserAuthStateInput
): CalculatedUserAuthState {
  const normalizedEmail = (input.email || '').trim().toLowerCase();
  const isMasterAdmin = normalizedEmail === MASTER_ADMIN_EMAIL;
  const parsedCurrentRole = isValidUserRole(input.currentRole)
    ? normalizeUserRole(input.currentRole)
    : null;
  const isSocio = Boolean(input.isSocio);

  const operationalRole = deriveOperationalRoleFromAssignments(
    Boolean(input.hasActiveStudentAssignment),
    Boolean(input.hasActiveTeacherAssignment)
  );

  // 1. Master Admin or explicit Admin role always preserves UserRole.Admin
  if (isMasterAdmin || parsedCurrentRole === UserRole.Admin) {
    const access = isMasterAdmin ? true : input.manualAccess !== false;
    return {
      access,
      active: access,
      role: UserRole.Admin,
      isSocio,
      status: access ? 'active' : 'inactive',
      operationalRole,
      category: access ? 'admin' : 'baja'
    };
  }

  // 2. Workshop-driven operational role calculation
  if (operationalRole === 'hibrido') {
    const access = input.manualAccess !== false;
    return {
      access,
      active: access,
      role: UserRole.Hibrido,
      isSocio,
      status: access ? 'active' : 'inactive',
      operationalRole,
      category: access ? 'hibrido' : 'baja'
    };
  }

  if (operationalRole === 'alumno') {
    const access = input.manualAccess !== false;
    return {
      access,
      active: access,
      role: UserRole.Alumno,
      isSocio,
      status: access ? 'active' : 'inactive',
      operationalRole,
      category: access ? 'alumno' : 'baja'
    };
  }

  if (operationalRole === 'profesor') {
    const access = input.manualAccess !== false;
    return {
      access,
      active: access,
      role: UserRole.Monitor,
      isSocio,
      status: access ? 'active' : 'inactive',
      operationalRole,
      category: access ? 'profesor' : 'baja'
    };
  }

  // 3. No active workshops (operationalRole === 'vacio')
  // During initial user creation by an Admin, preserve an explicitly selected Monitor/Alumno/Híbrido role
  if (
    input.preserveExplicitRoleOnCreation &&
    parsedCurrentRole &&
    (parsedCurrentRole === UserRole.Monitor ||
      parsedCurrentRole === UserRole.Alumno ||
      parsedCurrentRole === UserRole.Hibrido)
  ) {
    const access = input.manualAccess !== false;
    const mappedCat: AuthAccessCategory =
      parsedCurrentRole === UserRole.Hibrido
        ? 'hibrido'
        : parsedCurrentRole === UserRole.Alumno
        ? 'alumno'
        : 'profesor';
    return {
      access,
      active: access,
      role: parsedCurrentRole,
      isSocio,
      status: access ? 'active' : 'inactive',
      operationalRole: 'vacio',
      category: access ? mappedCat : 'baja'
    };
  }

  // If member is Socio (isSocio === true)
  if (isSocio) {
    const access = input.manualAccess !== false;
    return {
      access,
      active: access,
      role: UserRole.Socio,
      isSocio: true,
      status: access ? 'active' : 'inactive',
      operationalRole: 'vacio',
      category: access ? 'socio' : 'baja'
    };
  }

  // Not a socio AND no active workshops -> access = false (inactive), preserve last valid role for record
  const fallbackRole: UserRole = parsedCurrentRole ?? UserRole.Socio;

  return {
    access: false,
    active: false,
    role: fallbackRole,
    isSocio: false,
    status: 'inactive',
    operationalRole: 'vacio',
    category: 'baja'
  };
}
