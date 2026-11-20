// Mockup "Consegna PSC/PSA" del Geoportale Regione Calabria.
// Il controllo degli shapefile gira nel browser e applica le regole esportate dal gdb template
// (js/regole_qtrp.js, generato da esporta_regole_js.py): stesse regole di valida_attributi.py.
(function () {
  "use strict";
  const R = window.REGOLE_QTRP;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Sistemi di riferimento ammessi, riconosciuti dal nome PROJCS del .prj (formato Esri)
  const CRS = {
    "WGS_1984_UTM_Zone_33N": { epsg: 32633, nome: "WGS84 / UTM 33N (EPSG:32633)" },
    "RDN2008_UTM_zone_33N": { epsg: 7792, nome: "RDN2008 / UTM 33N (EPSG:7792)" },
  };
  const TIPI_POLIGONO = [5, 15, 25];
  const MAX_RIGHE_VIDEO = 500;

  // ---------------------------------------------------------------- 1. template
  function aggiornaTemplate() {
    const crs = document.querySelector("input[name=crs]:checked").value;
    const fmt = document.querySelector("input[name=fmt]:checked").value;
    const nome = `QTRP_PSC_Template_${crs}_${fmt}.zip`;
    $("#btn-template").href = "download/" + nome;
    $("#btn-template").setAttribute("download", nome);
    $("#nome-template").textContent = nome;
  }
  document.querySelectorAll("input[name=crs], input[name=fmt]").forEach((i) => i.addEventListener("change", aggiornaTemplate));
  aggiornaTemplate();

  function tabellaTemplate() {
    $("#n-layer").textContent = `${R.layer.length} layer`;
    $("#origine-regole").textContent = R.origine;
    let h = '<table class="table table-sm tab-report"><thead><tr><th>Layer</th><th>Campo</th><th>Compilazione</th><th>Valori ammessi</th></tr></thead><tbody>';
    for (const l of R.layer) {
      const figli = {};
      for (const d of l.dipendenze) figli[d.campi[1]] = d.campi[0];
      l.campi.forEach((c, i) => {
        let comp = c.obbligatorio ? "obbligatorio" : figli[c.nome] ? `dipende da ${figli[c.nome]}` : "facoltativo";
        let val = c.valori ? c.valori.join(" · ") : `testo libero (max ${c.lunghezza})`;
        h += `<tr>${i === 0 ? `<td rowspan="${l.campi.length}"><strong>${esc(l.nome)}</strong></td>` : ""}<td>${esc(c.nome)}</td><td>${comp}</td><td>${esc(val)}</td></tr>`;
      });
    }
    $("#tabella-template").innerHTML = h + "</tbody></table>";
  }
  tabellaTemplate();
  document.querySelectorAll("[data-toggle-target]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = document.getElementById(b.dataset.toggleTarget);
      const open = !t.classList.contains("show");
      t.classList.toggle("show", open);
      b.classList.toggle("collapsed", !open);
      b.setAttribute("aria-expanded", open);
    }));

  // ---------------------------------------------------------------- 2. caricamento
  const dz = $("#dropzone");
  dz.addEventListener("click", (e) => { if (e.target.tagName !== "INPUT" && e.target.tagName !== "LABEL") $("#file").click(); });
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  // il file scelto resta in attesa: il controllo parte da "Carica e valida"
  let fileScelto = null;
  function scegli(f) {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) { alert("Carica un archivio .zip"); return; }
    fileScelto = f;
    $("#dz-testo").innerHTML = `<strong>${esc(f.name)}</strong> <span class="text-muted">(${(f.size / 1e6).toFixed(1)} MB)</span>`;
    dz.classList.add("scelto");
    pronto();
  }
  // Comune: testo libero con suggerimenti, valido solo se e' un comune della Calabria (si normalizza la grafia)
  // Menu a tendina con tutti i comuni della regione, filtrabile scrivendo
  const COMUNI = window.COMUNI_CALABRIA || [];
  const inCom = $("#comune"), lista = $("#lista-comuni");
  let attivo = -1;
  function comuneValido() {
    const v = inCom.value.trim().toLowerCase();
    return COMUNI.find((c) => c.toLowerCase() === v) || null;
  }
  function apriLista(tutti) {
    const q = tutti ? "" : inCom.value.trim().toLowerCase();
    const voci = COMUNI.filter((c) => c.toLowerCase().includes(q));
    lista.innerHTML = voci.length
      ? voci.map((c, i) => `<li role="option" data-c="${esc(c)}" id="com-${i}">${esc(c)}</li>`).join("")
      : '<li class="vuota">Nessun Comune trovato</li>';
    lista.hidden = false; lista.scrollTop = 0; inCom.setAttribute("aria-expanded", "true"); attivo = -1;
    const sel = lista.querySelector(`li[data-c="${CSS.escape(inCom.value)}"]`);
    if (sel) { sel.classList.add("attivo"); sel.scrollIntoView({ block: "nearest" }); }
  }
  function chiudiLista() { lista.hidden = true; inCom.setAttribute("aria-expanded", "false"); }
  function scegliComune(c) { inCom.value = c; chiudiLista(); pronto(); }
  inCom.addEventListener("focus", () => apriLista(true));
  inCom.addEventListener("click", () => { if (lista.hidden) apriLista(true); });
  inCom.addEventListener("input", () => { apriLista(false); pronto(); });
  inCom.addEventListener("keydown", (e) => {
    const voci = [...lista.querySelectorAll("li[data-c]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (lista.hidden) apriLista(true);
      attivo = Math.max(0, Math.min(voci.length - 1, attivo + (e.key === "ArrowDown" ? 1 : -1)));
      voci.forEach((li, i) => li.classList.toggle("attivo", i === attivo));
      if (voci[attivo]) { voci[attivo].scrollIntoView({ block: "nearest" }); inCom.setAttribute("aria-activedescendant", voci[attivo].id); }
    } else if (e.key === "Enter") {
      e.preventDefault(); const v = voci[attivo] || (voci.length === 1 ? voci[0] : null); if (v) scegliComune(v.dataset.c);
    } else if (e.key === "Escape") chiudiLista();
  });
  lista.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-c]"); if (li) { e.preventDefault(); scegliComune(li.dataset.c); } });
  inCom.addEventListener("blur", () => { chiudiLista(); const c = comuneValido(); if (c) inCom.value = c; pronto(); });
  function pronto() {
    const testo = $("#comune").value.trim();
    const mancano = [!$("#titolo-fornitura").value.trim() && "titolo", !comuneValido() && (testo ? "un Comune della Calabria valido" : "Comune"), !fileScelto && "archivio"].filter(Boolean);
    $("#btn-carica").disabled = mancano.length > 0;
    $("#carica-help").textContent = mancano.length ? "Manca: " + mancano.join(", ") + "." : "";
  }
  dz.addEventListener("drop", (e) => scegli(e.dataTransfer.files[0]));
  $("#file").addEventListener("change", (e) => { scegli(e.target.files[0]); e.target.value = ""; });
  $("#titolo-fornitura").addEventListener("input", pronto);
  $("#comune").addEventListener("change", pronto);
  $("#btn-carica").addEventListener("click", () => { $("#btn-carica").disabled = true; avvia(fileScelto).finally(pronto); });
  function nuovaFornitura() {
    fileScelto = null; $("#titolo-fornitura").value = ""; dz.classList.remove("scelto");
    $("#dz-testo").textContent = "Trascina qui lo zip con la cartella degli shapefile o con il File Geodatabase";
    $("#sez-report").hidden = true; $("#avviso-gdb").hidden = true; resetLista(); pronto();
  }
  $("#btn-nuova").addEventListener("click", nuovaFornitura);
  function passo() { /* nessun indicatore di passi in questa versione */ }
  function resetLista() { document.querySelectorAll("#lista-controlli li").forEach((li) => li.classList.remove("run", "ok", "ko", "warn")); }
  function statoControllo(k, s) { const li = document.querySelector(`#lista-controlli li[data-k=${k}]`); li.classList.remove("run", "ok", "ko", "warn"); if (s) li.classList.add(s); }
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  function stato(t) { $("#stato-testo").textContent = t; }

  // ---------------------------------------------------------------- lettura shapefile
  function leggiDbf(buf, encoding) {
    const dv = new DataView(buf);
    const n = dv.getUint32(4, true), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true);
    const dec = new TextDecoder(encoding);
    const campi = [];
    let off = 1;
    for (let p = 32; p < hlen - 1 && dv.getUint8(p) !== 0x0d; p += 32) {
      const nome = dec.decode(new Uint8Array(buf, p, 11)).replace(/\0.*$/, "").trim();
      campi.push({ nome, tipo: String.fromCharCode(dv.getUint8(p + 11)), lunghezza: dv.getUint8(p + 16), off });
      off += dv.getUint8(p + 16);
    }
    const righe = [];
    for (let i = 0; i < n; i++) {
      const base = hlen + i * rlen;
      if (base + rlen > buf.byteLength) break;
      if (dv.getUint8(base) === 0x2a) continue; // record cancellato
      const r = { __oid: i };
      for (const c of campi) r[c.nome] = dec.decode(new Uint8Array(buf, base + c.off, c.lunghezza)).replace(/\0/g, "").trimEnd();
      righe.push(r);
    }
    return { campi, righe };
  }
  function nomeProj(txt) { const m = /PROJCS\["([^"]+)"/.exec(txt || ""); return m ? m[1] : null; }

  // ---------------------------------------------------------------- controlli
  async function avvia(file) {
    if (!/\.zip$/i.test(file.name)) { alert("Carica un archivio .zip"); return; }
    window.__ultimoFile = file; // conservato con la fornitura per visualizzare le tavole sulla mappa
    $("#sez-report").hidden = true; $("#avviso-gdb").hidden = true;
    $("#stato-elaborazione").hidden = false; resetLista(); passo(2);
    const E = [];
    const err = (layer, controllo, o = {}) => E.push({ layer, oid: o.oid ?? "", campo: o.campo ?? "", livello: o.livello || "ERRORE", controllo, valore: o.valore ?? "", dettaglio: o.dettaglio ?? "" });
    try {
      statoControllo("archivio", "run"); stato(`Lettura di ${file.name}…`);
      const zip = await JSZip.loadAsync(file);
      const nomi = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
      await pausa(400);
      const isGdb = nomi.some((n) => /\.gdb\//i.test(n));
      if (CFG.gpUrl && (isGdb || CFG.serverAncheShapefile)) {
        statoControllo("archivio", "ok");
        await controllaSulServer(file);
        await avviaTopologia(file);
        return;
      }
      if (isGdb) {
        statoControllo("archivio", "ok");
        $("#stato-elaborazione").hidden = true;
        const gdb = nomi.find((n) => /\.gdb\//i.test(n)).match(/([^/]+\.gdb)\//i)[1];
        $("#avviso-gdb").innerHTML = `<strong>File Geodatabase rilevato: ${esc(gdb)}.</strong> Il controllo dei geodatabase, compreso il confronto delle codelist
          con il template di riferimento, è eseguito dal servizio di geoprocessing regionale, non ancora collegato a questo mockup.
          Per la dimostrazione carica una fornitura in formato shapefile.`;
        $("#avviso-gdb").hidden = false;
        return;
      }
      // raggruppa i file per shapefile (nome senza estensione, in qualunque cartella dello zip)
      const shp = {};
      for (const n of nomi) {
        const m = /([^/]+)\.(shp|shx|dbf|prj|cpg)$/i.exec(n);
        if (!m) continue;
        (shp[m[1].toLowerCase()] ??= { nome: m[1] })[m[2].toLowerCase()] = n;
      }
      statoControllo("archivio", Object.keys(shp).length ? "ok" : "ko");
      if (!Object.keys(shp).length) err("—", "Nessuno shapefile nell'archivio");

      // completezza
      statoControllo("completezza", "run"); stato("Verifica della completezza della fornitura…"); await pausa(400);
      const attesi = Object.fromEntries(R.layer.map((l) => [l.nome.toLowerCase(), l]));
      const quadro = {};
      for (const l of R.layer) {
        quadro[l.nome] = { stato: shp[l.nome.toLowerCase()] ? "presente" : "MANCANTE", crs: "–", geom: "–", record: "–" };
        if (!shp[l.nome.toLowerCase()]) err(l.nome, "Layer mancante");
      }
      for (const k in shp) if (!attesi[k] && shp[k].shp) { quadro[shp[k].nome] = { stato: "in eccesso", crs: "–", geom: "–", record: "–", extra: true }; err(shp[k].nome, "Layer in eccesso", { livello: "AVVISO" }); }
      for (const l of R.layer) {
        const s = shp[l.nome.toLowerCase()];
        if (s) for (const ext of ["shp", "shx", "dbf", "prj"]) if (!s[ext]) err(l.nome, "File mancante", { valore: `${l.nome}.${ext}` });
      }
      statoControllo("completezza", E.some((e) => e.livello === "ERRORE") ? "ko" : "ok");

      // sistema di riferimento e geometria
      statoControllo("crs", "run"); stato("Verifica del sistema di riferimento…"); await pausa(400);
      const crsTrovati = new Set();
      for (const l of R.layer) {
        const s = shp[l.nome.toLowerCase()]; if (!s) continue;
        if (s.prj) {
          const p = nomeProj(await zip.file(s.prj).async("string"));
          if (CRS[p]) { quadro[l.nome].crs = `EPSG:${CRS[p].epsg}`; crsTrovati.add(CRS[p].epsg); }
          else { quadro[l.nome].crs = p || "non leggibile"; err(l.nome, "Sistema di riferimento non ammesso", { valore: p || "", dettaglio: "ammessi EPSG:7792 o EPSG:32633" }); }
        }
        if (s.shp) {
          const head = await zip.file(s.shp).async("arraybuffer");
          const t = new DataView(head).getInt32(32, true);
          quadro[l.nome].geom = TIPI_POLIGONO.includes(t) ? "poligono" : `tipo ${t}`;
          if (!TIPI_POLIGONO.includes(t)) err(l.nome, "Tipo geometria errato", { valore: `tipo shape ${t}`, dettaglio: "atteso poligono" });
        }
      }
      if (crsTrovati.size > 1) err("—", "Sistemi di riferimento non omogenei", { valore: [...crsTrovati].map((c) => "EPSG:" + c).join(", "), dettaglio: "tutti i layer devono usare lo stesso sistema" });
      statoControllo("crs", E.some((e) => /riferimento|geometria/.test(e.controllo)) ? "ko" : "ok");

      // struttura, valori, dipendenze
      statoControllo("struttura", "run"); stato("Verifica della struttura dei campi…"); await pausa(300);
      const dati = {};
      for (const l of R.layer) {
        const s = shp[l.nome.toLowerCase()]; if (!s || !s.dbf) continue;
        const cpg = s.cpg ? (await zip.file(s.cpg).async("string")).trim().toLowerCase() : "";
        const enc = /utf-?8/.test(cpg) ? "utf-8" : "windows-1252";
        const dbf = leggiDbf(await zip.file(s.dbf).async("arraybuffer"), enc);
        dati[l.nome] = dbf; quadro[l.nome].record = dbf.righe.length;
        const presenti = Object.fromEntries(dbf.campi.map((c) => [c.nome.toLowerCase(), c]));
        for (const c of l.campi) {
          const f = presenti[c.nome.toLowerCase()];
          if (!f) err(l.nome, "Campo mancante", { campo: c.nome });
          else if (f.tipo !== "C") err(l.nome, "Tipo campo errato", { campo: c.nome, valore: f.tipo, dettaglio: "atteso testo" });
          else if (f.lunghezza < c.lunghezza) err(l.nome, "Lunghezza campo insufficiente", { campo: c.nome, valore: f.lunghezza, dettaglio: `attesa ${c.lunghezza}`, livello: "AVVISO" });
        }
        // Id, Shape_Leng e Shape_Area sono aggiunti in automatico da ArcGIS: ignorati, come in valida_attributi.py
        const nomiAttesi = new Set(l.campi.map((c) => c.nome.toLowerCase()).concat(["id", "shape_leng", "shape_area"]));
        for (const f of dbf.campi) if (!nomiAttesi.has(f.nome.toLowerCase())) err(l.nome, "Campo in eccesso", { campo: f.nome, livello: "AVVISO" });
        if (!dbf.righe.length) err(l.nome, "Layer vuoto");
      }
      statoControllo("struttura", E.some((e) => /Campo|Tipo campo|Lunghezza/.test(e.controllo)) ? (E.some((e) => /Campo mancante|Tipo campo/.test(e.controllo)) ? "ko" : "warn") : "ok");

      statoControllo("valori", "run"); statoControllo("dipendenze", "run");
      stato("Verifica della compilazione degli attributi e delle codelist…"); await pausa(300);
      for (const l of R.layer) {
        const dbf = dati[l.nome]; if (!dbf) continue;
        const reale = Object.fromEntries(dbf.campi.map((c) => [c.nome.toLowerCase(), c.nome]));
        const campi = l.campi.filter((c) => reale[c.nome.toLowerCase()]);
        const gruppi = l.dipendenze.filter((d) => d.campi.every((n) => reale[n.toLowerCase()]));
        for (const r of dbf.righe) {
          const v = {}, fuori = new Set();
          for (const c of campi) { const x = r[reale[c.nome.toLowerCase()]]; v[c.nome] = x && x.trim() ? x : null; }
          for (const c of campi) {
            const x = v[c.nome];
            if (x === null) { if (c.obbligatorio) err(l.nome, "Attributo obbligatorio non compilato", { campo: c.nome, oid: r.__oid }); continue; }
            if (x.length > c.lunghezza) err(l.nome, "Valore troppo lungo", { campo: c.nome, oid: r.__oid, valore: x.slice(0, 60), dettaglio: `max ${c.lunghezza} caratteri` });
            if (c.valori && !c.valori.includes(x)) {
              fuori.add(c.nome);
              const h = c.valori.find((a) => a.trim().toLowerCase() === x.trim().toLowerCase());
              err(l.nome, "Valore fuori dominio", { campo: c.nome, oid: r.__oid, valore: x, dettaglio: h ? `forse '${h}' (maiuscole/spazi)` : "valore non presente nella codelist" });
            }
          }
          for (const g of gruppi) {
            if (g.campi.some((n) => fuori.has(n))) continue;
            const combo = g.campi.map((n) => v[n]);
            if (combo[0] === null) continue;
            if (!g.combinazioni.some((k) => k.every((x, i) => x === combo[i]))) {
              const amm = g.combinazioni.filter((k) => k[0] === combo[0]).map((k) => k[1] ?? "<vuoto>").sort();
              err(l.nome, "Combinazione non ammessa (codelist dipendente)", { campo: g.campi.join("/"), oid: r.__oid,
                valore: combo.map((x) => x ?? "<vuoto>").join(" / "), dettaglio: "ammessi: " + amm.join(", ") });
            }
          }
        }
      }
      await pausa(300);
      statoControllo("valori", E.some((e) => /obbligatorio|fuori dominio|troppo lungo/.test(e.controllo)) ? "ko" : "ok");
      statoControllo("dipendenze", E.some((e) => /dipendente/.test(e.controllo)) ? "ko" : "ok");
      $("#stato-elaborazione").hidden = true;
      mostraReport(file.name, quadro, E, crsTrovati);
      await avviaTopologia(file, { zip, shp, dati });
    } catch (e) {
      $("#stato-elaborazione").hidden = true;
      if (e.servizio || /fetch/i.test(e.message)) {
        resetLista(); statoControllo("archivio", "ok");
        $("#avviso-gdb").innerHTML = `<strong>Il servizio di validazione regionale non ha completato il controllo.</strong> Risposta del servizio: ${esc(e.message)}`;
        $("#avviso-gdb").hidden = false;
      } else {
        statoControllo("archivio", "ko");
        alert("Impossibile leggere l'archivio: " + e.message);
      }
    }
  }

  // ---------------------------------------------------------------- controllo sul servizio di geoprocessing
  // Web tool ValidazionePSC.pyt pubblicato su ArcGIS Enterprise: upload dello zip, submitJob, attesa, lettura di report.json.
  const CFG = window.CONFIG_MOCKUP || {};
  async function gp(url, body) {
    // nelle POST multipart ArcGIS Server legge f e token solo dal corpo del form, non dall'indirizzo
    if (body) { body.append("f", "json"); if (CFG.token) body.append("token", CFG.token); }
    const u = body ? url : url + (url.includes("?") ? "&" : "?") + "f=json" + (CFG.token ? "&token=" + encodeURIComponent(CFG.token) : "");
    const r = await fetch(u, body ? { method: "POST", body } : {});
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message || "errore del servizio"); e.servizio = true; throw e; }
    return j;
  }
  // upload dello zip sul servizio, submitJob con i parametri, attesa della fine; restituisce i risultati richiesti
  async function eseguiJob(taskUrl, file, parametri, risultati, avanzamento) {
    const task = taskUrl.replace(/\/+$/, ""), servizio = task.replace(/\/[^/]+$/, "");
    const fd = new FormData(); fd.append("file", file);
    const up = await gp(servizio + "/uploads/upload", fd);
    const sub = new FormData();
    sub.append("fornitura", JSON.stringify({ itemID: up.item.itemID }));
    for (const [k, v] of Object.entries(parametri)) sub.append(k, v);
    const job = await gp(task + "/submitJob", sub);
    let st = job;
    for (let i = 0; i < 900 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) {
      avanzamento(st.jobStatus.replace("esriJob", ""));
      await pausa(2000);
      st = await gp(`${task}/jobs/${job.jobId}`);
    }
    if (st.jobStatus !== "esriJobSucceeded") throw Object.assign(new Error("il servizio ha restituito " + st.jobStatus), { servizio: true });
    const out = {};
    for (const r of risultati) { const x = await gp(`${task}/jobs/${job.jobId}/results/${r}`); out[r] = x.value && (x.value.url || x.value); }
    return out;
  }
  async function controllaSulServer(file) {
    ["completezza", "crs", "struttura", "valori", "dipendenze"].forEach((k) => statoControllo(k, "run"));
    stato("Invio della fornitura al servizio di validazione regionale…");
    // uscite testuali: la cartella dei job non e' raggiungibile da geohub-coll
    const r = await eseguiJob(CFG.gpUrl, file, { nome_fornitura: file.name }, ["report_json_testo", "report_pdf_b64"],
      (s) => stato(`Controllo in corso sul server (${s})…`));
    mostraDaServer(JSON.parse(r.report_json_testo), file.name, null);
  }
  const daBase64 = (s, tipo) => new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], { type: tipo });

  // il calcolo gira in un Web Worker: la pagina resta reattiva e mostra l'avanzamento
  async function topologiaInWorker(file, shp, dati, comune, fase) {
    const w = new Worker("js/topologia_worker.js?v=20261121l"), buf = await file.arrayBuffer();
    try {
      return await new Promise((ok, ko) => {
        w.onmessage = (e) => { const m = e.data; if (m.fase) fase(m.fase); else if (m.fine) ok(m); else if (m.errore) ko(new Error(m.errore)); };
        w.onerror = (e) => ko(new Error(e.message || "errore nel calcolo"));
        w.postMessage({ buf, shp, dati, comune }, [buf]);
      });
    } finally { w.terminate(); }
  }
  // Controllo topologico: nel browser per gli shapefile (js/topologia.js), sul web tool regionale per i gdb.
  // Report PDF e pacchetto errori conservati nel browser con la fornitura; alla fine l'esito unico della fornitura.
  async function avviaTopologia(file, ctx) {
    const u = ULTIMO, id = u && u.id;
    const fase = (s) => { const x = $("#topo-stato"); if (x) x.textContent = s; };
    let rep, pdf, zip, formato;
    statoControllo("topologia", "run");
    try {
      if (ctx && window.TOPOLOGIA) {
        attesa("Attributi controllati. Controllo topologico in corso…");
        ({ rep, zip } = await topologiaInWorker(file, ctx.shp, ctx.dati, u.comune, fase));
        pdf = window.TOPOLOGIA.pdf(rep, u); formato = "shp";
      } else if (CFG.topoUrl) {
        formato = $("#formato-errori").value;
        attesa("Attributi controllati. Controllo topologico in corso sul server, può richiedere alcuni minuti…");
        const r = await eseguiJob(CFG.topoUrl, file, { nome_fornitura: file.name, comune: u.comune, formato_errori: formato },
          ["report_json_testo", "report_pdf_b64", "errori_zip_b64"], (s) => fase(`(${s})`));
        rep = JSON.parse(r.report_json_testo);
        pdf = daBase64(r.report_pdf_b64, "application/pdf"); zip = daBase64(r.errori_zip_b64, "application/zip");
      } else {
        statoControllo("topologia", "warn");
        esitoFinale(null, null, null);
        return;
      }
    } catch (e) {
      statoControllo("topologia", "ko");
      esitoFinale(null, null, "controllo topologico non eseguito: " + (e.message || e));
      return;
    }
    const topo = { esito: rep.esito, errori: rep.errori, avvisi: rep.avvisi, formato };
    statoControllo("topologia", rep.errori ? "ko" : rep.avvisi ? "warn" : "ok");
    if (window.SERVIZI) {
      await window.SERVIZI.salvaFile(id + ":topo_pdf", pdf); await window.SERVIZI.salvaFile(id + ":topo_zip", zip);
      window.SERVIZI.aggiornaFornitura(id, { topologia: topo });
    }
    esitoFinale(topo, { pdf: URL.createObjectURL(pdf), zip: URL.createObjectURL(zip) }, null);
  }

  // riquadro neutro mentre i controlli sono in corso: nessun esito finche' attributi e topologia non sono conclusi
  function attesa(testo) {
    $("#esito").className = "esito attesa";
    $("#esito").innerHTML = `<span class="giro"></span><div><div class="esito-titolo">Verifica in corso</div>
      <div class="esito-meta">${esc(testo)} <span id="topo-stato"></span></div></div>`;
    $("#esito-nota").innerHTML = ""; $("#azioni-report").hidden = true;
    $("#sez-report").hidden = false;
  }

  // esito unico della fornitura: stessa regola che decide se la fornitura e' utilizzabile per le tavole
  function esitoFinale(topo, link, problemaTopo) {
    const u = ULTIMO, id = u.id;
    const uso = window.SERVIZI ? window.SERVIZI.statoUso({ ...u, topologia: topo || undefined }) : { ok: !u.nErr, motivo: "" };
    const ok = uso.ok && !problemaTopo;
    const presenti = Object.values(u.quadro).filter((x) => x.stato === "presente").length;
    const prime = sintesi(u.E).filter((r) => r[0] === "ERRORE").slice(0, 3).map((r) => `${r[1]} (${r[2]}: ${r[3]})`);
    const tTopo = topo ? `topologia ${topo.errori} errori, ${topo.avvisi} avvisi` : "topologia non verificata";
    $("#esito").className = "esito " + (ok ? "ok" : "ko");
    $("#esito").innerHTML = `<svg class="ico" style="width:2.5rem;height:2.5rem;flex-shrink:0" viewBox="0 0 24 24"><path d="${ok
      ? "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 15-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8l-9 9Z"
      : "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"}"/></svg>
      <div><div class="esito-titolo">${ok ? "Fornitura CONFORME" : "Fornitura NON CONFORME"}</div>
      <div class="esito-meta">${esc(u.titolo)} · ${esc(u.comune)} – ${esc(u.strumento)} · ${presenti} layer su ${R.layer.length} · ${esc(u.crsTxt)}</div>
      <div class="esito-meta">Attributi ${u.nErr} errori, ${u.nAv} avvisi · ${tTopo}</div></div>`;
    const motivi = [];
    if (u.nErr) motivi.push(`attributi non conformi${prime.length ? ` (principali errori: ${prime.join("; ")})` : ""}`);
    if (topo && topo.errori) motivi.push(`${topo.errori} errori topologici (geometrie, sovrapposizioni): vedi il report topologico e il pacchetto errori`);
    if (problemaTopo) motivi.push(problemaTopo);
    else if (!ok && !u.nErr && !(topo && topo.errori) && uso.motivo) motivi.push(uso.motivo);
    $("#esito-nota").innerHTML = ok
      ? `<div class="msg msg-info">Attributi e topologia conformi: la fornitura è salvata in <a href="#/forniture">Le mie forniture</a> ed è utilizzabile per la <a href="#/tavole">composizione delle tavole</a>.${uso.motivo ? `<div class="small mt-1">Nota: ${esc(uso.motivo)}.</div>` : ""}</div>`
      : `<div class="msg msg-warn">La fornitura è salvata in <a href="#/forniture">Le mie forniture</a>, ma <strong>non è utilizzabile per la composizione delle tavole</strong>. Correggi e ricaricala.
         <ul class="small mb-0 mt-1">${motivi.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>`;
    const tp = $("#btn-topo-pdf"), tz = $("#btn-topo-zip");
    tp.hidden = tz.hidden = !link;
    if (link) {
      tp.href = link.pdf; tp.download = `report_topologia_${id}.pdf`;
      tz.href = link.zip; tz.download = `errori_topologia_${id}_${topo.formato}.zip`;
      tz.textContent = `Pacchetto errori topologici (${topo.formato === "gdb" ? "File Geodatabase" : "shapefile"})`;
    }
    $("#azioni-report").hidden = false;
    $("#sez-report").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  // Report JSON prodotto da valida_attributi.py -> stessa visualizzazione del controllo nel browser
  function mostraDaServer(rep, nomeFile, pdfUrl) {
    const E = rep.segnalazioni.map((e) => ({ ...e, oid: e.oid === "" ? "" : e.oid }));
    const has = (re) => E.some((e) => re.test(e.controllo));
    statoControllo("completezza", has(/Layer mancante|Layer vuoto/) ? "ko" : "ok");
    statoControllo("crs", has(/riferimento|geometria/) ? "ko" : "ok");
    statoControllo("struttura", has(/Campo mancante|Tipo campo/) ? "ko" : has(/Campo in eccesso|Lunghezza|Template modificato/) ? "warn" : "ok");
    statoControllo("valori", has(/obbligatorio|fuori dominio|troppo lungo/) ? "ko" : "ok");
    statoControllo("dipendenze", has(/dipendente/) ? "ko" : "ok");
    $("#stato-elaborazione").hidden = true;
    mostraReport(nomeFile, rep.quadro, E, new Set(rep.epsg));
    ULTIMO.pdfServer = pdfUrl || null;
  }
  window.__mostraDaServer = mostraDaServer; // usato per le prove senza server

  // ---------------------------------------------------------------- 3. report
  let ULTIMO = null;
  const conta = (E, f) => E.filter(f).length;

  // nuova verifica: registra la fornitura (conforme o no) e mostra solo l'esito; il dettaglio e' nel PDF
  function mostraReport(nomeFile, quadro, E, crs) {
    const nErr = conta(E, (e) => e.livello === "ERRORE"), nAv = E.length - nErr;
    const unico = crs.size === 1 && Object.values(CRS).find((c) => c.epsg === [...crs][0]);
    ULTIMO = { titolo: $("#titolo-fornitura").value.trim(), nomeFile, quadro, E, nErr, nAv, comune: comuneValido() || $("#comune").value.trim(), strumento: $("#strumento").value,
      data: new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }),
      crsTxt: unico ? unico.nome : crs.size ? "non omogeneo" : "non rilevato",
      formato: /gdb/i.test(nomeFile) ? "gdb" : "shapefile", id: "PSC-" + Date.now().toString(36).toUpperCase() };
    if (window.SERVIZI) window.SERVIZI.registraFornitura(ULTIMO);

    attesa("Attributi controllati. Avvio del controllo topologico…");
  }
  window.APP = {
    reportPdf(f) { creaPdf(f); },
    nascondiReport() { $("#sez-report").hidden = true; $("#avviso-gdb").hidden = true; resetLista(); },
  };

  function sintesi(E) {
    const m = new Map();
    for (const e of E) { const k = [e.livello, e.controllo, e.layer].join("|"); m.set(k, (m.get(k) || 0) + 1); }
    return [...m].map(([k, n]) => [...k.split("|"), n]).sort((a, b) => (a[0] !== b[0] ? (a[0] === "ERRORE" ? -1 : 1) : a[1].localeCompare(b[1]) || a[2].localeCompare(b[2])));
  }
  function ordinati(E) { return [...E].sort((a, b) => a.layer.localeCompare(b.layer) || (a.livello !== b.livello ? (a.livello === "ERRORE" ? -1 : 1) : 0) || a.controllo.localeCompare(b.controllo) || (+a.oid || 0) - (+b.oid || 0)); }

  $("#btn-csv").addEventListener("click", () => {
    const rows = [["layer", "oid", "campo", "livello", "controllo", "valore", "dettaglio"]].concat(ordinati(ULTIMO.E).map((e) => [e.layer, e.oid, e.campo, e.livello, e.controllo, e.valore, e.dettaglio]));
    const csv = "﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    scarica(new Blob([csv], { type: "text/csv" }), `report_analitico_${ULTIMO.id}.csv`);
  });
  function scarica(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  // PDF sul modello dei report di Regione Lombardia: quadro della consegna, sintesi, analitico
  $("#btn-pdf").addEventListener("click", () => creaPdf(ULTIMO));
  function creaPdf(u) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const BLU = [0, 102, 204], ROSSO = [192, 0, 0], VERDE = [46, 125, 50], AV = [178, 106, 0];
    doc.setFillColor(...BLU); doc.rect(0, 0, 210, 24, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("Regione Calabria – Geoportale", 14, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Dipartimento Territorio e Tutela dell'Ambiente · Consegna digitale PSC/PSA", 14, 18);
    doc.setTextColor(0, 38, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("Report di controllo della fornitura", 14, 36);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
    const meta = [["Titolo", u.titolo || "–"], ["Comune", u.comune], ["Strumento", u.strumento], ["File", u.nomeFile], ["Sistema di riferimento", u.crsTxt],
      ["Template di riferimento", R.origine], ["Controllo n.", u.id], ["Data", u.data]];
    let y = 43;
    for (const [k, v] of meta) { doc.setFont("helvetica", "bold"); doc.text(k + ":", 14, y); doc.setFont("helvetica", "normal"); doc.text(String(v), 58, y); y += 5; }
    y += 2;
    doc.setFillColor(...(u.nErr ? ROSSO : VERDE)); doc.rect(14, y, 182, 12, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`Esito: ${u.nErr ? "NON CONFORME" : "CONFORME"}  –  ${u.nErr} errori, ${u.nAv} avvisi`, 18, y + 8);
    y += 18;
    const tit = (t) => { doc.setTextColor(0, 38, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(t, 14, y); y += 3; };
    const tab = (head, body, colori, extra = {}) => {
      doc.autoTable(Object.assign({ startY: y, head: [head], body, theme: "grid", margin: { left: 14, right: 14, bottom: 16 },
        styles: { fontSize: 8, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1, overflow: "linebreak" },
        headStyles: { fillColor: [217, 226, 243], textColor: [0, 38, 77], fontStyle: "bold" },
        didParseCell: (d) => { if (d.section === "body" && colori && colori[d.row.index]) d.cell.styles.textColor = colori[d.row.index]; } }, extra));
      y = doc.lastAutoTable.finalY + 9;
    };
    tit("1. Quadro della consegna");
    const qr = Object.entries(u.quadro).map(([l, x]) => [l, x.stato, x.crs, x.geom, x.record,
      conta(u.E, (e) => e.layer === l && e.livello === "ERRORE"), conta(u.E, (e) => e.layer === l && e.livello === "AVVISO")]);
    tab(["Layer", "Stato", "Sist. riferimento", "Geometria", "Record", "Errori", "Avvisi"], qr, qr.map((r) => (r[5] ? ROSSO : r[1] === "in eccesso" ? AV : null)));
    tit("2. Sintesi per controllo");
    const s = sintesi(u.E);
    if (s.length) tab(["Livello", "Controllo", "Layer", "Occorrenze"], s, s.map((r) => (r[0] === "ERRORE" ? ROSSO : AV)));
    else { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40); doc.text("Nessun errore né avviso.", 14, y + 3); y += 10; }
    tit("3. Elenco analitico");
    const an = ordinati(u.E);
    if (an.length) tab(["Layer", "OID", "Campo", "Liv.", "Controllo", "Valore", "Dettaglio"], an.map((e) => [e.layer, e.oid, e.campo, e.livello, e.controllo, e.valore, e.dettaglio]),
      an.map((e) => (e.livello === "ERRORE" ? ROSSO : AV)), { styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" }, columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 11 }, 2: { cellWidth: 24 }, 3: { cellWidth: 15 }, 6: { cellWidth: 45 } } });
    else { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40); doc.text("Nessuna segnalazione.", 14, y + 3); y += 10; }
    if (y > 260) { doc.addPage(); y = 20; }
    tit("4. Controlli geometrici e topologici");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
    doc.text(doc.splitTextToSize("Non eseguiti in questa versione: qualità delle geometrie, sovrapposizioni, copertura del territorio comunale rispetto al limite ISTAT (tolleranza 20 m).", 182), 14, y + 3);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130);
      doc.text(`Controllo n. ${u.id} · ${u.comune}`, 14, 290);
      doc.text(`Pagina ${i} di ${n}`, 196, 290, { align: "right" });
    }
    doc.save(`report_controllo_${u.id}.pdf`);
  }
})();
