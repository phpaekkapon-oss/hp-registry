import { useCallback, useEffect, useState } from 'react';

/** Chrome / Edge / Android fire this when the app is installable; iOS Safari never does. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it so the app can offer its own "install" button
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/**
 * Production registers the real offline worker (/sw.js). Development registers a worker that
 * caches nothing (/sw-dev.js) so installing can still be tried without stale-code surprises.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Relative to the site's base (the app is served under /hp-registry/): the worker's scope must cover the app's own pages
  const script = `${import.meta.env.BASE_URL}${import.meta.env.PROD ? 'sw.js' : 'sw-dev.js'}`;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(script).catch((err) => console.warn('[pwa] service worker registration failed:', err));
  });
}

/**
 * Whether this web app is already installed on this computer (Chrome/Edge; other browsers answer null = unknown).
 * The browser hides its install option for an installed app, which is the usual reason installing seems not to work.
 */
export async function isAlreadyInstalled(): Promise<boolean | null> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string }[]> };
  if (!nav.getInstalledRelatedApps) return null;
  try {
    return (await nav.getInstalledRelatedApps()).some((a) => a.platform === 'webapp');
  } catch {
    return null;
  }
}

export interface InstallDiagnosis {
  /** Browsers only allow installing from HTTPS or localhost */
  secureContext: boolean;
  serviceWorkerSupported: boolean;
  ios: boolean;
  android: boolean;
}

export function getInstallDiagnosis(): InstallDiagnosis {
  return {
    secureContext: window.isSecureContext,
    serviceWorkerSupported: 'serviceWorker' in navigator,
    ios: isIosSafari(),
    android: /android/i.test(navigator.userAgent),
  };
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const isIosSafari = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);

export interface InstallState {
  /** The browser offered an install prompt and we can show our own button */
  canInstall: boolean;
  /** Already running as an installed app */
  installed: boolean;
  /** iOS: no prompt API, the person has to use Share → Add to Home Screen */
  needsIosHint: boolean;
  install: () => Promise<void>;
}

export function useInstallApp(): InstallState {
  const [, force] = useState(0);
  // Installed on this computer but currently open in a normal browser tab: Chrome sends no install prompt then
  const [installedElsewhere, setInstalledElsewhere] = useState(false);

  useEffect(() => {
    void isAlreadyInstalled().then((v) => setInstalledElsewhere(v === true));
  }, []);

  useEffect(() => {
    const update = () => force((n) => n + 1);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
  }, []);

  // A live install prompt proves the app is NOT installed, so it overrides the related-apps check
  const installed = (typeof window !== 'undefined' && isStandalone()) || (installedElsewhere && deferredPrompt === null);
  return {
    canInstall: !installed && deferredPrompt !== null,
    installed,
    needsIosHint: !installed && typeof window !== 'undefined' && isIosSafari(),
    install,
  };
}

/** Chrome serialises colour-mix() results as color(srgb ...), so normalise any CSS colour to #rrggbb through a 1px canvas */
function toHex(color: string): string | null {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.canvas.width = ctx.canvas.height = 1;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 0 ? null : `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The colour at the top of the side menu as actually painted (solid colour, or the first stop of its gradient).
 * null when the menu is not on screen (e.g. collapsed on a phone), so the caller can use a fallback.
 */
export function readSidebarTopColor(): string | null {
  const aside = document.querySelector<HTMLElement>('aside.app-sidebar');
  if (!aside || aside.offsetWidth === 0) return null;
  const style = getComputedStyle(aside);
  const gradientStop = /linear-gradient\([^]*?((?:rgba?|color)\([^)]*\))/.exec(style.backgroundImage)?.[1];
  const color = gradientStop ?? style.backgroundColor;
  return color && color !== 'rgba(0, 0, 0, 0)' ? toHex(color) : null;
}

/** Colours the browser UI (Android status bar / installed-app title bar) to match the app */
export function setBrowserThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}
