// "Componi il pacchetto": il pacchetto da inviare alla Regione raccoglie una fornitura (le geometrie) e le tavole PDF
// dello stesso Comune in un manifesto sul Portal (web tool SalvaPacchetto; EliminaPacchetto per le bozze).
//  - elenco dei pacchetti della cartella scelta, con filtri per Comune e stato;
//  - editor: titolo, Comune, fornitura e tavole di quel Comune (cercate in tutte le cartelle dell'utente), lista di
//    controllo per l'invio (fornitura presente e conforme, almeno una tavola), cartella, condivisione e gruppi.
// L'invio alla Regione e' un passo successivo. L'accesso e' quello del pulsante in alto (js/accesso.js).
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  if (!$("#pk-elenco")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tagVal = (tags, k) => ((tags || []).find((t) => t.startsWith(k + ":")) || "").slice(k.length + 1);
  const data = (ms) => new Date(ms).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const esito = (snippet) => (/^(CONFORME|NON CONFORME):/.exec(snippet || "") || [])[1] || "";
  let sessione = null, pacchetti = [], modifica = null, forniture = [], tavole = [];

  const tok = () => encodeURIComponent(sessione.token);
  async function cerca(q) { // item dell'utente in tutte le sue cartelle
    const j = await (await fetch(`${portal}/sharing/rest/search?f=json&num=100&sortField=modified&sortOrder=desc&q=${encodeURIComponent(`owner:"${sessione.utente}" AND ${q}`)}&token=${tok()}`)).json();
    if (j.error) throw new Error(j.error.message);
    return j.results || [];
  }
  async function manifesto(id) { // il JSON del pacchetto (zip)
    const b = await (await fetch(`${portal}/sharing/rest/content/items/${id}/data`, { method: "POST", body: new URLSearchParams({ token: sessione.token }) })).arrayBuffer();
    const z = await JSZip.loadAsync(b);
    const n = Object.keys(z.files).find((x) => /\.json$/i.test(x));
    return JSON.parse(await z.file(n).async("string"));
  }

  // ---------------------------------------------------------------- accesso, cartelle, gruppi
  async function avvio() {
    sessione = window.ACCESSO && window.ACCESSO.sessione();
    if (!sessione) {
      $("#pk-accesso").innerHTML = `<div class="msg msg-warn">Per comporre i pacchetti <a href="#" data-apri-accesso>accedi al Portal</a> con il pulsante in alto.</div>`;
      $("#pk-area").hidden = true; return;
    }
    $("#pk-accesso").innerHTML = ""; $("#pk-area").hidden = false;
    const [c, io] = await Promise.all([fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}?f=json&num=1&token=${tok()}`).then((x) => x.json()),
      fetch(`${portal}/sharing/rest/community/self?f=json&token=${tok()}`).then((x) => x.json())]);
    const cart = (c.folders || []).sort((a, b) => a.title.localeCompare(b.title, "it"));
    for (const [sel, chiave] of [["#pk-cartella", "id"], ["#pk-n-cartella", "title"]]) {
      const prima = $(sel).value;
      $(sel).innerHTML = `<option value="" disabled${prima ? "" : " selected"}>— scegli la cartella —</option>` +
        cart.map((x) => `<option value="${esc(x[chiave])}"${x[chiave] === prima ? " selected" : ""}>${esc(x.title)}</option>`).join("");
    }
    $("#pk-n-gruppi").innerHTML = (io.groups || []).map((g) => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("") || "<option disabled>Nessun gruppo</option>";
    $("#pk-n-comune-lista").innerHTML = (window.COMUNI_CALABRIA || []).map((x) => `<option value="${esc(x)}">`).join("");
    if ($("#pk-cartella").value) await carica();
    else $("#pk-elenco").innerHTML = `<div class="vuoto">Scegli la cartella del Portal in cui sono salvati i pacchetti.</div>`;
  }

  // ---------------------------------------------------------------- elenco dei pacchetti
  async function carica() {
    const id = $("#pk-cartella").value;
    $("#pk-elenco").innerHTML = `<p class="small text-muted">Caricamento…</p>`;
    try {
      pacchetti = [];
      for (let start = 1; start > 0;) {
        const j = await (await fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}/${id}?f=json&num=100&start=${start}&token=${tok()}`)).json();
        if (j.error) throw new Error(j.error.message);
        pacchetti.push(...(j.items || []).filter((x) => (x.tags || []).includes("urb-pacchetto")));
        start = j.nextStart > 0 ? j.nextStart : 0;
      }
      const comuni = [...new Set(pacchetti.map((x) => tagVal(x.tags, "comune")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
      const sc = $("#pk-comune").value;
      $("#pk-comune").innerHTML = `<option value="">Tutti</option>` + comuni.map((x) => `<option${x === sc ? " selected" : ""}>${esc(x)}</option>`).join("");
      disegna();
    } catch (e) { $("#pk-elenco").innerHTML = `<div class="msg msg-err">Pacchetti non disponibili: ${esc(e.message)}</div>`; }
  }
  function disegna() {
    const fc = $("#pk-comune").value, fs = $("#pk-stato").value;
    const righe = pacchetti.filter((x) => (!fc || tagVal(x.tags, "comune") === fc) && (!fs || tagVal(x.tags, "stato") === fs)).sort((a, b) => b.modified - a.modified);
    if (!pacchetti.length) { $("#pk-elenco").innerHTML = `<div class="vuoto">Nessun pacchetto in questa cartella: creane uno con “Nuovo pacchetto”.</div>`; return; }
    if (!righe.length) { $("#pk-elenco").innerHTML = `<div class="vuoto">Nessun pacchetto con questi filtri.</div>`; return; }
    $("#pk-elenco").innerHTML = `<div class="table-responsive"><table class="table table-sm tab-report align-middle"><thead><tr>
      <th>Aggiornato</th><th>Comune</th><th>Pacchetto</th><th>Stato</th><th></th></tr></thead><tbody>` +
      righe.map((x) => {
        const bozza = tagVal(x.tags, "stato") === "bozza", pronto = /pronto per l'invio/.test(x.snippet || "") && !/non ancora/.test(x.snippet || "");
        return `<tr><td>${data(x.modified)}</td><td>${esc(tagVal(x.tags, "comune"))}</td>
          <td><strong>${esc(x.title)}</strong><div class="small text-muted">${esc(x.snippet || "")}</div></td>
          <td>${bozza ? `<span class="pill ${pronto ? "pill-ok" : "pill-av"}">${pronto ? "bozza – pronto" : "bozza"}</span>` : `<span class="pill pill-blu">${esc(tagVal(x.tags, "stato"))}</span>`}</td>
          <td class="text-nowrap">${bozza ? `<button class="btn btn-outline-primary btn-sm" type="button" data-modifica="${esc(x.id)}">Modifica</button>
            <button class="btn btn-outline-danger btn-sm" type="button" data-elimina="${esc(x.id)}" data-titolo="${esc(x.title)}">Elimina</button>` : ""}</td></tr>`;
      }).join("") + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- editor
  async function apri(item) {
    modifica = item || null;
    $("#pk-modulo").hidden = false;
    $("#pk-modulo-titolo").textContent = item ? `Modifica: ${item.title}` : "Nuovo pacchetto";
    let m = null;
    if (item) { try { m = await manifesto(item.id); } catch (e) { $("#pk-esito-op").innerHTML = `<span class="text-danger">Pacchetto non leggibile: ${esc(e.message)}</span>`; } }
    $("#pk-n-titolo").value = item ? item.title : "";
    $("#pk-n-note").value = m ? m.note || "" : "";
    $("#pk-n-comune").value = item ? tagVal(item.tags, "comune") : "";
    await contenuti(m);
    $("#pk-modulo").scrollIntoView({ behavior: "smooth" });
  }
  async function contenuti(m) { // forniture e tavole del Comune scelto
    const comune = $("#pk-n-comune").value.trim();
    if (!(window.COMUNI_CALABRIA || []).includes(comune)) {
      $("#pk-n-fornitura").innerHTML = `<option value="">— scegli prima il Comune —</option>`; $("#pk-n-tavole").innerHTML = ""; forniture = tavole = []; controlli(); return;
    }
    const scelta = m ? (m.fornitura && m.fornitura.item) : $("#pk-n-fornitura").value;
    const spuntate = m ? (m.tavole || []).map((t) => t.item) : [...document.querySelectorAll("#pk-n-tavole input:checked")].map((x) => x.value);
    [forniture, tavole] = await Promise.all([cerca(`tags:"urb-fornitura" AND tags:"comune:${comune}"`), cerca(`tags:"urb-tavola" AND tags:"comune:${comune}"`)]);
    // la ricerca del Portal spezza i tag sui trattini: "urb-fornitura" trova anche report ed errori ("urb-fornitura-report"…),
    // quindi si tengono solo gli item con il tag esatto (le forniture caricate) e del Comune scelto
    forniture = forniture.filter((x) => (x.tags || []).includes("urb-fornitura") && tagVal(x.tags, "comune") === comune);
    tavole = tavole.filter((x) => (x.tags || []).includes("urb-tavola") && tagVal(x.tags, "comune") === comune);
    $("#pk-n-fornitura").innerHTML = `<option value="">— nessuna (bozza) —</option>` + forniture.map((x) =>
      `<option value="${esc(x.id)}"${x.id === scelta ? " selected" : ""}>${esc(x.title)} – ${esc(esito(x.snippet) || "esito non noto")} (${data(x.modified)})</option>`).join("");
    $("#pk-n-tavole").innerHTML = tavole.length ? tavole.map((x) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="pk-t-${esc(x.id)}" value="${esc(x.id)}"${spuntate.includes(x.id) ? " checked" : ""}>
      <label class="form-check-label" for="pk-t-${esc(x.id)}">${esc(x.title)} <span class="small text-muted">${esc(x.name || "")} · ${data(x.modified)}</span></label></div>`).join("")
      : `<div class="small text-muted">Nessuna tavola di ${esc(comune)}: caricala in <a href="#/le-mie-tavole">Le mie tavole</a>.</div>`;
    controlli();
  }
  function controlli() { // lista di controllo per l'invio, mentre si compone
    const f = forniture.find((x) => x.id === $("#pk-n-fornitura").value), nT = document.querySelectorAll("#pk-n-tavole input:checked").length;
    const voci = [["Fornitura presente", !!f], ["Fornitura conforme", !!f && esito(f.snippet) === "CONFORME"], ["Almeno una tavola", nT > 0]];
    $("#pk-controlli").innerHTML = voci.map(([t, ok]) => `<li class="${ok ? "ok" : "ko"}">${esc(t)}</li>`).join("") +
      `<li class="small text-muted" style="list-style:none">${voci.every((x) => x[1]) ? "Il pacchetto è pronto per l'invio." : "Puoi salvarlo in bozza e completarlo dopo."}</li>`;
  }

  // ---------------------------------------------------------------- web tool
  async function gp(url, campi) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...campi, f: "json" })) fd.append(k, v);
    const j = await (await fetch(url, { method: "POST", body: fd })).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }
  async function lavoro(taskUrl, campi) {
    const task = taskUrl.replace(/\/+$/, "");
    let st = await gp(task + "/submitJob", campi);
    for (let i = 0; i < 150 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) { await pausa(2000); st = await gp(`${task}/jobs/${st.jobId}`, {}); }
    if (st.jobStatus !== "esriJobSucceeded") {
      throw new Error((st.messages || []).filter((x) => /Error/.test(x.type) && !/^Failed/.test(x.description)).map((x) => x.description.trim()).join(" · ") || st.jobStatus);
    }
  }
  async function salva() {
    const comune = $("#pk-n-comune").value.trim();
    const mancano = [!$("#pk-n-titolo").value.trim() && "il titolo", !(window.COMUNI_CALABRIA || []).includes(comune) && "il Comune",
      !$("#pk-n-cartella").value && "la cartella", !$("#pk-n-condivisione").value && "la condivisione"].filter(Boolean);
    if (mancano.length) { $("#pk-esito-op").innerHTML = `<span class="text-danger">Manca ${mancano.join(", ")}.</span>`; return; }
    $("#pk-salva").disabled = true;
    $("#pk-esito-op").innerHTML = `<span class="text-muted">Salvataggio del pacchetto (SalvaPacchetto)…</span>`;
    try {
      await lavoro(CFG.salvaPacchettoUrl, { titolo: $("#pk-n-titolo").value.trim(), comune, ambito: CFG.ambitoPagina,
        item_fornitura: $("#pk-n-fornitura").value, tavole: [...document.querySelectorAll("#pk-n-tavole input:checked")].map((x) => x.value).join(","),
        token: sessione.token, item_pacchetto: modifica ? modifica.id : "", note: $("#pk-n-note").value.trim(),
        cartella_portal: $("#pk-n-cartella").value, condivisione: $("#pk-n-condivisione").value,
        gruppi: [...$("#pk-n-gruppi").selectedOptions].map((o) => o.value).join(",") });
      $("#pk-esito-op").innerHTML = `<span class="text-success">Pacchetto ${modifica ? "aggiornato" : "creato"}.</span>`;
      $("#pk-modulo").hidden = true; modifica = null;
      if ($("#pk-cartella").value) await carica();
    } catch (e) { $("#pk-esito-op").innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
    finally { $("#pk-salva").disabled = false; }
  }
  async function elimina(id, titolo) {
    if (!confirm(`Eliminare il pacchetto “${titolo}”?\n\nViene eliminato solo il pacchetto: fornitura e tavole restano sul Portal.`)) return;
    $("#pk-esito-op").innerHTML = `<span class="text-muted">Eliminazione di “${esc(titolo)}” (EliminaPacchetto)…</span>`;
    try {
      await lavoro(CFG.eliminaPacchettoUrl, { item_pacchetto: id, token: sessione.token });
      $("#pk-esito-op").innerHTML = `<span class="text-success">Pacchetto “${esc(titolo)}” eliminato.</span>`;
      await carica();
    } catch (e) { $("#pk-esito-op").innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
  }

  $("#pk-cartella").addEventListener("change", () => carica());
  $("#pk-comune").addEventListener("change", disegna);
  $("#pk-stato").addEventListener("change", disegna);
  $("#pk-nuovo").addEventListener("click", () => apri(null));
  $("#pk-annulla").addEventListener("click", () => { $("#pk-modulo").hidden = true; modifica = null; });
  $("#pk-salva").addEventListener("click", salva);
  $("#pk-n-comune").addEventListener("change", () => contenuti(null).catch((e) => { $("#pk-esito-op").innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }));
  $("#pk-n-fornitura").addEventListener("change", controlli);
  $("#pk-n-tavole").addEventListener("change", controlli);
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-vista=pacchetti]")) return;
    if (e.target.closest("[data-apri-accesso]")) { e.preventDefault(); window.ACCESSO.apriPannello(); return; }
    const mo = e.target.closest("[data-modifica]");
    if (mo) { apri(pacchetti.find((x) => x.id === mo.dataset.modifica)); return; }
    const el = e.target.closest("[data-elimina]");
    if (el) elimina(el.dataset.elimina, el.dataset.titolo);
  });
  const vista = () => { if (location.hash === "#/pacchetti") avvio().catch((e) => { $("#pk-elenco").innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; }); };
  window.addEventListener("hashchange", vista);
  document.addEventListener("accesso-cambiato", vista);
  vista();
})();
