// "Le mie tavole": i PDF delle tavole del piano salvati sul Portal (web tool UploadTavola), cartella per cartella,
// con filtri per Comune ed elaborato. Per ogni tavola: scarica, sostituisci il PDF (UploadTavola con item_tavola),
// elimina (EliminaTavola). Le tavole si raccolgono poi, con la fornitura, nel pacchetto di invio alla Regione.
// Elaborati dal catalogo delle tavole del QTRP (window.TAVOLE_QTRP, item CONFIG_MOCKUP.tavoleItem).
// L'accesso e' quello del pulsante in alto (js/accesso.js).
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  if (!$("#lt-elenco")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tagVal = (tags, k) => ((tags || []).find((t) => t.startsWith(k + ":")) || "").slice(k.length + 1);
  const data = (ms) => new Date(ms).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const TAG = "urb-tavola";
  let sessione = null, tavole = [], sostituisci = null;
  const elaborati = () => Object.fromEntries((window.TAVOLE_QTRP || []).flatMap((g) => g.tavole.map((t) => [t.codice, { ...t, macro: g.macro }])));

  // ---------------------------------------------------------------- accesso, cartelle, gruppi
  async function avvio() {
    sessione = window.ACCESSO && window.ACCESSO.sessione();
    if (!sessione) {
      $("#lt-accesso").innerHTML = `<div class="msg msg-warn">Per caricare e gestire le tavole <a href="#" data-apri-accesso>accedi al Portal</a> con il pulsante in alto.</div>`;
      $("#lt-area").hidden = true; return;
    }
    $("#lt-accesso").innerHTML = ""; $("#lt-area").hidden = false;
    await (window.TAVOLE_PRONTE || Promise.resolve());
    const t = encodeURIComponent(sessione.token);
    const [c, io] = await Promise.all([fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}?f=json&num=1&token=${t}`).then((x) => x.json()),
      fetch(`${portal}/sharing/rest/community/self?f=json&token=${t}`).then((x) => x.json())]);
    const cart = (c.folders || []).sort((a, b) => a.title.localeCompare(b.title, "it"));
    for (const sel of ["#lt-cartella", "#lt-n-cartella"]) {
      const prima = $(sel).value;
      $(sel).innerHTML = `<option value="" disabled${prima ? "" : " selected"}>— scegli la cartella —</option>` +
        cart.map((x) => `<option value="${esc(sel === "#lt-cartella" ? x.id : x.title)}"${(sel === "#lt-cartella" ? x.id : x.title) === prima ? " selected" : ""}>${esc(x.title)}</option>`).join("");
    }
    $("#lt-n-gruppi").innerHTML = (io.groups || []).map((g) => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("") || "<option disabled>Nessun gruppo</option>";
    const E = elaborati();
    $("#lt-n-codice").innerHTML = `<option value="" disabled selected>— scegli l'elaborato —</option>` +
      (window.TAVOLE_QTRP || []).map((g) => `<optgroup label="${esc(g.macro)}">${g.tavole.map((x) => `<option value="${esc(x.codice)}">${esc(x.nome)} (${esc(x.codice)})</option>`).join("")}</optgroup>`).join("");
    $("#lt-n-comune-lista").innerHTML = (window.COMUNI_CALABRIA || []).map((x) => `<option value="${esc(x)}">`).join("");
    if (!Object.keys(E).length) $("#lt-esito-op").innerHTML = `<span class="text-danger">Catalogo delle tavole non disponibile.</span>`;
    if ($("#lt-cartella").value) await carica();
    else $("#lt-elenco").innerHTML = `<div class="vuoto">Scegli la cartella del Portal in cui sono salvate le tavole.</div>`;
  }

  // ---------------------------------------------------------------- elenco
  async function carica() {
    const id = $("#lt-cartella").value;
    $("#lt-elenco").innerHTML = `<p class="small text-muted">Caricamento…</p>`;
    try {
      tavole = [];
      for (let start = 1; start > 0;) {
        const j = await (await fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}/${id}?f=json&num=100&start=${start}&token=${encodeURIComponent(sessione.token)}`)).json();
        if (j.error) throw new Error(j.error.message);
        tavole.push(...(j.items || []).filter((x) => (x.tags || []).includes(TAG)));
        start = j.nextStart > 0 ? j.nextStart : 0;
      }
      const comuni = [...new Set(tavole.map((x) => tagVal(x.tags, "comune")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
      const sc = $("#lt-comune").value, se = $("#lt-elaborato").value, E = elaborati();
      $("#lt-comune").innerHTML = `<option value="">Tutti</option>` + comuni.map((x) => `<option${x === sc ? " selected" : ""}>${esc(x)}</option>`).join("");
      const codici = [...new Set(tavole.map((x) => tagVal(x.tags, "codice")).filter(Boolean))].sort();
      $("#lt-elaborato").innerHTML = `<option value="">Tutti</option>` + codici.map((x) => `<option value="${esc(x)}"${x === se ? " selected" : ""}>${esc(E[x] ? E[x].nome : x)}</option>`).join("");
      disegna();
    } catch (e) { $("#lt-elenco").innerHTML = `<div class="msg msg-err">Tavole non disponibili: ${esc(e.message)}</div>`; }
  }
  function disegna() {
    const fc = $("#lt-comune").value, fe = $("#lt-elaborato").value, E = elaborati();
    const righe = tavole.filter((x) => (!fc || tagVal(x.tags, "comune") === fc) && (!fe || tagVal(x.tags, "codice") === fe)).sort((a, b) => b.modified - a.modified);
    if (!tavole.length) { $("#lt-elenco").innerHTML = `<div class="vuoto">Nessuna tavola in questa cartella.</div>`; return; }
    if (!righe.length) { $("#lt-elenco").innerHTML = `<div class="vuoto">Nessuna tavola con questi filtri.</div>`; return; }
    $("#lt-elenco").innerHTML = `<div class="table-responsive"><table class="table table-sm tab-report align-middle"><thead><tr>
      <th>Aggiornata</th><th>Comune</th><th>Elaborato</th><th>Tavola</th><th></th></tr></thead><tbody>` +
      righe.map((x) => {
        const cod = tagVal(x.tags, "codice"), el = E[cod], inviata = (x.tags || []).includes("urb-inviata");
        return `<tr><td>${data(x.modified)}</td><td>${esc(tagVal(x.tags, "comune"))}</td>
          <td>${esc(el ? el.nome : cod)}<div class="small text-muted">${esc(el ? el.macro : "")} · ${esc(cod)}</div></td>
          <td><strong>${esc(x.title)}</strong>${inviata ? ' <span class="pill pill-blu">inviata</span>' : ""}<div class="small text-muted">${esc(x.name || "")}</div></td>
          <td class="text-nowrap"><a href="#" class="btn btn-outline-secondary btn-sm" data-scarica="${esc(x.id)}" data-nome="${esc(x.name || x.title + ".pdf")}">Scarica</a>
            ${inviata ? "" : `<button class="btn btn-outline-primary btn-sm" type="button" data-sostituisci="${esc(x.id)}">Sostituisci PDF</button>
            <button class="btn btn-outline-danger btn-sm" type="button" data-elimina="${esc(x.id)}" data-titolo="${esc(x.title)}">Elimina</button>`}</td></tr>`;
      }).join("") + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- web tool (upload del file + job)
  async function gp(url, corpo) {
    const fd = corpo instanceof FormData ? corpo : new FormData();
    if (!(corpo instanceof FormData)) for (const [k, v] of Object.entries(corpo)) fd.append(k, v);
    fd.append("f", "json");
    const j = await (await fetch(url, { method: "POST", body: fd })).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }
  async function lavoro(taskUrl, campi, file) {
    const task = taskUrl.replace(/\/+$/, ""), servizio = task.replace(/\/[^/]+$/, "");
    if (file) {
      const fd = new FormData(); fd.append("file", file);
      const up = await gp(servizio + "/uploads/upload", fd);
      campi = { ...campi, tavola: JSON.stringify({ itemID: up.item.itemID }) };
    }
    let st = await gp(task + "/submitJob", campi);
    for (let i = 0; i < 150 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) { await pausa(2000); st = await gp(`${task}/jobs/${st.jobId}`, {}); }
    if (st.jobStatus !== "esriJobSucceeded") {
      throw new Error((st.messages || []).filter((x) => /Error/.test(x.type) && !/^Failed/.test(x.description)).map((x) => x.description.trim()).join(" · ") || st.jobStatus);
    }
  }

  // ---------------------------------------------------------------- carica / sostituisci / elimina
  function apriModulo(item) {
    sostituisci = item || null;
    $("#lt-modulo").hidden = false;
    $("#lt-modulo-titolo").textContent = item ? `Sostituisci il PDF di “${item.title}”` : "Carica una tavola";
    $("#lt-n-file").value = "";
    $("#lt-n-titolo").value = item ? item.title : "";
    $("#lt-n-codice").value = item ? tagVal(item.tags, "codice") : "";
    $("#lt-n-comune").value = item ? tagVal(item.tags, "comune") : "";
    $("#lt-n-codice").disabled = $("#lt-n-comune").disabled = false;
    $("#lt-modulo").scrollIntoView({ behavior: "smooth" });
  }
  async function invia() {
    const f = $("#lt-n-file").files[0], comune = $("#lt-n-comune").value.trim();
    const mancano = [!f && "il PDF", !$("#lt-n-codice").value && "l'elaborato", !(window.COMUNI_CALABRIA || []).includes(comune) && "il Comune",
      !$("#lt-n-cartella").value && "la cartella", !$("#lt-n-condivisione").value && "la condivisione"].filter(Boolean);
    if (mancano.length) { $("#lt-esito-op").innerHTML = `<span class="text-danger">Manca ${mancano.join(", ")}.</span>`; return; }
    $("#lt-invia").disabled = true;
    $("#lt-esito-op").innerHTML = `<span class="text-muted">${sostituisci ? "Sostituzione" : "Caricamento"} della tavola (UploadTavola)…</span>`;
    try {
      await lavoro(CFG.uploadTavolaUrl, { codice: $("#lt-n-codice").value, item_catalogo: CFG.tavoleItem, comune, ambito: CFG.ambitoPagina,
        titolo: $("#lt-n-titolo").value.trim(), token: sessione.token, item_tavola: sostituisci ? sostituisci.id : "",
        cartella_portal: $("#lt-n-cartella").value, condivisione: $("#lt-n-condivisione").value,
        gruppi: [...$("#lt-n-gruppi").selectedOptions].map((o) => o.value).join(",") }, f);
      $("#lt-esito-op").innerHTML = `<span class="text-success">Tavola ${sostituisci ? "sostituita" : "caricata"}.</span>`;
      $("#lt-modulo").hidden = true; sostituisci = null;
      if ($("#lt-cartella").value) await carica();
    } catch (e) { $("#lt-esito-op").innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
    finally { $("#lt-invia").disabled = false; }
  }
  async function elimina(id, titolo) {
    if (!confirm(`Eliminare la tavola “${titolo}”?\n\nIl PDF viene eliminato dal Portal e l'operazione non si può annullare.`)) return;
    $("#lt-esito-op").innerHTML = `<span class="text-muted">Eliminazione di “${esc(titolo)}” (EliminaTavola)…</span>`;
    try {
      await lavoro(CFG.eliminaTavolaUrl, { item_tavola: id, token: sessione.token });
      $("#lt-esito-op").innerHTML = `<span class="text-success">Tavola “${esc(titolo)}” eliminata.</span>`;
      await carica();
    } catch (e) { $("#lt-esito-op").innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
  }
  async function scarica(id, nome) { // il file passa dal browser: il token non finisce in un indirizzo
    const b = await (await fetch(`${portal}/sharing/rest/content/items/${id}/data`, { method: "POST", body: new URLSearchParams({ token: sessione.token }) })).blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $("#lt-cartella").addEventListener("change", () => carica());
  $("#lt-comune").addEventListener("change", disegna);
  $("#lt-elaborato").addEventListener("change", disegna);
  $("#lt-nuova").addEventListener("click", () => apriModulo(null));
  $("#lt-annulla").addEventListener("click", () => { $("#lt-modulo").hidden = true; sostituisci = null; });
  $("#lt-invia").addEventListener("click", invia);
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-vista=le-mie-tavole]")) return;
    if (e.target.closest("[data-apri-accesso]")) { e.preventDefault(); window.ACCESSO.apriPannello(); return; }
    const s = e.target.closest("[data-scarica]");
    if (s) { e.preventDefault(); scarica(s.dataset.scarica, s.dataset.nome).catch((x) => alert("Download non riuscito: " + x.message)); return; }
    const so = e.target.closest("[data-sostituisci]");
    if (so) { apriModulo(tavole.find((x) => x.id === so.dataset.sostituisci)); return; }
    const el = e.target.closest("[data-elimina]");
    if (el) elimina(el.dataset.elimina, el.dataset.titolo);
  });
  const vista = () => { if (location.hash === "#/le-mie-tavole") avvio().catch((e) => { $("#lt-elenco").innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; }); };
  window.addEventListener("hashchange", vista);
  document.addEventListener("accesso-cambiato", vista);
  vista();
})();
