// Template di riferimento: elenco e struttura letti dal Portal, nessuna copia delle regole nel mockup.
//  - elenco: item "File Geodatabase" del Portal il cui titolo contiene CONFIG_MOCKUP.templateFiltro
//    (confronto senza maiuscole e accenti), del proprietario templateOwner o con il tag templateTag (quello che
//    aggiunge il servizio "Carica template"), eventualmente nella cartella templateCartella. Ordinati dal piu'
//    recente: il primo e' il template corrente. Basta caricare un nuovo template sul Portal perche' compaia.
//  - struttura (layer, campi, codelist, dipendenze, CRS): dal tool "Descrivi template" del servizio
//    valida_attributi; conservata nel browser finche' l'item non cambia (data di modifica).
// Espone window.TEMPLATE e window.REGOLE_QTRP (struttura del template attivo); a ogni cambio di template
// emette l'evento "template-cambiato". window.MODELLO_PRONTO si risolve al primo caricamento.
(function () {
  "use strict";
  const CFG = window.CONFIG_MOCKUP || {};
  const portal = (CFG.portalUrl || "").replace(/\/+$/, "");
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const memo = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                 set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage pieno o bloccato */ } } };

  window.REGOLE_QTRP = { origine: "", layer: [] };

  async function elenco() {
    // nuovi template: tag generale + tag dell'ambito; vecchi (senza ambito): proprietario e titolo con "template"
    const nuovi = CFG.templateTag && `(tags:"${CFG.templateTag}" AND tags:"ambito:${CFG.ambitoPagina || "psc"}")`;
    const chi = [nuovi, CFG.templateOwner && `owner:${CFG.templateOwner}`].filter(Boolean);
    let q = 'type:"File Geodatabase"' + (chi.length ? ` AND (${chi.join(" OR ")})` : "");
    if (CFG.templateCartella) q += ` AND ownerfolder:${CFG.templateCartella}`;
    const r = await fetch(`${portal}/sharing/rest/search?f=json&num=100&sortField=created&sortOrder=desc&q=${encodeURIComponent(q)}&_=${Date.now()}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const filtro = norm(CFG.templateFiltro || "template");
    const ambito = `ambito:${CFG.ambitoPagina || "psc"}`;
    // un template nuovo senza regole topologiche non si puo' usare per validare: ai Comuni non si mostra,
    // alla Regione (sessione di amministrazione aperta) si mostra come "regole da definire"
    let regione = false;
    try { const a = JSON.parse(sessionStorage.getItem("psc-admin")); regione = !!(a && a.scade > Date.now()); } catch (e) { /* nessuna sessione */ }
    const nuovo = (x) => (x.tags || []).includes(ambito), conRegole = (x) => (x.tags || []).some((t) => t.startsWith("regole:"));
    return (j.results || []).filter((x) => (nuovo(x) && (conRegole(x) || regione))
        || (!(x.tags || []).some((t) => t.startsWith("ambito:")) && norm(x.title).includes(filtro)))
      .map((x) => ({ id: x.id, titolo: x.title, modificato: x.modified, creato: x.created, note: x.snippet || "", proprietario: x.owner,
                     daCompletare: nuovo(x) && !conRegole(x),
                     struttura: ((x.tags || []).find((t) => t.startsWith("struttura:")) || "").slice(10),
                     regole: ((x.tags || []).find((t) => t.startsWith("regole:")) || "").slice(7) }));
  }

  async function gp(url, body) {
    if (body) { body.append("f", "json"); if (CFG.token) body.append("token", CFG.token); }
    const u = body ? url : url + "?f=json" + (CFG.token ? "&token=" + encodeURIComponent(CFG.token) : "");
    const j = await (await fetch(u, body ? { method: "POST", body } : {})).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }

  // Struttura del template (layer, campi, codelist, dipendenze): il JSON che UploadTemplate ha ricavato dal gdb e
  // caricato come item collegato (tag struttura:<id> sul template). Token: quello dell'accesso, se c'e'.
  async function descrivi(item, token) {
    const tok = token || (window.ACCESSO && window.ACCESSO.sessione() && window.ACCESSO.sessione().token) || "";
    if (item.struttura) {
      const chiave = `tpl:${item.id}:${item.modificato}`, salvato = memo.get(chiave);
      if (salvato) return JSON.parse(salvato);
      const r = await fetch(`${portal}/sharing/rest/content/items/${item.struttura}/data${tok ? "?token=" + encodeURIComponent(tok) : ""}`);
      const b = await r.arrayBuffer();
      let m;
      if (new Uint8Array(b)[0] === 0x50) { // zip con il JSON (il Portal non accetta .json sciolti)
        const z = await JSZip.loadAsync(b);
        const n = Object.keys(z.files).find((x) => /\.json$/i.test(x));
        if (!n) throw new Error("struttura del template non leggibile");
        m = JSON.parse(await z.file(n).async("string"));
      } else m = JSON.parse(new TextDecoder().decode(b));
      if (m.error) throw new Error("struttura del template non accessibile: " + (m.error.message || ""));
      memo.set(chiave, JSON.stringify(m));
      return m;
    }
    // template caricati con le versioni precedenti (senza struttura collegata): vecchio servizio, se configurato
    if (!CFG.descriviUrl) throw new Error(`il template “${item.titolo}” non ha una struttura collegata: ricaricalo con UploadTemplate`);
    const chiave = `tpl:${item.id}:${item.modificato}`, salvato = !token && memo.get(chiave);
    if (salvato) return JSON.parse(salvato);
    const task = CFG.descriviUrl.replace(/\/+$/, "");
    const fd = new FormData(); fd.append("item_template", item.id);
    if (token) fd.append("token", token);
    let st = await gp(task + "/submitJob", fd);
    const id = st.jobId;
    for (let i = 0; i < 150 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) {
      await pausa(1500); st = await gp(`${task}/jobs/${id}`);
    }
    if (st.jobStatus !== "esriJobSucceeded") throw new Error("descrizione del template non riuscita: " + st.jobStatus);
    const v = (await gp(`${task}/jobs/${id}/results/modello_testo`)).value;
    const m = typeof v === "string" ? JSON.parse(v) : v;
    if (!token) memo.set(chiave, JSON.stringify(m));
    return m;
  }

  const T = window.TEMPLATE = {
    elenco: [], attivo: null, errore: null, descrivi,
    async aggiorna() { T.elenco = await elenco(); document.dispatchEvent(new CustomEvent("template-elenco")); return T.elenco; },
    async scegli(id) {
      const item = T.elenco.find((x) => x.id === id) || T.elenco[0];
      if (!item) throw new Error("nessun template trovato sul Portal");
      document.dispatchEvent(new CustomEvent("template-caricamento", { detail: item }));
      const m = await descrivi(item);
      T.attivo = item; window.REGOLE_QTRP = m; memo.set("tpl-scelto", item.id);
      document.dispatchEvent(new CustomEvent("template-cambiato", { detail: item }));
      return m;
    },
  };

  window.MODELLO_PRONTO = (async () => {
    try {
      T.elenco = await elenco();
      // il template corrente e' il piu' recente; la scelta dell'utente resta finche' il template esiste
      return await T.scegli(memo.get("tpl-scelto"));
    } catch (e) {
      T.errore = e.message; console.warn("Template dal Portal non disponibile:", e.message);
      document.dispatchEvent(new CustomEvent("template-cambiato", { detail: null }));
      return null;
    }
  })();
})();
