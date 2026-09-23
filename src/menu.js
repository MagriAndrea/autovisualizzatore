// Menu iniziale a numeri: 1 avvia, 2 modifica le impostazioni, 0 esce.
import readline from 'node:readline';
import { loadImpostazioni, saveImpostazioni, valori } from './impostazioni.js';

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

function riepilogo({ startFromLesson, maxLessons }) {
  const quante = maxLessons > 0 ? `${maxLessons} lezioni` : 'tutte le lezioni';
  return `Autovisualizza ${quante} partendo dalla lezione ${startFromLesson}.`;
}

async function configurazione() {
  const voci = loadImpostazioni();
  for (;;) {
    console.log('\n──────── Configurazione ────────\n');
    voci.forEach((v, i) => {
      console.log(`  ${i + 1}) ${v.nome} = ${v.valore}`);
      console.log(`     ${v.descrizione}`);
      if (v.note) console.log(`     Nota: ${v.note}`);
      console.log('');
    });
    console.log('  0) Indietro\n');

    const scelta = (await ask('Quale vuoi modificare? > ')).trim();
    if (scelta === '0' || scelta === '') return;
    const voce = voci[Number(scelta) - 1];
    if (!voce) { console.log('  → Scelta non valida.'); continue; }

    const input = (await ask(`Nuovo valore per ${voce.nome} (attuale ${voce.valore}, INVIO = lascia così) > `)).trim();
    if (input === '') continue;
    const n = Number(input);
    const min = voce.min ?? 0;
    if (!Number.isInteger(n) || n < min) {
      console.log(`  → Serve un numero intero maggiore o uguale a ${min}.`);
      continue;
    }
    voce.valore = n;
    saveImpostazioni(voci);
    console.log(`  → Salvato: ${voce.nome} = ${n}`);
  }
}

// Ritorna quando l'utente sceglie "Inizia"; con "Esci" termina il processo.
export async function menu() {
  for (;;) {
    console.log('\n──────── Autovisualizzatore ────────\n');
    console.log(riepilogo(valori()));
    console.log('\n  1) Inizia');
    console.log('  2) Configurazione');
    console.log('  0) Esci\n');

    const scelta = (await ask('Scegli un numero > ')).trim();
    if (scelta === '1') return;
    if (scelta === '2') await configurazione();
    else if (scelta === '0') process.exit(0);
    else console.log('  → Scelta non valida.');
  }
}
