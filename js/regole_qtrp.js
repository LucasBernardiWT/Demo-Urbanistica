// Generato da esporta_regole_js.py: non modificare a mano.
window.REGOLE_QTRP = {
 "origine": "QTRP_PSC_Template_WGS84_UTM33N.gdb",
 "generato": "20/11/2026 11:27",
 "layer": [
  {
   "nome": "classifattibilitapiano",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Classe",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_classifattibilitapiano_Classe",
     "valori": [
      "1",
      "2",
      "3",
      "4"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "componentiatu",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_componentiatu_Tipologia",
     "valori": [
      "Ambiente a carattere storico",
      "Territorio urbanizzato ad intervento diretto",
      "Territorio urbanizzato da riqualificare",
      "Edificazione abusiva",
      "Verde urbano e periurbano",
      "Nuovi insediamenti",
      "Attività industriali D.Lgs. 334/99",
      "Aree di protezione civile",
      "Valenza paesaggistica e ambientale",
      "Aree agricoloforestali"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    },
    {
     "nome": "DestUso",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_componentiatu_DestUso",
     "valori": [
      "Residenziale, turistico-ricettiva e direzionale, sanitaria",
      "Produttiva",
      "Industriale",
      "Servizi pubblici"
     ],
     "obbligatorio": false
    }
   ],
   "dipendenze": [
    {
     "campi": [
      "Tipologia",
      "DestUso"
     ],
     "combinazioni": [
      [
       "Ambiente a carattere storico",
       null
      ],
      [
       "Territorio urbanizzato ad intervento diretto",
       null
      ],
      [
       "Territorio urbanizzato da riqualificare",
       null
      ],
      [
       "Edificazione abusiva",
       null
      ],
      [
       "Verde urbano e periurbano",
       null
      ],
      [
       "Nuovi insediamenti",
       "Residenziale, turistico-ricettiva e direzionale, sanitaria"
      ],
      [
       "Nuovi insediamenti",
       "Produttiva"
      ],
      [
       "Nuovi insediamenti",
       "Industriale"
      ],
      [
       "Nuovi insediamenti",
       "Servizi pubblici"
      ],
      [
       "Attività industriali D.Lgs. 334/99",
       null
      ],
      [
       "Aree di protezione civile",
       null
      ],
      [
       "Valenza paesaggistica e ambientale",
       null
      ],
      [
       "Aree agricoloforestali",
       null
      ]
     ]
    }
   ]
  },
  {
   "nome": "macrozone",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Macrozona",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_macrozone_Macrozona",
     "valori": [
      "Agroforestale",
      "Urbanizzato",
      "Urbanizzabile"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    },
    {
     "nome": "Sottozona",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_macrozone_Sottozona",
     "valori": [
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "E6",
      "Centri e nuclei a carattere storico",
      "Città consolidata",
      "Periferia consolidata",
      "Periferia pubblica",
      "Periferia industriale",
      "Aree periurbane",
      "Aree a urbanizzazione diffusa"
     ],
     "obbligatorio": false
    }
   ],
   "dipendenze": [
    {
     "campi": [
      "Macrozona",
      "Sottozona"
     ],
     "combinazioni": [
      [
       "Agroforestale",
       "E1"
      ],
      [
       "Agroforestale",
       "E2"
      ],
      [
       "Agroforestale",
       "E3"
      ],
      [
       "Agroforestale",
       "E4"
      ],
      [
       "Agroforestale",
       "E5"
      ],
      [
       "Agroforestale",
       "E6"
      ],
      [
       "Urbanizzato",
       "Centri e nuclei a carattere storico"
      ],
      [
       "Urbanizzato",
       "Città consolidata"
      ],
      [
       "Urbanizzato",
       "Periferia consolidata"
      ],
      [
       "Urbanizzato",
       "Periferia pubblica"
      ],
      [
       "Urbanizzato",
       "Periferia industriale"
      ],
      [
       "Urbanizzato",
       "Aree periurbane"
      ],
      [
       "Urbanizzato",
       "Aree a urbanizzazione diffusa"
      ],
      [
       "Urbanizzabile",
       null
      ]
     ]
    }
   ]
  },
  {
   "nome": "modalitaintervento",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_modalitaintervento_Tipologia",
     "valori": [
      "Conservazione",
      "Trasformazione",
      "Nuovo impianto"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "modalitauso",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_modalitauso_Tipologia",
     "valori": [
      "Insediativo",
      "Produttivo",
      "Infrastrutturale",
      "Misto"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "rischi",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_rischi_Tipologia",
     "valori": [
      "rischio sanitario",
      "rischio ambientale",
      "rischio incidente rilevante",
      "rischio incendio boschivo",
      "rischio erosione e consumo di suolo",
      "rischio frana",
      "rischio alluvione",
      "rischio erosione costiera",
      "rischio desertificazione e deficit idrico, subsidenza e sinkholes",
      "rischio tsunami",
      "rischio sismico",
      "Esposizione al rumore",
      "Esposizione ai campi elettromagnetici"
     ],
     "obbligatorio": true
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "sistemi",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_sistemi_Tipologia",
     "valori": [
      "Ambientale",
      "Insediativo",
      "Relazionale"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "sottosistemiambientale",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_sottosistemiambientale_Tipologia",
     "valori": [
      "Risorsa antropica",
      "Risorsa naturale"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    },
    {
     "nome": "Risorsa",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_sottosistemiambientale_Risorsa",
     "valori": [
      "Aree di interesse archeologico",
      "Aree di rilievo storico-culturale",
      "Emergenze storico architettoniche e culturali",
      "Aree produttive",
      "Aree agricole di interesse primario",
      "Clima",
      "Aria",
      "Acqua",
      "Flora",
      "Fauna"
     ],
     "obbligatorio": false
    },
    {
     "nome": "valore",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_sottosistemiambientale_valore",
     "valori": [
      "Basso",
      "Medio",
      "Alto"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Vulnerab",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_sottosistemiambientale_Vulnerab",
     "valori": [
      "Non vulnerabile",
      "Poco vulnerabile",
      "Mediamente vulnerabile",
      "Molto vulnerabile"
     ],
     "obbligatorio": true
    }
   ],
   "dipendenze": [
    {
     "campi": [
      "Tipologia",
      "Risorsa"
     ],
     "combinazioni": [
      [
       "Risorsa antropica",
       "Aree di interesse archeologico"
      ],
      [
       "Risorsa antropica",
       "Aree di rilievo storico-culturale"
      ],
      [
       "Risorsa antropica",
       "Emergenze storico architettoniche e culturali"
      ],
      [
       "Risorsa antropica",
       "Aree produttive"
      ],
      [
       "Risorsa antropica",
       "Aree agricole di interesse primario"
      ],
      [
       "Risorsa naturale",
       "Clima"
      ],
      [
       "Risorsa naturale",
       "Aria"
      ],
      [
       "Risorsa naturale",
       "Acqua"
      ],
      [
       "Risorsa naturale",
       "Flora"
      ],
      [
       "Risorsa naturale",
       "Fauna"
      ]
     ]
    }
   ]
  },
  {
   "nome": "sottosistemirelazionale",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_sottosistemirelazionale_Tipologia",
     "valori": [
      "Viabilità esistente",
      "Viabilità prevista",
      "Viabilità da riqualificare",
      "Altri sistemi di trasporto esistenti",
      "Altri sistemi di trasporto previsti",
      "Altri sistemi di trasporto da riqualificare",
      "Reti di servizio e telecomunicazione",
      "Infrastrutture e attrezzature pubbliche di maggiore rilevanza"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "unitapaesaggio",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Tipologia",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_unitapaesaggio_Tipologia",
     "valori": [
      "Valore 1",
      "Valore 2"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  },
  {
   "nome": "zoneprg",
   "geometria": "Polygon",
   "campi": [
    {
     "nome": "Zona",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": "CL_zoneprg_Zona",
     "valori": [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F"
     ],
     "obbligatorio": true
    },
    {
     "nome": "Note",
     "tipo": "String",
     "lunghezza": 100,
     "dominio": null,
     "valori": null,
     "obbligatorio": false
    }
   ],
   "dipendenze": []
  }
 ]
};
