import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Crosshair,
  RotateCcw,
  Check,
  Loader2,
  Move
} from 'lucide-react';
import { AvatarCropOptions } from '../lib/avatarUpload';
import { AppLanguage } from '../types';
import { createTranslator } from '../lib/i18n';

interface AvatarCropModalProps {
  file: File;
  language: AppLanguage;
  isProcessing: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: (crop: AvatarCropOptions) => void | Promise<void>;
}

const PREVIEW_SIZE = 264;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  file,
  language,
  isProcessing,
  errorMessage,
  onCancel,
  onConfirm
}) => {
  const t = createTranslator(language);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setLoadError(false);
    setNaturalSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const clampOffset = useCallback(
    (x: number, y: number, targetZoom: number): { x: number; y: number } => {
      if (!naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) {
        return { x: 0, y: 0 };
      }
      const minSide = Math.min(naturalSize.width, naturalSize.height);
      const effectiveScale = (PREVIEW_SIZE / minSide) * targetZoom;
      const renderedW = naturalSize.width * effectiveScale;
      const renderedH = naturalSize.height * effectiveScale;
      const maxX = Math.max(0, (renderedW - PREVIEW_SIZE) / 2);
      const maxY = Math.max(0, (renderedH - PREVIEW_SIZE) / 2);

      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y))
      };
    },
    [naturalSize]
  );

  const handleZoomChange = (nextZoomRaw: number) => {
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(nextZoomRaw.toFixed(2))));
    setZoom(clampedZoom);
    setOffset(prev => clampOffset(prev.x, prev.y, clampedZoom));
  };

  const handleCenterOnly = () => {
    setOffset({ x: 0, y: 0 });
  };

  const handleResetAll = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isProcessing || !naturalSize) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: offset.x,
      originY: offset.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    const next = clampOffset(
      dragStartRef.current.originX + dx,
      dragStartRef.current.originY + dy,
      zoom
    );
    setOffset(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignorar
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isProcessing || !naturalSize) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    handleZoomChange(zoom + delta);
  };

  const displayDimensions = (() => {
    if (!naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) {
      return null;
    }
    const minSide = Math.min(naturalSize.width, naturalSize.height);
    const effectiveScale = (PREVIEW_SIZE / minSide) * zoom;
    return {
      width: naturalSize.width * effectiveScale,
      height: naturalSize.height * effectiveScale
    };
  })();

  const handleConfirmClick = () => {
    if (isProcessing || loadError || !naturalSize) return;
    void onConfirm({
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
      previewSize: PREVIEW_SIZE
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.personal.cropModal.title')}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('profile.personal.cropModal.title')}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {t('profile.personal.cropModal.subtitle')}
            </p>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            aria-label={t('profile.personal.cropModal.cancel')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lienzo interactivo de recorte y centrado */}
        <div className="flex flex-col items-center gap-2.5">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={handleWheel}
            style={{ width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px` }}
            className={`relative overflow-hidden rounded-2xl border-2 border-emerald-500/70 bg-slate-950 shadow-inner touch-none select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            {previewUrl && !loadError && (
              <img
                src={previewUrl}
                alt=""
                draggable={false}
                onLoad={e => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                    setOffset({ x: 0, y: 0 });
                  } else {
                    setLoadError(true);
                  }
                }}
                onError={() => setLoadError(true)}
                style={
                  displayDimensions
                    ? {
                        width: `${displayDimensions.width}px`,
                        height: `${displayDimensions.height}px`,
                        maxWidth: 'none',
                        maxHeight: 'none',
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`
                      }
                    : {
                        opacity: 0
                      }
                }
              />
            )}

            {/* Guía circular + rejilla de tercios sutil para centrar */}
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-0 rounded-full ring-1 ring-white/80"
                style={{ boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.38)' }}
              />
              <div className="absolute inset-x-0 top-1/3 border-t border-white/20" />
              <div className="absolute inset-x-0 top-2/3 border-t border-white/20" />
              <div className="absolute inset-y-0 left-1/3 border-l border-white/20" />
              <div className="absolute inset-y-0 left-2/3 border-l border-white/20" />
            </div>

            {!naturalSize && !loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-semibold text-rose-300 bg-slate-900">
                {t('profile.personal.avatarInvalidImage')}
              </div>
            )}
          </div>

          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <Move className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            <span>{t('profile.personal.cropModal.hint')}</span>
          </span>
        </div>

        {/* Controles de Zoom y Centrado */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {t('profile.personal.cropModal.zoomLabel')}
            </span>
            <span className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isProcessing || zoom <= MIN_ZOOM}
              onClick={() => handleZoomChange(zoom - 0.15)}
              title={t('profile.personal.cropModal.zoomOutTooltip')}
              aria-label={t('profile.personal.cropModal.zoomOutTooltip')}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              disabled={isProcessing || !naturalSize}
              onChange={e => handleZoomChange(parseFloat(e.target.value))}
              aria-label={t('profile.personal.cropModal.zoomLabel')}
              className="flex-1 accent-emerald-600 cursor-pointer"
            />

            <button
              type="button"
              disabled={isProcessing || zoom >= MAX_ZOOM}
              onClick={() => handleZoomChange(zoom + 0.15)}
              title={t('profile.personal.cropModal.zoomInTooltip')}
              aria-label={t('profile.personal.cropModal.zoomInTooltip')}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isProcessing || (offset.x === 0 && offset.y === 0)}
              onClick={handleCenterOnly}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
            >
              <Crosshair className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>{t('profile.personal.cropModal.centerButton')}</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || (zoom === 1 && offset.x === 0 && offset.y === 0)}
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t('profile.personal.cropModal.resetButton')}</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
          >
            {t('profile.personal.cropModal.cancel')}
          </button>

          <button
            type="button"
            disabled={isProcessing || loadError || !naturalSize}
            onClick={handleConfirmClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>
              {isProcessing
                ? t('profile.personal.cropModal.processing')
                : t('profile.personal.cropModal.confirm')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
