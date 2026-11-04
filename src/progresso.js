// Avanzamento salvato in progresso.json: per ogni esame, la videoteca e lo stato di ogni lezione.
// Lezione: { n, id, url, durata (s), posizione (s, il punto più avanti raggiunto), completata, aggiornata (ms) }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'progresso.json');

export function carica() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (_) {
    return { esameCorrente: null, esami: {} };
  }
}

export function salva(p) {
  // Scrive su un file temporaneo e poi lo rinomina: un Ctrl+C a metà non rovina il file.
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(p, null, 2) + '\n');
  fs.renameSync(FILE + '.tmp', FILE);
}

export function esameCorrente(p) {
  return p.esameCorrente ? p.esami[p.esameCorrente] ?? null : null;
}

// Registra le lezioni trovate nella videoteca, senza perdere l'avanzamento di quelle già note.
export function aggiornaEsame(p, courseid, videoteca, urls, param) {
  const prima = p.esami[courseid];
  const note = new Map((prima?.lezioni ?? []).map((l) => [l.id, l]));
  const lezioni = urls.map((url, i) => {
    let id = url;
    try { id = new URL(url).searchParams.get(param) ?? url; } catch (_) {}
    const l = note.get(id) ?? {};
    return {
      n: i + 1, id, url,
      durata: l.durata ?? null,
      posizione: l.posizione ?? 0,
      completata: l.completata ?? false,
      aggiornata: l.aggiornata ?? 0,
    };
  });
  const esame = { videoteca, lezioni };
  // Import una tantum dal vecchio startFromLesson: le lezioni precedenti erano già viste.
  if (p.importa && String(p.importa.courseid) === String(courseid)) {
    segnaViste(esame, p.importa.giaVisteFinoA);
    delete p.importa;
  }
  p.esami[courseid] = esame;
  p.esameCorrente = courseid;
  return esame;
}

export function segnaViste(esame, finoA) {
  for (const l of esame.lezioni) {
    if (l.n <= finoA) l.completata = true;
  }
}

// Quanto manca: lezioni e secondi di video (durata ancora sconosciuta = media di quelle note, o 45 min).
export function stima(esame) {
  const note = esame.lezioni.filter((l) => l.durata);
  const media = note.length ? note.reduce((a, l) => a + l.durata, 0) / note.length : 45 * 60;
  const rimaste = esame.lezioni.filter((l) => !l.completata);
  const secondi = rimaste.reduce((a, l) => a + Math.max(0, (l.durata ?? media) - l.posizione), 0);
  return { rimaste: rimaste.length, totali: esame.lezioni.length, secondi };
}

export function durata(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
