// Servizio "Carica template" (amministratore regionale): invia una nuova versione del template al web tool
// UploadTemplate, che la controlla, ne ricava la struttura (JSON) e carica gdb e struttura sul Portal.
//  1. accesso con l'account del Portal dal pulsante in alto (js/accesso.js), comune a tutte le pagine;
//  2. il gdb scelto come cartella viene compresso nel browser (JSZip); uno zip viene usato cosi' com'e';
//  3. lo zip va al servizio (uploads/upload), poi submitJob con titolo, note, cartella del Portal e token.
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const memo = { get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
                 set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage bloccato */ } },
                 via(k) { try { sessionStorage.removeItem(k); } catch (e) { /* storage bloccato */ } } };
  let sessione = null; // { token, utente, scade }
  let archivio = null; // { blob, nome }

  // ---------------------------------------------------------------- accesso (js/accesso.js, pulsante in alto)
  async function aggiornaSessione() {
    sessione = window.ACCESSO ? window.ACCESSO.sessione() : null;
    $("#tpl-modulo").disabled = !sessione;
    $("#admin-accesso").innerHTML = sessione
      ? `<div class="msg msg-info">Accesso al Portal come <strong>${esc(sessione.utente)}</strong>.</div>`
      : `<div class="msg msg-warn">Per caricare un template <a href="#" id="admin-apri">accedi al Portal</a> con il pulsante in alto a destra.</div>`;
    if (!sessione) { $("#admin-apri").onclick = (e) => { e.preventDefault(); window.ACCESSO.apriPannello(); }; abilita(); return; }
    await caricaCartelle();
    await caricaRegole();
    abilita();
  }
  async function caricaRegole() { // file di regole topologiche dell'ambito scelto
    if (!sessione) return;
    const q = `tags:"${CFG.regoleTag}" AND tags:"ambito:${$("#tpl-ambito").value}"`;
    const j = await (await fetch(`${portal}/sharing/rest/search?f=json&num=100&sortField=modified&sortOrder=desc&q=${encodeURIComponent(q)}&token=${encodeURIComponent(sessione.token)}`)).json();
    $("#tpl-regole").innerHTML = `<option value="">— le definisco dopo il caricamento —</option>` +
      (j.results || []).map((r) => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join("");
    abilita();
  }
  async function caricaCartelle() {
    const j = await (await fetch(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}?f=json&num=1&token=${encodeURIComponent(sessione.token)}`)).json();
    const cartelle = (j.folders || []).map((c) => c.title).sort((a, b) => a.localeCompare(b, "it"));
    const pred = CFG.cartellaTemplate || "Draft Urbanistica";
    if (!cartelle.includes(pred)) cartelle.unshift(pred);
    $("#tpl-cartella-portal").innerHTML = cartelle.map((c) => `<option${c === pred ? " selected" : ""}>${esc(c)}</option>`).join("");
    // gruppi dell'utente, per la condivisione facoltativa
    const io = await (await fetch(`${portal}/sharing/rest/community/self?f=json&token=${encodeURIComponent(sessione.token)}`)).json();
    $("#tpl-gruppi").innerHTML = (io.groups || []).sort((a, b) => a.title.localeCompare(b.title, "it"))
      .map((g) => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("") || "<option disabled>Nessun gruppo</option>";
  }

  // ---------------------------------------------------------------- scelta del template
  async function daCartella(files) {
    const zip = new JSZip();
    let nome = null;
    for (const f of files) {
      const p = f.webkitRelativePath.split("/");
      const i = p.findIndex((x) => /\.gdb$/i.test(x));
      if (i < 0 || /\.lock$/i.test(f.name)) continue;
      nome = nome || p[i];
      zip.file(p.slice(i).join("/"), f);
    }
    if (!nome) throw new Error("la cartella non contiene un File Geodatabase (.gdb)");
    return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), nome: nome + ".zip" };
  }
  async function daZip(file) {
    const zip = await JSZip.loadAsync(file);
    if (!Object.keys(zip.files).some((n) => /\.gdb\//i.test(n))) throw new Error("lo zip non contiene un File Geodatabase (.gdb)");
    return { blob: file, nome: file.name };
  }
  async function scegli(promessa) {
    $("#tpl-file").textContent = "Preparazione…";
    try {
      archivio = await promessa;
      $("#tpl-file").textContent = `${archivio.nome} (${(archivio.blob.size / 1024).toFixed(0)} KB)`;
    } catch (e) { archivio = null; $("#tpl-file").textContent = e.message; }
    abilita();
  }
  function abilita() { $("#tpl-carica").disabled = !(sessione && archivio && $("#tpl-condivisione").value && $("#tpl-cartella-portal").value); }

  // ---------------------------------------------------------------- invio al servizio UploadTemplate
  async function gp(url, campi) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...campi, f: "json", token: sessione.token })) fd.append(k, v);
    const j = await (await fetch(url, { method: "POST", body: fd })).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }
  function passo(testo) {
    const li = document.createElement("li"); li.innerHTML = `${esc(testo)} <span class="text-muted">…</span>`;
    $("#tpl-passi").appendChild(li);
    return (ok, nota) => { li.innerHTML = `${esc(testo)} <span class="${ok ? "text-success" : "text-danger"}">${ok ? "fatto" : "errore"}${nota ? " – " + esc(nota) : ""}</span>`; };
  }
  // ---------------------------------------------------------------- passo 2: regole topologiche del template caricato
  async function lavoro(url, campi) { // job asincrono di un web tool: attende la fine, errori con il codice del tool
    const task = url.replace(/\/+$/, "");
    let st = await gp(task + "/submitJob", campi);
    const id = st.jobId;
    for (let i = 0; i < 200 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) { await pausa(2000); st = await gp(`${task}/jobs/${id}`, {}); }
    if (st.jobStatus !== "esriJobSucceeded") {
      const m = (st.messages || []).filter((x) => /Error/.test(x.type) && !/^Failed/.test(x.description)).map((x) => x.description.trim()).join(" · ");
      throw new Error(m || st.jobStatus);
    }
    return async (n) => (await gp(`${task}/jobs/${id}/results/${n}`, {})).value;
  }
  function passoRegole(t) {
    const box = $("#tpl-passo-regole");
    if (t.regole) { box.hidden = true; return; } // regole gia' associate al caricamento
    box.hidden = false;
    $("#tpl-pr-titolo").textContent = t.titolo;
    $("#tpl-pr-esistenti").innerHTML = $("#tpl-regole").innerHTML.replace("— le definisco dopo il caricamento —", "— scegli le regole —");
    $("#tpl-pr-crea").href = `#/regole-topologia/${t.gdb}`;
    $("#tpl-pr-esito").innerHTML = "";
    $("#tpl-pr-conferma").onclick = async () => {
      const r = $("#tpl-pr-esistenti").value;
      if (!r) { $("#tpl-pr-esito").innerHTML = `<span class="text-danger">scegli un file di regole</span>`; return; }
      $("#tpl-pr-conferma").disabled = true;
      $("#tpl-pr-esito").innerHTML = `<span class="text-muted">Controllo e associazione (AssociaRegoleTopologia)…</span>`;
      try {
        await lavoro(CFG.associaRegoleUrl, { item_template: t.gdb, azione: "associa", item_regole: r, token: sessione.token });
        $("#tpl-pr-esito").innerHTML = `<span class="text-success">Regole associate: il template è completo.</span>`;
        if (window.TEMPLATE) await window.TEMPLATE.aggiorna();
      } catch (e) { $("#tpl-pr-esito").innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
      finally { $("#tpl-pr-conferma").disabled = false; }
    };
  }

  async function carica() {
    const titolo = $("#tpl-titolo").value.trim(), filtro = CFG.templateFiltro || "template";
    $("#tpl-passi").innerHTML = "";
    if (!window.ACCESSO.sessione()) { await aggiornaSessione(); return; }
    $("#tpl-carica").disabled = true;
    const task = CFG.uploadTemplateUrl.replace(/\/+$/, ""), servizio = task.replace(/\/[^/]+$/, "");
    let p, dopo = null;
    $("#tpl-passo-regole").hidden = true;
    try {
      p = passo("Invio del template al servizio");
      const up = await gp(servizio + "/uploads/upload", { file: new File([archivio.blob], archivio.nome, { type: "application/zip" }) });
      p(true, archivio.nome);

      p = passo("Controllo, struttura e caricamento sul Portal (UploadTemplate)");
      let st = await gp(task + "/submitJob", { template: JSON.stringify({ itemID: up.item.itemID }), titolo, note: $("#tpl-note").value.trim(), ambito: $("#tpl-ambito").value, epsg: CFG.crsTemplate, item_regole: $("#tpl-regole").value,
        token: sessione.token, cartella_portal: $("#tpl-cartella-portal").value, condivisione: $("#tpl-condivisione").value,
        gruppi: [...$("#tpl-gruppi").selectedOptions].map((o) => o.value).join(","), solo_verifica: "false" });
      const id = st.jobId;
      for (let i = 0; i < 200 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) { await pausa(2000); st = await gp(`${task}/jobs/${id}`, {}); }
      if (st.jobStatus !== "esriJobSucceeded") {
        // solo i messaggi d'errore del tool (codice UTnn e motivo), senza le righe generiche del server
        const m = (st.messages || []).filter((x) => /Error/.test(x.type) && !/^Failed/.test(x.description))
          .map((x) => x.description.trim()).join(" · ");
        throw new Error(m || st.jobStatus);
      }
      const r = async (n) => (await gp(`${task}/jobs/${id}/results/${n}`, {})).value;
      const [gdb, json, testo] = [await r("item_template"), await r("item_struttura"), await r("struttura_testo")];
      const m = typeof testo === "string" ? JSON.parse(testo) : testo;
      p(true, `${m.layer.length} layer, EPSG:${m.epsg}; template ${gdb}, struttura ${json}`);

      dopo = { gdb, struttura: json, titolo: titolo || archivio.nome.replace(/(\.gdb)?\.zip$/i, ""), ambito: $("#tpl-ambito").value, regole: $("#tpl-regole").value };
      p = passo("Aggiornamento dell'elenco delle versioni");
      if (window.TEMPLATE) await window.TEMPLATE.aggiorna();
      p(true, $("#tpl-condivisione").value === "tutti" ? `“${titolo || "Template"}” è la versione corrente` : `“${titolo || "Template"}” caricato (${$("#tpl-condivisione").value})`);
      archivio = null; $("#tpl-file").textContent = "Nessun file scelto"; $("#tpl-titolo").value = ""; $("#tpl-note").value = "";
      passoRegole(dopo);
    } catch (e) {
      if (p) p(false, e.message);
    } finally { abilita(); }
  }

  if (!$("#admin-accesso")) return;
  aggiornaSessione().catch(() => {});
  document.addEventListener("accesso-cambiato", () => aggiornaSessione().catch(() => {}));
  $("#tpl-cartella").addEventListener("change", (e) => e.target.files.length && scegli(daCartella(e.target.files)));
  $("#tpl-zip").addEventListener("change", (e) => e.target.files[0] && scegli(daZip(e.target.files[0])));
  $("#tpl-titolo").addEventListener("input", abilita);
  $("#tpl-ambito").innerHTML = (CFG.ambiti || [["psc", "PSC"]]).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  $("#tpl-carica").addEventListener("click", carica);
  $("#tpl-ambito").addEventListener("change", () => caricaRegole().catch(() => {}));
  $("#tpl-regole").addEventListener("change", abilita);
  $("#tpl-condivisione").addEventListener("change", abilita);
})();
