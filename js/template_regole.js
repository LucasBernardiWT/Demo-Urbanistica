// Servizio "Template e regole topologiche" (amministratore regionale): mostra quali regole topologiche sono
// associate a ogni template e permette di cambiarle (web tool AssociaRegoleTopologia), per esempio quando si
// pubblica un nuovo file di regole. Le validazioni successive useranno le nuove regole.
// L'accesso e' quello della pagina "Carica template" (stessa sessione del browser).
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  if (!$("#tr-elenco")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const tagVal = (tags, k) => ((tags || []).find((t) => t.startsWith(k + ":")) || "").slice(k.length + 1);
  const data = (ms) => new Date(ms).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  let sessione = null;

  function leggiSessione() {
    try { const s = JSON.parse(sessionStorage.getItem("psc-admin")); return s && s.scade > Date.now() ? s : null; } catch (e) { return null; }
  }
  async function cerca(q) {
    const j = await (await fetch(`${portal}/sharing/rest/search?f=json&num=100&sortField=created&sortOrder=desc&q=${encodeURIComponent(q)}&token=${encodeURIComponent(sessione.token)}`)).json();
    if (j.error) throw new Error(j.error.message);
    return j.results || [];
  }
  async function gp(url, campi) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...campi, f: "json", token: sessione.token })) fd.append(k, v);
    const j = await (await fetch(url, { method: "POST", body: fd })).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }

  async function elenco() {
    sessione = leggiSessione();
    if (!sessione) {
      $("#tr-accesso").innerHTML = `<div class="msg msg-warn">Per gestire le associazioni accedi con l'account del Portal dalla pagina
        <a href="#/carica-template">Carica template</a>, poi torna qui.</div>`;
      $("#tr-elenco").innerHTML = ""; return;
    }
    $("#tr-accesso").innerHTML = `<div class="msg msg-info">Accesso al Portal come <strong>${esc(sessione.utente)}</strong>.</div>`;
    $("#tr-elenco").innerHTML = `<p class="small text-muted">Caricamento…</p>`;
    try {
      const [tpl, regole] = await Promise.all([cerca(`type:"File Geodatabase" AND tags:"${CFG.templateTag}"`), cerca(`tags:"${CFG.regoleTag}"`)]);
      const perId = Object.fromEntries(regole.map((r) => [r.id, r]));
      if (!tpl.length) { $("#tr-elenco").innerHTML = `<p class="small text-muted">Nessun template sul Portal.</p>`; return; }
      $("#tr-elenco").innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Template</th><th>Ambito</th>
        <th>Regole associate ora</th><th>Nuove regole</th><th></th></tr></thead><tbody>` + tpl.map((t) => {
          const amb = tagVal(t.tags, "ambito"), ora = tagVal(t.tags, "regole"), mio = t.owner === sessione.utente;
          const cand = regole.filter((r) => !amb || tagVal(r.tags, "ambito") === amb);
          const attuali = ora ? (perId[ora] ? `${esc(perId[ora].title)}<div class="small text-muted">modificate il ${data(perId[ora].modified)}</div>`
            : `<span class="small text-danger">item ${esc(ora)} non trovato</span>`) : `<span class="small text-danger">nessuna</span>`;
          return `<tr data-template="${esc(t.id)}"><td>${esc(t.title)}<div class="small text-muted">pubblicato il ${data(t.created)}</div></td><td>${esc(amb)}</td><td>${attuali}</td>
            <td><select class="form-select form-select-sm tr-regole"${mio ? "" : " disabled"}>${cand.map((r) => `<option value="${esc(r.id)}"${r.id === ora ? " selected" : ""}>${esc(r.title)}</option>`).join("") || "<option value=''>nessun file di regole</option>"}</select>
              ${mio ? "" : `<div class="small text-muted">template di ${esc(t.owner)}</div>`}</td>
            <td><button class="btn btn-primary btn-sm tr-associa" type="button" disabled>Associa</button></td></tr>`;
        }).join("") + "</tbody></table></div>";
      document.querySelectorAll("#tr-elenco tr[data-template]").forEach((tr) => {
        const sel = tr.querySelector(".tr-regole"), btn = tr.querySelector(".tr-associa");
        const ora = tagVal((tpl.find((t) => t.id === tr.dataset.template) || {}).tags, "regole");
        const aggiorna = () => { btn.disabled = sel.disabled || !sel.value || sel.value === ora; };
        sel.onchange = aggiorna; aggiorna();
        btn.onclick = () => associa(tr.dataset.template, sel.value, tr.querySelector("td").firstChild.textContent);
      });
    } catch (e) { $("#tr-elenco").innerHTML = `<div class="msg msg-err">Elenco non disponibile: ${esc(e.message)}</div>`; }
  }

  async function associa(template, regole, nome) {
    const li = document.createElement("li");
    $("#tr-passi").innerHTML = ""; $("#tr-passi").appendChild(li);
    li.innerHTML = `${esc(nome)}: controllo e associazione (AssociaRegoleTopologia) <span class="text-muted">…</span>`;
    document.querySelectorAll(".tr-associa").forEach((b) => { b.disabled = true; });
    try {
      const task = CFG.associaRegoleUrl.replace(/\/+$/, "");
      let st = await gp(task + "/submitJob", { item_template: template, item_regole: regole, token: sessione.token });
      const id = st.jobId;
      for (let i = 0; i < 100 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) { await pausa(2000); st = await gp(`${task}/jobs/${id}`, {}); }
      if (st.jobStatus !== "esriJobSucceeded") {
        const m = (st.messages || []).filter((x) => /Error/.test(x.type) && !/^Failed/.test(x.description)).map((x) => x.description.trim()).join(" · ");
        throw new Error(m || st.jobStatus);
      }
      li.innerHTML = `${esc(nome)}: <span class="text-success">regole associate – le prossime validazioni useranno le nuove regole</span>`;
    } catch (e) {
      li.innerHTML = `${esc(nome)}: <span class="text-danger">errore – ${esc(e.message)}</span>`;
    }
    await elenco();
  }

  const vista = () => { if (location.hash === "#/template-regole") elenco(); };
  window.addEventListener("hashchange", vista); vista();
})();
