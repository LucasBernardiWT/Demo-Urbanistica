// Configurazione del mockup.
// gpUrl: URL del task del web tool "Valida fornitura PSC/PSA" pubblicato su ArcGIS Enterprise, ad esempio
//   https://<server>/server/rest/services/<cartella>/<servizio>/GPServer/<nome visualizzato del task, con %20>
//   Il servizio deve avere la capacità "Uploads" attiva.
//   Vuoto = servizio non collegato: i gdb non vengono controllati, gli shapefile si controllano nel browser.
// token: token ArcGIS se il servizio non e' pubblico (vuoto se condiviso con tutti).
// serverAncheShapefile: true = anche gli shapefile vengono controllati sul server invece che nel browser.
window.CONFIG_MOCKUP = {
  gpUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/Valida_fornitura_PSC_PSA/GPServer/Valida%20fornitura%20PSC%20PSA",
  // topoUrl: URL del task del web tool "Valida topologia PSC/PSA" (ValidazioneTopologiaPSC.pyt); vuoto = non collegato
  // Gli shapefile sono controllati nel browser (js/topologia.js); il servizio serve solo per i File Geodatabase e va
  // ripubblicato con le uscite testuali (report_json_testo, report_pdf_b64, errori_zip_b64) prima di attivarlo:
  // https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/Valida_topologia_PSC_PSA/GPServer/Valida%20topologia%20PSC%20PSA
  topoUrl: "",
  token: "",
  serverAncheShapefile: false,
};
