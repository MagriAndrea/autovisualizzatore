// Impostazioni modificabili dall'utente dal menu (impostazioni.json).
// Ogni voce ha: nome, valore, min, descrizione, note.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'impostazioni.json');

export function loadImpostazioni() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

export function saveImpostazioni(voci) {
  fs.writeFileSync(FILE, JSON.stringify(voci, null, 2) + '\n');
}

// { startFromLesson: 35, maxLessons: 8, ... }
export function valori(voci = loadImpostazioni()) {
  return Object.fromEntries(voci.map((v) => [v.nome, v.valore]));
}
