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
  dz.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) avvia(e.dataTransfer.files[0]); });
  $("#file").addEventListener("change", (e) => { if (e.target.files[0]) avvia(e.target.files[0]); e.target.value = ""; });
  $("#btn-nuova").addEventListener("click", () => {
    $("#sez-report").hidden = true; passo(2); resetLista();
    $("#sez-upload").scrollIntoView({ behavior: "smooth" });
  });

  function passo(n) {
    document.querySelectorAll(".step").forEach((s) => {
      const k = +s.dataset.step;
      s.classList.toggle("active", k === n);
      s.classList.toggle("done", k < n);
    });
  }
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
    const u = url + (url.includes("?") ? "&" : "?") + "f=json" + (CFG.token ? "&token=" + encodeURIComponent(CFG.token) : "");
    const r = await fetch(u, body ? { method: "POST", body } : {});
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message || "errore del servizio"); e.servizio = true; throw e; }
    return j;
  }
  async function controllaSulServer(file) {
    const task = CFG.gpUrl.replace(/\/+$/, ""), servizio = task.replace(/\/[^/]+$/, "");
    ["completezza", "crs", "struttura", "valori", "dipendenze"].forEach((k) => statoControllo(k, "run"));
    stato("Invio della fornitura al servizio di validazione regionale…");
    const fd = new FormData(); fd.append("file", file);
    const up = await gp(servizio + "/uploads/upload", fd);
    const sub = new FormData();
    sub.append("fornitura", JSON.stringify({ itemID: up.item.itemID }));
    sub.append("nome_fornitura", file.name);
    const job = await gp(task + "/submitJob", sub);
    let st = job;
    for (let i = 0; i < 600 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) {
      stato(`Controllo in corso sul server (${st.jobStatus.replace("esriJob", "")})…`);
      await pausa(2000);
      st = await gp(`${task}/jobs/${job.jobId}`);
    }
    if (st.jobStatus !== "esriJobSucceeded") throw new Error("il servizio ha restituito " + st.jobStatus);
    const ris = await gp(`${task}/jobs/${job.jobId}/results/report_json`);
    const pdf = await gp(`${task}/jobs/${job.jobId}/results/report_pdf`);
    const rep = await (await fetch(ris.value.url)).json();
    mostraDaServer(rep, file.name, pdf.value && pdf.value.url);
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

  // salvato: fornitura già registrata (riapertura dallo storico); altrimenti nuova verifica da registrare
  function mostraReport(nomeFile, quadro, E, crs, salvato) {
    if (salvato) ULTIMO = salvato;
    else {
      const nErr = conta(E, (e) => e.livello === "ERRORE");
      const unico = crs.size === 1 && Object.values(CRS).find((c) => c.epsg === [...crs][0]);
      ULTIMO = { nomeFile, quadro, E, nErr, nAv: E.length - nErr, comune: $("#comune").value, strumento: $("#strumento").value,
        data: new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }),
        crsTxt: unico ? unico.nome : crs.size ? "non omogeneo" : "non rilevato",
        formato: /gdb/i.test(nomeFile) ? "gdb" : "shapefile", id: "PSC-" + Date.now().toString(36).toUpperCase() };
      if (window.SERVIZI) window.SERVIZI.registraFornitura(ULTIMO);
    }
    const { nErr, nAv, comune, strumento, data, crsTxt } = ULTIMO;
    E = ULTIMO.E; quadro = ULTIMO.quadro; nomeFile = ULTIMO.nomeFile;

    $("#esito").className = "esito " + (nErr ? "ko" : "ok");
    $("#esito").innerHTML = `<svg class="ico" style="width:2.5rem;height:2.5rem" viewBox="0 0 24 24"><path d="${nErr
      ? "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"
      : "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 15-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8l-9 9Z"}"/></svg>
      <div><div class="esito-titolo">${nErr ? "Fornitura NON CONFORME" : "Fornitura CONFORME"}</div>
      <div class="esito-meta">${esc(comune)} – ${esc(strumento)} · ${esc(nomeFile)} · ${esc(crsTxt)} · ${nErr} errori, ${nAv} avvisi · controllo n. ${ULTIMO.id} del ${data}</div></div>`;

    let q = '<table class="table table-sm tab-report"><thead><tr><th>Layer</th><th>Stato</th><th>Sistema di riferimento</th><th>Geometria</th><th class="num">Record</th><th class="num">Errori</th><th class="num">Avvisi</th></tr></thead><tbody>';
    for (const [l, x] of Object.entries(quadro)) {
      const ne = conta(E, (e) => e.layer === l && e.livello === "ERRORE"), na = conta(E, (e) => e.layer === l && e.livello === "AVVISO");
      const pill = x.stato === "presente" ? "pill-ok" : x.extra ? "pill-av" : "pill-err";
      q += `<tr class="${ne ? "errore" : ""}"><td>${esc(l)}</td><td><span class="pill ${pill}">${esc(x.stato)}</span></td><td>${esc(x.crs)}</td><td>${esc(x.geom)}</td><td class="num">${x.record}</td><td class="num">${ne}</td><td class="num">${na}</td></tr>`;
    }
    $("#tab-quadro").innerHTML = q + "</tbody></table>";

    const s = sintesi(E);
    $("#tab-sintesi").innerHTML = s.length
      ? '<table class="table table-sm tab-report"><thead><tr><th>Livello</th><th>Controllo</th><th>Layer</th><th class="num">Occorrenze</th></tr></thead><tbody>' +
        s.map((r) => `<tr class="${r[0] === "ERRORE" ? "errore" : "avviso"}"><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="num">${r[3]}</td></tr>`).join("") + "</tbody></table>"
      : '<p class="text-success">Nessun errore né avviso.</p>';

    const layers = [...new Set(E.map((e) => e.layer))].sort();
    $("#filtro-layer").innerHTML = '<option value="">tutti</option>' + layers.map((l) => `<option>${esc(l)}</option>`).join("");
    $("#filtro-livello").value = "";
    analitico();
    $("#sez-report").hidden = false;
    $("#sez-report").scrollIntoView({ behavior: "smooth" });
  }
  // riapre il report di una fornitura dello storico nella vista Verifica
  window.APP = {
    apriReport(f) { resetLista(); $("#avviso-gdb").hidden = true; mostraReport(null, null, null, null, f); },
    nascondiReport() { $("#sez-report").hidden = true; resetLista(); },
  };

  function sintesi(E) {
    const m = new Map();
    for (const e of E) { const k = [e.livello, e.controllo, e.layer].join("|"); m.set(k, (m.get(k) || 0) + 1); }
    return [...m].map(([k, n]) => [...k.split("|"), n]).sort((a, b) => (a[0] !== b[0] ? (a[0] === "ERRORE" ? -1 : 1) : a[1].localeCompare(b[1]) || a[2].localeCompare(b[2])));
  }
  function ordinati(E) { return [...E].sort((a, b) => a.layer.localeCompare(b.layer) || (a.livello !== b.livello ? (a.livello === "ERRORE" ? -1 : 1) : 0) || a.controllo.localeCompare(b.controllo) || (+a.oid || 0) - (+b.oid || 0)); }

  function analitico() {
    if (!ULTIMO) return;
    const fl = $("#filtro-layer").value, fv = $("#filtro-livello").value;
    const righe = ordinati(ULTIMO.E).filter((e) => (!fl || e.layer === fl) && (!fv || e.livello === fv));
    if (!righe.length) { $("#tab-analitico").innerHTML = '<p class="text-success">Nessuna segnalazione.</p>'; return; }
    const vis = righe.slice(0, MAX_RIGHE_VIDEO);
    $("#tab-analitico").innerHTML = '<table class="table table-sm tab-report"><thead><tr><th>Layer</th><th>OID</th><th>Campo</th><th>Livello</th><th>Controllo</th><th>Valore</th><th>Dettaglio</th></tr></thead><tbody>' +
      vis.map((e) => `<tr class="${e.livello === "ERRORE" ? "errore" : "avviso"}"><td>${esc(e.layer)}</td><td>${esc(e.oid)}</td><td>${esc(e.campo)}</td><td>${e.livello}</td><td>${esc(e.controllo)}</td><td>${esc(e.valore)}</td><td>${esc(e.dettaglio)}</td></tr>`).join("") +
      "</tbody></table>" + (righe.length > vis.length ? `<p class="small text-muted">Mostrate ${vis.length} di ${righe.length} segnalazioni: l'elenco completo è nel PDF e nel CSV.</p>` : "");
  }
  $("#filtro-layer").addEventListener("change", analitico);
  $("#filtro-livello").addEventListener("change", analitico);

  $("#btn-csv").addEventListener("click", () => {
    const rows = [["layer", "oid", "campo", "livello", "controllo", "valore", "dettaglio"]].concat(ordinati(ULTIMO.E).map((e) => [e.layer, e.oid, e.campo, e.livello, e.controllo, e.valore, e.dettaglio]));
    const csv = "﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    scarica(new Blob([csv], { type: "text/csv" }), `report_analitico_${ULTIMO.id}.csv`);
  });
  function scarica(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  // PDF sul modello dei report di Regione Lombardia: quadro della consegna, sintesi, analitico
  $("#btn-pdf").addEventListener("click", () => {
    const u = ULTIMO, { jsPDF } = window.jspdf;
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
    const meta = [["Comune", u.comune], ["Strumento", u.strumento], ["File", u.nomeFile], ["Sistema di riferimento", u.crsTxt],
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
  });
})();
