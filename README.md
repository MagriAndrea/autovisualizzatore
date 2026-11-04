# Autovisualizzatore

Fa scorrere le videolezioni Uninettuno di un esame fino in fondo, in tempo reale, così la
percentuale di visualizzazione arriva al 100% senza guardarle a mano. Tu fai solo il login,
una volta ogni due ore circa: al resto pensa il programma.

## Uso
```bash
npm install                 # installa Playwright (solo la prima volta)
npm start                   # apre il menu
```
Il menu dice quanto manca (es. *"16 lezioni da finire su 40, circa 11 h di video… 2 login"*):

- **1 — Avvia** (o INVIO): si apre Chrome e fai il login. La prima volta apri anche la
  videoteca dell'esame: il programma la riconosce da solo e se la ricorda.
- **2 — Nuovo esame**: dopo il login apri la videoteca di un altro esame.
- **3 — Impostazioni**: facoltative (vedi sotto).
- **0 — Esci**.

## Come funziona
- **Lista continua**: quando una lezione finisce, dopo 2 minuti di pausa ne parte un'altra al suo
  posto. Prima riprendono le lezioni lasciate a metà.
- **Avanzamento salvato** in `progresso.json` ogni 5 secondi (posizione e durata di ogni lezione).
  Una lezione lasciata a metà riparte dal punto salvato meno 5 minuti di margine. Ctrl+C in
  qualsiasi momento: non si perde niente.
- **Login ogni ~2 ore**: il tempo di fruizione è di 120 minuti dal login. A 115 minuti (o subito,
  se il sito avvisa che il tempo è finito) il programma salva, fa logout, ti manda una notifica
  e riapre Chrome per il login. Il Mac resta sveglio mentre il programma lavora.
- **Video insieme in automatico**: ogni 2 minuti confronta quanto è andato avanti ogni video con il
  tempo passato, e guarda la *riserva* (i secondi già scaricati). Tutti almeno al 97% e riserva
  stabile → aggiunge un video (massimo 8). Uno sotto l'80% → toglie l'ultimo aperto, che
  riprenderà dal punto salvato. Via di mezzo → lascia com'è.
- **Lezioni bloccate**: una lezione ferma da 3 minuti viene chiusa e riprovata più tardi; dopo
  3 blocchi nella stessa sessione viene lasciata stare e segnalata alla fine.
- **Chrome invisibile**: dopo il login la finestra si chiude e le lezioni girano in un Chrome senza
  finestra, con gli stessi cookie e lo stesso user agent. Il player mette in pausa i video quando
  la scheda non è visibile: uno script iniettato fa risultare ogni scheda sempre visibile.

Stack: **Node.js + Playwright**, con il **Chrome di sistema**. Il profilo è in `./.chrome-profile`.

## impostazioni.json (dal menu, facoltative)
- `videoInsieme` — quanti video insieme; `0` = automatico (consigliato).
- `invisibile` — `1` = lezioni in Chrome invisibile; `0` = in una finestra visibile.

Dal menu puoi anche **segnare come già viste** le lezioni fino a un certo numero.

## config.json (parametri tecnici)
- `sessioneMinuti` (115) — dopo quanti minuti dal login fermarsi e chiedere un nuovo login.
- `pausaTraLezioniSec` (120) — pausa tra la fine di una lezione e l'inizio della successiva.
- `margineRipresaSec` (300) / `margineStessaSessioneSec` (30) — quanto tornare indietro quando una
  lezione riparte dopo un nuovo login / nella stessa sessione.
- `bloccoMaxSec` (180) — dopo quanti secondi fermo un video è considerato bloccato.
- `finestraAutoSec` (120), `sogliaOk` (0.97), `sogliaLento` (0.8), `caloRiservaSec` (10),
  `ignoraInizioSec` (30), `autoIniziale` (3), `autoMax` (8) — regolazione automatica.
- `linkSelector`, `linkIncludes`, `linkExcludes`, `dedupeByParam` — come riconoscere i link alle lezioni.
- `notificheMac` — `false` per non ricevere notifiche.

## Note
- I video vanno in **tempo reale**: il programma non accelera e non salta pezzi da vedere.
- Strumento per il proprio account, sui propri corsi.
