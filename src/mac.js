// Cose del Mac: tenerlo sveglio mentre il programma lavora e mandare notifiche.
import { spawn, execFile } from 'node:child_process';

// Impedisce lo stop per inattività finché questo programma resta aperto.
export function tieniSveglio() {
  const p = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true });
  p.on('error', () => {}); // non su Mac: pazienza
  p.unref();
}

export function notifica(cfg, testo) {
  process.stdout.write('\x07'); // campanello del terminale
  if (cfg.notificheMac === false) return;
  const t = testo.replace(/["\\]/g, '');
  execFile('osascript', ['-e', `display notification "${t}" with title "Autovisualizzatore" sound name "Glass"`], () => {});
}
