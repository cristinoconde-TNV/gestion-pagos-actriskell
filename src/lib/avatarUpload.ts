import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_SIZE_PX = 400;
export const AVATAR_INITIAL_QUALITY = 0.8;
export const AVATAR_MAX_BYTES = 50 * 1024; // 50 KB

export interface PresetAvatarItem {
  id: string;
  path: string;
}

export const PRESET_AVATARS: PresetAvatarItem[] = [
  { id: 'preset-1', path: '/avatars/preset-1.svg' },
  { id: 'preset-2', path: '/avatars/preset-2.svg' },
  { id: 'preset-3', path: '/avatars/preset-3.svg' },
  { id: 'preset-4', path: '/avatars/preset-4.svg' },
  { id: 'preset-5', path: '/avatars/preset-5.svg' },
  { id: 'preset-6', path: '/avatars/preset-6.svg' },
  { id: 'preset-7', path: '/avatars/preset-7.svg' },
  { id: 'preset-8', path: '/avatars/preset-8.svg' }
];

export interface AvatarCropOptions {
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  previewSize?: number;
}

export interface OptimizedAvatarResult {
  blob: Blob;
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
  fileExt: 'webp' | 'jpg' | 'png';
  formatLabel: 'WebP' | 'JPEG' | 'PNG';
  sizeBytes: number;
  width: number;
  height: number;
  qualityUsed: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

async function loadImageSource(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          try {
            bitmap.close();
          } catch {
            // Ignorar si ya fue liberado
          }
        }
      };
    } catch {
      // Fallback a HTMLImageElement si createImageBitmap falla con algún formato/codec
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('invalid_image'));
      el.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl)
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Optimiza cualquier imagen seleccionada desde galería o cámara:
 * - Recorte 1:1 con zoom y desplazamiento personalizados (o centrado por defecto)
 * - Redimensionado a 400x400px
 * - Conversión a WebP (calidad inicial 0.8) ajustando si supera 50KB,
 *   con respaldo automático a JPEG/PNG en navegadores sin soporte WebP (p. ej. Safari).
 */
