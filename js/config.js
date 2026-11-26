// Configurazione del mockup.
// gpUrl: URL del task del web tool "Valida attributi" (3 - Scripts/ValidazioneAttributi.pyt) su ArcGIS Enterprise:
//   https://<server>/server/rest/services/<cartella>/<servizio>/GPServer/<nome visualizzato del task, con %20>
//   Il servizio deve avere la capacità "Uploads" attiva. Vuoto = non collegato: i gdb non vengono controllati,
//   gli shapefile si controllano nel browser.
// topoUrl: URL del task del web tool "Valida topologia" (3 - Scripts/ValidazioneTopologia.pyt); vuoto = non collegato.
//   Gli shapefile sono controllati nel browser (js/topologia.js); il servizio serve per i File Geodatabase.
// Template e regole dei due servizi sono item del Portal: si aggiornano li', senza toccare il mockup.
// tavoleItem: item del Portal con regole_tavole_qtrp.json (catalogo tavole e layer minimi); vuoto = copia locale
//   js/regole_tavole_qtrp.json. portalUrl: Portal da cui leggere l'item.
// token: token ArcGIS se i servizi non sono pubblici (vuoto se condivisi con tutti).
// serverAncheShapefile: true = anche gli shapefile vengono controllati sul server invece che nel browser.
window.CONFIG_MOCKUP = {
  gpUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/valida_attributi/GPServer/Valida%20attributi",
  topoUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/valida_topologia/GPServer/Valida%20topologia",
  portalUrl: "https://geohub-coll.regione.calabria.it/portal",
  tavoleItem: "ec041abfa08946c1a00aef046fb87886",
  // Template di riferimento (js/template_portal.js): item "File Geodatabase" del Portal con questa sottostringa nel
  // titolo (senza distinzione di maiuscole), nella cartella templateCartella (id) o del proprietario templateOwner.
  // descriviUrl: tool "Descrivi template" del servizio valida_attributi, che ne restituisce la struttura.
  templateFiltro: "template",
  templateOwner: "portalmanager",
  templateCartella: "",
  templateDefault: "1950a1414ba845e498a3bcf940fa6d3d",
  descriviUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/valida_attributi/GPServer/Descrivi%20template",
  esportaShpUrl: "https://geohub-coll.regione.calabria.it/server/rest/services/draft_urbanistica/valida_attributi/GPServer/Esporta%20template%20shapefile",
  token: "",
  serverAncheShapefile: true,
};
