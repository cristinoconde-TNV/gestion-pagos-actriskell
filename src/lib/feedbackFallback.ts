import { getStoredSupabaseConfig } from './supabase';
import {
  FeedbackReport,
  FeedbackReportPriority,
  FeedbackReportType
} from '../types';

const TAB_TO_MODULE_MAP: Record<string, string> = {
  dashboard: 'dashboard',
  calendar: 'calendar',
  payments: 'payments',
  activities: 'activities',
  teachers: 'teachers',
  expenses: 'expenses',
  'admin-users': 'admin_users',
  'admin-config': 'admin_config',
  'admin-feedback': 'admin_config',
  'teacher-portal': 'teacher_portal',
  'teacher-students': 'teacher_portal',
  'student-portal': 'student_portal',
  'socio-portal': 'socio_portal',
  profile: 'profile_avatar'
};

export function normalizeFeedbackUserRole(rawRole?: string | null): string {
  switch ((rawRole || '').trim().toLowerCase()) {
    case 'admin':
    case 'administrador':
      return 'admin';
    case 'monitor':
    case 'teacher':
    case 'profesor':
      return 'teacher';
    case 'alumno':
    case 'student':
      return 'student';
    case 'hybrid':
    case 'híbrido':
    case 'hibrido':
    case 'teacher_student':
      return 'hybrid';
    case 'member':
    case 'socio':
    default:
      return 'member';
  }
}

function toLegacySpanishFeedbackRole(canonicalRole: string): string {
  switch (canonicalRole) {
    case 'admin':
      return 'Admin';
    case 'teacher':
      return 'Monitor';
    case 'student':
      return 'Alumno';
    case 'hybrid':
      return 'Híbrido';
    case 'member':
    default:
      return 'Socio';
  }
}

export function extractSupabaseAccessTokenFromStorage(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token =
        parsed?.access_token ||
        parsed?.currentSession?.access_token ||
        parsed?.session?.access_token;
      if (typeof token === 'string' && token.split('.').length === 3) {
        return token;
      }
    }
  } catch {
    // Ignore malformed storage entries
  }
  return null;
}

export function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
}

export function isStaticHostWithoutBackend(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return host.endsWith('.github.io');
}

export function classifyFeedbackLocally(
  rawText: string,
  currentTab: string
): {
  type: FeedbackReportType;
  priority: FeedbackReportPriority;
  technical_summary: string;
  affected_module: string;
} {
  const lower = rawText.toLowerCase();

  let type: FeedbackReportType = 'other';
  if (
    /(error|fallo|falla|bug|no funciona|no carga|cuelga|colgado|bloquea|405|404|500|broken|crash|fails|erro|non funciona)/.test(
      lower
    )
  ) {
    type = 'bug';
  } else if (/(añadir|agregar|nueva|nuevo|estaría bien|sugerencia|feature|engadir|poder )/.test(lower)) {
    type = 'feature_request';
  } else if (/(mejorar|diseño|botón|móvil|pantalla|interfaz|color|texto|lento|ux|ui|layout)/.test(lower)) {
    type = 'ux_improvement';
  } else if (/(\?|cómo|como|duda|pregunta|puedo|how|where|dónde|donde)/.test(lower)) {
    type = 'question';
  }

  let priority: FeedbackReportPriority = 'medium';
  if (
    /(bloquea|no puedo entrar|pago|cobro|cuota|datos|perdido|405|500|crítico|urgente|critical|cannot login)/.test(
      lower
    )
  ) {
    priority = 'high';
  } else if (type === 'question' || /(color|texto|fuente|icono|pequeño)/.test(lower)) {
    priority = 'low';
  }

  const affected_module = TAB_TO_MODULE_MAP[currentTab] || 'general';
  const cleanSnippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 260);
  const technical_summary = `[${affected_module}] ${cleanSnippet}`;

  return {
    type,
    priority,
    technical_summary,
    affected_module
  };
}

export async function submitFeedbackDirectToSupabase(params: {
  accessToken: string;
  rawText: string;
  currentTab: string;
  language: string;
  userRole?: string;
  userName?: string;
  userEmail?: string;
  fallbackUserId?: string;
}): Promise<{ report?: FeedbackReport; error?: string; status?: number }> {
  const cfg = getStoredSupabaseConfig();
  const baseUrl = (cfg.url || '').replace(/\/+$/, '');
  const anonKey = cfg.anonKey;

  const tokenSub = decodeJwtSub(params.accessToken);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userId =
    (tokenSub && uuidRegex.test(tokenSub) && tokenSub) ||
    (params.fallbackUserId && uuidRegex.test(params.fallbackUserId) && params.fallbackUserId) ||
    null;

  if (!userId) {
    return {
      status: 401,
      error: 'No se pudo verificar tu sesión de Supabase Auth para registrar el reporte.'
    };
  }

  const normalizedRole = normalizeFeedbackUserRole(params.userRole);
  const classified = classifyFeedbackLocally(params.rawText, params.currentTab);

  const buildPayload = (roleValue: string) => ({
    user_id: userId,
    user_name: (params.userName || '').trim() || 'Usuario',
    user_email: (params.userEmail || '').trim(),
    user_role: roleValue,
    type: classified.type,
    priority: classified.priority,
    status: 'pending' as const,
    technical_summary: classified.technical_summary,
    affected_module: classified.affected_module,
    raw_text: params.rawText,
    current_tab: params.currentTab || 'general',
    language: params.language || 'es'
  });

  const postToRest = async (payload: Record<string, unknown>, returnRow: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const endpoint = returnRow
        ? `${baseUrl}/rest/v1/feedback_reports?select=*`
        : `${baseUrl}/rest/v1/feedback_reports`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Prefer: returnRow ? 'return=representation' : 'return=minimal'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const body = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let payload = buildPayload(normalizedRole);
    let result = await postToRest(payload, true);

    // Compatibilidad si una constraint legacy en feedback_reports aún espera etiquetas en español
    if (!result.ok && result.body?.code === '23514' && String(result.body?.message || '').includes('user_role')) {
      const legacyRole = toLegacySpanishFeedbackRole(normalizedRole);
      payload = buildPayload(legacyRole);
      result = await postToRest(payload, true);
    }

    // Si RLS permite INSERT pero bloquea SELECT RETURNING a usuarios no-Admin, insertar con return=minimal
    if (!result.ok && (result.status === 401 || result.status === 403 || result.body?.code === '42501')) {
      const minimalResult = await postToRest(payload, false);
      if (minimalResult.ok) {
        const syntheticReport: FeedbackReport = {
          id: `local-${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString()
        };
        return { report: syntheticReport, status: 201 };
      }
      result = minimalResult;
    }

    if (!result.ok) {
      const code = result.body?.code || String(result.status);
      const msg =
        result.body?.message ||
        result.body?.error_description ||
        result.body?.error ||
        `HTTP ${result.status}`;
      return {
        status: result.status,
        error: `No se pudo guardar el reporte en Supabase (${code}): ${msg}`
      };
    }

    const row = Array.isArray(result.body) ? result.body[0] : result.body;
    const finalReport: FeedbackReport = (row as FeedbackReport) || {
      id: `local-${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString()
    };
    return { report: finalReport, status: 201 };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        status: 504,
        error: 'Tiempo de espera agotado al guardar el feedback en Supabase.'
      };
    }
    return {
      status: 500,
      error: err?.message || 'Error de conexión al guardar el feedback.'
    };
  }
}
