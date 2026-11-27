// Accesso al Portal con l'account dell'utente (OAuth 2, applicazione registrata: CONFIG_MOCKUP.appId), dal pulsante
// nella barra in alto, valido per tutte le pagine (Carica template, Regole topologiche, Template e regole...).
// Due modi (CONFIG_MOCKUP.oauthModo): "codice" = il Portal mostra un codice monouso da incollare qui, scambiato con
// il token (PKCE; non servono indirizzi di ritorno registrati); "redirect" = la pagina oauth-callback.html riceve il
// token e lo passa a questa finestra (servono gli indirizzi di ritorno registrati).
// La sessione { token, utente, scade } sta in sessionStorage ("psc-admin"); a ogni cambio parte l'evento
// "accesso-cambiato" sul document. window.ACCESSO.sessione() restituisce la sessione valida o null.
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CHIAVE = "psc-admin";

  function sessione() {
    try { const s = JSON.parse(sessionStorage.getItem(CHIAVE)); return s && s.scade > Date.now() ? s : null; } catch (e) { return null; }
  }
  function cambia(s) {
    try { if (s) sessionStorage.setItem(CHIAVE, JSON.stringify(s)); else sessionStorage.removeItem(CHIAVE); } catch (e) { /* storage bloccato */ }
    disegna();
    document.dispatchEvent(new CustomEvent("accesso-cambiato", { detail: s }));
  }
  async function apri(token, scadeSec) {
    const j = await (await fetch(`${portal}/sharing/rest/community/self?f=json&token=${encodeURIComponent(token)}`)).json();
    if (j.error || !j.username) throw new Error(j.error ? j.error.message : "accesso non riuscito");
    if (!(j.privileges || []).includes("portal:user:createItem")) throw new Error(`l'utente ${j.username} non può creare elementi sul Portal`);
    $("#accesso-pannello").hidden = true;
    cambia({ token, utente: j.username, scade: Date.now() + (scadeSec || 7200) * 1000 });
  }

  // ---------------------------------------------------------------- interfaccia: pulsante in alto + pannello
  function disegna(errore) {
    const s = sessione(), btn = $("#accesso-btn"), box = $("#accesso-contenuto");
    btn.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z"/></svg>` +
      `<span class="d-none d-md-inline"> ${s ? esc(s.utente) : "Accedi al Portal"}</span>`;
    if (s) {
      box.innerHTML = `<div class="small mb-2">Accesso al Portal come <strong>${esc(s.utente)}</strong>.</div>
        <button id="accesso-esci" class="btn btn-outline-secondary btn-sm" type="button">Esci</button>`;
      $("#accesso-esci").onclick = () => { $("#accesso-pannello").hidden = true; cambia(null); };
      return;
    }
    const err = errore ? `<div class="small text-danger mt-1">${esc(errore)}</div>` : "";
    if (!CFG.appId) { box.innerHTML = `<div class="small">Accesso non disponibile: manca <code>appId</code> in <code>js/config.js</code>.</div>`; return; }
    if (CFG.oauthModo === "redirect") {
      box.innerHTML = `<button id="accesso-accedi" class="btn btn-primary btn-sm" type="button">Accedi con l'account del Portal</button>${err}`;
      $("#accesso-accedi").onclick = accediRedirect;
      return;
    }
    box.innerHTML = `<button id="accesso-accedi" class="btn btn-primary btn-sm" type="button">1. Accedi con l'account del Portal</button>
      <div class="small text-muted mt-1">Si apre la pagina di accesso del Portal regionale: dopo l'accesso mostra un codice.</div>
      <label for="accesso-codice" class="form-label-plain mt-2">2. Codice mostrato dal Portal</label>
      <div class="d-flex gap-2"><input id="accesso-codice" class="form-control form-control-sm" type="text" autocomplete="off" placeholder="Incolla il codice">
      <button id="accesso-conferma" class="btn btn-outline-primary btn-sm" type="button">Conferma</button></div>${err}`;
    $("#accesso-accedi").onclick = accediCodice;
    $("#accesso-conferma").onclick = () => confermaCodice($("#accesso-codice").value.trim()).catch((x) => disegna(x.message));
  }

  // accesso con codice (OAuth 2 + PKCE, ritorno "out of band"): il codice vale una volta e per pochi minuti
  const OOB = "urn:ietf:wg:oauth:2.0:oob";
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  let verificatore = null;
  async function accediCodice() {
    verificatore = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const sfida = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificatore)));
    window.open(`${portal}/sharing/rest/oauth2/authorize?client_id=${encodeURIComponent(CFG.appId)}&response_type=code` +
      `&expiration=120&redirect_uri=${encodeURIComponent(OOB)}&code_challenge=${sfida}&code_challenge_method=S256`, "oauth-portal", "width=520,height=680");
  }
  async function confermaCodice(codice) {
    if (!codice) throw new Error("incolla il codice mostrato dal Portal");
    if (!verificatore) throw new Error("prima clicca su “Accedi con l'account del Portal”");
    const fd = new FormData();
    for (const [k, v] of Object.entries({ client_id: CFG.appId, grant_type: "authorization_code", code: codice,
      redirect_uri: OOB, code_verifier: verificatore, f: "json" })) fd.append(k, v);
    const j = await (await fetch(`${portal}/sharing/rest/oauth2/token`, { method: "POST", body: fd })).json();
    if (j.error || !j.access_token) throw new Error((j.error && (j.error_description || j.error.message || j.error)) || "codice non valido o scaduto");
    verificatore = null;
    await apri(j.access_token, j.expires_in);
  }
  function accediRedirect() {
    const ritorno = new URL("oauth-callback.html", location.href).href;
    const w = window.open(`${portal}/sharing/rest/oauth2/authorize?client_id=${encodeURIComponent(CFG.appId)}` +
      `&response_type=token&expiration=120&redirect_uri=${encodeURIComponent(ritorno)}`, "oauth-portal", "width=520,height=680");
    const ricevi = (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== "oauth") return;
      window.removeEventListener("message", ricevi);
      if (w) w.close();
      if (e.data.errore || !e.data.token) disegna(e.data.errore || "accesso annullato");
      else apri(e.data.token, e.data.scade).catch((x) => disegna(x.message));
    };
    window.addEventListener("message", ricevi);
  }

  window.ACCESSO = { sessione, apriPannello: () => { $("#accesso-pannello").hidden = false; } };
  if (!$("#accesso-btn")) return;
  $("#accesso-btn").onclick = () => { $("#accesso-pannello").hidden = !$("#accesso-pannello").hidden; };
  $("#accesso-chiudi").onclick = () => { $("#accesso-pannello").hidden = true; };
  disegna();
  // la sessione scade: il pulsante torna "Accedi" senza ricaricare la pagina
  setInterval(() => { const s = sessione(); if (!s && /accesso-esci/.test($("#accesso-contenuto").innerHTML)) cambia(null); }, 60000);
})();
