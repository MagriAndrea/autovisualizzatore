// Ciò che dipende dalle pagine Uninettuno: login, videoteca, link alle lezioni.

// Il link "Esci" c'è solo da loggati. La videoteca invece si vede anche da sloggati,
// quindi i link alle lezioni non dicono niente sul login.
export async function loggato(page) {
  return (await page.$$eval('a[href*="logoff.aspx"]', (e) => e.length).catch(() => 0)) > 0;
}

export const isVideoteca = (url) => /cyberspaziovideotecaitems\.aspx/i.test(url);
export const logoffUrl = (cfg) => new URL('/it/logoff.aspx', cfg.startUrl).href;

export function courseid(url) {
  try { return new URL(url).searchParams.get('courseid') || url; } catch (_) { return url; }
}

// Link alle lezioni presenti nella pagina: filtrati come in config.json e senza doppioni.
export async function lezioniNellaPagina(page, cfg) {
  const urls = await page
    .$$eval(cfg.linkSelector, (els) => els.map((e) => e.href).filter(Boolean))
    .catch(() => []);
  const inc = cfg.linkIncludes || [];
  const exc = cfg.linkExcludes || [];
  const visti = new Set();
  const out = [];
  for (const u of urls) {
    if (!inc.every((s) => u.includes(s)) || exc.some((s) => u.includes(s))) continue;
    let chiave = u;
    try { chiave = new URL(u).searchParams.get(cfg.dedupeByParam) ?? u; } catch (_) {}
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(u);
  }
  return out;
}
