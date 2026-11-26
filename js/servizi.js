// Area PSC/PSA: navigazione fra i servizi, storico forniture, composizione e gestione tavole, invio.
// Nel mockup lo stato e' nel browser: metadati in localStorage, zip delle forniture in IndexedDB
// (servono a mostrare le tavole sulla mappa). Nel servizio reale starebbero sul server regionale.
// parte quando il catalogo delle tavole (js/tavole_qtrp.js) e' stato letto
window.TAVOLE_PRONTE.then(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LAYER = window.REGOLE_QTRP.layer.map((l) => l.nome);
  const CAT = window.TAVOLE_QTRP;
  { const n = document.getElementById("n-tavole-minime"); if (n) n.textContent = CAT.flatMap((g) => g.tavole).filter((t) => t.layer.length).length; }
  const TAV = Object.fromEntries(CAT.flatMap((g) => g.tavole.map((t) => [t.codice, { ...t, macro: g.macro }])));
  // nei filtri compaiono solo i Comuni con forniture caricate (l'elenco completo serve solo al caricamento)
  const comuniConDati = () => [...new Set(leggi().forniture.map((f) => f.comune))].sort((a, b) => a.localeCompare(b, "it"));
  const MAX_SEGNALAZIONI = 2000;
  const ora = () => new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

  const VISTE = {
    home: ["Pianificazione comunale – PSC/PSA", "Servizi per la redazione, la verifica e la consegna dei Piani Strutturali Comunali secondo il QTRP."],
    template: ["Template e regole", "Il template dei dati previsto dal QTRP (Tomo IV, Allegato 2) e le regole con cui vengono controllate le forniture."],
    verifica: ["Carica e verifica la fornitura", "Carica i dati del piano: vengono validati rispetto al template del QTRP e salvati con il report."],
    forniture: ["Le mie forniture", "Storico delle verifiche e versione di lavoro di ogni Comune."],
    tavole: ["Composizione delle tavole", "Le tavole del piano previste dal QTRP, collegate ai layer della versione di lavoro."],
    gestione: ["Visualizza, modifica e valida le tavole", "Le tavole salvate o inviate, sulla mappa e con il controllo di coerenza."],
    tavola: ["Tavola", ""],
    invio: ["Invio alla Regione", "Consegna ufficiale del piano: dati, tavole e ricevuta."],
  };

  // ---------------------------------------------------------------- stato
  const VUOTO = () => ({ forniture: [], lavoro: {}, tavole: [], invii: [] });
  function leggi() { try { return JSON.parse(localStorage.getItem("psc_mockup_v2")) || VUOTO(); } catch (e) { return VUOTO(); } }
  function scrivi(s) { try { localStorage.setItem("psc_mockup_v2", JSON.stringify(s)); } catch (e) { /* storage pieno o bloccato */ } }
  const lavoro = (s, c) => s.forniture.find((f) => f.id === s.lavoro[c]) || null;
  // Una fornitura e' utilizzabile per tavole e invio se e' conforme negli attributi e nella topologia (errori
  // topologici bloccanti). Gli shapefile si controllano nel browser; per i gdb serve il servizio regionale
  // (topoUrl): senza servizio il requisito e' sospeso per i gdb.
  const topologiaRichiesta = (f) => f.formato !== "gdb" || !!(window.CONFIG_MOCKUP || {}).topoUrl;
  function statoUso(f) {
    if (f.nErr) return { ok: false, motivo: "attributi non conformi" };
    if (!topologiaRichiesta(f)) return { ok: true, motivo: f.topologia ? "" : "topologia non verificata (File Geodatabase, servizio non collegato)" };
    if (!f.topologia) return { ok: false, motivo: "in attesa del controllo topologico" };
    if (f.topologia.errori) return { ok: false, motivo: "errori topologici" };
    return { ok: true, motivo: "" };
  }
  let comuneCorrente = "";
  try { comuneCorrente = localStorage.getItem("psc_mockup_comune") || ""; } catch (e) { /* default */ }

  // IndexedDB per gli zip delle forniture
  function idb() {
    return new Promise((ok, ko) => { const r = indexedDB.open("psc_mockup", 1); r.onupgradeneeded = () => r.result.createObjectStore("zip"); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  }
  async function zipSalva(id, blob) { try { const db = await idb(); db.transaction("zip", "readwrite").objectStore("zip").put(blob, id); } catch (e) { /* non disponibile */ } }
  async function zipLeggi(id) {
    try { const db = await idb(); return await new Promise((ok) => { const r = db.transaction("zip").objectStore("zip").get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); }
    catch (e) { return null; }
  }
  async function zipElimina(id) {
    try { const st = (await idb()).transaction("zip", "readwrite").objectStore("zip"); for (const k of [id, id + ":topo_pdf", id + ":topo_zip"]) st.delete(k); }
    catch (e) { /* ignora */ }
  }
  function scaricaBlob(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  // Versione di lavoro: genera in bozza le tavole con layer minimi previsti dal catalogo QTRP che ancora
  // mancano e ricollega tutte le bozze del Comune alla nuova versione (layer minimi sempre presenti).
  function impostaLavoro(s, comune, id) {
    s.lavoro[comune] = id;
    for (const g of CAT) for (const t of g.tavole) {
      if (!t.layer.length) continue;
      if (s.tavole.some((x) => x.comune === comune && x.stato === "bozza" && x.base === t.codice)) continue;
      s.tavole.push({ id: "T" + Date.now().toString(36) + t.codice, comune, base: t.codice, codice: t.multipla ? `${t.codice}_1` : t.codice,
        titolo: t.nome, scala: "1:5.000", layer: [...t.layer], minimi: [...t.layer], pdf: null, fornitura: id,
        stato: "bozza", automatica: true, creata: ora() });
    }
    s.tavole.filter((x) => x.comune === comune && x.stato === "bozza").forEach((x) => {
      x.fornitura = id;
      x.minimi = TAV[x.base].layer.slice();
      x.layer = [...new Set([...x.minimi, ...x.layer])];
    });
  }

  window.SERVIZI = {
    aggiornaFornitura(id, dati) {
      const s = leggi(), f = s.forniture.find((x) => x.id === id);
      if (!f) return;
      Object.assign(f, dati);
      if (statoUso(f).ok && !s.lavoro[f.comune]) impostaLavoro(s, f.comune, f.id); // diventa utilizzabile dopo la topologia
      scrivi(s);
    },
    statoUso: (f) => statoUso(f),
    salvaFile: (chiave, blob) => zipSalva(chiave, blob),
    registraFornitura(f) {
      const s = leggi();
      s.forniture.unshift({ ...f, E: f.E.slice(0, MAX_SEGNALAZIONI), troncato: f.E.length > MAX_SEGNALAZIONI });
      if (statoUso(f).ok && !s.lavoro[f.comune]) impostaLavoro(s, f.comune, f.id); // la prima utilizzabile diventa versione di lavoro
      scrivi(s);
      if (window.__ultimoFile && f.formato === "shapefile") zipSalva(f.id, window.__ultimoFile);
    },
  };

  // selettori del Comune: uno per servizio, sincronizzati sul Comune corrente
  function popolaComuni() {
    const comuni = comuniConDati();
    if (!comuni.includes(comuneCorrente)) comuneCorrente = comuni[0] || "";
    document.querySelectorAll(".sel-comune").forEach((sel) => {
      const tutti = sel.dataset.tutti, prev = sel.value;
      sel.innerHTML = comuni.length
        ? (tutti ? '<option value="">tutti i Comuni</option>' : "") + comuni.map((c) => `<option>${esc(c)}</option>`).join("")
        : '<option value="">nessun Comune con forniture</option>';
      sel.value = tutti ? (comuni.includes(prev) ? prev : "") : comuneCorrente;
      sel.onchange = () => { if (sel.value) { comuneCorrente = sel.value; try { localStorage.setItem("psc_mockup_comune", comuneCorrente); } catch (e) { /* ignora */ } } vai(); };
    });
  }

  // ---------------------------------------------------------------- navigazione
  function vai() {
    const [vista, arg] = location.hash.replace(/^#\/?/, "").split("/");
    const v = VISTE[vista] ? vista : "home";
    document.querySelectorAll(".vista").forEach((d) => (d.hidden = d.dataset.vista !== v));
    popolaComuni();
    $("#band-titolo").textContent = VISTE[v][0];
    $("#band-sottotitolo").textContent = VISTE[v][1];
    $("#barra-contesto").hidden = v === "home";
    document.title = `${VISTE[v][0]} – Geoportale Regione Calabria`;
    if (v === "verifica") window.APP.nascondiReport();
    if (v === "forniture") forniture();
    if (v === "tavole") tavole();
    if (v === "gestione") gestione();
    if (v === "tavola") scheda(arg);
    if (v === "invio") invio();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", vai);

  // ---------------------------------------------------------------- le mie forniture
  function forniture() {
    const s = leggi(), fc = $("#f-comune").value;
    const elenco = s.forniture.filter((f) => !fc || f.comune === fc);
    if (!elenco.length) {
      $("#lista-forniture").innerHTML = '<div class="vuoto">Nessuna verifica eseguita. <a href="#/verifica">Esegui una verifica</a>.</div>';
      return;
    }
    $("#lista-forniture").innerHTML = '<div class="table-responsive"><table class="table table-sm tab-report align-middle"><thead><tr><th>Data</th>' + (fc ? "" : "<th>Comune</th>") +
      '<th>Fornitura</th><th>Formato</th><th>Sistema di riferimento</th><th>Esito</th><th class="num">Errori</th><th class="num">Avvisi</th><th>Topologia</th><th></th></tr></thead><tbody>' +
      elenco.map((f) => `<tr>
        <td>${esc(f.data)}</td>${fc ? "" : `<td>${esc(f.comune)}</td>`}
        <td><strong>${esc(f.titolo || f.nomeFile)}</strong>${s.lavoro[f.comune] === f.id ? ' <span class="pill pill-blu">versione di lavoro</span>' : ""}
          <div class="small text-muted">${esc(f.strumento || "")} · ${esc(f.nomeFile)}${statoUso(f).motivo ? ` · <span class="${statoUso(f).ok ? "" : "text-danger"}">${statoUso(f).ok ? "" : "non utilizzabile per le tavole: "}${esc(statoUso(f).motivo)}</span>` : ""}</div></td>
        <td>${esc(f.formato || "")}</td><td>${esc(f.crsTxt)}</td>
        <td><span class="pill ${f.nErr ? "pill-err" : "pill-ok"}">${f.nErr ? "non conforme" : "conforme"}</span></td>
        <td class="num">${f.nErr}</td><td class="num">${f.nAv}</td>
        <td class="text-nowrap">${f.topologia ? `<span class="pill ${f.topologia.errori ? "pill-err" : "pill-ok"}">${f.topologia.errori ? "non conforme" : "conforme"}</span>
          <button class="btn btn-link btn-xs p-0" data-file="${f.id}:topo_pdf" data-nome="report_topologia_${f.id}.pdf" type="button">PDF</button> ·
          <button class="btn btn-link btn-xs p-0" data-file="${f.id}:topo_zip" data-nome="errori_topologia_${f.id}_${f.topologia.formato || "shp"}.zip" type="button">errori</button>`
          : '<span class="small text-muted">non eseguita</span>'}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-outline-primary btn-xs" data-pdf="${f.id}" type="button">Report PDF</button>
          ${statoUso(f).ok && s.lavoro[f.comune] !== f.id ? `<button class="btn btn-outline-primary btn-xs" data-lavoro="${f.id}" type="button">Usa come versione di lavoro</button>` : ""}
          <button class="btn btn-link btn-xs text-danger" data-elimina="${f.id}" type="button">Elimina</button>
        </td></tr>`).join("") + "</tbody></table></div>";
    document.querySelectorAll("[data-file]").forEach((b) => b.addEventListener("click", async () => {
      const blob = await zipLeggi(b.dataset.file);
      blob ? scaricaBlob(blob, b.dataset.nome) : alert("File non disponibile in questo browser: ricarica la fornitura.");
    }));
    document.querySelectorAll("[data-pdf]").forEach((b) => b.addEventListener("click", () => window.APP.reportPdf(leggi().forniture.find((x) => x.id === b.dataset.pdf))));
    document.querySelectorAll("[data-lavoro]").forEach((b) => b.addEventListener("click", () => {
      const s = leggi(), f = s.forniture.find((x) => x.id === b.dataset.lavoro); impostaLavoro(s, f.comune, f.id); scrivi(s); forniture();
    }));
    document.querySelectorAll("[data-elimina]").forEach((b) => b.addEventListener("click", () => {
      const s = leggi(), f = s.forniture.find((x) => x.id === b.dataset.elimina);
      s.forniture = s.forniture.filter((x) => x.id !== f.id);
      if (s.lavoro[f.comune] === f.id) delete s.lavoro[f.comune];
      scrivi(s); zipElimina(f.id); forniture();
    }));
  }

  // ---------------------------------------------------------------- composizione tavole
  let modifica = null, dopoSalva = null; // id tavola in modifica; vista a cui tornare
  $("#tv-codice").innerHTML = CAT.map((g) => `<optgroup label="${esc(g.macro)}">` +
    g.tavole.map((t) => `<option value="${t.codice}">${t.codice} – ${esc(t.nome)}${t.layer.length ? " ●" : ""}</option>`).join("") + "</optgroup>").join("");

  // minimi: layer minimi bloccati (tavole generate in automatico); gli altri si aggiungono o tolgono liberamente
  function layerForm(sel, minimi = []) {
    const t = TAV[$("#tv-codice").value], l = lavoro(leggi(), comuneCorrente);
    if (!l) { $("#tv-layer").innerHTML = '<p class="small text-muted mb-0">Nessuna versione di lavoro: i layer saranno disponibili dopo una verifica conforme.</p>'; return; }
    $("#tv-layer").innerHTML = LAYER.map((n) => {
      const min = minimi.includes(n), prev = t.layer.includes(n), on = min || (sel ? sel.includes(n) : prev);
      return `<label class="tv-chip${min ? " minimo" : prev ? " previsto" : ""}"${min ? ' title="Layer minimo previsto dal QTRP: non si può togliere"' : ""}>
        <input type="checkbox" value="${n}"${on ? " checked" : ""}${min ? " disabled" : ""}> ${n}${min ? ' <span class="small">· minimo</span>' : prev ? ' <span class="small">· previsto</span>' : ""}</label>`;
    }).join("");
  }
  $("#tv-codice").addEventListener("change", () => { if (!modifica) $("#tv-titolo").value = TAV[$("#tv-codice").value].nome; layerForm(); controllaForm(); });
  $("#tv-layer").addEventListener("change", controllaForm);
  const selezionati = () => [...document.querySelectorAll("#tv-layer input:checked")].map((i) => i.value);
  const bozze = (s, c) => s.tavole.filter((t) => t.comune === c && t.stato === "bozza");

  function controllaForm() {
    const t = TAV[$("#tv-codice").value], sel = selezionati(), m = [];
    if (!t.multipla && bozze(leggi(), comuneCorrente).some((x) => x.base === t.codice && x.id !== modifica))
      m.push(["err", `Il QTRP prevede una sola ${t.codice}: esiste già.`]);
    const mancanti = t.layer.filter((n) => !sel.includes(n));
    if (mancanti.length) m.push(["warn", `Per questo elaborato il QTRP collega ${mancanti.join(", ")}: non è selezionato.`]);
    if (!t.layer.length) m.push(["info", "Per questo elaborato il QTRP non definisce un modello dati: la tavola può contenere solo il PDF o layer aggiuntivi."]);
    $("#tv-messaggi").innerHTML = m.map(([k, x]) => `<div class="msg msg-${k}">${esc(x)}</div>`).join("");
    $("#tv-salva").disabled = m.some(([k]) => k === "err");
  }

  // il form si apre sotto la tavola in modifica (in cima all'elenco per una nuova tavola)
  const formCasa = { padre: $("#form-tavola").parentNode, dopo: $("#form-tavola").nextSibling };
  function formACasa() { formCasa.padre.insertBefore($("#form-tavola"), formCasa.dopo); }
  function apriForm(tv, ritorno) {
    modifica = tv ? tv.id : null; dopoSalva = ritorno || null;
    const card = tv && document.querySelector(`#lista-tavole [data-card="${tv.id}"]`);
    if (card) card.after($("#form-tavola")); else formACasa();
    if (tv && tv.comune !== comuneCorrente) { comuneCorrente = tv.comune; }
    $("#form-tavola").hidden = false;
    $("#form-tavola-titolo").textContent = tv ? `Modifica ${tv.codice}` : "Nuova tavola";
    $("#tv-codice").value = tv ? tv.base : "QNC_Tav";
    $("#tv-codice").disabled = !!tv;
    $("#tv-titolo").value = tv ? tv.titolo : TAV[$("#tv-codice").value].nome;
    $("#tv-scala").value = tv ? tv.scala : "1:5.000";
    $("#tv-pdf").value = "";
    layerForm(tv ? tv.layer : null, tv && tv.minimi ? tv.minimi : []); controllaForm();
    $("#form-tavola").scrollIntoView({ behavior: "smooth", block: card ? "center" : "nearest" });
  }
  $("#btn-nuova-tavola").addEventListener("click", () => {
    if (!comuneCorrente) { alert("Carica prima una fornitura: le tavole appartengono al Comune della fornitura."); return; }
    apriForm(null);
  });
  $("#tv-annulla").addEventListener("click", () => { $("#form-tavola").hidden = true; formACasa(); modifica = null; if (dopoSalva) location.hash = dopoSalva; });
  $("#tv-salva").addEventListener("click", () => {
    const s = leggi(), pdf = $("#tv-pdf").files[0], l = lavoro(s, comuneCorrente);
    if (modifica) {
      const tv = s.tavole.find((x) => x.id === modifica);
      Object.assign(tv, { titolo: $("#tv-titolo").value, scala: $("#tv-scala").value, layer: selezionati(), fornitura: l ? l.id : tv.fornitura, modificata: ora() });
      if (pdf) tv.pdf = pdf.name;
    } else {
      const base = $("#tv-codice").value, t = TAV[base];
      const n = t.multipla ? s.tavole.filter((x) => x.comune === comuneCorrente && x.base === base).length + 1 : 0;
      s.tavole.push({ id: "T" + Date.now().toString(36), comune: comuneCorrente, base, codice: n ? `${base}_${n}` : base,
        titolo: $("#tv-titolo").value || t.nome, scala: $("#tv-scala").value, layer: selezionati(), pdf: pdf ? pdf.name : null,
        fornitura: l ? l.id : null, stato: "bozza", creata: ora() });
    }
    scrivi(s); $("#form-tavola").hidden = true; modifica = null;
    if (dopoSalva) { const r = dopoSalva; dopoSalva = null; location.hash = r; } else tavole();
  });

  // etichetta di validita' della tavola (stessi controlli del pulsante Valida)
  function statoValidita(t, s) {
    if (t.stato === "inviata") return "";
    const r = validaTavola(t, s), err = r.filter((x) => x[0] === "err"), wa = r.filter((x) => x[0] === "warn");
    const motivi = (err.length ? err : wa).map((x) => x[1] + (x[2] ? ": " + x[2] : "")).join("; ");
    if (!err.length && !wa.length) return '<span class="pill pill-ok">valida</span>';
    // per le tavole da sistemare: elenco completo dei requisiti, con cosa fare per quelli non rispettati
    const cosaFare = { "Elaborato PDF mancante": "carica il PDF con Modifica", "Layer previsti dal QTRP non inclusi": "aggiungi i layer con Modifica",
      "Fornitura di riferimento non disponibile": "ricarica la fornitura in Carica e verifica", "Fornitura di riferimento non conforme": "scegli una versione di lavoro conforme",
      "Layer assenti nella fornitura": "carica una fornitura che li contenga", "Layer vuoti": "compila i layer nella fornitura",
      "La versione di lavoro è cambiata": "apri Modifica e salva", "Elaborato duplicato": "elimina la tavola in più" };
    return `<span class="pill ${err.length ? "pill-err" : "pill-av"}" title="${esc(motivi)}">${err.length ? "non valida" : "valida con avvisi"}</span>
      <ul class="requisiti">${r.map(([k, x, d]) => `<li class="${k}"><span class="req-ico">${k === "ok" ? "✓" : k === "err" ? "✗" : "!"}</span>
        <span>${esc(x)}${d && k !== "ok" ? ` <span class="text-muted">(${esc(d)})</span>` : ""}${k !== "ok" && cosaFare[x] ? ` → <strong>${esc(cosaFare[x])}</strong>` : ""}</span></li>`).join("")}</ul>`;
  }
  function riepilogoValidita(el, s) {
    const b = el.filter((t) => t.stato === "bozza"), n = (k) => b.filter((t) => validaTavola(t, s).some((x) => x[0] === k)).length;
    const ko = n("err"), av = b.filter((t) => !validaTavola(t, s).some((x) => x[0] === "err") && validaTavola(t, s).some((x) => x[0] === "warn")).length;
    if (!b.length) return "";
    return `<div class="riepilogo-validita"><span class="pill pill-ok">${b.length - ko - av} valide</span>
      <span class="pill pill-av">${av} con avvisi</span><span class="pill pill-err">${ko} non valide</span>
      ${ko ? '<span class="small text-muted">Sotto ogni tavola non valida sono elencati i requisiti e cosa fare.</span>' : ""}</div>`;
  }

  function cardTavola(t, azioni, s) {
    return `<div class="tavola" data-card="${t.id}">
      <div class="tv-cod">${esc(t.codice)}</div>
      <div class="flex-grow-1">
        <div class="fw-semibold">${esc(t.titolo)} ${t.stato === "inviata" ? `<span class="pill pill-ok">inviata · ${esc(t.protocollo)}</span>` : '<span class="pill pill-av">bozza</span>'}${t.automatica ? ' <span class="pill pill-auto" title="Generata in automatico dalla versione di lavoro">automatica</span>' : ""}</div>
        <div class="small text-muted">${esc(t.comune)} · ${esc(TAV[t.base].macro)} · scala ${esc(t.scala)}</div>
        <div class="mt-1">${t.layer.map((n) => (t.minimi || []).includes(n) ? `<span class="pill pill-blu" title="layer minimo">${esc(n)}</span>` : `<span class="pill pill-agg" title="layer aggiunto">+ ${esc(n)}</span>`).join(" ") || '<span class="small text-muted">nessun layer</span>'}</div>
        <div class="small mt-1">${t.pdf ? `PDF: ${esc(t.pdf)}` : '<span class="text-danger">PDF da caricare</span>'}</div>
        ${s ? `<div class="mt-1">${statoValidita(t, s)}</div>` : ""}
      </div>
      <div class="text-nowrap">${azioni}</div></div>`;
  }

  function tavole() {
    formACasa();
    $("#form-tavola").hidden = !modifica && $("#form-tavola").hidden;
    const s = leggi(), l = lavoro(s, comuneCorrente);
    $("#avviso-tavole").innerHTML = l
      ? `<div class="msg msg-info mb-3">Versione di lavoro: <strong>${esc(l.titolo || l.nomeFile)}</strong> (${esc(l.nomeFile)}) verificata il ${esc(l.data)}.</div>`
      : '<div class="msg msg-warn mb-3">Per questo Comune non c\'è ancora una versione di lavoro conforme: le tavole si possono impostare, i layer si collegano dopo una <a href="#/verifica">verifica</a> conforme.</div>';
    const ord = bozze(s, comuneCorrente).sort((a, b) => a.codice.localeCompare(b.codice, "it", { numeric: true }));
    $("#lista-tavole").innerHTML = riepilogoValidita(ord, s) + (ord.length ? ord.map((t) => cardTavola(t,
      `<a class="btn btn-outline-primary btn-xs" href="#/tavola/${t.id}">Apri</a>
       <button class="btn btn-outline-primary btn-xs" data-mod="${t.id}" type="button">${t.pdf ? "Modifica" : "Aggiungi PDF e layer"}</button>
       ${t.automatica ? "" : `<button class="btn btn-link btn-xs text-danger" data-del="${t.id}" type="button">Elimina</button>`}`, s)).join("")
      : '<div class="vuoto">Nessuna tavola in bozza. Le tavole previste dal QTRP vengono create quando il Comune ha una versione di lavoro conforme.</div>');
    document.querySelectorAll("#lista-tavole [data-mod]").forEach((b) => b.addEventListener("click", () => apriForm(leggi().tavole.find((x) => x.id === b.dataset.mod))));
    document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const s = leggi(); s.tavole = s.tavole.filter((x) => x.id !== b.dataset.del); scrivi(s); tavole();
    }));
    const usati = new Set(ord.flatMap((t) => t.layer));
    $("#copertura-layer").innerHTML = LAYER.map((n) => `<li class="${usati.has(n) ? "ok" : ""}">${n}</li>`).join("");
  }

  // ---------------------------------------------------------------- gestione tavole
  function gestione() {
    const s = leggi(), fc = $("#g-comune").value, fs = $("#g-stato").value;
    const el = s.tavole.filter((t) => (!fc || t.comune === fc) && (!fs || t.stato === fs))
      .sort((a, b) => a.comune.localeCompare(b.comune) || a.codice.localeCompare(b.codice, "it", { numeric: true }));
    $("#lista-gestione").innerHTML = riepilogoValidita(el, s) + (el.length ? el.map((t) => cardTavola(t,
      `<a class="btn btn-primary btn-xs" href="#/tavola/${t.id}">Visualizza</a>`, s)).join("")
      : '<div class="vuoto">Nessuna tavola. Le tavole si creano in <a href="#/tavole">Composizione delle tavole</a>.</div>');
  }
  $("#g-stato").addEventListener("change", gestione);

  // convalida di una tavola rispetto a QTRP, versione di lavoro e altre tavole
  function validaTavola(t, s) {
    const r = [], q = TAV[t.base], f = s.forniture.find((x) => x.id === t.fornitura), l = lavoro(s, t.comune);
    r.push(t.pdf ? ["ok", "Elaborato PDF presente", t.pdf] : ["err", "Elaborato PDF mancante", ""]);
    const mancanti = q.layer.filter((n) => !t.layer.includes(n));
    r.push(mancanti.length ? ["warn", "Layer previsti dal QTRP non inclusi", mancanti.join(", ")] : ["ok", "Layer previsti dal QTRP inclusi", q.layer.join(", ") || "nessuno previsto"]);
    if (!f) r.push(t.layer.length ? ["err", "Fornitura di riferimento non disponibile", "verifica di nuovo i dati"] : ["ok", "Nessun layer da collegare", ""]);
    else {
      const uso = statoUso(f);
      r.push(!uso.ok ? ["err", "Fornitura di riferimento non conforme", `${f.nomeFile}: ${uso.motivo}`] : ["ok", "Fornitura di riferimento conforme", `${f.nomeFile} (${f.data})`]);
      if (uso.ok && uso.motivo) r.push(["warn", "Topologia non verificata", "servizio topologico non collegato"]);
      const assenti = t.layer.filter((n) => !f.quadro[n] || f.quadro[n].stato !== "presente");
      r.push(assenti.length ? ["err", "Layer assenti nella fornitura", assenti.join(", ")] : ["ok", "Layer presenti nella fornitura", ""]);
      const vuoti = t.layer.filter((n) => f.quadro[n] && f.quadro[n].record === 0);
      if (vuoti.length) r.push(["err", "Layer vuoti", vuoti.join(", ")]);
      if (t.stato === "bozza" && l && l.id !== f.id) r.push(["warn", "La versione di lavoro è cambiata", `la tavola usa ${f.nomeFile}: aprila in modifica e salva per aggiornarla a ${l.nomeFile}`]);
    }
    if (!q.multipla && s.tavole.some((x) => x.id !== t.id && x.comune === t.comune && x.stato === t.stato && x.base === t.base))
      r.push(["err", "Elaborato duplicato", `il QTRP prevede una sola ${t.base}`]);
    return r;
  }

  // ---------------------------------------------------------------- scheda tavola con mappa
  let mappa = null, gruppi = {};
  const COLORI = ["#0066cc", "#c00000", "#2e7d32", "#ff9933", "#6a3d9a", "#00838f", "#8d6e63", "#d81b60", "#558b2f", "#5c6bc0", "#f9a825"];
  async function scheda(id) {
    const s = leggi(), t = s.tavole.find((x) => x.id === id);
    if (!t) { $("#tv-testata").innerHTML = '<div class="vuoto">Tavola non trovata.</div>'; return; }
    $("#band-titolo").textContent = `${t.codice} – ${t.titolo}`;
    $("#band-sottotitolo").textContent = `${t.comune} · ${TAV[t.base].macro}`;
    const inviata = t.stato === "inviata";
    $("#tv-testata").innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2">
        ${inviata ? `<span class="pill pill-ok">inviata · protocollo ${esc(t.protocollo)}</span>` : '<span class="pill pill-av">bozza</span>'}
        <span class="small text-muted">scala ${esc(t.scala)} · ${t.pdf ? "PDF " + esc(t.pdf) : "PDF da caricare"}</span>
        <span class="ms-auto d-flex gap-2">
          ${inviata ? '<button id="btn-riapri" class="btn btn-outline-primary btn-xs" type="button">Crea una nuova bozza da questa tavola</button>'
                    : '<button id="btn-modifica" class="btn btn-outline-primary btn-xs" type="button">Modifica</button>'}
          <a href="#/gestione" class="btn btn-outline-secondary btn-xs">Elenco tavole</a></span></div>`;
    if (!inviata) $("#btn-modifica").onclick = () => { comuneCorrente = t.comune; location.hash = "#/tavole"; setTimeout(() => apriForm(leggi().tavole.find((x) => x.id === t.id), "#/tavola/" + t.id), 50); };
    else $("#btn-riapri").onclick = () => {
      const s = leggi(), c = { ...t, id: "T" + Date.now().toString(36), stato: "bozza", protocollo: null, creata: ora(), da: t.id };
      s.tavole.push(c); scrivi(s); location.hash = "#/tavola/" + c.id;
    };
    $("#esito-validazione").innerHTML = '<span class="text-muted">Premi Valida per controllare la tavola rispetto ai dati e al QTRP.</span>';
    $("#btn-valida-tavola").onclick = () => {
      const r = validaTavola(t, leggi()), ko = r.filter((x) => x[0] === "err").length, wa = r.filter((x) => x[0] === "warn").length;
      $("#esito-validazione").innerHTML = `<div class="msg msg-${ko ? "err" : wa ? "warn" : "info"}">${ko ? "Tavola non valida" : wa ? "Tavola valida con avvisi" : "Tavola valida"}</div>` +
        '<ul class="lista-controlli">' + r.map(([k, x, d]) => `<li class="${k === "ok" ? "ok" : k === "err" ? "ko" : "warn"}">${esc(x)}${d ? `<div class="text-muted">${esc(d)}</div>` : ""}</li>`).join("") + "</ul>";
    };
    await disegna(t);
  }

  async function disegna(t) {
    if (!mappa) {
      mappa = L.map("mappa", { preferCanvas: true }).setView([39.0, 16.5], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mappa);
    }
    setTimeout(() => mappa.invalidateSize(), 50);
    Object.values(gruppi).forEach((g) => mappa.removeLayer(g)); gruppi = {};
    $("#legenda").innerHTML = "";
    const stato = (x) => ($("#mappa-stato").textContent = x);
    if (!t.layer.length) { stato("La tavola non ha layer: contiene solo l'elaborato PDF."); return; }
    const blob = t.fornitura ? await zipLeggi(t.fornitura) : null;
    if (!blob) { stato("I dati della fornitura non sono disponibili in questo browser (verifica eseguita altrove o su File Geodatabase): rieseguire la verifica dello zip di shapefile."); return; }
    stato("Lettura dei layer…");
    const gj = [].concat(await shp(await blob.arrayBuffer()));
    const perNome = Object.fromEntries(gj.map((g) => [String(g.fileName).split("/").pop().toLowerCase(), g]));
    const bounds = L.latLngBounds([]);
    t.layer.forEach((n, i) => {
      const g = perNome[n.toLowerCase()]; if (!g) return;
      const col = COLORI[i % COLORI.length];
      // simbologia per classi sulla prima codelist del layer (es. Macrozona), dalle regole del template
      const regola = window.REGOLE_QTRP.layer.find((l) => l.nome === n);
      const temaTav = TAV[t.base].tema && TAV[t.base].tema[n];
      const cc = regola && (regola.campi.find((c) => c.nome === temaTav && c.valori) || regola.campi.find((c) => c.valori));
      const campoChiave = cc ? cc.nome : null;
      const tinta = (v) => (cc && cc.valori.includes(v) ? COLORI[(i + cc.valori.indexOf(v)) % COLORI.length] : col);
      const presenti = cc ? cc.valori.filter((v) => g.features.some((f) => f.properties[campoChiave] === v)) : [];
      gruppi[n] = L.geoJSON(g, {
        style: (f) => { const c = tinta(campoChiave && f.properties[campoChiave]); return { color: c, weight: 0.8, fillColor: c, fillOpacity: 0.35 }; },
        onEachFeature: (f, lyr) => lyr.bindPopup(`<strong>${esc(n)}</strong><br>` + Object.entries(f.properties)
          .filter(([k]) => !/^(shape_|id$)/i.test(k)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join("<br>")),
      }).addTo(mappa);
      bounds.extend(gruppi[n].getBounds());
      const voce = document.createElement("label");
      voce.className = "voce-legenda";
      voce.innerHTML = `<input type="checkbox" checked> <strong>${esc(n)}</strong> <span class="small text-muted">${g.features.length} poligoni${campoChiave ? " · per " + esc(campoChiave) : ""}</span>`;
      voce.querySelector("input").onchange = (e) => (e.target.checked ? gruppi[n].addTo(mappa) : mappa.removeLayer(gruppi[n]));
      $("#legenda").appendChild(voce);
      const classi = document.createElement("div");
      classi.className = "classi-legenda";
      classi.innerHTML = (presenti.length ? presenti : [n]).map((v) => `<div><span class="campione" style="background:${tinta(v)}59;border-color:${tinta(v)}"></span> ${esc(v)}</div>`).join("");
      $("#legenda").appendChild(classi);
    });
    if (bounds.isValid()) mappa.fitBounds(bounds, { padding: [10, 10] });
    stato(`Sistema di riferimento della fornitura riproiettato in WGS84 per la visualizzazione. Clic su un poligono per gli attributi.`);
  }

  // ---------------------------------------------------------------- invio
  function condizioni(s, c) {
    const l = lavoro(s, c), b = bozze(s, c), usati = new Set(b.flatMap((t) => t.layer));
    const senzaPdf = b.filter((t) => !t.pdf).map((t) => t.codice);
    const nonValide = b.filter((t) => validaTavola(t, s).some((r) => r[0] === "err")).map((t) => t.codice);
    const fuori = LAYER.filter((n) => !usati.has(n));
    return [
      [!!l && statoUso(l).ok, "Versione di lavoro conforme (attributi e topologia)", l ? `${l.nomeFile} (${l.data})${statoUso(l).motivo ? " – " + statoUso(l).motivo : ""}` : "nessuna fornitura conforme selezionata"],
      [b.length > 0, "Tavole in bozza da inviare", `${b.length} tavole`],
      [!fuori.length, "Ogni layer compare in almeno una tavola", fuori.length ? "mancano: " + fuori.join(", ") : "tutti gli 11 layer"],
      [b.length > 0 && !senzaPdf.length, "PDF caricato per ogni tavola", senzaPdf.length ? "mancano: " + senzaPdf.join(", ") : ""],
      [b.length > 0 && !nonValide.length, "Tavole valide", nonValide.length ? "non valide: " + nonValide.join(", ") : ""],
    ];
  }
  function invio() {
    const s = leggi(), c = comuneCorrente, cond = condizioni(s, c), ok = cond.every((x) => x[0]);
    $("#checklist-invio").innerHTML = cond.map(([v, t, d]) => `<li class="${v ? "ok" : "ko"}">${esc(t)}${d ? `<div class="small text-muted">${esc(d)}</div>` : ""}</li>`).join("");
    $("#dichiarazione").checked = false;
    const aggiorna = () => ($("#btn-invia").disabled = !(ok && $("#dichiarazione").checked));
    $("#dichiarazione").onchange = aggiorna; aggiorna();
    const inv = s.invii.filter((i) => i.comune === c);
    $("#riepilogo-invio").innerHTML = inv.length ? '<h2 class="h6">Invii effettuati</h2>' + inv.map((i, k) => `<div class="tavola"><div class="flex-grow-1">
        <div class="fw-semibold">Protocollo ${esc(i.protocollo)}</div><div class="small text-muted">${esc(i.data)} · ${i.tavole.length} tavole · ${esc(i.fornitura)}</div></div>
        <button class="btn btn-outline-primary btn-xs" data-ric="${k}" type="button">Ricevuta PDF</button></div>`).join("")
      : '<div class="vuoto">Nessun invio effettuato per questo Comune.</div>';
    document.querySelectorAll("[data-ric]").forEach((b) => (b.onclick = () => ricevuta(inv[+b.dataset.ric])));
  }
  $("#btn-invia").addEventListener("click", () => {
    const s = leggi(), c = comuneCorrente, l = lavoro(s, c), b = bozze(s, c);
    const inv = { protocollo: "RC-PSC-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6), data: ora(), comune: c,
      strumento: l.strumento, fornitura: `${l.titolo || ""} (${l.nomeFile})`, controllo: l.id,
      tavole: b.map((t) => ({ codice: t.codice, titolo: t.titolo, layer: t.layer, pdf: t.pdf })) };
    b.forEach((t) => Object.assign(t, { stato: "inviata", protocollo: inv.protocollo, inviata: inv.data }));
    s.invii.unshift(inv); scrivi(s); invio();
  });
  function ricevuta(inv) {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFillColor(0, 102, 204); doc.rect(0, 0, 210, 24, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Regione Calabria – Geoportale", 14, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Dipartimento Territorio e Tutela dell'Ambiente · Consegna digitale PSC/PSA", 14, 18);
    doc.setTextColor(0, 38, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Ricevuta di consegna", 14, 36);
    doc.setFontSize(9); doc.setTextColor(40);
    let y = 44;
    for (const [k, v] of [["Protocollo", inv.protocollo], ["Data", inv.data], ["Comune", inv.comune], ["Strumento", inv.strumento],
      ["Fornitura dati", inv.fornitura], ["Controllo di conformità", inv.controllo]]) {
      doc.setFont("helvetica", "bold"); doc.text(k + ":", 14, y); doc.setFont("helvetica", "normal"); doc.text(String(v), 60, y); y += 5;
    }
    doc.autoTable({ startY: y + 4, head: [["Tavola", "Titolo", "Layer", "PDF"]], body: inv.tavole.map((t) => [t.codice, t.titolo, t.layer.join(", "), t.pdf || ""]),
      theme: "grid", styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [217, 226, 243], textColor: [0, 38, 77] }, margin: { left: 14, right: 14 } });
    doc.setFontSize(7.5); doc.setTextColor(130); doc.text("Documento generato dal mockup del servizio: non ha valore amministrativo.", 14, 290);
    doc.save(`ricevuta_${inv.protocollo}.pdf`);
  }

  popolaComuni();
  vai();
});
