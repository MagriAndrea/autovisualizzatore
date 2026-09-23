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
npm install                 # installa Playwright (solo la prima volta)
npm start                   # apre il menu
```
Il menu mostra cosa verrà fatto (es. *"Autovisualizza 8 lezioni partendo dalla lezione 35"*) e chiede un numero:

- **1 — Inizia**: apre Chrome, fai il login, vai alla videoteca dell'esame e incolla l'URL
  (o lascia vuoto per usare la scheda aperta). Le lezioni partono tutte insieme.
- **2 — Configurazione**: modifica le impostazioni qui sotto, scegliendole per numero.
- **0 — Esci**.

## impostazioni.json (modificabili dal menu)
Ogni voce ha `nome`, `valore`, `min`, `descrizione`, `note`.
- `startFromLesson` — lezione da cui partire (1 = dalla prima).
- `maxLessons` — quante lezioni guardare insieme (0 = tutte le rimanenti). Consigliato max 6-7.

## config.json (parametri tecnici)
- `lessonsListUrl` — pagina che elenca le lezioni di un esame.
- `linkSelector` — selettore CSS dei link alle singole lezioni.
- `concurrency` — `0` = tutte insieme; altrimenti max tab contemporanee.
- `autoClose` — `false` lascia le tab aperte a fine video (consigliato, così partono gli ultimi heartbeat).
- `maxMinutesPerVideo` — cap di sicurezza per lezione.

## Note
- I video vanno in **tempo reale**: aprendole tutte insieme finisci in ~durata del video più lungo,
  dentro i 120 min di validità dell'SSO.
- Strumento per il proprio account, sui propri corsi.
