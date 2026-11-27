// Servizio "Regole topologiche" (amministratore regionale): crea e modifica i file di regole topologiche che
// si associano ai template (UploadTemplate) e che ValidaFornitura usa per la topologia.
//  - elenco: item del Portal con il tag CONFIG_MOCKUP.regoleTag, con i template che li usano (tag regole:<id>);
//  - editor: parte dalla struttura JSON di un template (layer poligonali e loro campi), oppure da regole esistenti
//    (Modifica = stesso item; Duplica = regole nuove);
//  - salvataggio: web tool UploadRegoleTopologia (controlla schema e compatibilita' con il template e, in modifica,
//    con tutti i template che usano le regole).
// L'accesso e' quello della pagina "Carica template" (stessa sessione del browser).
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  if (!$("#rt-accesso")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const TOLL = [["area_minima_errore_m2", "Area minima di un errore (m²)", "Sotto questa area sovrapposizioni, buchi e sconfinamenti non vengono segnalati."],
                ["distanza_confine_m", "Tolleranza sul limite comunale (m)", "Sconfinamenti e buchi entro questa distanza dal limite ISTAT non vengono segnalati."],
                ["sliver_area_m2", "Area massima di uno sliver (m²)", "Poligoni più piccoli e sottili di così sono sliver (errore)."],
                ["sliver_sottigliezza", "Sottigliezza massima di uno sliver", "Indice 4πA/P² (1 = cerchio, vicino a 0 = filiforme)."],
                ["cuspide_angolo_gradi", "Angolo massimo di una cuspide (°)", "Vertici con angolo più acuto sono cuspidi."]];
  const LIV = [["copertura_fuori_tolleranza", "Territorio non coperto (buchi)"], ["contenimento_fuori_tolleranza", "Sconfinamento dal limite comunale"],
               ["multiparte", "Poligono multiparte"], ["cuspide", "Cuspide"]];
  let sessione = null, templateRif = [], stato = null; // stato: { item, struttura, base }

  function leggiSessione() {
    try { const s = JSON.parse(sessionStorage.getItem("psc-admin")); return s && s.scade > Date.now() ? s : null; } catch (e) { return null; }
  }
  const tok = () => `token=${encodeURIComponent(sessione.token)}`;
  async function cerca(q) {
    const j = await (await fetch(`${portal}/sharing/rest/search?f=json&num=100&sortField=modified&sortOrder=desc&q=${encodeURIComponent(q)}&${tok()}`)).json();
    if (j.error) throw new Error(j.error.message);
    return j.results || [];
  }
  async function leggiJson(id) { // item JSON, anche zippato (struttura e regole)
    const r = await fetch(`${portal}/sharing/rest/content/items/${id}/data?${tok()}`);
    const b = await r.arrayBuffer();
    if (new Uint8Array(b)[0] === 0x50) { // "PK": zip
      const z = await JSZip.loadAsync(b);
      const n = Object.keys(z.files).find((x) => /\.json$/i.test(x));
      if (!n) throw new Error("nell'item non c'è un file JSON");
      return JSON.parse(await z.file(n).async("string"));
    }
    return JSON.parse(new TextDecoder().decode(b));
  }
  const tagVal = (tags, k) => ((tags || []).find((t) => t.startsWith(k + ":")) || "").slice(k.length + 1);

  // ---------------------------------------------------------------- elenco
  async function elenco() {
    sessione = leggiSessione();
    if (!sessione) {
      $("#rt-accesso").innerHTML = `<div class="msg msg-warn">Per gestire le regole accedi con l'account del Portal dalla pagina
        <a href="#/carica-template">Carica template</a>, poi torna qui.</div>`;
      $("#rt-elenco").innerHTML = ""; $("#rt-nuove").disabled = true; return;
    }
    $("#rt-accesso").innerHTML = `<div class="msg msg-info">Accesso al Portal come <strong>${esc(sessione.utente)}</strong>.</div>`;
    $("#rt-nuove").disabled = false;
    $("#rt-elenco").innerHTML = `<p class="small text-muted">Caricamento…</p>`;
    try {
      const [regole, tpl] = await Promise.all([cerca(`tags:"${CFG.regoleTag}"`),
        cerca(`type:"File Geodatabase" AND (tags:"${CFG.templateTag}" OR tags:"psc-template")`)]);
      templateRif = tpl.filter((t) => tagVal(t.tags, "struttura")).map((t) => ({ id: t.id, titolo: t.title, struttura: tagVal(t.tags, "struttura"), regole: tagVal(t.tags, "regole") }));
      $("#rt-template").innerHTML = templateRif.map((t) => `<option value="${t.struttura}">${esc(t.titolo)}</option>`).join("") || "<option value=''>Nessun template</option>";
      if (!regole.length) { $("#rt-elenco").innerHTML = `<p class="small text-muted">Nessun file di regole sul Portal: creane uno con “Nuove regole”.</p>`; return; }
      $("#rt-elenco").innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Regole</th><th>Ambito</th><th>Modificate</th><th>Usate da</th><th></th></tr></thead><tbody>` +
        regole.map((r) => {
          const usate = templateRif.filter((t) => t.regole === r.id);
          return `<tr><td>${esc(r.title)}<div class="small text-muted">${esc(r.snippet || "")}</div></td><td>${esc(tagVal(r.tags, "ambito"))}</td>
            <td>${new Date(r.modified).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
            <td class="small">${usate.length ? usate.map((t) => esc(t.titolo)).join("<br>") : "<span class='text-muted'>nessun template</span>"}</td>
            <td class="text-nowrap">${r.owner === sessione.utente ? `<button class="btn btn-outline-primary btn-sm" data-modifica="${r.id}">Modifica</button> ` : ""}
              <button class="btn btn-outline-secondary btn-sm" data-duplica="${r.id}">Duplica</button></td></tr>`;
        }).join("") + "</tbody></table></div>";
      const per = Object.fromEntries(regole.map((r) => [r.id, r]));
      document.querySelectorAll("[data-modifica]").forEach((b) => b.onclick = () => apri(per[b.dataset.modifica], false));
      document.querySelectorAll("[data-duplica]").forEach((b) => b.onclick = () => apri(per[b.dataset.duplica], true));
    } catch (e) { $("#rt-elenco").innerHTML = `<div class="msg msg-err">Elenco non disponibile: ${esc(e.message)}</div>`; }
  }

  // ---------------------------------------------------------------- editor
  async function apri(item, duplica) {
    $("#rt-passi").innerHTML = "";
    try {
      const base = item ? await leggiJson(item.id) : JSON.parse(JSON.stringify(CFG.regoleNuove || {}));
      if (!base.strati) base.strati = {};
      const rif = item && ((item.description || "").match(/struttura ([0-9a-f]{32})/) || [])[1];
      stato = { item: item && !duplica ? item.id : null, base, usate: item ? templateRif.filter((t) => t.regole === item.id) : [] };
      $("#rt-titolo").value = item ? (duplica ? item.title + " (copia)" : item.title) : "";
      $("#rt-note").value = item ? (item.snippet || "") : "";
      $("#rt-ambito").value = item ? tagVal(item.tags, "ambito") || CFG.ambitoPagina : CFG.ambitoPagina;
      if (rif && templateRif.some((t) => t.struttura === rif)) $("#rt-template").value = rif;
      $("#rt-intestazione").textContent = stato.item ? `Modifica: ${item.title}` : (item ? `Nuove regole (copia di ${item.title})` : "Nuove regole");
      $("#rt-avviso").innerHTML = stato.item && stato.usate.length
        ? `<div class="msg msg-warn">Queste regole sono usate da ${stato.usate.map((t) => `<strong>${esc(t.titolo)}</strong>`).join(", ")}: la modifica vale per le
           validazioni future di tutti questi template. Per non toccarli usa “Duplica”.</div>` : "";
      $("#rt-toll").innerHTML = TOLL.map(([k, et, aiuto]) => `<div class="col-md-6"><label class="form-label-plain" for="rt-t-${k}">${et}</label>
        <input id="rt-t-${k}" class="form-control form-control-sm" type="number" min="0" step="any" value="${esc((base.tolleranze || {})[k] ?? "")}">
        <div class="small text-muted">${aiuto}</div></div>`).join("");
      $("#rt-liv").innerHTML = LIV.map(([k, et]) => `<div class="col-md-6"><label class="form-label-plain" for="rt-l-${k}">${et}</label>
        <select id="rt-l-${k}" class="form-select form-select-sm">${["ERRORE", "AVVISO"].map((x) => `<option${(base.livelli || {})[k] === x ? " selected" : ""}>${x}</option>`).join("")}</select></div>`).join("");
      $("#rt-editor").hidden = false;
      await layer();
      $("#rt-editor").scrollIntoView({ behavior: "smooth" });
    } catch (e) { $("#rt-passi").innerHTML = `<li class="text-danger">Regole non leggibili: ${esc(e.message)}</li>`; }
  }
  async function layer() { // righe dei layer poligonali del template di riferimento
    const id = $("#rt-template").value;
    if (!id) { $("#rt-layer").innerHTML = ""; return; }
    $("#rt-layer").innerHTML = `<tr><td colspan="4" class="text-muted small">Caricamento della struttura…</td></tr>`;
    try {
      stato.struttura = await leggiJson(id);
      const s = stato.base.strati;
      const pol = stato.struttura.layer.filter((l) => /poly/i.test(l.geometria));
      const fuori = Object.keys(s).filter((k) => !pol.some((l) => l.nome.toLowerCase() === k.toLowerCase()));
      $("#rt-layer").innerHTML = pol.map((l) => {
        const r = s[l.nome.toLowerCase()] || s[l.nome] || null;
        const d = r ? r.disgiunzione : "tutti";
        const opz = [["", "non controllata"], ["tutti", "tra tutti i record"], ...l.campi.map((c) => [c.nome, `solo a parità di “${c.nome}”`])];
        return `<tr data-layer="${esc(l.nome.toLowerCase())}"><td><input type="checkbox" class="form-check-input rt-usa"${r ? " checked" : ""}></td><td>${esc(l.nome)}</td>
          <td><select class="form-select form-select-sm rt-disg">${opz.map(([v, t]) => `<option value="${esc(v)}"${(d ?? "") === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></td>
          <td><input type="checkbox" class="form-check-input rt-cop"${r && r.copertura ? " checked" : ""}></td></tr>`;
      }).join("") + (fuori.length ? `<tr><td colspan="4" class="small text-danger">Nelle regole ci sono layer che questo template non ha (verranno tolti): ${esc(fuori.join(", "))}</td></tr>` : "");
    } catch (e) { $("#rt-layer").innerHTML = `<tr><td colspan="4" class="text-danger small">Struttura non leggibile: ${esc(e.message)}</td></tr>`; }
  }
  function componi() {
    const r = { ...stato.base, tolleranze: {}, livelli: {}, strati: {} };
    for (const [k] of TOLL) r.tolleranze[k] = Number($(`#rt-t-${k}`).value);
    for (const [k] of LIV) r.livelli[k] = $(`#rt-l-${k}`).value;
    document.querySelectorAll("#rt-layer tr[data-layer]").forEach((tr) => {
      if (!tr.querySelector(".rt-usa").checked) return;
      r.strati[tr.dataset.layer] = { disgiunzione: tr.querySelector(".rt-disg").value || null, copertura: tr.querySelector(".rt-cop").checked };
    });
    return r;
  }

  // ---------------------------------------------------------------- salvataggio (UploadRegoleTopologia)
  async function gp(url, campi) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...campi, f: "json", token: sessione.token })) fd.append(k, v);
    const j = await (await fetch(url, { method: "POST", body: fd })).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }
  async function salva() {
    const li = document.createElement("li");
    $("#rt-passi").innerHTML = ""; $("#rt-passi").appendChild(li);
    li.innerHTML = `Controllo e salvataggio (UploadRegoleTopologia) <span class="text-muted">…</span>`;
    $("#rt-salva").disabled = true;
    try {
      const task = CFG.uploadRegoleTopologiaUrl.replace(/\/+$/, "");
      let st = await gp(task + "/submitJob", { regole: JSON.stringify(componi()), item_struttura: $("#rt-template").value,
        titolo: $("#rt-titolo").value.trim(), ambito: $("#rt-ambito").value, token: sessione.token, item_regole: stato.item || "",
        note: $("#rt-note").value.trim(), cartella_portal: CFG.cartellaTemplate || "", condivisione: $("#rt-condivisione").value });
      const id = st.jobId;
      for (let i = 0; i < 100 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) { await pausa(2000); st = await gp(`${task}/jobs/${id}`, {}); }
      if (st.jobStatus !== "esriJobSucceeded") {
        const m = (st.messages || []).filter((x) => /Error/.test(x.type) && !/^Failed/.test(x.description)).map((x) => x.description.trim()).join(" · ");
        throw new Error(m || st.jobStatus);
      }
      const item = (await gp(`${task}/jobs/${id}/results/item_regole_out`, {})).value;
      li.innerHTML = `Controllo e salvataggio <span class="text-success">fatto – regole ${stato.item ? "aggiornate" : "create"} (item ${esc(item)})</span>`;
      $("#rt-editor").hidden = true; stato = null;
      await elenco();
    } catch (e) {
      li.innerHTML = `Controllo e salvataggio <span class="text-danger">errore – ${esc(e.message)}</span>`;
    } finally { $("#rt-salva").disabled = false; }
  }

  $("#rt-ambito").innerHTML = (CFG.ambiti || []).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
  $("#rt-nuove").onclick = () => apri(null, false);
  $("#rt-template").onchange = () => stato && layer();
  $("#rt-salva").onclick = salva;
  $("#rt-annulla").onclick = () => { $("#rt-editor").hidden = true; stato = null; };
  const vista = () => { if (location.hash === "#/regole-topologia") elenco(); };
  window.addEventListener("hashchange", vista); vista();
})();