export async function optimizeAvatarImage(
  file: File,
  crop?: AvatarCropOptions
): Promise<OptimizedAvatarResult> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('unsupported_file_type');
  }

  const loaded = await loadImageSource(file);
  try {
    const { source, width, height } = loaded;
    if (!width || !height) {
      throw new Error('invalid_image');
    }

    const minSide = Math.min(width, height);
    const zoom = Math.max(1, crop?.zoom ?? 1);
    const cropSize = minSide / zoom;

    let centerX = width / 2;
    let centerY = height / 2;

    if (crop?.previewSize && crop.previewSize > 0) {
      const effectiveScale = (crop.previewSize / minSide) * zoom;
      centerX = width / 2 - (crop.offsetX ?? 0) / effectiveScale;
      centerY = height / 2 - (crop.offsetY ?? 0) / effectiveScale;
    }

    const sx = Math.max(0, Math.min(width - cropSize, centerX - cropSize / 2));
    const sy = Math.max(0, Math.min(height - cropSize, centerY - cropSize / 2));

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas_unavailable');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
    ctx.drawImage(
      source,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX
    );

    const qualitySteps = [AVATAR_INITIAL_QUALITY, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.18];

    // 1. Intentar WebP si el navegador soporta codificación WebP real
    let webpSupported = true;
    let selectedBlob: Blob | null = null;
    let qualityUsed = AVATAR_INITIAL_QUALITY;

    for (const q of qualitySteps) {
      const candidate = await canvasToBlob(canvas, 'image/webp', q);
      if (!candidate || candidate.type !== 'image/webp') {
        webpSupported = false;
        selectedBlob = null;
        break;
      }
      selectedBlob = candidate;
      qualityUsed = q;
      if (candidate.size <= AVATAR_MAX_BYTES) {
        break;
      }
    }

    if (webpSupported && selectedBlob) {
      return {
        blob: selectedBlob,
        mimeType: 'image/webp',
        fileExt: 'webp',
        formatLabel: 'WebP',
        sizeBytes: selectedBlob.size,
        width: AVATAR_SIZE_PX,
        height: AVATAR_SIZE_PX,
        qualityUsed
      };
    }

    // 2. Fallback automático a JPEG (componiendo sobre fondo blanco para transparencias)
    const opaqueCanvas = document.createElement('canvas');
    opaqueCanvas.width = AVATAR_SIZE_PX;
    opaqueCanvas.height = AVATAR_SIZE_PX;
    const opaqueCtx = opaqueCanvas.getContext('2d');
    if (opaqueCtx) {
      opaqueCtx.fillStyle = '#ffffff';
      opaqueCtx.fillRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
      opaqueCtx.drawImage(canvas, 0, 0);
    }
    const jpegCanvas = opaqueCtx ? opaqueCanvas : canvas;

    let jpegBlob: Blob | null = null;
    let jpegQuality = AVATAR_INITIAL_QUALITY;
    for (const q of qualitySteps) {
      const candidate = await canvasToBlob(jpegCanvas, 'image/jpeg', q);
      if (!candidate || candidate.type !== 'image/jpeg') {
        jpegBlob = null;
        break;
      }
      jpegBlob = candidate;
      jpegQuality = q;
      if (candidate.size <= AVATAR_MAX_BYTES) {
        break;
      }
    }

    if (jpegBlob) {
      return {
        blob: jpegBlob,
        mimeType: 'image/jpeg',
        fileExt: 'jpg',
        formatLabel: 'JPEG',
        sizeBytes: jpegBlob.size,
        width: AVATAR_SIZE_PX,
        height: AVATAR_SIZE_PX,
        qualityUsed: jpegQuality
      };
    }

    // 3. Último recurso: PNG
    const pngBlob = await canvasToBlob(canvas, 'image/png');
    if (pngBlob) {
      return {
        blob: pngBlob,
        mimeType: 'image/png',
        fileExt: 'png',
        formatLabel: 'PNG',
        sizeBytes: pngBlob.size,
        width: AVATAR_SIZE_PX,
        height: AVATAR_SIZE_PX,
        qualityUsed: 1
      };
    }

    throw new Error('avatar_encode_failed');
  } finally {
    loaded.cleanup();
  }
}

export const optimizeAvatarToWebP = optimizeAvatarImage;

function resolveAvatarExtensionAndMime(blob: Blob, mimeType?: string): {
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
  ext: 'webp' | 'jpg' | 'png';
} {
  const raw = (mimeType || blob.type || 'image/webp').toLowerCase();
  if (raw.includes('jpeg') || raw.includes('jpg')) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (raw.includes('png')) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  return { mimeType: 'image/webp', ext: 'webp' };
}

/**
 * Sube el avatar optimizado a Supabase Storage (`avatars/{user_id}/avatar.{webp|jpg|png}` con upsert: true)
 * y devuelve la URL pública con cache-busting `?t={timestamp}`.
 */
export async function uploadAvatarToStorage(
  userId: string,
  blob: Blob,
  mimeType?: string
): Promise<string> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) {
    throw new Error('missing_user_id');
  }

  const resolved = resolveAvatarExtensionAndMime(blob, mimeType);
  const filePath = `${cleanUserId}/avatar.${resolved.ext}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, blob, {
      contentType: resolved.mimeType,
      cacheControl: '3600',
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  // Limpiar extensiones previas distintas para evitar archivos huérfanos en Storage
  const stalePaths = (['webp', 'jpg', 'png'] as const)
    .filter(ext => ext !== resolved.ext)
    .map(ext => `${cleanUserId}/avatar.${ext}`);
  if (stalePaths.length > 0) {
    try {
      await supabase.storage.from(AVATAR_BUCKET).remove(stalePaths);
    } catch {
      // Ignorar errores de limpieza opcional
    }
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  const basePublicUrl = (data?.publicUrl || '').split('?')[0];
  if (!basePublicUrl) {
    throw new Error('missing_public_url');
  }

  return `${basePublicUrl}?t=${Date.now()}`;
}
