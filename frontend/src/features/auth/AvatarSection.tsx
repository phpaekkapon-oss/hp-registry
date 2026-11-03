import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Camera, ImagePlus, Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { securityApi } from './securityApi';
import { UserAvatar } from './UserAvatar';

const OUT_SIZE = 256;
const VIEW = 280; // px of the round crop window on screen
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_ZOOM = 4;

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Address the preview <img> can show */
  url: string;
  close: () => void;
}

/** Decode with createImageBitmap, or with an <img> where that fails (some formats / older browsers) */
async function decode(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, url, close: () => { bitmap.close(); URL.revokeObjectURL(url); } };
  } catch {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, url, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('เปิดไฟล์รูปนี้ไม่ได้ (รูปแบบไม่รองรับ เช่น HEIC) กรุณาใช้ไฟล์ JPG, PNG หรือ WebP');
    }
  }
}

/** Draw exactly what the round window shows into a 256 px square JPEG */
async function renderCrop(img: Decoded, zoom: number, offset: { x: number; y: number }): Promise<Blob> {
  const base = VIEW / Math.min(img.width, img.height);
  const s = base * zoom;
  const side = VIEW / s; // source pixels covered by the window
  const cx = img.width / 2 - offset.x / s;
  const cy = img.height / 2 - offset.y / s;
  const canvas = document.createElement('canvas');
  canvas.width = OUT_SIZE;
  canvas.height = OUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background
  ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
  ctx.drawImage(img.source, cx - side / 2, cy - side / 2, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('ย่อรูปไม่สำเร็จ');
  return blob;
}

/** The avatar as a button that opens the photo editor (works inside a menu via asChild) */
export const AvatarButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { name: string; className: string; variant?: 'strip' | 'badge' }>(
  ({ name, className, variant = 'strip', ...rest }, ref) => {
    const shape = className.match(/rounded[^ ]*/)?.[0] ?? '';
    return (
      <button
        ref={ref}
        type="button"
        aria-label="เปลี่ยนรูปโปรไฟล์"
        title="เปลี่ยนรูปโปรไฟล์"
        {...rest}
        className={`group relative inline-block shrink-0 cursor-pointer outline-none ${shape} focus-visible:ring-2 focus-visible:ring-[var(--brand-strong)]`}
      >
        <UserAvatar name={name} className={className} />
        {variant === 'badge' ? (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-strong,#1d4ed8)] text-white ring-4 ring-[var(--token-surface-card,#fff)]">
            <Camera className="h-4 w-4" aria-hidden />
          </span>
        ) : (
          <span className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 overflow-hidden bg-black/55 py-0.5 text-[10px] font-semibold leading-tight text-white ${shape === 'rounded-full' ? 'rounded-b-full' : 'rounded-b-xl'}`}>
            <Camera className="h-3 w-3" aria-hidden /> เปลี่ยน
          </span>
        )}
      </button>
    );
  }
);
AvatarButton.displayName = 'AvatarButton';

/**
 * "เปลี่ยนรูปโปรไฟล์": choose or drop a photo, drag it to frame the face, zoom, save.
 * The crop window is round (that is how the photo is shown), and what is saved is exactly what is inside it.
 */
export const AvatarEditorDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; onDone?: (message: { kind: 'ok' | 'error'; text: string }) => void }> = ({ open, onOpenChange, onDone }) => {
  const { user, security, setSecurity } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<Decoded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | 'load' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  /** Fingers on the touch screen: one drags, two pinch to zoom */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const reset = useCallback(() => {
    setImg((old) => {
      old?.close();
      return null;
    });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setBusy(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /** Keep the photo covering the whole window */
  const clamp = useCallback((o: { x: number; y: number }, z: number, d: Decoded | null) => {
    if (!d) return { x: 0, y: 0 };
    const s = (VIEW / Math.min(d.width, d.height)) * z;
    const mx = Math.max(0, (d.width * s - VIEW) / 2);
    const my = Math.max(0, (d.height * s - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  }, []);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) return setError('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG หรือ WebP)');
    if (file.size > MAX_INPUT_BYTES) return setError('ไฟล์ใหญ่เกินไป (ไม่เกิน 10 MB)');
    setBusy('load');
    try {
      const d = await decode(file);
      setImg((old) => {
        old?.close();
        return d;
      });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปิดรูปไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const changeZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(z);
    setOffset((o) => clamp(o, z, img));
  };

  const save = async () => {
    if (!img) return;
    setBusy('save');
    setError(null);
    try {
      setSecurity(await securityApi.uploadAvatar(await renderCrop(img, zoom, offset)));
      onDone?.({ kind: 'ok', text: 'เปลี่ยนรูปโปรไฟล์แล้ว' });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    try {
      setSecurity(await securityApi.removeAvatar());
      onDone?.({ kind: 'ok', text: 'ลบรูปโปรไฟล์แล้ว' });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    if (!img) return null;
    const s = (VIEW / Math.min(img.width, img.height)) * zoom;
    return { w: img.width * s, h: img.height * s };
  }, [img, zoom]);

  const zoomBtn = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[110] flex max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-white/10">
            <Dialog.Title className="flex items-center gap-2 font-prompt text-base font-bold">
              <Camera className="h-4 w-4 text-brand" aria-hidden /> เปลี่ยนรูปโปรไฟล์
            </Dialog.Title>
            <Dialog.Close className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer" aria-label="ปิด">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">เลือกรูป ลากเพื่อจัดตำแหน่ง ปรับขนาด แล้วกดบันทึก</Dialog.Description>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <input ref={input} type="file" accept="image/*" className="sr-only" id="avatar-editor-file" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />

            {!img ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); void choose(e.dataTransfer.files?.[0]); }}
                className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${over ? 'border-[var(--brand-strong)] bg-brand-soft' : 'border-slate-300 dark:border-white/20'}`}
              >
                <UserAvatar name={user?.displayName ?? '?'} className="h-28 w-28 rounded-full text-4xl" />
                <button type="button" onClick={() => input.current?.click()} disabled={busy !== null} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand cursor-pointer hover:underline">
                  {busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />} เลือกรูป หรือลากไฟล์มาวาง
                </button>
                <p className="text-xs text-ink-4">JPG / PNG / WebP ไม่เกิน 10 MB · แนะนำรูปหน้าตรง พื้นหลังเรียบ</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  role="group"
                  aria-label="จัดตำแหน่งรูป ลากเพื่อเลื่อน หรือใช้ปุ่มลูกศร"
                  tabIndex={0}
                  className="relative mx-auto touch-none select-none overflow-hidden rounded-full bg-slate-200 ring-2 ring-[var(--brand-strong)] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-4 dark:bg-slate-700"
                  style={{ width: VIEW, height: VIEW, maxWidth: '100%' }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    if (pointers.current.size === 2) {
                      const [a, b] = [...pointers.current.values()];
                      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
                      drag.current = null;
                    } else drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
                  }}
                  onPointerMove={(e) => {
                    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    if (pointers.current.size === 2 && pinch.current) {
                      const [a, b] = [...pointers.current.values()];
                      changeZoom(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
                      return;
                    }
                    const d = drag.current;
                    if (d) setOffset(clamp({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py }, zoom, img));
                  }}
                  onPointerUp={(e) => {
                    pointers.current.delete(e.pointerId);
                    pinch.current = null;
                    const rest = [...pointers.current.values()][0];
                    // One finger left after a pinch: carry on dragging from where it is
                    drag.current = rest ? { px: rest.x, py: rest.y, ox: offset.x, oy: offset.y } : null;
                  }}
                  onPointerCancel={(e) => {
                    pointers.current.delete(e.pointerId);
                    pinch.current = null;
                    drag.current = null;
                  }}
                  onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 20 : 6;
                    const move: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                    if (move[e.key]) {
                      e.preventDefault();
                      setOffset((o) => clamp({ x: o.x + move[e.key][0], y: o.y + move[e.key][1] }, zoom, img));
                    } else if (e.key === '+' || e.key === '=') changeZoom(zoom + 0.1);
                    else if (e.key === '-') changeZoom(zoom - 0.1);
                  }}
                >
                  {shown && (
                    <img
                      src={img.url}
                      alt="ตัวอย่างรูปโปรไฟล์"
                      draggable={false}
                      className="pointer-events-none absolute max-w-none"
                      style={{ width: shown.w, height: shown.h, left: VIEW / 2 - shown.w / 2 + offset.x, top: VIEW / 2 - shown.h / 2 + offset.y }}
                    />
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => changeZoom(zoom - 0.2)} aria-label="ซูมออก" className={zoomBtn}>
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="ขนาดรูป" className="h-2 w-full cursor-pointer accent-[var(--brand-strong)]" />
                  <button type="button" onClick={() => changeZoom(zoom + 0.2)} aria-label="ซูมเข้า" className={zoomBtn}>
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="text-center text-xs text-ink-4">ลากรูปเพื่อจัดตำแหน่งใบหน้าให้อยู่กลางวงกลม · เลื่อนลูกกลิ้งเมาส์ ใช้แถบ หรือถ่างสองนิ้วเพื่อซูม</p>
                <div className="text-center">
                  <button type="button" onClick={() => input.current?.click()} disabled={busy !== null} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand cursor-pointer hover:underline">
                    <ImagePlus className="h-4 w-4" aria-hidden /> เลือกรูปอื่น
                  </button>
                </div>
              </div>
            )}

            {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">{error}</p>}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3.5 dark:border-white/10">
            {security.avatarUrl ? (
              <button type="button" onClick={() => void remove()} disabled={busy !== null} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer disabled:opacity-60">
                {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} ลบรูป
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => void save()} disabled={!img || busy !== null} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold cursor-pointer disabled:opacity-50">
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} บันทึกรูป
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
