// Template di riferimento: elenco e struttura letti dal Portal, nessuna copia delle regole nel mockup.
//  - elenco: item "File Geodatabase" del Portal il cui titolo contiene CONFIG_MOCKUP.templateFiltro
//    (confronto senza maiuscole e accenti), nella cartella templateCartella o del proprietario templateOwner.
//    Basta caricare un nuovo template sul Portal perche' compaia nel menu.
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
    let q = 'type:"File Geodatabase"';
    if (CFG.templateCartella) q += ` ownerfolder:${CFG.templateCartella}`;
    if (CFG.templateOwner) q += ` owner:${CFG.templateOwner}`;
    const r = await fetch(`${portal}/sharing/rest/search?f=json&num=100&sortField=title&q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const filtro = norm(CFG.templateFiltro || "template");
    return (j.results || []).filter((x) => norm(x.title).includes(filtro))
      .map((x) => ({ id: x.id, titolo: x.title, modificato: x.modified }));
  }

  async function gp(url, body) {
    if (body) { body.append("f", "json"); if (CFG.token) body.append("token", CFG.token); }
    const u = body ? url : url + "?f=json" + (CFG.token ? "&token=" + encodeURIComponent(CFG.token) : "");
    const j = await (await fetch(u, body ? { method: "POST", body } : {})).json();
    if (j.error) throw new Error(j.error.message || "errore del servizio");
    return j;
  }

  async function descrivi(item) {
    const chiave = `tpl:${item.id}:${item.modificato}`, salvato = memo.get(chiave);
    if (salvato) return JSON.parse(salvato);
    const task = CFG.descriviUrl.replace(/\/+$/, "");
    const fd = new FormData(); fd.append("item_template", item.id);
    let st = await gp(task + "/submitJob", fd);
    const id = st.jobId;
    for (let i = 0; i < 150 && !/Succeeded|Failed|Cancelled|TimedOut/.test(st.jobStatus); i++) {
      await pausa(1500); st = await gp(`${task}/jobs/${id}`);
    }
    if (st.jobStatus !== "esriJobSucceeded") throw new Error("descrizione del template non riuscita: " + st.jobStatus);
    const v = (await gp(`${task}/jobs/${id}/results/modello_testo`)).value;
    const m = typeof v === "string" ? JSON.parse(v) : v;
    memo.set(chiave, JSON.stringify(m));
    return m;
  }

  const T = window.TEMPLATE = {
    elenco: [], attivo: null, errore: null,
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
      return await T.scegli(memo.get("tpl-scelto") || CFG.templateDefault);
    } catch (e) {
      T.errore = e.message; console.warn("Template dal Portal non disponibile:", e.message);
      document.dispatchEvent(new CustomEvent("template-cambiato", { detail: null }));
      return null;
    }
  })();
})();
