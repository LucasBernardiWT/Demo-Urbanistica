// Web Worker del controllo topologico: esegue js/topologia.js fuori dalla pagina, che resta reattiva.
// Riceve lo zip della fornitura, l'elenco dei file per layer, i dbf letti e il Comune; restituisce report e pacchetto errori.
importScripts("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/rbush@3.0.1/rbush.min.js",
  "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js",
  "topologia.js?v=20261121l");
self.onmessage = async (e) => {
  const { buf, shp, dati, comune } = e.data;
  try {
    const zip = await JSZip.loadAsync(buf);
    const r = await self.TOPOLOGIA.esegui(zip, shp, dati, comune, (f) => self.postMessage({ fase: f }));
    self.postMessage({ fine: true, rep: r.rep, zip: r.zip });
  } catch (err) {
    self.postMessage({ errore: String((err && err.message) || err) });
  }
};
