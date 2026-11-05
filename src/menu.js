// Menu iniziale: dice quanto manca e chiede cosa fare. Le impostazioni sono facoltative.
import readline from 'node:readline';
import { loadImpostazioni, saveImpostazioni, valori } from './impostazioni.js';
import { esameCorrente, stima, durata, primaDaVedere, aMeta, partiDa, elenco, lezioni, salva } from './progresso.js';

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

const COME_FUNZIONA = `
──────── Come funziona ────────

Questo programma guarda al posto tuo le videolezioni di un esame, così la
percentuale di visualizzazione arriva al 100%. Non serve tenere aperta nessuna
scheda di Chrome: le lezioni vanno avanti in un Chrome invisibile, e il
programma fa credere al sito che ci sia qualcuno davanti alla lezione.

  • Per iniziare scegli "Avvia", fai il login ed entra una volta nella pagina
    delle videolezioni dell'esame. Dalla volta dopo il programma se la ricorda.

  • Le lezioni partono dalla prima che ti manca e vanno avanti da sole fino
    all'ultima. Non devi fare né controllare niente.

  • Vanno alla velocità normale: una lezione di 45 minuti dura 45 minuti.
    Per fare prima il programma ne guarda più di una insieme, e sceglie da
    solo quante in base alla tua connessione.

  • Circa ogni 2 ore devi rifare il login: Uninettuno conta al massimo
    120 minuti per ogni accesso. Ti arriva una notifica e si riapre Chrome.

  • Se fermi il programma prima della fine non perdi niente: la volta dopo
    ogni lezione riparte dal punto in cui si era fermata (qualche minuto
    prima, per sicurezza).

  • Per fermarlo premi Ctrl+C. Mentre lavora lascia il Mac acceso, con il
    coperchio aperto e possibilmente in carica. Lo schermo può spegnersi.
`;

// Da dove si parte. Le lezioni a metà vengono aperte per prime (vedi prossima() in sessione.js).
function partenza(esame) {
  const n = primaDaVedere(esame);
  if (n == null) return 'Tutte le lezioni sono complete.';
  const meta = aMeta(esame);
  if (!meta.length) return `Si parte dalla lezione ${n}.`;
  if (meta[0] === n) return `Si parte dalla lezione ${n} (${elenco(meta)} a metà: riprendono dal punto salvato).`;
  return `Prima riprendono le lezioni a metà (${elenco(meta)}) dal punto salvato, poi si parte dalla ${n}.`;
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
    `${nome}: ${lezioni(st.rimaste)} da finire su ${st.totali}, circa ${durata(st.secondi)} di video.`,
    partenza(esame),
    `Con ${n} video insieme${videoInsieme ? '' : ' (stima: il numero è automatico)'} servono circa ${durata(tempo)}: ${login} login.`,
  ].join('\n');
}

const mostraValore = (v) => (v.nome === 'videoInsieme' && v.valore === 0 ? '0 (automatico)' : String(v.valore));

// Chiede da quale lezione partire e aggiorna progresso.json.
async function sceltaPartenza(progresso, esame) {
  const tot = esame.lezioni.length;
  const attuale = primaDaVedere(esame);
  const input = (await ask(`Da quale lezione vuoi partire? (1-${tot}, INVIO = lascia così) > `)).trim();
  if (input === '') return;
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > tot) { console.log('  → Numero non valido.'); return; }
  if (n === attuale) { console.log(`  → Si parte già dalla lezione ${n}.`); return; }
  if (n < (attuale ?? tot + 1)) {
    const fino = (attuale ?? tot + 1) - 1;
    const quali = n === fino ? `La lezione ${n} risulta già vista` : `Le lezioni ${n}–${fino} risultano già viste`;
    const ok = (await ask(`  ${quali}: le rimetto da guardare? (s/N) > `)).trim();
    if (!/^s/i.test(ok)) { console.log('  → Lasciato com\'era.'); return; }
  }
  partiDa(esame, n);
  salva(progresso);
  console.log(`  → Fatto. ${partenza(esame)}`);
}

async function impostazioni(progresso) {
  const voci = loadImpostazioni();
  for (;;) {
    const esame = esameCorrente(progresso);
    const nPartenza = voci.length + 1;
    console.log('\n──────── Impostazioni (facoltative) ────────\n');
    voci.forEach((v, i) => {
      console.log(`  ${i + 1}) ${v.nome} = ${mostraValore(v)}`);
      console.log(`     ${v.descrizione}`);
      if (v.note) console.log(`     Nota: ${v.note}`);
      console.log('');
    });
    if (esame) {
      const n = primaDaVedere(esame);
      console.log(`  ${nPartenza}) Lezione da cui partire = ${n ?? 'nessuna, sono tutte complete'}  (esame ${progresso.esameCorrente})`);
      console.log(`     ${partenza(esame)}`);
      console.log('     Cambiala se alcune lezioni le hai già viste in altro modo: quelle prima');
      console.log('     del numero che scegli contano come già viste.\n');
    }
    console.log('  0) Indietro\n');

    const scelta = (await ask('Cosa vuoi cambiare? > ')).trim();
    if (scelta === '0' || scelta === '') return;

    if (esame && Number(scelta) === nPartenza) {
      await sceltaPartenza(progresso, esame);
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
  // Prima volta (nessun esame ancora): la spiegazione compare da sola.
  if (!Object.keys(progresso.esami).length) console.log(COME_FUNZIONA);
  for (;;) {
    console.log('\n──────── Autovisualizzatore ────────\n');
    console.log(riepilogo(progresso, cfg));
    console.log('\n  1) Avvia          (oppure INVIO)');
    console.log('  2) Nuovo esame    (dopo il login apri un\'altra videoteca)');
    console.log('  3) Impostazioni');
    console.log('  4) Come funziona');
    console.log('  0) Esci\n');

    const scelta = (await ask('Scegli un numero > ')).trim();
    if (scelta === '1' || scelta === '') return 'avvia';
    if (scelta === '2') return 'nuovo';
    if (scelta === '3') await impostazioni(progresso);
    else if (scelta === '4') { console.log(COME_FUNZIONA); await ask('INVIO per tornare al menu > '); }
    else if (scelta === '0') process.exit(0);
    else console.log('  → Scelta non valida.');
  }
}
