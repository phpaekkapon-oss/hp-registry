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
  const script = import.meta.env.PROD ? '/sw.js' : '/sw-dev.js';
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

  const installed = typeof window !== 'undefined' && isStandalone();
  return {
    canInstall: !installed && deferredPrompt !== null,
    installed,
    needsIosHint: !installed && typeof window !== 'undefined' && isIosSafari(),
    install,
  };
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
