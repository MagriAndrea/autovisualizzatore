// Avvio: menu, poi giri "login → lezioni fino a ~115 minuti → nuovo login" finché le lezioni sono finite.
// L'avanzamento di ogni lezione è in progresso.json: si riprende sempre da dove si era rimasti.
import { loadConfig, launch, launchInvisible, sleep } from './browser.js';
import { menu } from './menu.js';
import { carica, salva, aggiornaEsame, esameCorrente, stima, durata, lezioni } from './progresso.js';
import { sessione } from './sessione.js';
import { loggato, isVideoteca, courseid, logoffUrl, lezioniNellaPagina } from './sito.js';
import { tieniSveglio, notifica } from './mac.js';

const progresso = carica();
const scelta = await menu(progresso, loadConfig());
const cfg = loadConfig(); // ricaricata: dal menu potresti aver cambiato le impostazioni
let nuovoEsame = scelta === 'nuovo' || !esameCorrente(progresso);

if (!nuovoEsame && stima(esameCorrente(progresso)).rimaste === 0) {
  console.log('\nLe lezioni di questo esame sono già tutte complete. Scegli "Nuovo esame" per un altro.');
  process.exit(0);
}

// Ctrl+C: salva subito. Playwright poi chiude Chrome ed esce; se Chrome non è aperto, esco io.
process.on('SIGINT', () => {
  try { salva(progresso); } catch (_) {}
  console.log('\nFermato. Avanzamento salvato.');
  setTimeout(() => process.exit(130), 3000);
});
tieniSveglio();

// Ripete fn() ogni 2 secondi finché restituisce qualcosa.
async function attendi(fn) {
  for (;;) {
    const r = await fn();
    if (r) return r;
    await sleep(2000);
  }
}

// Apre Chrome visibile, fa logout (così i 120 minuti partono da un login nuovo) e aspetta il tuo login.
async function login(giro) {
  process.stdout.write('\x1b[2J\x1b[H');
  console.log(`──────── Login${giro > 1 ? ` n. ${giro}` : ''} ────────\n`);
  console.log('Apro Chrome e la pagina di Uninettuno…');
  const context = await launch(cfg);
  const page = context.pages()[0] || (await context.newPage());
  try { await page.goto(logoffUrl(cfg), { waitUntil: 'domcontentloaded' }); } catch (_) {}
  try { await page.goto(cfg.startUrl, { waitUntil: 'domcontentloaded' }); } catch (_) {}

  console.log('\nFai il LOGIN nella finestra di Chrome che si è aperta.');
  if (nuovoEsame) console.log('Poi apri la VIDEOTECA dell\'esame da guardare: il programma la riconosce da solo.');
  console.log('');

  const loginAt = await attendi(async () => {
    for (const p of context.pages()) if (await loggato(p)) return Date.now();
    return null;
  });
  console.log('Login riconosciuto.');

  let id, esame;
  if (nuovoEsame) {
    console.log('Aspetto che tu apra la videoteca dell\'esame…');
    const v = await attendi(async () => {
      for (const p of context.pages()) {
        if (!isVideoteca(p.url())) continue;
        const urls = await lezioniNellaPagina(p, cfg);
        if (urls.length) return { url: p.url(), urls };
      }
      return null;
    });
    id = courseid(v.url);
    esame = aggiornaEsame(progresso, id, v.url, v.urls, cfg.dedupeByParam);
    nuovoEsame = false;
  } else {
    // Esame già noto: vado io alla videoteca e aggiorno l'elenco (se compaiono lezioni nuove).
    id = progresso.esameCorrente;
    const salvato = progresso.esami[id];
    console.log('Apro la videoteca dell\'esame e controllo l\'elenco delle lezioni…');
    try { await page.goto(salvato.videoteca, { waitUntil: 'domcontentloaded' }); } catch (_) {}
    await page.waitForSelector(cfg.linkSelector, { timeout: 15000 }).catch(() => {});
    const urls = await lezioniNellaPagina(page, cfg);
    esame = urls.length ? aggiornaEsame(progresso, id, salvato.videoteca, urls, cfg.dedupeByParam) : salvato;
  }
  salva(progresso);
  console.log(`Esame ${id}: ${esame.lezioni.length} lezioni, ${stima(esame).rimaste} da finire.`);
  return { context, page, id, esame, loginAt };
}

let insieme; // in automatico, il numero di video raggiunto nella sessione precedente
for (let giro = 1; ; giro++) {
  const { context, page, id, esame, loginAt } = await login(giro);
  let ctx = context;
  if (cfg.invisibile === 1) {
    // Porta i cookie del login in un Chrome senza finestra, con lo stesso user agent.
    console.log('Chiudo la finestra di Chrome e passo a Chrome invisibile…');
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
    const storageState = await context.storageState();
    await context.close();
    ctx = await launchInvisible(cfg, { storageState, userAgent });
  }

  const esito = await sessione({ cfg, context: ctx, progresso, esame, nomeEsame: id, loginAt, iniziale: insieme });
  insieme = esito.target;
  salva(progresso);
  // Logout anche qui: la sessione vecchia si chiude subito, invece di restare aperta sul server.
  const uscita = await ctx.newPage().catch(() => null);
  if (uscita) await uscita.goto(logoffUrl(cfg), { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await ctx.close().catch(() => {});
  await ctx.browser()?.close().catch(() => {}); // solo per Chrome invisibile

  const st = stima(esame);
  if (st.rimaste === 0) {
    notifica(cfg, 'Tutte le lezioni sono complete!');
    console.log(`\nTutte le ${st.totali} lezioni dell'esame ${id} sono complete.`);
    console.log('Controlla le percentuali nella tua pagina studente.');
    break;
  }
  if (esito.motivo === 'finite') {
    const n = esame.lezioni.filter((l) => !l.completata).map((l) => l.n);
    notifica(cfg, 'Alcune lezioni non partono: controllale a mano');
    console.log(`\nLe lezioni n. ${n.join(', ')} si sono bloccate 3 volte e le ho lasciate stare.`);
    console.log('Aprile a mano per controllare. Al prossimo avvio verranno riprovate.');
    break;
  }
  const perche = esito.motivo === 'avviso'
    ? `il sito ha avvisato: "${esito.avviso}"`
    : `sono passati ${cfg.sessioneMinuti} minuti dal login`;
  const manca = st.rimaste === 1 ? 'Manca' : 'Mancano';
  notifica(cfg, `Rifai il login per continuare: ${manca.toLowerCase()} ${lezioni(st.rimaste)}`);
  console.log(`\nSessione finita: ${perche}. Avanzamento salvato.`);
  console.log(`${manca} ${lezioni(st.rimaste)} (circa ${durata(st.secondi)} di video). Riapro Chrome per il login…`);
  await sleep(3000);
}
process.exit(0);
