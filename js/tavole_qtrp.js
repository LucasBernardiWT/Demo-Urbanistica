// Catalogo delle tavole del PSC/PSA: non e' scritto nel codice, si legge da regole_tavole_qtrp.json
// (sorgente in 3 - Scripts/regole_tavole_qtrp.json). Ordine di lettura:
//   1. item del Portal indicato in CONFIG_MOCKUP.tavoleItem (il JSON, oppure uno zip che lo contiene:
//      il Portal rifiuta i .json caricati come GeoJSON);
//   2. copia locale js/regole_tavole_qtrp.json, se l'item non e' indicato o non e' raggiungibile.
// Espone window.TAVOLE_QTRP (macro -> tavole) e la promessa window.TAVOLE_PRONTE.
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};

  async function leggi(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer(), b = new Uint8Array(buf);
    if (b[0] === 0x50 && b[1] === 0x4b) { // "PK": zip
      const zip = await JSZip.loadAsync(buf);
      const f = Object.values(zip.files).find((x) => !x.dir && /\.json$/i.test(x.name));
      if (!f) throw new Error("nessun JSON nello zip");
      return JSON.parse(await f.async("string"));
    }
    return JSON.parse(new TextDecoder("utf-8").decode(buf));
  }

  const portal = (CFG.portalUrl || "https://geohub-coll.regione.calabria.it/portal").replace(/\/+$/, "");
  window.TAVOLE_PRONTE = (async () => {
    let dati = null;
    if (CFG.tavoleItem) {
      try { dati = await leggi(`${portal}/sharing/rest/content/items/${CFG.tavoleItem}/data`); }
      catch (e) { console.warn("Catalogo tavole dal Portal non disponibile, uso la copia locale:", e.message); }
    }
    if (!dati) dati = await leggi("js/regole_tavole_qtrp.json?v=" + Date.now());
    window.TAVOLE_QTRP = dati.macro.map((m) => ({ macro: m.nome, tavole: m.tavole }));
    return window.TAVOLE_QTRP;
  })();
})();
