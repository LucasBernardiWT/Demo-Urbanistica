# Demo Urbanistica – Consegna digitale PSC/PSA

Mockup dei servizi del Geoportale Regione Calabria per la redazione, la verifica e la consegna dei
Piani Strutturali Comunali secondo il QTRP (Tomo IV, Allegato 2). Pagina statica, pubblicabile con GitHub Pages.

Servizi: template e regole, verifica della fornitura, storico forniture, composizione delle tavole,
visualizzazione/modifica/convalida delle tavole su mappa, invio alla Regione.

- `js/regole_qtrp.js`: regole del template (layer, campi, codelist, codelist dipendenti), generate dal gdb di riferimento.
- `js/tavole_qtrp.js`: catalogo delle tavole del QTRP.
- `js/config.js`: URL del servizio di geoprocessing regionale per il controllo dei File Geodatabase.
- `download/`: template in RDN2008 (EPSG:7792) e WGS84 (EPSG:32633), shapefile e File Geodatabase.
- `demo/`: forniture di esempio.

Gli shapefile sono controllati nel browser; lo stato (storico, tavole, invii) resta nel browser dell'utente.
Mockup dimostrativo: non ha valore amministrativo.
