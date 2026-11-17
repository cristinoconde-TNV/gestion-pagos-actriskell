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

export interface OptimizedAvatarResult {
  blob: Blob;
  sizeBytes: number;
  width: number;
  height: number;
  qualityUsed: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
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
 * - Recorte centrado 1:1 (center-crop)
 * - Redimensionado a 400x400px
 * - Conversión a WebP (calidad inicial 0.8) ajustando si supera 50KB
 */
export async function optimizeAvatarToWebP(file: File): Promise<OptimizedAvatarResult> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('unsupported_file_type');
  }

  const loaded = await loadImageSource(file);
  try {
    const { source, width, height } = loaded;
    if (!width || !height) {
      throw new Error('invalid_image');
    }

    const cropSize = Math.min(width, height);
    const sx = Math.floor((width - cropSize) / 2);
    const sy = Math.floor((height - cropSize) / 2);

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

    const qualitySteps = [AVATAR_INITIAL_QUALITY, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25];
    let selectedBlob: Blob | null = null;
    let qualityUsed = AVATAR_INITIAL_QUALITY;

    for (const q of qualitySteps) {
      const candidate = await canvasToBlob(canvas, 'image/webp', q);
      if (!candidate) continue;
      if (candidate.type && candidate.type !== 'image/webp') {
        throw new Error('webp_not_supported');
      }
      selectedBlob = candidate;
      qualityUsed = q;
      if (candidate.size <= AVATAR_MAX_BYTES) {
        break;
      }
    }

    if (!selectedBlob) {
      throw new Error('webp_encode_failed');
    }

    return {
      blob: selectedBlob,
      sizeBytes: selectedBlob.size,
      width: AVATAR_SIZE_PX,
      height: AVATAR_SIZE_PX,
      qualityUsed
    };
  } finally {
    loaded.cleanup();
  }
}

/**
 * Sube el avatar WebP optimizado a Supabase Storage (`avatars/{user_id}/avatar.webp` con upsert: true)
 * y devuelve la URL pública con cache-busting `?t={timestamp}`.
 */
export async function uploadAvatarToStorage(userId: string, blob: Blob): Promise<string> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) {
    throw new Error('missing_user_id');
  }

  const filePath = `${cleanUserId}/avatar.webp`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, blob, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  const basePublicUrl = (data?.publicUrl || '').split('?')[0];
  if (!basePublicUrl) {
    throw new Error('missing_public_url');
  }

  return `${basePublicUrl}?t=${Date.now()}`;
}
