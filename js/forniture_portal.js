// "Le mie forniture" dal Portal: le forniture salvate da ValidaFornitura nell'account dell'utente, cartella per
// cartella (l'utente sceglie la cartella), con filtri per Comune ed esito. Per ogni fornitura: zip caricato, report
// PDF e pacchetto errori (item collegati dai tag report:<id> ed errori:<id>), e "Sostituisci con un nuovo zip", che
// apre Carica e verifica in modalita' sovrascrittura (#/verifica/<id>: ValidaFornitura con item_fornitura).
// L'accesso e' quello del pulsante in alto (js/accesso.js).
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  if (!$("#fp-elenco")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tagVal = (tags, k) => ((tags || []).find((t) => t.startsWith(k + ":")) || "").slice(k.length + 1);
  const data = (ms) => new Date(ms).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  const TAG = "urb-fornitura";
  let sessione = null, forniture = [];

  // esito e conteggi dal riepilogo dell'item, scritto da ValidaFornitura: "NON CONFORME: 3 errori, 1 avvisi (data)"
  function esito(snippet) {
    const m = /^(CONFORME|NON CONFORME): (\d+) errori, (\d+) avvisi/.exec(snippet || "");
    return m ? { esito: m[1], errori: +m[2], avvisi: +m[3] } : { esito: "", errori: null, avvisi: null };
  }

  async function cartelle() {
    sessione = window.ACCESSO && window.ACCESSO.sessione();
    if (!sessione) {
      $("#fp-accesso").innerHTML = `<div class="msg msg-warn">Per vedere le forniture salvate sul Portal <a href="#" data-apri-accesso>accedi al Portal</a> con il pulsante in alto.</div>`;
      $("#fp-filtri").hidden = true; $("#fp-elenco").innerHTML = ""; return;
    }
    $("#fp-accesso").innerHTML = "";
    $("#fp-filtri").hidden = false;
    const j = await (await fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}?f=json&num=1&token=${encodeURIComponent(sessione.token)}`)).json();
    const scelta = $("#fp-cartella").value;
    $("#fp-cartella").innerHTML = `<option value="" disabled${scelta ? "" : " selected"}>— scegli la cartella —</option>` +
      (j.folders || []).sort((a, b) => a.title.localeCompare(b.title, "it"))
        .map((c) => `<option value="${esc(c.id)}"${c.id === scelta ? " selected" : ""}>${esc(c.title)}</option>`).join("");
    if ($("#fp-cartella").value) await carica();
    else $("#fp-elenco").innerHTML = `<div class="vuoto">Scegli la cartella del Portal in cui sono salvate le forniture.</div>`;
  }

  async function carica() { // item della cartella con il tag delle forniture
    const id = $("#fp-cartella").value;
    $("#fp-elenco").innerHTML = `<p class="small text-muted">Caricamento…</p>`;
    try {
      forniture = [];
      for (let start = 1; start > 0;) {
        const j = await (await fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}/${id}?f=json&num=100&start=${start}&token=${encodeURIComponent(sessione.token)}`)).json();
        if (j.error) throw new Error(j.error.message);
        forniture.push(...(j.items || []).filter((x) => (x.tags || []).includes(TAG)));
        start = j.nextStart > 0 ? j.nextStart : 0;
      }
      const comuni = [...new Set(forniture.map((f) => tagVal(f.tags, "comune")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
      const sc = $("#fp-comune").value;
      $("#fp-comune").innerHTML = `<option value="">Tutti</option>` + comuni.map((c) => `<option${c === sc ? " selected" : ""}>${esc(c)}</option>`).join("");
      disegna();
    } catch (e) { $("#fp-elenco").innerHTML = `<div class="msg msg-err">Forniture non disponibili: ${esc(e.message)}</div>`; }
  }

  function disegna() {
    const fc = $("#fp-comune").value, fe = $("#fp-esito").value;
    const righe = forniture.filter((f) => (!fc || tagVal(f.tags, "comune") === fc) && (!fe || esito(f.snippet).esito === fe))
      .sort((a, b) => b.modified - a.modified);
    if (!forniture.length) { $("#fp-elenco").innerHTML = `<div class="vuoto">Nessuna fornitura in questa cartella. <a href="#/verifica">Carica e verifica una fornitura</a>.</div>`; return; }
    if (!righe.length) { $("#fp-elenco").innerHTML = `<div class="vuoto">Nessuna fornitura con questi filtri.</div>`; return; }
    $("#fp-elenco").innerHTML = `<div class="table-responsive"><table class="table table-sm tab-report align-middle"><thead><tr>
      <th>Ultima validazione</th><th>Comune</th><th>Fornitura</th><th>Esito</th><th class="num">Errori</th><th class="num">Avvisi</th><th>Scarica</th><th></th></tr></thead><tbody>` +
      righe.map((f) => {
        const e = esito(f.snippet), rep = tagVal(f.tags, "report"), err = tagVal(f.tags, "errori");
        const pill = e.esito ? `<span class="pill ${e.esito === "CONFORME" ? "pill-ok" : "pill-err"}">${esc(e.esito)}</span>` : "–";
        return `<tr><td>${data(f.modified)}</td><td>${esc(tagVal(f.tags, "comune"))}</td>
          <td><strong>${esc(f.title)}</strong><div class="small text-muted">${esc(f.name || "")} · ${esc(tagVal(f.tags, "ambito"))}</div></td>
          <td>${pill}</td><td class="num">${e.errori ?? "–"}</td><td class="num">${e.avvisi ?? "–"}</td>
          <td class="text-nowrap small"><a href="#" data-scarica="${esc(f.id)}" data-nome="${esc(f.name || f.title + ".zip")}">zip</a>
            ${rep ? ` · <a href="#" data-scarica="${esc(rep)}" data-nome="${esc(f.title)}_report.pdf">report</a>` : ""}
            ${err ? ` · <a href="#" data-scarica="${esc(err)}" data-nome="${esc(f.title)}_errori.zip">errori</a>` : ""}</td>
          <td><a class="btn btn-outline-primary btn-sm text-nowrap" href="#/verifica/${esc(f.id)}">Sostituisci con un nuovo zip</a></td></tr>`;
      }).join("") + "</tbody></table></div>";
  }

  async function scarica(id, nome) { // il file passa dal browser: il token non finisce in un indirizzo
    const r = await fetch(`${portal}/sharing/rest/content/items/${id}/data`, { method: "POST", body: new URLSearchParams({ token: sessione.token }) });
    const b = await r.blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $("#fp-cartella").addEventListener("change", () => carica());
  $("#fp-comune").addEventListener("change", disegna);
  $("#fp-esito").addEventListener("change", disegna);
  $("#fp-elenco").addEventListener("click", (e) => {
    const a = e.target.closest("[data-scarica]");
    if (a) { e.preventDefault(); scarica(a.dataset.scarica, a.dataset.nome).catch((x) => alert("Download non riuscito: " + x.message)); }
  });
  $("#fp-accesso").addEventListener("click", (e) => { if (e.target.closest("[data-apri-accesso]")) { e.preventDefault(); window.ACCESSO.apriPannello(); } });
  const vista = () => { if (location.hash === "#/forniture") cartelle().catch((e) => { $("#fp-elenco").innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; }); };
  window.addEventListener("hashchange", vista);
  document.addEventListener("accesso-cambiato", vista);
  vista();
})();
