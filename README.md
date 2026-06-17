# Autovisualizzatore

Apre in parallelo le videolezioni Uninettuno e le fa scorrere fino in fondo, così la
percentuale di visualizzazione arriva al 100% senza guardarle a mano.

## Come funziona
Il player Uninettuno mette in pausa il video quando la scheda va in secondo piano
(usa la *Page Visibility API*). Questo strumento inietta in ogni pagina uno spoof che
la fa risultare sempre "visibile e in primo piano": così tutte le lezioni possono stare
in tab di un'unica finestra e proseguono comunque tutte insieme.

Stack: **Node.js + Playwright**, pilotando il **Chrome di sistema** (così l'eventuale DRM
funziona). Login SSO fatto a mano una volta: la sessione resta nel profilo `./.chrome-profile`.

## Uso
```bash
npm install                 # installa Playwright
npm run discover            # ti logghi, vai sull'elenco lezioni, estrae i link candidati
# -> fissa lessonsListUrl e linkSelector in config.json
npm start                   # apre tutte le lezioni e le porta al 100%
```

## config.json
- `lessonsListUrl` — pagina che elenca le lezioni di un esame.
- `linkSelector` — selettore CSS dei link alle singole lezioni.
- `concurrency` — `0` = tutte insieme; altrimenti max tab contemporanee.
- `autoClose` — `false` lascia le tab aperte a fine video (consigliato, così partono gli ultimi heartbeat).
- `maxMinutesPerVideo` — cap di sicurezza per lezione.

## Note
- I video vanno in **tempo reale**: aprendole tutte insieme finisci in ~durata del video più lungo,
  dentro i 120 min di validità dell'SSO.
- Strumento per il proprio account, sui propri corsi.
