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

export function isValidUserRole(rawRole?: string | null): boolean {
  if (!rawRole) return false;
  const normalized = String(rawRole).trim().toLowerCase();
  return [
    'admin',
    'administrador',
    'monitor',
    'teacher',
    'profesor',
    'alumno',
    'student',
    'híbrido',
    'hibrido',
    'teacher_student',
    'socio'
  ].includes(normalized);
}

export function normalizeUserRole(
  rawRole?: string | null,
  fallback: UserRole = UserRole.Socio
): UserRole {
  if (!rawRole) return fallback;
  const trimmed = String(rawRole).trim();
  if (
    trimmed === UserRole.Admin ||
    trimmed === UserRole.Monitor ||
    trimmed === UserRole.Alumno ||
    trimmed === UserRole.Hibrido ||
    trimmed === UserRole.Socio
  ) {
    return trimmed as UserRole;
  }

  switch (trimmed.toLowerCase()) {
    case 'admin':
    case 'administrador':
      return UserRole.Admin;
    case 'monitor':
    case 'teacher':
    case 'profesor':
      return UserRole.Monitor;
    case 'alumno':
    case 'student':
      return UserRole.Alumno;
    case 'híbrido':
    case 'hibrido':
    case 'teacher_student':
      return UserRole.Hibrido;
    case 'socio':
      return UserRole.Socio;
    default:
      return fallback;
  }
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

export function deriveAccessFromRow(row: any, emailOverride?: string | null): boolean {
  const normalizedEmail = (emailOverride || row?.email || '').trim().toLowerCase();
  if (normalizedEmail === MASTER_ADMIN_EMAIL) return true;

  if (typeof row?.access === 'boolean') return row.access;
  if (typeof row?.active === 'boolean') return row.active;

  if (row?.role === null || row?.role === '') return false;

  const todayStr = new Date().toISOString().split('T')[0];
  if (
    typeof row?.end_date === 'string' &&
    row.end_date.length > 0 &&
    row.end_date <= todayStr &&
    (!row?.start_date || row.end_date >= row.start_date)
  ) {
    return false;
  }

  return true;
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
