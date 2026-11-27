// Configurazione del mockup.
// gpUrl: URL del task del web tool "Valida attributi" (3 - Scripts/ValidaAttributi.pyt) su ArcGIS Enterprise:
//   https://<server>/server/rest/services/<cartella>/<servizio>/GPServer/<nome visualizzato del task, con %20>
//   Il servizio deve avere la capacità "Uploads" attiva. Vuoto = non collegato: i gdb non vengono controllati,
//   gli shapefile si controllano nel browser.
// topoUrl: URL del task del web tool "Valida topologia" (3 - Scripts/ValidaTopologia.pyt); vuoto = non collegato.
//   Gli shapefile sono controllati nel browser (js/topologia.js); il servizio serve per i File Geodatabase.
// Template e regole dei due servizi sono item del Portal: si aggiornano li', senza toccare il mockup.
// tavoleItem: item del Portal con regole_tavole_qtrp.json (catalogo tavole e layer minimi); vuoto = copia locale
//   js/regole_tavole_qtrp.json. portalUrl: Portal da cui leggere l'item.
// token: token ArcGIS se i servizi non sono pubblici (vuoto se condivisi con tutti).
// serverAncheShapefile: true = anche gli shapefile vengono controllati sul server invece che nel browser.
window.CONFIG_MOCKUP = {
  // gpUrl/topoUrl: vecchi servizi separati (non piu' pubblicati), sostituiti da validaFornituraUrl
  gpUrl: "",
  topoUrl: "",
  // validaFornituraUrl: web tool ValidaFornitura (attributi + topologia + salvataggio sul Portal, un solo job);
  // registroUrl: tabella hosted del registro forniture (vuoto = non ancora pubblicata)
  validaFornituraUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/ValidaFornitura/GPServer/ValidaFornitura",
  registroUrl: "",
  // eliminaFornituraUrl: web tool EliminaFornitura (fornitura + report + pacchetto errori; registro: "eliminata")
  eliminaFornituraUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/EliminaFornitura/GPServer/EliminaFornitura",
  portalUrl: "https://geohub-coll.regione.calabria.it/portal",
  tavoleItem: "ec041abfa08946c1a00aef046fb87886",
  // Template di riferimento (js/template_portal.js): item "File Geodatabase" del Portal con questa sottostringa nel
  // titolo (senza distinzione di maiuscole), nella cartella templateCartella (id) o del proprietario templateOwner.
  // descriviUrl: servizio descrivi_template, che restituisce la struttura del template.
  templateFiltro: "template",
  templateOwner: "portalmanager",
  templateTag: "urb-template",
  // ambiti (destinazione d'uso) dei template: il tool accetta qualsiasi valore, la lista si decide qui.
  // ambitoPagina: ambito dei template mostrati nella pagina Template e usati per i controlli
  ambiti: [["psc", "PSC / PSA – Piano Strutturale Comunale"], ["pot", "POT – Piano Operativo Temporale"],
           ["ptcp", "PTCP – Piano Territoriale di Coordinamento Provinciale"], ["qtrp", "QTRP e piani regionali"],
           ["settore", "Piani di settore regionali"]],
  ambitoPagina: "psc",
  templateCartella: "",
  descriviUrl: "", // vecchio servizio Descrivi template (non piu' pubblicato): la struttura si legge dal JSON collegato
  // downloadTemplateUrl: web tool DownloadTemplate (template in shapefile o GeoPackage, generati dal gdb)
  downloadTemplateUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/DownloadTemplate/GPServer/DownloadTemplate",
  // appId: id dell'applicazione OAuth registrata sul Portal (accesso con l'account del Portal); vuoto = accesso non attivo
  appId: "T1PQUbU9iD1BAhGw",
  // oauthModo: "codice" (il Portal mostra un codice da copiare; non servono indirizzi di ritorno registrati)
  //   oppure "redirect" (ritorno automatico su oauth-callback.html, da registrare sull'applicazione del Portal)
  oauthModo: "codice",
  // uploadTemplateUrl: web tool UploadTemplate; cartellaTemplate: cartella del Portal proposta per i nuovi template
  uploadTemplateUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/UploadTemplate/GPServer/UploadTemplate",
  cartellaTemplate: "Draft Urbanistica",
  // crsTemplate: sistema di riferimento richiesto ai template (Allegato A: RDN2008 / UTM 33N)
  crsTemplate: 7792,
  // Regole topologiche (js/regole_topologia.js): web tool UploadRegoleTopologia, tag degli item delle regole,
  // valori proposti per le regole nuove (li decide il frontend: il web tool non ha valori predefiniti)
  uploadRegoleTopologiaUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/UploadRegoleTopologia/GPServer/UploadRegoleTopologia",
  regoleTag: "urb-regole-topologia",
  // associaRegoleUrl: web tool AssociaRegoleTopologia (pagina "Template e regole topologiche")
  associaRegoleUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/AssociaRegoleTopologia/GPServer/AssociaRegoleTopologia",
  // regolePredefinite: il primo set di regole del template PSC (pulsante "Popola con le regole predefinite")
  regolePredefinite: {
    tolleranze: { area_minima_errore_m2: 4, distanza_confine_m: 20, sliver_area_m2: 0.36, sliver_sottigliezza: 0.03, cuspide_angolo_gradi: 1 },
    livelli: { copertura_fuori_tolleranza: "AVVISO", contenimento_fuori_tolleranza: "AVVISO", multiparte: "AVVISO", cuspide: "AVVISO" },
    strati: {
      zoneprg: { disgiunzione: "tutti", copertura: true },
      macrozone: { disgiunzione: "tutti", copertura: true },
      sistemi: { disgiunzione: "tutti", copertura: true },
      modalitaintervento: { disgiunzione: "tutti", copertura: true },
      modalitauso: { disgiunzione: "tutti", copertura: true },
      classifattibilitapiano: { disgiunzione: "tutti", copertura: false },
      componentiatu: { disgiunzione: "tutti", copertura: false },
      unitapaesaggio: { disgiunzione: "tutti", copertura: false },
      rischi: { disgiunzione: "Tipologia", copertura: false },
      sottosistemiambientale: { disgiunzione: "Risorsa", copertura: false },
      sottosistemirelazionale: { disgiunzione: "Tipologia", copertura: false }
    },
    confine_comunale: { servizio: "https://geohub-coll.regione.calabria.it/server/rest/services/viewer_catastale/istat_limiti/FeatureServer/0",
                        campo_nome: "comune", campo_regione: "cod_reg", codice_regione: 18 },
  },
  regoleNuove: {
    tolleranze: { area_minima_errore_m2: 4, distanza_confine_m: 20, sliver_area_m2: 0.36, sliver_sottigliezza: 0.03, cuspide_angolo_gradi: 1 },
    livelli: { copertura_fuori_tolleranza: "AVVISO", contenimento_fuori_tolleranza: "AVVISO", multiparte: "AVVISO", cuspide: "AVVISO" },
    confine_comunale: { servizio: "https://geohub-coll.regione.calabria.it/server/rest/services/viewer_catastale/istat_limiti/FeatureServer/0",
                        campo_nome: "comune", campo_regione: "cod_reg", codice_regione: 18 },
  },
  token: "",
  serverAncheShapefile: true,
};
