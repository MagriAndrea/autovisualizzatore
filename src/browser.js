// Funzioni condivise: avvio del browser, spoof della visibilità, lettura/controllo dei video.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  // Risolvi il profilo Chrome in path assoluto.
  cfg.userDataDir = path.resolve(ROOT, cfg.userDataDir);
  return cfg;
}

// Questo script viene iniettato PRIMA di ogni script della pagina, in ogni frame.
// Fa credere a ogni pagina/iframe di essere sempre "in primo piano e visibile",
// così il player custom non mette in pausa il video quando la tab è in background.
function visibilitySpoof() {
  const alwaysVisible = () => 'visible';
  const never = () => false;
  for (const target of [Document.prototype, document]) {
    try {
      Object.defineProperty(target, 'visibilityState', { configurable: true, get: alwaysVisible });
      Object.defineProperty(target, 'webkitVisibilityState', { configurable: true, get: alwaysVisible });
      Object.defineProperty(target, 'hidden', { configurable: true, get: never });
      Object.defineProperty(target, 'webkitHidden', { configurable: true, get: never });
    } catch (_) { /* in alcuni contesti la proprieta' non e' configurabile */ }
  }
  try { document.hasFocus = () => true; } catch (_) {}
  // Inghiotti gli eventi che il player potrebbe usare per accorgersi del cambio di stato.
  const swallow = (e) => { e.stopImmediatePropagation(); };
  for (const ev of ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze']) {
    try { document.addEventListener(ev, swallow, true); } catch (_) {}
    try { window.addEventListener(ev, swallow, true); } catch (_) {}
  }
}

export async function launch(cfg) {
  const args = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required',
  ];
  const context = await chromium.launchPersistentContext(cfg.userDataDir, {
    channel: cfg.channel || 'chrome',
    headless: !!cfg.headless,
    viewport: null,
    args,
  });
  await context.addInitScript(visibilitySpoof);
  return context;
}

// Cerca un <video> in tutti i frame della pagina e ne legge lo stato.
export async function readVideo(page) {
  for (const frame of page.frames()) {
    try {
      const s = await frame.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return null;
        return {
          currentTime: v.currentTime || 0,
          duration: Number.isFinite(v.duration) ? v.duration : null,
          paused: v.paused,
          ended: v.ended,
          readyState: v.readyState,
        };
      });
      if (s) return s;
    } catch (_) { /* frame staccato / cross-origin non accessibile */ }
  }
  return null;
}

// Spinge il play (muto) su ogni <video> trovato, nel caso l'autoplay non sia partito.
export async function nudgePlay(page) {
  for (const frame of page.frames()) {
    try {
      await frame.evaluate(() => {
        const v = document.querySelector('video');
        if (v) {
          v.muted = true;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        }
      });
    } catch (_) {}
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
