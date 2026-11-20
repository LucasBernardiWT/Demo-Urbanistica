// Configurazione del mockup.
// gpUrl: URL del task del web tool "Valida fornitura PSC/PSA" pubblicato su ArcGIS Enterprise, ad esempio
//   https://<server>/server/rest/services/<cartella>/<servizio>/GPServer/<nome visualizzato del task, con %20>
//   Il servizio deve avere la capacità "Uploads" attiva.
//   Vuoto = servizio non collegato: i gdb non vengono controllati, gli shapefile si controllano nel browser.
// token: token ArcGIS se il servizio non e' pubblico (vuoto se condiviso con tutti).
// serverAncheShapefile: true = anche gli shapefile vengono controllati sul server invece che nel browser.
window.CONFIG_MOCKUP = {
  gpUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/Valida_fornitura_PSC_PSA/GPServer/Valida%20fornitura%20PSC%20PSA",
  token: "",
  serverAncheShapefile: false,
};
