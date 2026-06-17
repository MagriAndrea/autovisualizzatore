// Step interattivo: ti logghi a mano, vai sulla pagina con l'elenco delle lezioni,
// e questo script estrae i link candidati + salva l'HTML, così fissiamo il selettore.
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, launch, ROOT, ensureDir } from './browser.js';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

// Raggruppa gli href per "pattern" (le cifre diventano #) per scovare la lista di lezioni.
function patternOf(href) {
  try {
    const u = new URL(href);
    return u.origin + u.pathname.replace(/\d+/g, '#');
  } catch (_) {
    return href.replace(/\d+/g, '#');
  }
}

async function dumpPage(page, idx, outDir) {
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.href,
      text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      classes: a.className || '',
      id: a.id || '',
    }));
  });
  const html = await page.content();
  fs.writeFileSync(path.join(outDir, `page-${idx}.html`), html);
  fs.writeFileSync(path.join(outDir, `links-${idx}.json`), JSON.stringify({ url: page.url(), links }, null, 2));
  return { url: page.url(), links };
}

const cfg = loadConfig();
const outDir = path.join(ROOT, 'discovered');
ensureDir(outDir);

console.log('\n[1/3] Avvio Chrome col profilo persistente…');
const context = await launch(cfg);
const page = context.pages()[0] || (await context.newPage());

try {
  await page.goto(cfg.startUrl || 'about:blank', { waitUntil: 'domcontentloaded' });
} catch (_) {
  console.log('  (startUrl non raggiunto, naviga pure a mano nel browser)');
}

console.log('\n[2/3] Nel browser appena aperto:');
console.log('  1. Effettua il login SSO.');
console.log('  2. Vai alla pagina che ELENCA le videolezioni di un esame.');
console.log('  3. Torna qui e premi INVIO.\n');
await ask('Premi INVIO quando sei sulla pagina-elenco… ');

console.log('\n[3/3] Estrazione link da tutte le schede aperte…\n');
const pages = context.pages();
const groups = new Map();
for (let i = 0; i < pages.length; i++) {
  const { url, links } = await dumpPage(pages[i], i + 1, outDir);
  console.log(`Scheda ${i + 1}: ${url}  (${links.length} link)`);
  for (const l of links) {
    const p = patternOf(l.href);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(l);
  }
}

// Mostra i gruppi più numerosi: il più grande è quasi sempre la lista delle lezioni.
const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
console.log('\nGruppi di link per pattern (i più numerosi sono i candidati lezioni):\n');
for (const [pattern, items] of ranked) {
  const ex = items[0];
  const cls = ex.classes ? `  class="${ex.classes}"` : '';
  console.log(`  ${String(items.length).padStart(3)}×  ${pattern}`);
  console.log(`        es: "${ex.text}" -> ${ex.href}${cls}`);
}

console.log(`\nHTML e link salvati in: ${path.relative(ROOT, outDir)}/`);
console.log('Mandami questo output (o il contenuto di discovered/links-*.json) e ti fisso io');
console.log('lessonsListUrl + linkSelector nel config.\n');
console.log('Lascio il browser aperto: chiudilo tu quando vuoi (oppure Ctrl+C qui).');

// Non chiudo il context: così resti loggato nel profilo per il run successivo.
