// Una sessione = un login, fino a cfg.sessioneMinuti. Lista continua: quando una lezione finisce,
// dopo la pausa ne parte un'altra al suo posto. L'avanzamento si salva a ogni lettura (ogni 5 s).
import { leggiVideo, nudgePlay, salta, sleep } from './browser.js';
import { salva, stima, durata, lezioni } from './progresso.js';

const FINE_TEMPO = /fruizione|120\s*minuti/i;

function fmt(sec) {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}
const pct = (v) => `${Math.round(v * 100)}%`;

// Restituisce { motivo: 'tempo' | 'avviso' | 'finite', avviso, target }.
// 'finite' = niente più da aprire: lezioni tutte complete, o rimaste solo quelle che si bloccano.
// iniziale = numero di video con cui partire (in automatico: quello raggiunto nella sessione prima).
export async function sessione({ cfg, context, progresso, esame, nomeEsame, loginAt, iniziale }) {
  const pollMs = cfg.pollSeconds * 1000;
  const finestraMs = cfg.finestraAutoSec * 1000;
  const fineSessione = loginAt + cfg.sessioneMinuti * 60_000;
  const auto = !cfg.videoInsieme; // 0 = automatico
  let target = auto ? iniziale ?? cfg.autoIniziale : cfg.videoInsieme;
  let stato = ''; // cosa sta facendo in questo momento, se è un'attesa (es. "Apro la lezione 31…")

  const attive = []; // lezioni in riproduzione
  const inPausa = []; // lezioni finite: la scheda resta aperta durante la pausa
  const bloccate = new Map(); // id lezione → quante volte si è bloccata in questa sessione
  const eventi = [];
  let avviso = null;
  let prossimaMisura = Date.now() + finestraMs;

  const evento = (testo) => {
    eventi.push(`${new Date().toTimeString().slice(0, 5)}  ${testo}`);
    if (eventi.length > 6) eventi.shift();
  };

  // Avvisi del sito: alert() o notifiche (catturate da browser.js). Se parlano dei 120 minuti, ci fermiamo.
  function ascolta(page) {
    page.on('dialog', async (d) => {
      evento(`Avviso del sito: "${d.message()}"`);
      if (FINE_TEMPO.test(d.message())) avviso = d.message();
      await d.dismiss().catch(() => {});
    });
    page.on('console', (m) => {
      const t = m.text();
      if (!t.startsWith('[autovis-notifica]')) return;
      const msg = t.slice('[autovis-notifica]'.length).trim();
      evento(`Notifica del sito: "${msg}"`);
      if (FINE_TEMPO.test(msg)) avviso = msg;
    });
  }

  // Prossima lezione da aprire: prima quelle lasciate a metà, poi in ordine.
  function prossima() {
    const occupate = new Set([...attive, ...inPausa].map((a) => a.l.id));
    const libere = esame.lezioni.filter((l) => !l.completata && !occupate.has(l.id) && (bloccate.get(l.id) || 0) < 3);
    return libere.find((l) => l.posizione > 0) ?? libere[0] ?? null;
  }

  async function apri(l) {
    const page = await context.newPage();
    ascolta(page);
    const ora = Date.now();
    const a = { l, page, apertaAt: ora, avanzataAt: ora, partita: false, ultimaPos: null, saltoAt: 0, ripresa: false, campioni: [], s: null, vel: null };
    attive.push(a);
    try { await page.goto(l.url, { waitUntil: 'domcontentloaded' }); } catch (_) {}
    await nudgePlay(page);
  }

  async function togli(a) {
    attive.splice(attive.indexOf(a), 1);
    await a.page.close().catch(() => {});
  }

  // Appena si conosce la durata: se la lezione era già iniziata, salta al punto salvato meno il margine.
  // Margine pieno (5 min) se il punto viene da un login precedente, piccolo se da questo.
  async function riprendi(a, s, ora) {
    a.ripresa = true;
    const l = a.l;
    if (!s.dur || l.posizione <= 0) return;
    const margine = l.aggiornata < loginAt ? cfg.margineRipresaSec : cfg.margineStessaSessioneSec;
    const da = Math.min(l.posizione - margine, s.dur - 30);
    if (da <= 5) return;
    try { await salta(s.frame, da); } catch (_) { return; }
    Object.assign(a, { saltoAt: ora, avanzataAt: ora, ultimaPos: null, campioni: [] });
    evento(`Lez. ${l.n}: riprendo da ${fmt(da)} (vista fino a ${fmt(l.posizione)})`);
  }

  function completa(a, ora) {
    a.l.completata = true;
    a.l.posizione = a.l.durata ?? a.l.posizione;
    a.l.aggiornata = ora;
    attive.splice(attive.indexOf(a), 1);
    inPausa.push({ l: a.l, page: a.page, finoA: ora + cfg.pausaTraLezioniSec * 1000 });
    evento(`Lez. ${a.l.n} completata`);
  }

  async function controlla(a, ora) {
    const s = await leggiVideo(a.page);
    a.s = s;
    if (!s) return;
    const l = a.l;
    if (s.dur) l.durata = Math.round(s.dur);
    if (!a.ripresa) {
      if (s.dur || ora - a.apertaAt > 60_000) await riprendi(a, s, ora);
      if (a.saltoAt === ora) return;
    }
    if (a.ultimaPos != null && s.pos > a.ultimaPos + 0.5) { a.avanzataAt = ora; a.partita = true; }
    a.ultimaPos = s.pos;
    if (s.pos > l.posizione) { l.posizione = Math.floor(s.pos); l.aggiornata = ora; }

    a.campioni.push({ t: ora, pos: s.pos, riserva: s.riserva, finoAllaFine: s.finoAllaFine });
    while (a.campioni.length && a.campioni[0].t < ora - finestraMs - pollMs) a.campioni.shift();
    const recenti = a.campioni.filter((c) => c.t >= ora - 30_000); // velocità degli ultimi 30 s, per lo schermo
    a.vel = recenti.length >= 2 ? (recenti.at(-1).pos - recenti[0].pos) / ((recenti.at(-1).t - recenti[0].t) / 1000) : null;

    if (s.ended || (s.dur && s.pos >= s.dur - cfg.completeAtSecondsLeft)) return completa(a, ora);
    if (s.paused) await nudgePlay(a.page);
  }

  // Ogni finestraAutoSec: velocità (video avanzato / tempo passato) e riserva di ogni video.
  // Conta solo i video già partiti, ignorando i primi ignoraInizioSec dopo l'apertura o un salto.
  // Una lezione che non parte proprio non è un problema di rete: la gestisce il controllo dei blocchi.
  async function misura(ora) {
    const inizio = ora - finestraMs;
    const media = (arr) => arr.reduce((x, c) => x + c.riserva, 0) / arr.length;
    const misure = [];
    for (const a of attive) {
      if (!a.partita || !a.l.durata) continue;
      const da = Math.max(inizio, a.apertaAt + cfg.ignoraInizioSec * 1000, a.saltoAt + cfg.ignoraInizioSec * 1000);
      const c = a.campioni.filter((x) => x.t >= da);
      if (c.length < 3 || c.at(-1).t - c[0].t < finestraMs * 0.6) continue;
      const vel = (c.at(-1).pos - c[0].pos) / ((c.at(-1).t - c[0].t) / 1000);
      const terzo = Math.max(1, Math.floor(c.length / 3));
      const naturale = c.some((x) => x.finoAllaFine); // video scaricato fino in fondo: la riserva cala da sola
      const inCalo = !naturale && media(c.slice(-terzo)) < media(c.slice(0, terzo)) - cfg.caloRiservaSec;
      misure.push({ a, vel, inCalo });
    }
    if (!misure.length) return;

    const lente = misure.filter((m) => m.vel < cfg.sogliaLento);
    if (lente.length) {
      const minimo = target === 1;
      target = Math.max(1, target - 1);
      const lento = pct(Math.min(...lente.map((m) => m.vel)));
      evento(`${lente.length} video sotto ${pct(cfg.sogliaLento)} (il più lento ${lento}): ${minimo ? 'già al minimo, 1' : `scendo a ${target}`}`);
      if (attive.length + inPausa.length > target && attive.length > 1) {
        const ultima = attive.reduce((x, y) => (y.apertaAt > x.apertaAt ? y : x));
        evento(`Chiudo la lez. ${ultima.l.n}: riprenderà dal punto salvato`);
        await togli(ultima);
      }
      return;
    }
    const piena = misure.every((m) => m.vel >= cfg.sogliaOk && !m.inCalo);
    if (piena && misure.length === attive.length && attive.length + inPausa.length >= target && target < cfg.autoMax && prossima()) {
      target++;
      evento(`tutti a velocità piena e riserva stabile: salgo a ${target}`);
    }
  }

  function schermo(ora) {
    const st = stima(esame);
    const r = [];
    r.push(`Autovisualizzatore — esame ${nomeEsame} — ${st.totali - st.rimaste}/${st.totali} lezioni complete`);
    const alle = new Date(fineSessione).toTimeString().slice(0, 5);
    const minuti = Math.ceil((fineSessione - ora) / 60_000);
    r.push(`Prossima richiesta di login alle ${alle} (tra ${minuti < 1 ? 'meno di un minuto' : durata(minuti * 60)})`);
    r.push(`Video insieme: ${target}${auto ? ` (automatico, max ${cfg.autoMax})` : ' (numero fisso)'}`);
    if (stato) r.push('', `→ ${stato}`);
    r.push('');
    r.push('  lez.  avanzamento        tempo              velocità  riserva');
    for (const a of attive) {
      const s = a.s, dur = a.l.durata, pos = s ? s.pos : 0;
      let bar = ' '.repeat(10), perc = '    ';
      if (dur) {
        const q = Math.min(1, pos / dur), n = Math.round(q * 10);
        bar = '█'.repeat(n) + '░'.repeat(10 - n);
        perc = pct(q).padStart(4);
      }
      const tempo = s && (a.partita || pos > 0) ? `${fmt(pos)} / ${fmt(dur)}` : 'carico il player…';
      const vel = a.vel == null || !a.partita ? '-' : pct(a.vel);
      const ris = s ? `${Math.round(s.riserva)} s` : '-';
      r.push(`  ${String(a.l.n).padStart(3)}  [${bar}] ${perc}  ${tempo.padEnd(18)} ${vel.padStart(6)}   ${ris.padStart(6)}`);
    }
    for (const p of inPausa) r.push(`  ${String(p.l.n).padStart(3)}  completata — pausa ancora ${fmt((p.finoA - ora) / 1000)}`);
    if (!attive.length && !inPausa.length && !stato) r.push('  (nessuna lezione aperta)');
    r.push('');
    r.push(`Da guardare: ${lezioni(st.rimaste)}, circa ${durata(st.secondi)} di video.`);
    if (eventi.length) r.push('', 'Ultimi eventi:', ...eventi.map((e) => `  ${e}`));
    r.push('', 'Ctrl+C per fermare: l\'avanzamento è salvato.');
    process.stdout.write('\x1b[2J\x1b[H' + r.join('\n') + '\n');
  }

  function fine(motivo) {
    salva(progresso);
    stato = 'Avanzamento salvato. Faccio logout e chiudo Chrome…';
    schermo(Date.now());
    return { motivo, avviso, target };
  }

  for (;;) {
    let ora = Date.now();
    if (avviso) return fine('avviso');
    if (ora >= fineSessione) return fine('tempo');

    // Pause finite: chiudi la scheda e libera il posto.
    for (const p of [...inPausa]) {
      if (ora >= p.finoA) {
        inPausa.splice(inPausa.indexOf(p), 1);
        await p.page.close().catch(() => {});
      }
    }
    // Posti liberi: apri le prossime lezioni.
    while (attive.length + inPausa.length < target) {
      const l = prossima();
      if (!l) break;
      stato = `Apro la lezione ${l.n}…`;
      schermo(Date.now());
      await apri(l);
      if (attive.length + inPausa.length < target) await sleep(cfg.staggerMs);
    }
    stato = '';
    if (!attive.length && !inPausa.length) return fine('finite');

    for (const a of [...attive]) {
      ora = Date.now();
      await controlla(a, ora);
      if (attive.includes(a) && ora - a.avanzataAt > cfg.bloccoMaxSec * 1000) {
        bloccate.set(a.l.id, (bloccate.get(a.l.id) || 0) + 1);
        evento(`Lez. ${a.l.n} ferma da ${cfg.bloccoMaxSec} s: la chiudo e la riprovo più tardi`);
        await togli(a);
      }
    }
    if (auto && Date.now() >= prossimaMisura) {
      await misura(Date.now());
      prossimaMisura = Date.now() + finestraMs;
    }
    salva(progresso);
    schermo(Date.now());
    await sleep(pollMs);
  }
}
