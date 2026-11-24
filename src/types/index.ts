export type PaymentMethod = 'cash' | 'transfer' | 'bizum' | 'card';
export type PaymentStatus = 'paid' | 'partial' | 'pending' | 'overdue' | 'exempt' | 'cancelled';
export type TeacherPaymentScheme = 'per_class' | 'monthly_fixed' | 'revenue_share';
export type StudentStatus = 'active' | 'inactive' | 'trial' | 'pending_validation';
export type StudentValidationStatus = 'pending' | 'validated' | 'rejected';
export type ExpenseCategory = 'rent' | 'utilities' | 'materials' | 'cleaning' | 'insurance' | 'marketing' | 'other';
export enum UserRole {
  Admin = 'admin',
  Monitor = 'teacher',
  Alumno = 'student',
  Hibrido = 'hybrid',
  Socio = 'member'
}
export type OperationalRole = 'alumno' | 'profesor' | 'hibrido' | 'vacio';
export type MemberType = 'socio' | 'alumno_no_socio' | 'monitor_no_socio';
export type AppLanguage = 'es' | 'gl' | 'en';

export interface MemberStatusHistoryEntry {
  id: string;
  entityType: 'student' | 'teacher' | 'profile';
  entityId: string;
  status: 'active' | 'inactive' | 'trial' | 'pending_validation';
  memberType?: MemberType;
  startDate: string;
  endDate?: string;
  notes?: string;
  changedAt: string;
  changedBy?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  access: boolean;
  operationalRole?: OperationalRole;
  isSocio: boolean;
  language?: AppLanguage;
  teacherId?: string; // Si es monitor, vincula a su perfil de profesor
  studentId?: string; // Si es alumno, vincula a su ficha de estudiante
  memberNumber?: string;
  memberType?: MemberType;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  hasExplicitRole?: boolean;
  accessStatus?: 'pending' | 'approved' | 'rejected';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  provider?: 'google' | 'email';
  lastLogin?: string;
  createdAt?: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  avatarUrl?: string;
  paymentScheme: TeacherPaymentScheme;
  ratePerClass: number; // e.g., 25 € / clase
  fixedMonthlyRate: number; // e.g., 400 € / mes
  revenueSharePercent: number; // e.g., 60 % de cuotas de sus alumnos
  preferredPaymentMethod: PaymentMethod;
  collectionType?: 'personal' | 'association'; // Tipo de cobro: Personal (directo alumno->monitor) o Asociación
  bankAccount?: string;
  active: boolean;
  status?: 'active' | 'pending' | 'pending_validation' | 'inactive';
  isSocio?: boolean;
  memberNumber?: string;
  memberType?: MemberType;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface Activity {
  id: string;
  name: string;
  description: string;
  teacherId: string;
  category: string;
  color: string;
  schedule: string[];
  defaultPriceMonthly: number;
  defaultPricePerClass: number;
  billingMode: 'monthly' | 'per_class';
  bizum_enabled?: boolean;
  bizum_phone?: string;
  bizum_concept?: string;
  room: string;
  active: boolean;
  status?: 'active' | 'pending' | 'inactive';
  startDate?: string;
  endedAt?: string;
  createdAt?: string;
}

export type EnrollmentStatus =
  | 'pending'
  | 'pending_enrollment'
  | 'active'
  | 'approved'
  | 'pending_unenroll'
  | 'pending_withdrawal'
  | 'rejected'
  | 'inactive';

export interface StudentActivityEnrollment {
  id?: string;
  activityId: string;
  customPrice?: number;
  enrolledSince: string;
  billingMode: 'monthly' | 'per_class';
  status?: EnrollmentStatus;
  active?: boolean;
  requestedBy?: string;
  dropRequestedAt?: string;
  dropReason?: string;
  deletedAt?: string;
  endedAt?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: StudentStatus;
  validationStatus?: StudentValidationStatus;
  isSocio?: boolean;
  memberNumber?: string;
  memberType?: MemberType;
  startDate?: string;
  endDate?: string;
  profileId?: string;
  registeredBy?: string;
  validatedAt?: string;
  registeredAt: string;
  activities: StudentActivityEnrollment[];
  pendingEnrollments?: StudentActivityEnrollment[];
  inactiveEnrollments?: StudentActivityEnrollment[];
  notes?: string;
}

export type StudentAbsenceStatus = 'reported' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface StudentAbsence {
  id: string;
  studentId: string;
  activityId: string;
  sessionDate: string; // YYYY-MM-DD
  reason?: string;
  status: StudentAbsenceStatus;
  reportedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  activityId: string;
  activityName: string;
  periodMonth: string; // "YYYY-MM" e.g., "2026-11"
  amount: number;
  paymentDate?: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  collectedByTeacher: boolean;
  collectedByTeacherId?: string;
  notes?: string;
}

export interface TeacherPayout {
  id: string;
  teacherId: string;
  periodMonth: string;
  calculatedAmount: number;
  classesCount: number;
  studentsCount: number;
  collectedInHandByTeacher: number; // ya cobrado en efectivo por él
  balancePending: number; // pendiente de transferirle/pagarle
  totalSettled: number;
  status: 'settled' | 'pending';
  settledDate?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface CenterExpense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  periodMonth: string;
  paymentMethod: PaymentMethod;
  status: 'paid' | 'pending';
  invoiceNumber?: string;
  notes?: string;
}

export interface SessionAttendanceRecord {
  studentId: string;
  studentName: string;
  attendance: 'present' | 'absent' | 'partial';
  paid: boolean;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  paymentId?: string;
}

export type ClassClosedBy = 'profesor' | 'automatica' | 'administrador';

export interface ClassSession {
  id: string;
  activityId: string;
  teacherId: string;
  date: string; // YYYY-MM-DD
  attendeesCount: number;
  durationMinutes: number;
  topic?: string;
  isClosed?: boolean;
  closedAt?: string;
  closedBy?: ClassClosedBy;
  closedByUserId?: string;
  reopenReason?: string;
  reopenedAt?: string;
  reopenedBy?: 'profesor' | 'administrador';
  attendanceRecords?: SessionAttendanceRecord[];
}

export interface AppConfigSetting {
  id?: string;
  config_key: string;
  config_value: string;
  is_active: boolean;
  description?: string;
  updated_at?: string;
}

export interface NewsNote {
  id: string;
  title: string;
  content: string;
  date: string;
  category: 'noticia' | 'aviso' | 'taller' | 'general';
  author?: string;
  pinned?: boolean;
  activityId?: string;
  activityName?: string;
  expiresAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export interface CalendarEventItem {
  id: string;
  title: string;
  startTime: string; // e.g., "10:00"
  endTime: string;   // e.g., "11:30"
  date: string;      // "YYYY-MM-DD"
  teacherName?: string;
  room?: string;
  activityName?: string;
  category?: string;
  billingMode?: 'monthly' | 'per_class';
  price?: number;
  description?: string;
  activityId?: string; 
}

export type FeedbackReportType =
  | 'bug'
  | 'feature_request'
  | 'ux_improvement'
  | 'question'
  | 'other';

export type FeedbackReportPriority = 'critical' | 'high' | 'medium' | 'low';

export type FeedbackReportStatus = 'pending' | 'in_review' | 'resolved' | 'deleted';

export interface FeedbackReport {
  id: string;
  user_id?: string | null;
  user_name: string;
  user_email: string;
  user_role: string;
  type: FeedbackReportType;
  priority: FeedbackReportPriority;
  status: FeedbackReportStatus;
  technical_summary: string;
  affected_module: string;
  raw_text: string;
  current_tab?: string | null;
  language?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export type FeedbackRoleToggleMap = Record<UserRole, boolean>;

export interface FeedbackSystemConfig {
  masterEnabled: boolean;
  roles: FeedbackRoleToggleMap;
}

export type MembershipWithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface MembershipWithdrawalRequest {
  id: string;
  profileId?: string;
  userId?: string;
  studentId?: string;
  teacherId?: string;
  userName: string;
  userEmail: string;
  userRole: string;
  reason?: string;
  status: MembershipWithdrawalStatus;
  debtsChecked: boolean;
  materialsChecked: boolean;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MemberAnnualFee {
  id: string;
  profileId: string;
  memberName: string;
  memberEmail: string;
  memberNumber?: string;
  feeYear: number;
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  receiptNumber?: string;
  notes?: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export type StudentPaymentMessageStatus = 'pending' | 'approved' | 'rejected';
export type PaymentPaidToType = 'teacher' | 'association' | 'other';

export interface StudentPaymentMessage {
  id: string;
  paymentId: string;
  studentId: string;
  studentName?: string;
  activityId: string;
  activityName?: string;
  teacherId?: string;
  teacherName?: string;
  periodMonth: string;
  receiptNumber?: string;
  amount?: number;
  reportedPaid: boolean;
  paidToType?: PaymentPaidToType;
  paidToName?: string;
  paymentMethod?: PaymentMethod;
  message: string;
  status: StudentPaymentMessageStatus;
  teacherEvaluation?: string;
  evaluatedBy?: string;
  evaluatedAt?: string;
  createdAt: string;
  updatedAt?: string;
}
