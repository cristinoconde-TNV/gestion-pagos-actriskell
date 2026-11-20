import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

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

function normalizeServerUserRole(rawRole?: string | null): string {
  switch ((rawRole || '').trim().toLowerCase()) {
    case 'admin':
    case 'administrador':
      return 'Admin';
    case 'monitor':
    case 'teacher':
    case 'profesor':
      return 'Monitor';
    case 'alumno':
    case 'student':
      return 'Alumno';
    case 'híbrido':
    case 'hibrido':
    case 'teacher_student':
      return 'Híbrido';
    case 'socio':
    default:
      return 'Socio';
  }
}

function parseFeedbackRolesConfig(rawValue?: string | null): Record<string, boolean> {
  const defaults: Record<string, boolean> = {
    Socio: true,
    Alumno: true,
    Monitor: true,
    Híbrido: true,
    Admin: true
  };
  if (!rawValue) return defaults;
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      const rawRoles =
        parsed.roles && typeof parsed.roles === 'object'
          ? (parsed.roles as Record<string, unknown>)
          : (parsed as Record<string, unknown>);

      const readToggle = (primary: string, legacy: string): boolean => {
        if (rawRoles[primary] !== undefined) return Boolean(rawRoles[primary]);
        if (rawRoles[primary.toLowerCase()] !== undefined) {
          return Boolean(rawRoles[primary.toLowerCase()]);
        }
        if (rawRoles[legacy] !== undefined) return Boolean(rawRoles[legacy]);
        return true;
      };

      return {
        Socio: readToggle('Socio', 'socio'),
        Alumno: readToggle('Alumno', 'student'),
        Monitor: readToggle('Monitor', 'teacher'),
        Híbrido: readToggle('Híbrido', 'teacher_student'),
        Admin: readToggle('Admin', 'admin')
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

function applyApiCorsHeaders(req: Request, res: Response, allowedMethods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    applyApiCorsHeaders(req, res, 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'triskell-api' });
  });

  app.options(['/api/feedback', '/api/feedback/'], (req: Request, res: Response) => {
    applyApiCorsHeaders(req, res, 'POST, OPTIONS');
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  });

  const handlePostFeedback = async (req: Request, res: Response) => {
    applyApiCorsHeaders(req, res, 'POST, OPTIONS');
    try {
      const authHeader = req.headers.authorization || '';
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = bearerMatch ? bearerMatch[1].trim() : '';

      if (!token) {
        return res.status(401).json({
          error: 'Debes iniciar sesión en Supabase para enviar feedback.'
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

      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user) {
        return res.status(401).json({
          error: 'Tu sesión de Supabase ha caducado o no es válida. Vuelve a iniciar sesión.'
        });
      }

      const authUser = userData.user;
      const normalizedEmail = (authUser.email || '').trim().toLowerCase();

      // Load trusted profile info by auth UID (with email fallback for pre-created/incognito Socio profiles)
      const loadProfile = async () => {
        const byUid = await supabase
          .from('profiles')
          .select('full_name, email, role, active, access')
          .eq('id', authUser.id)
          .maybeSingle();

        if (!byUid.error && byUid.data) {
          return byUid.data;
        }

        if (byUid.error?.code === '42703') {
          const legacyByUid = await supabase
            .from('profiles')
            .select('full_name, email, role, active')
            .eq('id', authUser.id)
            .maybeSingle();
          if (legacyByUid.data) return legacyByUid.data;
        }

        if (normalizedEmail) {
          const byEmail = await supabase
            .from('profiles')
            .select('full_name, email, role, active, access')
            .ilike('email', normalizedEmail)
            .maybeSingle();
          if (!byEmail.error && byEmail.data) {
            return byEmail.data;
          }
          if (byEmail.error?.code === '42703') {
            const legacyByEmail = await supabase
              .from('profiles')
              .select('full_name, email, role, active')
              .ilike('email', normalizedEmail)
              .maybeSingle();
            if (legacyByEmail.data) return legacyByEmail.data;
          }
        }

        return null;
      };

      const profileRow: any = await loadProfile();

      if (profileRow && (profileRow.access === false || profileRow.active === false)) {
        return res.status(403).json({
          error: 'Tu cuenta está inactiva y no puede enviar reportes.'
        });
      }

      const rawUserRole =
        (typeof profileRow?.role === 'string' && profileRow.role.trim()) ||
        (typeof authUser.user_metadata?.role === 'string' && authUser.user_metadata.role.trim()) ||
        (typeof authUser.app_metadata?.role === 'string' && authUser.app_metadata.role.trim()) ||
        (typeof body.userRole === 'string' && body.userRole.trim()) ||
        'Socio';
      const userRole = normalizeServerUserRole(rawUserRole);
      const userName =
        (typeof profileRow?.full_name === 'string' && profileRow.full_name.trim()) ||
        (typeof body.userName === 'string' && body.userName.trim()) ||
        (authUser.user_metadata?.full_name as string) ||
        authUser.email?.split('@')[0] ||
        'Usuario';
      const userEmail =
        (typeof profileRow?.email === 'string' && profileRow.email.trim()) ||
        authUser.email ||
        (typeof body.userEmail === 'string' && body.userEmail.trim()) ||
        '';

      // Verify feedback system master & role toggles from app_config
      const { data: configRow } = await supabase
        .from('app_config')
        .select('is_active, config_value')
        .eq('config_key', 'feedback_system')
        .maybeSingle();

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
          error:
            'El servicio de clasificación con Gemini AI no está configurado en el servidor (GEMINI_API_KEY).'
        });
      }

      const promptContext = [
        `Mensaje del usuario (idioma UI: ${language}, pestaña actual: ${currentTab}, rol: ${userRole}):`,
        `"""`,
        rawText,
        `"""`
      ].join('\n');

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptContext,
        config: {
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
        }
      });

      const responseText = aiResponse.text;
      if (!responseText) {
        return res.status(502).json({
          error: 'Gemini AI no devolvió una respuesta estructurada válida.'
        });
      }

      let parsedAi: Partial<GeminiFeedbackClassification>;
      try {
        parsedAi = JSON.parse(responseText) as Partial<GeminiFeedbackClassification>;
      } catch (parseErr) {
        console.error('Failed to parse Gemini JSON response:', responseText, parseErr);
        return res.status(502).json({
          error: 'La respuesta estructurada de Gemini AI no tuvo formato JSON válido.'
        });
      }

      const structured = normalizeClassification(parsedAi);

      const insertPayload = {
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

      const { data: savedRow, error: insertError } = await supabase
        .from('feedback_reports')
        .insert([insertPayload])
        .select('*')
        .single();

      if (insertError) {
        console.error('Supabase feedback_reports insert error:', insertError);
        const statusCode = insertError.code === '42501' ? 403 : 502;
        return res.status(statusCode).json({
          error: `No se pudo guardar el reporte en Supabase (${insertError.code || 'DB'}): ${insertError.message}`
        });
      }

      return res.status(201).json({
        report: savedRow
      });
    } catch (err: any) {
      console.error('Error processing /api/feedback:', err);
      return res.status(500).json({
        error: err?.message || 'Error interno al procesar el feedback con Gemini AI.'
      });
    }
  };

  app.post(['/api/feedback', '/api/feedback/'], handlePostFeedback);

  app.all(['/api/feedback', '/api/feedback/'], (req: Request, res: Response) => {
    applyApiCorsHeaders(req, res, 'POST, OPTIONS');
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      error: 'Método no permitido en /api/feedback. Usa POST.'
    });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' });
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
