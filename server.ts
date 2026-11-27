import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://qlpuwpktenwmptpnlusu.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_RAyfFJ0HivXJMr4quVilow_97KJWY3L';

const ALLOWED_TYPES = [
  'bug',
  'feature_request',
  'ux_improvement',
  'question',
  'other'
] as const;

const ALLOWED_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

const ALLOWED_MODULES = [
  'auth',
  'dashboard',
  'calendar',
  'payments',
  'activities',
  'teachers',
  'expenses',
  'admin_users',
  'admin_config',
  'teacher_portal',
  'student_portal',
  'socio_portal',
  'profile_avatar',
  'notifications',
  'general'
] as const;

type FeedbackType = (typeof ALLOWED_TYPES)[number];
type FeedbackPriority = (typeof ALLOWED_PRIORITIES)[number];

interface GeminiFeedbackClassification {
  type: FeedbackType;
  priority: FeedbackPriority;
  technical_summary: string;
  affected_module: string;
}

function getAiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} (${ms}ms)`));
    }, ms);
    Promise.resolve(promise).then(
      val => {
        clearTimeout(timer);
        resolve(val);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function isTransientGeminiError(err: any): boolean {
  const status = Number(err?.status ?? err?.code);
  const name = String(err?.name || '').toUpperCase();
  const msg = String(err?.message || '').toUpperCase();
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    name === 'ABORTERROR' ||
    msg.includes('ABORT') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('HIGH DEMAND') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('TIMEOUT') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('FETCH FAILED')
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeServerUserRole(rawRole?: string | null): string {
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

function toLegacySpanishServerRole(canonicalRole: string): string {
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

function parseFeedbackRolesConfig(rawValue?: string | null): Record<string, boolean> {
  const defaults: Record<string, boolean> = {
    member: true,
    student: true,
    teacher: true,
    hybrid: true,
    admin: true
  };
  if (!rawValue) return defaults;
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      const rawRoles =
        parsed.roles && typeof parsed.roles === 'object'
          ? (parsed.roles as Record<string, unknown>)
          : (parsed as Record<string, unknown>);

      const readToggle = (primary: string, ...legacyKeys: string[]): boolean => {
        if (rawRoles[primary] !== undefined) return Boolean(rawRoles[primary]);
        for (const legacy of legacyKeys) {
          if (rawRoles[legacy] !== undefined) return Boolean(rawRoles[legacy]);
        }
        return true;
      };

      return {
        member: readToggle('member', 'Socio', 'socio'),
        student: readToggle('student', 'Alumno', 'alumno'),
        teacher: readToggle('teacher', 'Monitor', 'monitor'),
        hybrid: readToggle('hybrid', 'Híbrido', 'Hibrido', 'hibrido', 'teacher_student'),
        admin: readToggle('admin', 'Admin')
      };
    }
  } catch {
    // Ignore malformed JSON and use defaults
  }
  return defaults;
}

function normalizeClassification(raw: Partial<GeminiFeedbackClassification>): GeminiFeedbackClassification {
  const type: FeedbackType = ALLOWED_TYPES.includes(raw.type as FeedbackType)
    ? (raw.type as FeedbackType)
    : 'other';

  const priority: FeedbackPriority = ALLOWED_PRIORITIES.includes(
    raw.priority as FeedbackPriority
  )
    ? (raw.priority as FeedbackPriority)
    : 'medium';

  const affectedModule =
    typeof raw.affected_module === 'string' &&
    ALLOWED_MODULES.includes(raw.affected_module as (typeof ALLOWED_MODULES)[number])
      ? raw.affected_module
      : 'general';

  const technicalSummary =
    typeof raw.technical_summary === 'string' && raw.technical_summary.trim().length > 0
      ? raw.technical_summary.trim().slice(0, 600)
      : 'Feedback recibido sin resumen técnico estructurado.';

  return {
    type,
    priority,
    technical_summary: technicalSummary,
    affected_module: affectedModule
  };
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function getConfiguredAllowedOrigins(): Set<string> {
  const rawList = [
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.ALLOWED_ORIGINS,
    process.env.APP_URL,
    process.env.VITE_APP_URL
  ]
    .filter((val): val is string => Boolean(val && val.trim()))
    .join(',');

  const origins = new Set<string>();
  for (const item of rawList.split(',')) {
    const normalized = normalizeOrigin(item);
    if (normalized && normalized !== '*') {
      origins.add(normalized);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    origins.add(`http://localhost:${PORT}`);
    origins.add(`http://127.0.0.1:${PORT}`);
  }

  return origins;
}

