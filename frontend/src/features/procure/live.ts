/**
 * Live updates for the procurement registers.
 *
 * The server pushes a tiny event (which register changed, and by whom) over Server-Sent Events whenever anyone
 * saves or deletes something. Screens react by quietly re-reading their list through the normal API, so
 * permissions are still enforced by the server. A slow timer and "tab became visible" cover anything the stream
 * missed (a dropped connection, or someone editing the database directly).
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export interface LiveEvent {
  /** orders | contracts | incoming | guarantees | progress | notes, or "*" for "reload everything" */
  resource: string;
  action: 'create' | 'update' | 'delete';
  ids: number[];
  by: string;
  byName: string;
  at: string;
}

export type LiveStatus = 'connecting' | 'live' | 'offline';

const handlers = new Set<(event: LiveEvent) => void>();
const statusListeners = new Set<() => void>();
let status: LiveStatus = 'connecting';
let source: EventSource | null = null;
let hadError = false;

const setStatus = (next: LiveStatus) => {
  if (status === next) return;
  status = next;
  statusListeners.forEach((l) => l());
};

const dispatch = (event: LiveEvent) => handlers.forEach((h) => h(event));

function connect() {
  if (source || handlers.size === 0 || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/procure/events');
  source.onopen = () => {
    setStatus('live');
    // After a drop we may have missed events: reload everything once
    if (hadError) dispatch({ resource: '*', action: 'update', ids: [], by: '', byName: '', at: new Date().toISOString() });
    hadError = false;
  };
  source.onmessage = (m) => {
    try {
      dispatch(JSON.parse(m.data) as LiveEvent);
    } catch {
      /* ignore a malformed event */
    }
  };
  source.onerror = () => {
    hadError = true;
    setStatus('offline'); // EventSource reconnects by itself (server asks for 4 s)
  };
}

/** Listen for changes. The connection is opened for the first listener and closed after the last. */
export function subscribeLive(handler: (event: LiveEvent) => void): () => void {
  handlers.add(handler);
  connect();
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0 && source) {
      source.close();
      source = null;
      status = 'connecting';
    }
  };
}

/** After an unlock: the browser gives up on a stream the server refused while locked, so open it again and reload everything */
export function reconnectLive(): void {
  if (source && source.readyState === EventSource.CLOSED) {
    source.close();
    source = null;
    hadError = true;
  }
  connect();
  requestRefresh();
}

/** The refresh button: make every screen reload now */
export function requestRefresh(): void {
  dispatch({ resource: '*', action: 'update', ids: [], by: '', byName: '', at: new Date().toISOString() });
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status
  );
}

const FALLBACK_POLL_MS = 45_000;

/**
 * Call `reload` when one of `resources` changes (or on refresh), when the tab becomes visible again,
 * and every 45 s as a safety net.
 */
export function useLiveReload(resources: string[], reload: () => void | Promise<void>): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = resources.join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several events in a burst (e.g. a bulk delete) cause one reload
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reloadRef.current(), 250);
    };
    const wanted = key.split(',');
    const off = subscribeLive((e) => {
      if (e.resource === '*' || wanted.includes(e.resource)) trigger();
    });
    const poll = setInterval(() => {
      if (!document.hidden) trigger();
    }, FALLBACK_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) trigger();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      clearInterval(poll);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key]);
}

/** Keys of rows that were added or changed between two loads (compared as JSON, so any field change counts) */
export function diffRows<T, K extends string | number>(prev: Map<K, string>, next: T[], keyOf: (row: T) => K): { ids: Set<K>; added: Set<K>; map: Map<K, string> } {
  const map = new Map<K, string>();
  const ids = new Set<K>();
  const added = new Set<K>();
  for (const row of next) {
    const key = keyOf(row);
    const json = JSON.stringify(row);
    map.set(key, json);
    if (prev.get(key) !== json) ids.add(key);
    if (!prev.has(key)) added.add(key);
  }
  return { ids, added, map };
}

export const changedIds = (prev: Map<number, string>, next: { id: number }[]) => diffRows(prev, next, (r) => r.id);

/** Briefly holds "these rows just changed" and "these rows are new"; the highlight fades on its own */
export function useFlashIds<K extends string | number = number>(): [ReadonlySet<K>, (changed: Set<K>, added?: Set<K>) => void, ReadonlySet<K>] {
  const [ids, setIds] = useState<ReadonlySet<K>>(new Set());
  const [fresh, setFresh] = useState<ReadonlySet<K>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    ids,
    (changed, added = new Set<K>()) => {
      clearTimeout(timer.current);
      setIds(changed);
      setFresh(added);
      timer.current = setTimeout(() => {
        setIds(new Set<K>());
        setFresh(new Set<K>());
      }, 3200);
    },
    fresh,
  ];
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Wraps a number or text. When the value changes (after the first render) it flashes and pops once; a numeric
 * value with `format` also counts smoothly from the old number to the new one instead of jumping.
 */
export const Flash: React.FC<{ value: unknown; format?: (n: number) => string; children?: React.ReactNode; className?: string }> = ({ value, format, children, className }) => {
  const previous = useRef(value);
  const [count, setCount] = useState(0);
  const [shown, setShown] = useState<number | null>(typeof value === 'number' ? value : null);
  // Callers pass an inline `format`, so it must not be an effect dependency (a re-run would cancel the count half way)
  const formatRef = useRef(format);
  formatRef.current = format;
  const hasFormat = Boolean(format);

  useEffect(() => {
    if (previous.current === value) return;
    const from = typeof previous.current === 'number' ? previous.current : null;
    previous.current = value;
    setCount((n) => n + 1);
    if (typeof value !== 'number' || !hasFormat || from === null || prefersReducedMotion()) {
      setShown(typeof value === 'number' ? value : null);
      return;
    }
    // Count from the old number to the new one in 0.7 s (ease-out)
    const duration = 700;
    let start: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, hasFormat]);

  const text = formatRef.current && typeof value === 'number' && shown !== null ? formatRef.current(Math.round(shown * 100) / 100) : children ?? String(value);
  // A new key replays the CSS animation
  return React.createElement('span', { key: count, className: `${count > 0 ? 'value-flash' : ''} ${className ?? ''}`.trim() }, text);
};

// ---------------------------------------------------------------------------
// Optional soft chime when someone else changes data (off by default, remembered per browser)
// ---------------------------------------------------------------------------

const SOUND_KEY = 'procure_live_sound';

export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveSoundPref(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* private mode: just not remembered */
  }
}

let audio: AudioContext | null = null;

/** Two short, quiet notes (no audio file needed) */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime;
    [[784, 0], [1175, 0.11]].forEach(([freq, offset]) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.35);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.4);
    });
  } catch {
    /* sound is a nicety; never break the page */
  }
}
