// Menu iniziale: dice quanto manca e chiede cosa fare. Le impostazioni sono facoltative.
import readline from 'node:readline';
import { loadImpostazioni, saveImpostazioni, valori } from './impostazioni.js';
import { esameCorrente, stima, durata, segnaViste, salva } from './progresso.js';

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

function riepilogo(progresso, cfg) {
  const esame = esameCorrente(progresso);
  if (!esame) return 'Nessun esame ancora: con "Avvia" fai il login e apri la videoteca, il programma la riconosce da solo.';
  const st = stima(esame);
  const nome = `Esame ${progresso.esameCorrente}`;
  if (st.rimaste === 0) return `${nome}: tutte le ${st.totali} lezioni sono complete. Usa "Nuovo esame" per un altro.`;
  const { videoInsieme } = valori();
  const n = videoInsieme || 6;
  const tempo = st.secondi / n;
  const login = Math.max(1, Math.ceil(tempo / (cfg.sessioneMinuti * 60)));
  return [
    `${nome}: ${st.rimaste} lezioni da finire su ${st.totali}, circa ${durata(st.secondi)} di video.`,
    `Con ${n} video insieme${videoInsieme ? '' : ' (stima: il numero è automatico)'} servono circa ${durata(tempo)}: ${login} login.`,
  ].join('\n');
}

const mostraValore = (v) => (v.nome === 'videoInsieme' && v.valore === 0 ? '0 (automatico)' : String(v.valore));

async function impostazioni(progresso) {
  const voci = loadImpostazioni();
  for (;;) {
    const esame = esameCorrente(progresso);
    const nViste = voci.length + 1;
    console.log('\n──────── Impostazioni (facoltative) ────────\n');
    voci.forEach((v, i) => {
      console.log(`  ${i + 1}) ${v.nome} = ${mostraValore(v)}`);
      console.log(`     ${v.descrizione}`);
      if (v.note) console.log(`     Nota: ${v.note}`);
      console.log('');
    });
    if (esame) {
      console.log(`  ${nViste}) Segna come già viste le lezioni fino alla n. …  (esame ${progresso.esameCorrente})`);
      console.log('     Per le lezioni che hai già visto in altro modo.\n');
    }
    console.log('  0) Indietro\n');

    const scelta = (await ask('Cosa vuoi cambiare? > ')).trim();
    if (scelta === '0' || scelta === '') return;

    if (esame && Number(scelta) === nViste) {
      const input = (await ask(`Fino a quale lezione? (1-${esame.lezioni.length}, INVIO = annulla) > `)).trim();
      if (input === '') continue;
      const n = Number(input);
      if (!Number.isInteger(n) || n < 1 || n > esame.lezioni.length) { console.log('  → Numero non valido.'); continue; }
      segnaViste(esame, n);
      salva(progresso);
      console.log(`  → Lezioni 1–${n} segnate come già viste.`);
      continue;
    }

    const voce = voci[Number(scelta) - 1];
    if (!voce) { console.log('  → Scelta non valida.'); continue; }
    const input = (await ask(`Nuovo valore per ${voce.nome} (attuale ${mostraValore(voce)}, INVIO = lascia così) > `)).trim();
    if (input === '') continue;
    const n = Number(input);
    const min = voce.min ?? 0;
    const max = voce.max ?? Infinity;
    if (!Number.isInteger(n) || n < min || n > max) {
      const range = Number.isFinite(max) ? `tra ${min} e ${max}` : `maggiore o uguale a ${min}`;
      console.log(`  → Serve un numero intero ${range}.`);
      continue;
    }
    voce.valore = n;
    saveImpostazioni(voci);
    console.log(`  → Salvato: ${voce.nome} = ${mostraValore(voce)}`);
  }
}

// Restituisce 'avvia' o 'nuovo'; con "Esci" termina il processo.
export async function menu(progresso, cfg) {
  for (;;) {
    console.log('\n──────── Autovisualizzatore ────────\n');
    console.log(riepilogo(progresso, cfg));
    console.log('\n  1) Avvia          (oppure INVIO)');
    console.log('  2) Nuovo esame    (dopo il login apri un\'altra videoteca)');
    console.log('  3) Impostazioni');
    console.log('  0) Esci\n');

    const scelta = (await ask('Scegli un numero > ')).trim();
    if (scelta === '1' || scelta === '') return 'avvia';
    if (scelta === '2') return 'nuovo';
    if (scelta === '3') await impostazioni(progresso);
    else if (scelta === '0') process.exit(0);
    else console.log('  → Scelta non valida.');
  }
}