function isOriginAllowed(req: Request, originHeader?: string): boolean {
  if (!originHeader) return true;
  const normalizedOrigin = normalizeOrigin(originHeader);
  if (!normalizedOrigin) return false;

  const configuredOrigins = getConfiguredAllowedOrigins();
  if (configuredOrigins.has(normalizedOrigin)) {
    return true;
  }

  const host = (req.headers.host || '').trim();
  if (host) {
    const expectedSameOrigin = `${req.protocol}://${host}`;
    if (normalizedOrigin === expectedSameOrigin) {
      return true;
    }
    if (process.env.NODE_ENV !== 'production' && normalizedOrigin === `http://${host}`) {
      return true;
    }
  }

  return false;
}

function applyApiCorsHeaders(
  req: Request,
  res: Response,
  allowedMethods = 'GET, POST, OPTIONS'
): boolean {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  res.setHeader('Vary', 'Origin');

  if (originHeader) {
    if (!isOriginAllowed(req, originHeader)) {
      return false;
    }
    res.setHeader('Access-Control-Allow-Origin', normalizeOrigin(originHeader));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  const cleanup = (now: number) => {
    for (const [k, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(k);
      }
    }
  };

  const cleanupTimer = setInterval(() => cleanup(Date.now()), Math.max(options.windowMs, 60_000));
  cleanupTimer.unref();

  const check = (key: string): { allowed: boolean; remaining: number; resetAt: number; retryAfterSec: number } => {
    const now = Date.now();
    if (buckets.size > 5000) {
      cleanup(now);
    }

    const fullKey = `${options.keyPrefix}:${key}`;
    let bucket = buckets.get(fullKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(fullKey, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    return {
      allowed: bucket.count <= options.max,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterSec
    };
  };

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const rawKey = options.keyGenerator ? options.keyGenerator(req) : req.ip || req.socket.remoteAddress || 'unknown';
    const result = check(rawKey);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({ error: options.message });
    }
    next();
  };

  return { middleware, check };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  const generalApiLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 60,
    keyPrefix: 'api-general',
    message: 'Demasiadas peticiones. Inténtalo de nuevo en unos momentos.'
  });

  const feedbackIpLimiter = createRateLimiter({
    windowMs: 5 * 60_000,
    max: 10,
    keyPrefix: 'feedback-ip',
    message: 'Has enviado demasiados avisos seguidos. Espera unos minutos antes de volver a intentarlo.'
  });

  const feedbackUserLimiter = createRateLimiter({
    windowMs: 10 * 60_000,
    max: 5,
    keyPrefix: 'feedback-user',
    message: 'Has alcanzado el límite temporal de envíos de feedback. Inténtalo de nuevo más tarde.'
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const corsOk = applyApiCorsHeaders(req, res, 'GET, POST, OPTIONS');
    if (!corsOk) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use('/api', generalApiLimiter.middleware);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'triskell-api' });
  });

  app.options(['/api/feedback', '/api/feedback/'], (req: Request, res: Response) => {
    const corsOk = applyApiCorsHeaders(req, res, 'POST, OPTIONS');
    if (!corsOk) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  });

  const handlePostFeedback = async (req: Request, res: Response) => {
    const corsOk = applyApiCorsHeaders(req, res, 'POST, OPTIONS');
    if (!corsOk) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
    try {
      const authHeader = req.headers.authorization || '';
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = bearerMatch ? bearerMatch[1].trim() : '';

      if (!token) {
        return res.status(401).json({
          error: 'Debes iniciar sesión para enviar feedback.'
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawText = typeof body.rawText === 'string' ? body.rawText.trim() : '';
      const currentTab =
        typeof body.currentTab === 'string' ? body.currentTab.trim().slice(0, 64) : 'general';
      const language =
        typeof body.language === 'string' ? body.language.trim().slice(0, 8) : 'es';

      if (rawText.length < 4) {
        return res.status(400).json({
          error: 'Por favor escribe al menos 4 caracteres describiendo tu aviso o sugerencia.'
        });
      }

      if (rawText.length > 3000) {
        return res.status(400).json({
          error: 'El mensaje es demasiado largo (máximo 3000 caracteres).'
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });

      const { data: userData, error: authError } = await withTimeout(
        supabase.auth.getUser(token),
        7000,
        'Auth session verification timeout'
      );
      if (authError || !userData?.user) {
        return res.status(401).json({
          error: 'Tu sesión ha caducado o no es válida. Vuelve a iniciar sesión.'
        });
      }

      const authUser = userData.user;
      const userRate = feedbackUserLimiter.check(authUser.id);
      if (!userRate.allowed) {
        res.setHeader('Retry-After', String(userRate.retryAfterSec));
        return res.status(429).json({
          error: 'Has alcanzado el límite temporal de envíos de feedback. Inténtalo de nuevo más tarde.'
        });
      }

      const normalizedEmail = (authUser.email || '').trim().toLowerCase();

      // Load trusted profile info by auth UID (with email fallback for pre-created/incognito Socio profiles)
      const loadProfile = async () => {
        const byUid = await supabase
          .from('profiles')
          .select('full_name, email, role, active, access')
          .eq('id', authUser.id)
          .maybeSingle();

        if (byUid.error && byUid.error.code === '42703') {
          const legacyByUid = await supabase
            .from('profiles')
            .select('full_name, email, role, active')
            .eq('id', authUser.id)
            .maybeSingle();
          if (legacyByUid.error) throw legacyByUid.error;
          if (legacyByUid.data) return legacyByUid.data;
        } else if (byUid.error) {
          throw byUid.error;
        } else if (byUid.data) {
          return byUid.data;
        }

        if (normalizedEmail) {
          const byEmail = await supabase
            .from('profiles')
            .select('full_name, email, role, active, access')
            .ilike('email', normalizedEmail)
            .maybeSingle();
          if (byEmail.error && byEmail.error.code === '42703') {
            const legacyByEmail = await supabase
              .from('profiles')
              .select('full_name, email, role, active')
              .ilike('email', normalizedEmail)
              .maybeSingle();
            if (legacyByEmail.error) throw legacyByEmail.error;
            if (legacyByEmail.data) return legacyByEmail.data;
          } else if (byEmail.error) {
            throw byEmail.error;
          } else if (byEmail.data) {
            return byEmail.data;
          }
        }

        return null;
      };

      let profileRow: any = null;
      try {
        profileRow = await withTimeout(
          loadProfile(),
          5000,
          'Profile lookup timeout'
        );
      } catch (profileErr) {
        console.error('Profile lookup error during /api/feedback:', profileErr);
        return res.status(503).json({
          error: 'No se pudo verificar tu perfil de usuario en este momento.'
        });
      }

      if (profileRow && (profileRow.access === false || profileRow.active === false)) {
        return res.status(403).json({
          error: 'Tu cuenta está inactiva y no puede enviar reportes.'
        });
      }

      const rawUserRole =
        (typeof profileRow?.role === 'string' && profileRow.role.trim()) ||
        (typeof authUser.app_metadata?.role === 'string' && authUser.app_metadata.role.trim()) ||
        'member';
      const userRole = normalizeServerUserRole(rawUserRole);
      const userName =
        (typeof profileRow?.full_name === 'string' && profileRow.full_name.trim()) ||
        (typeof authUser.user_metadata?.full_name === 'string' &&
          authUser.user_metadata.full_name.trim()) ||
        (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name.trim()) ||
        authUser.email?.split('@')[0] ||
        'Usuario';
      const userEmail =
        (typeof profileRow?.email === 'string' && profileRow.email.trim()) ||
        authUser.email ||
        '';

      // Verify feedback system master & role toggles from app_config
      let configRow: { is_active: any; config_value: any } | null = null;
      try {
        const configRes = await withTimeout(
          supabase
            .from('app_config')
            .select('is_active, config_value')
            .eq('config_key', 'feedback_system')
            .maybeSingle(),
          4000,
          'App config lookup timeout'
        );
        if (configRes.error) {
          console.error('Feedback config query error:', configRes.error);
          return res.status(503).json({
            error: 'No se pudo verificar la disponibilidad del sistema de feedback.'
          });
        }
        configRow = configRes.data;
      } catch (cfgQueryErr) {
        console.error('Feedback config lookup error:', cfgQueryErr);
        return res.status(503).json({
          error: 'No se pudo verificar la disponibilidad del sistema de feedback.'
        });
      }

      if (configRow) {
        const masterActive =
          configRow.is_active !== false && String(configRow.is_active).toLowerCase() !== 'false';
        if (!masterActive) {
          return res.status(403).json({
            error: 'El sistema de feedback está desactivado temporalmente por administración.'
          });
        }
        const rolesMap = parseFeedbackRolesConfig(configRow.config_value);
        if (rolesMap[userRole] === false) {
          return res.status(403).json({
            error: 'El envío de feedback no está habilitado para tu perfil de acceso.'
          });
        }
      }

      // Initialize Gemini API on server side
      let ai: GoogleGenAI;
      try {
        ai = getAiClient();
      } catch (cfgErr) {
        console.error('Gemini API key configuration error:', cfgErr);
        return res.status(503).json({
          error: 'El servicio de clasificación automática no está disponible temporalmente.'
        });
      }

      const promptContext = [
        `Mensaje del usuario (idioma UI: ${language}, pestaña actual: ${currentTab}, rol: ${userRole}):`,
        `"""`,
        rawText,
        `"""`
      ].join('\n');

      const sharedSchemaConfig = {
        systemInstruction:
          'Eres un ingeniero de producto analizando reportes informales y sugerencias de usuarios de una aplicación de gestión de asociación cultural (Triskell: pagos, talleres, inscripciones, calendario, portales de socio/alumno/monitor y administración). Clasifica el reporte de forma precisa y redacta un resumen técnico claro en español (1-2 frases accionables) identificando el módulo afectado y su prioridad real.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: [...ALLOWED_TYPES],
              description:
                'Categoría técnica del feedback: bug (fallo/error), feature_request (nueva funcionalidad), ux_improvement (mejora visual o de uso), question (duda), other (otro).'
            },
            priority: {
              type: Type.STRING,
              enum: [...ALLOWED_PRIORITIES],
              description:
                'Urgencia: critical (bloquea acceso, pagos o datos), high (fallo importante sin bloqueo total), medium (error menor o mejora valiosa), low (sugerencia estética o consulta).'
            },
            technical_summary: {
              type: Type.STRING,
              description:
                'Resumen técnico conciso en español (1-2 frases) para el equipo de administración y desarrollo.'
            },
            affected_module: {
              type: Type.STRING,
              enum: [...ALLOWED_MODULES],
              description: 'Módulo de la aplicación más relacionado con el reporte.'
            }
          },
          required: ['type', 'priority', 'technical_summary', 'affected_module']
        }
      };

      const callGemini = async (
        modelName: string,
        thinkingLevel: ThinkingLevel,
        timeoutMs: number
      ) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, timeoutMs);
        try {
          return await withTimeout(
            ai.models.generateContent({
              model: modelName,
              contents: promptContext,
              config: {
                ...sharedSchemaConfig,
                abortSignal: controller.signal,
                thinkingConfig: { thinkingLevel }
              }
            }),
            timeoutMs + 500,
            `Gemini ${modelName} timeout`
          );
        } catch (err: any) {
          if (controller.signal.aborted) {
            throw new Error(`Gemini ${modelName} timeout (${timeoutMs}ms)`);
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      };

      const attemptSequence: Array<{
        model: string;
        thinkingLevel: ThinkingLevel;
        timeoutMs: number;
        backoffBeforeMs: number;
      }> = [
        {
          model: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.LOW,
          timeoutMs: 15000,
          backoffBeforeMs: 0
        },
        {
          model: 'gemini-3.1-flash-lite',
          thinkingLevel: ThinkingLevel.MINIMAL,
          timeoutMs: 18000,
          backoffBeforeMs: 400
        },
        {
          model: 'gemini-3.1-flash-lite',
          thinkingLevel: ThinkingLevel.MINIMAL,
          timeoutMs: 15000,
          backoffBeforeMs: 800
        }
      ];

      let aiResponse;
      let lastGeminiError: any = null;
      for (let i = 0; i < attemptSequence.length; i++) {
        const attempt = attemptSequence[i];
        if (attempt.backoffBeforeMs > 0) {
          await sleepMs(attempt.backoffBeforeMs);
        }
        try {
          aiResponse = await callGemini(
            attempt.model,
            attempt.thinkingLevel,
            attempt.timeoutMs
          );
          lastGeminiError = null;
          break;
        } catch (err: any) {
          lastGeminiError = err;
          const isLastAttempt = i === attemptSequence.length - 1;
          if (!isTransientGeminiError(err) || isLastAttempt) {
            break;
          }
          const nextAttempt = attemptSequence[i + 1];
          console.warn(
            `${attempt.model} transient error/timeout, retrying with ${nextAttempt.model}:`,
            err?.message || err
          );
        }
      }

      if (!aiResponse) {
        const errStatus = Number(lastGeminiError?.status ?? lastGeminiError?.code);
        const errMsg = String(lastGeminiError?.message || '');
        if (isTransientGeminiError(lastGeminiError)) {
          console.warn('Gemini classification exhausted retries:', errMsg || lastGeminiError);
          return res.status(503).json({
            error:
              'El servicio de clasificación está temporalmente saturado. Inténtalo de nuevo en unos segundos.'
          });
        }
        console.error('Gemini classification error:', lastGeminiError);
        if (
          errStatus === 400 ||
          errStatus === 403 ||
          errMsg.includes('API_KEY_INVALID') ||
          errMsg.includes('PERMISSION_DENIED')
        ) {
          return res.status(502).json({
            error: 'No se pudo completar la clasificación automática en este momento.'
          });
        }
        throw lastGeminiError;
      }

      const responseText = aiResponse.text;
      if (!responseText) {
        return res.status(502).json({
          error: 'No se pudo obtener una clasificación válida del reporte.'
        });
      }

      let parsedAi: Partial<GeminiFeedbackClassification>;
      try {
        parsedAi = JSON.parse(responseText) as Partial<GeminiFeedbackClassification>;
      } catch (parseErr) {
        console.error('Failed to parse Gemini JSON response:', responseText, parseErr);
        return res.status(502).json({
          error: 'No se pudo interpretar la respuesta de clasificación del reporte.'
        });
      }

      const structured = normalizeClassification(parsedAi);

      let insertPayload = {
        user_id: authUser.id,
        user_name: userName,
        user_email: userEmail,
        user_role: userRole,
        type: structured.type,
        priority: structured.priority,
        status: 'pending',
        technical_summary: structured.technical_summary,
        affected_module: structured.affected_module,
        raw_text: rawText,
        current_tab: currentTab,
        language
      };

      let { data: savedRow, error: insertError } = await withTimeout(
        supabase.from('feedback_reports').insert([insertPayload]).select('*').single(),
        6000,
        'Database insert timeout'
      );

      // Compatibilidad si una constraint legacy en Supabase aún espera user_role en español
      if (insertError?.code === '23514' && String(insertError.message || '').includes('user_role')) {
        insertPayload = {
          ...insertPayload,
          user_role: toLegacySpanishServerRole(userRole)
        };
        const retryRole = await withTimeout(
          supabase.from('feedback_reports').insert([insertPayload]).select('*').single(),
          6000,
          'Database insert timeout'
        );
        savedRow = retryRole.data;
        insertError = retryRole.error;
      }

      // Si RLS permite INSERT pero restringe SELECT RETURNING a no-Admin, reintentar sin RETURNING
      if (insertError?.code === '42501') {
        const insertOnly = await withTimeout(
          supabase.from('feedback_reports').insert([insertPayload]),
          6000,
          'Database insert timeout'
        );
        if (!insertOnly.error) {
          return res.status(201).json({
            report: {
              id: `saved-${Date.now()}`,
              ...insertPayload,
              created_at: new Date().toISOString()
            }
          });
        }
        insertError = insertOnly.error;
      }

      if (insertError) {
        console.error('Supabase feedback_reports insert error:', insertError);
        const statusCode = insertError.code === '42501' ? 403 : 502;
        return res.status(statusCode).json({
          error:
            statusCode === 403
              ? 'No tienes permisos para enviar este reporte.'
              : 'No se pudo guardar el reporte en este momento. Inténtalo más tarde.'
        });
      }

      return res.status(201).json({
        report: savedRow
      });
    } catch (err: any) {
      console.error('Error processing /api/feedback:', err);
      return res.status(500).json({
        error: 'Ha ocurrido un error interno al procesar la solicitud.'
      });
    }
  };

  app.post(['/api/feedback', '/api/feedback/'], feedbackIpLimiter.middleware, handlePostFeedback);

  app.all(['/api/feedback', '/api/feedback/'], (req: Request, res: Response) => {
    const corsOk = applyApiCorsHeaders(req, res, 'POST, OPTIONS');
    if (!corsOk) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      error: 'Método no permitido en /api/feedback. Usa POST.'
    });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint no encontrado.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response, next: NextFunction) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
