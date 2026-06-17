// Runner principale: apre l'elenco lezioni, raccoglie gli URL, li apre TUTTI in parallelo
// (tab spoofate come "visibili") e monitora l'avanzamento di ogni video fino al 100%.
import readline from 'node:readline';
import { loadConfig, launch, readVideo, nudgePlay, sleep } from './browser.js';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

function fmt(sec) {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const cfg = loadConfig();
if (!cfg.linkSelector) {
  console.error('\nManca linkSelector in config.json (il selettore CSS dei link-lezione).');
  process.exit(1);
}

const context = await launch(cfg);
const lister = context.pages()[0] || (await context.newPage());

function filterDedupe(urls) {
  // Tiene solo gli href con tutti i linkIncludes e nessun linkExcludes.
  const inc = cfg.linkIncludes || [];
  const exc = cfg.linkExcludes || [];
  urls = urls.filter((u) => inc.every((s) => u.includes(s)) && !exc.some((s) => u.includes(s)));
  // Dedup: una sola lezione per valore del parametro indicato (es. matdidid), altrimenti per URL.
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    let key = u;
    if (cfg.dedupeByParam) {
      try { key = new URL(u).searchParams.get(cfg.dedupeByParam) ?? u; } catch (_) {}
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

// Raccoglie gli href dalla pagina indicata, col selettore configurato.
async function collectOn(page) {
  return page
    .$$eval(cfg.linkSelector || 'a[href]', (els) => els.map((e) => e.href).filter(Boolean))
    .catch(() => []);
}

const isLessonUrl = (u) => /cyberspaziomaterialedidattico\.aspx/i.test(u);

// Scrape della videoteca: vai sulla pagina-elenco e raccogli i link alle lezioni.
async function scrapeVideoteca(url) {
  try { await lister.goto(url, { waitUntil: 'domcontentloaded' }); } catch (_) {}
  // Aspetta che i link compaiano (la pagina ASP.NET può popolarli dopo il load).
  await lister.waitForSelector(cfg.linkSelector, { timeout: 15000 }).catch(() => {});
  return collectOn(lister);
}

// Input vuoto: raccoglie dalle schede già aperte (dove hai navigato tu alla videoteca).
async function scrapeOpenTabs() {
  const raw = [];
  for (const p of context.pages()) raw.push(...(await collectOn(p)));
  return raw;
}

// 1) Apri la pagina di login. 2) L'utente accede e va sulla videoteca.
try { await lister.goto(cfg.startUrl, { waitUntil: 'domcontentloaded' }); } catch (_) {}

console.log('\n──────── Autovisualizzatore ────────');
console.log('1) Fai il LOGIN nella finestra di Chrome che si è aperta.');
console.log('2) Vai alla VIDEOTECA dell\'esame che vuoi guardare.');
console.log('3) Incolla qui l\'URL della videoteca e premi INVIO');
console.log('   (oppure lascia VUOTO per usare la scheda già aperta sulla videoteca).\n');

let urls = [];
while (urls.length === 0) {
  const input = (await ask('URL videoteca (vuoto = scheda aperta)> ')).trim();
  if (isLessonUrl(input)) {
    console.log('  → Questo è l\'URL di una singola lezione. Serve l\'URL della VIDEOTECA (l\'elenco). Riprova.\n');
    continue;
  }
  const raw = input ? await scrapeVideoteca(input) : await scrapeOpenTabs();
  urls = filterDedupe(raw);
  if (urls.length === 0) {
    console.log('  → Nessuna lezione trovata. Completa il login / apri la videoteca giusta, poi riprova (INVIO).\n');
  }
}

// Per i test: maxLessons limita quante lezioni aprire (0 = tutte).
if (cfg.maxLessons && cfg.maxLessons > 0 && urls.length > cfg.maxLessons) {
  console.log(`(maxLessons=${cfg.maxLessons}: apro solo le prime ${cfg.maxLessons} di ${urls.length})`);
  urls = urls.slice(0, cfg.maxLessons);
}

const limit = cfg.concurrency && cfg.concurrency > 0 ? cfg.concurrency : urls.length;
console.log(`\nTrovate ${urls.length} lezioni. Apro fino a ${limit} in parallelo (tempo reale).\n`);

const tasks = urls.map((url, i) => ({ i: i + 1, url, page: null, done: false, status: null }));

// Apre una lezione in una nuova tab e avvia il play.
async function open(task) {
  task.page = await context.newPage();
  try {
    await task.page.goto(task.url, { waitUntil: 'domcontentloaded' });
  } catch (_) {}
  await nudgePlay(task.page);
}

// Apertura scaglionata per non sovraccaricare la rete tutto in una volta.
let opened = 0;
async function fillQueue() {
  for (const t of tasks) {
    if (t.page || t.done) continue;
    const active = tasks.filter((x) => x.page && !x.done).length;
    if (active >= limit) break;
    await open(t);
    opened++;
    await sleep(cfg.staggerMs || 1000);
  }
}

const startedAt = Date.now();
function render() {
  process.stdout.write('\x1b[2J\x1b[H'); // pulisci schermo
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  console.log(`Autovisualizzatore — ${tasks.filter((t) => t.done).length}/${tasks.length} complete — trascorso ${fmt(elapsed)}\n`);
  for (const t of tasks) {
    let bar = '         ', pct = '   ', extra = '';
    const s = t.status;
    if (t.done) {
      bar = '█████████'; pct = '100%'; extra = 'OK';
    } else if (!t.page) {
      extra = 'in coda';
    } else if (s && s.duration) {
      const r = Math.min(1, s.currentTime / s.duration);
      const n = Math.round(r * 9);
      bar = '█'.repeat(n) + '░'.repeat(9 - n);
      pct = `${String(Math.round(r * 100)).padStart(3)}%`;
      extra = `${fmt(s.currentTime)}/${fmt(s.duration)}${s.paused ? '  ⏸' : ''}`;
    } else if (s) {
      extra = `play… ${fmt(s.currentTime)}${s.paused ? '  ⏸' : ''}`;
    } else {
      extra = 'carico player…';
    }
    console.log(`  ${String(t.i).padStart(2)}. [${bar}] ${pct}  ${extra}`);
  }
  console.log('\nCtrl+C per fermare. Le tab restano aperte per inviare gli ultimi heartbeat.');
}

const pollMs = (cfg.pollSeconds || 5) * 1000;
const graceLeft = cfg.completeAtSecondsLeft ?? 3;
const maxMs = (cfg.maxMinutesPerVideo || 70) * 60 * 1000;

while (tasks.some((t) => !t.done)) {
  await fillQueue();
  for (const t of tasks) {
    if (!t.page || t.done) continue;
    const s = await readVideo(t.page);
    t.status = s;
    if (s) {
      const finishedByTime = s.duration && s.currentTime >= s.duration - graceLeft;
      if (s.ended || finishedByTime) {
        t.done = true;
        if (cfg.autoClose) { try { await t.page.close(); } catch (_) {} }
        continue;
      }
      if (s.paused) await nudgePlay(t.page); // ri-spinge il play se qualcosa l'ha messo in pausa
    }
    if (t.page && Date.now() - startedAt > maxMs && !t.done) {
      // Cap di sicurezza: non restare bloccati all'infinito su una singola lezione.
      t.done = true; t.status = { ...(s || {}), timedout: true };
    }
  }
  render();
  await sleep(pollMs);
}

render();
console.log('\nTutte le lezioni hanno raggiunto la fine.');
console.log('Controlla le percentuali nella tua homepage studente prima di chiudere il browser.');
if (!cfg.autoClose) {
  await ask('INVIO per chiudere il browser… ');
}
await context.close();
