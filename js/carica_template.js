// Servizio "Carica template" (amministratore regionale): pubblica sul Portal una nuova versione del template.
//  1. accesso al Portal: OAuth con CONFIG_MOCKUP.appId (pagina oauth-callback.html), oppure token incollato;
//  2. il gdb scelto come cartella viene compresso nel browser (JSZip); uno zip viene usato cosi' com'e';
//  3. upload come item "File Geodatabase" dell'utente, con il tag che lo fa comparire tra le versioni;
//  4. controllo della struttura con il tool "Descrivi template" (sistema di riferimento = crsTemplate);
//  5. se corretto, condivisione con tutti: diventa la versione corrente.
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let sessione = null; // { token, utente }
  let archivio = null; // { blob, nome }

  async function rest(url, campi) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...campi, f: "json", token: sessione.token })) fd.append(k, v);
    const j = await (await fetch(url, { method: "POST", body: fd })).json();
    if (j.error) throw new Error(j.error.message || "errore del Portal");
    return j;
  }

  // ---------------------------------------------------------------- accesso
  async function usaToken(token) {
    const j = await (await fetch(`${portal}/sharing/rest/community/self?f=json&token=${encodeURIComponent(token)}`)).json();
    if (j.error || !j.username) throw new Error(j.error ? j.error.message : "token non valido");
    if (!(j.privileges || []).includes("portal:user:createItem")) throw new Error(`l'utente ${j.username} non può creare elementi sul Portal`);
    sessione = { token, utente: j.username };
    disegnaAccesso(); abilita();
  }
  function disegnaAccesso(errore) {
    const box = $("#admin-accesso");
    if (sessione) {
      box.innerHTML = `<div class="msg msg-info">Accesso al Portal come <strong>${esc(sessione.utente)}</strong>. <a href="#" id="admin-esci">Esci</a></div>`;
      $("#admin-esci").onclick = (e) => { e.preventDefault(); sessione = null; disegnaAccesso(); abilita(); };
      return;
    }
    const err = errore ? `<div class="small text-danger mt-1">${esc(errore)}</div>` : "";
    if (CFG.appId) {
      box.innerHTML = `<button id="admin-accedi" class="btn btn-outline-primary btn-sm" type="button">Accedi al Portal</button>${err}`;
      $("#admin-accedi").onclick = accediOAuth;
    } else {
      box.innerHTML = `<label for="admin-token" class="form-label-plain">Token del Portal</label>
        <div class="d-flex gap-2"><input id="admin-token" class="form-control form-control-sm" type="password" autocomplete="off" placeholder="Incolla un token dell'amministratore">
        <button id="admin-usa" class="btn btn-outline-primary btn-sm" type="button">Usa</button></div>
        <div class="small text-muted mt-1">L'accesso diretto con l'account del Portal si attiva registrando l'applicazione (appId nel config).</div>${err}`;
      $("#admin-usa").onclick = () => usaToken($("#admin-token").value.trim()).catch((e) => disegnaAccesso(e.message));
    }
  }
  function accediOAuth() {
    const ritorno = new URL("oauth-callback.html", location.href).href;
    const url = `${portal}/sharing/rest/oauth2/authorize?client_id=${encodeURIComponent(CFG.appId)}&response_type=token&expiration=120&redirect_uri=${encodeURIComponent(ritorno)}`;
    const w = window.open(url, "oauth", "width=520,height=640");
    const ricevi = (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== "oauth") return;
      window.removeEventListener("message", ricevi);
      if (w) w.close();
      if (e.data.errore) disegnaAccesso(e.data.errore);
      else usaToken(e.data.token).catch((x) => disegnaAccesso(x.message));
    };
    window.addEventListener("message", ricevi);
  }

  // ---------------------------------------------------------------- scelta del template
  async function daCartella(files) {
    const lista = [...files];
    const primo = lista[0] && lista[0].webkitRelativePath.split("/");
    if (!primo) throw new Error("cartella vuota");
    // la cartella scelta e' il .gdb, oppure lo contiene
    const gdb = lista.map((f) => f.webkitRelativePath.split("/")).map((p) => p.findIndex((x) => /\.gdb$/i.test(x))).find((i) => i >= 0);
    if (gdb === undefined) throw new Error("la cartella non contiene un File Geodatabase (.gdb)");
    const zip = new JSZip();
    let nome = null;
    for (const f of lista) {
      const p = f.webkitRelativePath.split("/");
      const i = p.findIndex((x) => /\.gdb$/i.test(x));
      if (i < 0 || /\.lock$/i.test(f.name)) continue;
      nome = nome || p[i];
      zip.file(p.slice(i).join("/"), f);
    }
    return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), nome: nome.replace(/\.gdb$/i, "") + ".gdb.zip" };
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
  function abilita() { $("#tpl-carica").disabled = !(sessione && archivio && $("#tpl-titolo").value.trim()); }

  // ---------------------------------------------------------------- caricamento
  function passo(testo) {
    const li = document.createElement("li"); li.innerHTML = `${esc(testo)} <span class="text-muted">…</span>`;
    $("#tpl-passi").appendChild(li);
    return (ok, nota) => { li.innerHTML = `${esc(testo)} <span class="${ok ? "text-success" : "text-danger"}">${ok ? "fatto" : "errore"}${nota ? " – " + esc(nota) : ""}</span>`; };
  }
  async function carica() {
    const titolo = $("#tpl-titolo").value.trim(), filtro = CFG.templateFiltro || "template";
    $("#tpl-passi").innerHTML = "";
    if (!norm(titolo).includes(norm(filtro))) { passo("Controllo del titolo")(false, `deve contenere “${filtro}”`); return; }
    $("#tpl-carica").disabled = true;
    let p, item = null;
    try {
      p = passo("Caricamento sul Portal");
      const r = await rest(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}/addItem`, {
        file: new File([archivio.blob], archivio.nome, { type: "application/zip" }), type: "File Geodatabase",
        title: titolo, snippet: $("#tpl-note").value.trim(), tags: CFG.templateTag || "template" });
      item = r.id; p(true, "elemento " + item);

      p = passo("Controllo della struttura (Descrivi template)");
      const m = await window.TEMPLATE.descrivi({ id: item, modificato: Date.now() }, sessione.token);
      if (CFG.crsTemplate && m.epsg !== CFG.crsTemplate) {
        p(false, `${m.layer.length} layer, EPSG:${m.epsg} invece di EPSG:${CFG.crsTemplate}: template non condiviso, eliminalo o correggilo`);
        return;
      }
      p(true, `${m.layer.length} layer, ${m.crs} (EPSG:${m.epsg})`);

      p = passo("Condivisione con tutti");
      await rest(`${portal}/sharing/rest/content/users/${encodeURIComponent(sessione.utente)}/items/${item}/share`, { everyone: "true", org: "true" });
      p(true, "");

      p = passo("Aggiornamento dell'elenco delle versioni");
      await window.TEMPLATE.aggiorna();
      p(true, `“${titolo}” è la versione corrente`);
      archivio = null; $("#tpl-file").textContent = "Nessun file scelto"; $("#tpl-titolo").value = ""; $("#tpl-note").value = "";
    } catch (e) {
      if (p) p(false, e.message);
    } finally { abilita(); }
  }

  if (!$("#admin-accesso")) return;
  disegnaAccesso();
  $("#tpl-cartella").addEventListener("change", (e) => e.target.files.length && scegli(daCartella(e.target.files)));
  $("#tpl-zip").addEventListener("change", (e) => e.target.files[0] && scegli(daZip(e.target.files[0])));
  $("#tpl-titolo").addEventListener("input", abilita);
  $("#tpl-carica").addEventListener("click", carica);
})();
