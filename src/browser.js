// Funzioni condivise: avvio del browser, spoof della visibilità, lettura e controllo dei video.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valori } from './impostazioni.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export function loadConfig() {
  // config.json = parametri tecnici; impostazioni.json = quelli modificabili dal menu.
  const cfg = {
    ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')),
    ...valori(),
  };
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

// Altro script iniettato: passa al programma le notifiche del sito (es. "tempo di fruizione finito")
// scrivendole in console con un prefisso riconoscibile. La notifica vera parte comunque.
function catturaNotifiche() {
  try {
    const Vera = window.Notification;
    const Spia = function (titolo, opzioni) {
      console.log('[autovis-notifica] ' + titolo + ' ' + ((opzioni && opzioni.body) || ''));
      try { return new Vera(titolo, opzioni); } catch (_) { return {}; }
    };
    Spia.permission = 'granted';
    Spia.requestPermission = () => Promise.resolve('granted');
    window.Notification = Spia;
  } catch (_) {}
}

const ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--autoplay-policy=no-user-gesture-required',
];

// Chrome visibile col profilo salvato (./.chrome-profile): qui fai il login.
export async function launch(cfg) {
  const context = await chromium.launchPersistentContext(cfg.userDataDir, {
    channel: cfg.channel || 'chrome',
    headless: false,
    viewport: null,
    args: ARGS,
  });
  await context.addInitScript(visibilitySpoof);
  await context.addInitScript(catturaNotifiche);
  return context;
}

// Chrome senza finestra che riusa i cookie della sessione fatta in quello visibile.
// È lo stesso Chrome: carica il player e scarica i video come prima, solo non li disegna a schermo.
export async function launchInvisible(cfg, { storageState, userAgent }) {
  const browser = await chromium.launch({
    channel: cfg.channel || 'chrome',
    headless: true,
    args: ARGS,
  });
  const context = await browser.newContext({ storageState, userAgent, viewport: { width: 1280, height: 720 } });
  await context.addInitScript(visibilitySpoof);
  await context.addInitScript(catturaNotifiche);
  return context;
}

// Cerca un <video> in tutti i frame della pagina e ne legge lo stato, compresa la riserva
// (secondi già scaricati davanti alla posizione). Restituisce anche il frame, per i salti.
export async function leggiVideo(page) {
  for (const frame of page.frames()) {
    try {
      const s = await frame.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return null;
        let fine = v.currentTime;
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.5) fine = Math.max(fine, v.buffered.end(i));
        }
        return {
          pos: v.currentTime || 0,
          dur: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null,
          paused: v.paused,
          ended: v.ended,
          riserva: fine - v.currentTime,
          // Scaricato fino alla fine: da qui la riserva cala da sola, non è la rete.
          finoAllaFine: Number.isFinite(v.duration) && fine >= v.duration - 1,
        };
      });
      if (s) return { ...s, frame };
    } catch (_) { /* frame staccato / cross-origin non accessibile */ }
  }
  return null;
}

// Sposta il video al secondo indicato (il player Uninettuno lo permette).
export async function salta(frame, sec) {
  await frame.evaluate((t) => { document.querySelector('video').currentTime = t; }, sec);
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
