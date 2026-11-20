// Controllo topologico nel browser per forniture in shapefile: stesse regole e tolleranze del web tool
// (js/regole_topologia.json, copia di 3 - Scripts/regole_topologia.json) e limite comunale ISTAT con le
// fasce di tolleranza gia' calcolate (confini/<comune>.json, da esporta_confini_js.py).
// Le geometrie restano nel sistema di riferimento della fornitura (metri UTM): aree e distanze sono piane.
// Uscite: report (oggetto), pacchetto errori shapefile zippato (Blob) e report PDF (Blob).
(function () {
  "use strict";
  // funziona sia nella pagina sia nel Web Worker (js/topologia_worker.js)
  const G = typeof window !== "undefined" ? window : self;
  const BASE = G.document ? "" : new URL("../", G.location.href).href;
  const V = "?v=20261121l";
  const pausa = () => new Promise((r) => setTimeout(r, 0));

  // ---------------------------------------------------------------- geometria piana
  const areaFirmata = (r) => { let s = 0; for (let i = 0, n = r.length - 1; i < n; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
  const lunghezza = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]); return s; };
  const chiuso = (r) => r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  const areaMp = (mp) => mp.reduce((s, p) => s + Math.abs(areaFirmata(p[0])) - p.slice(1).reduce((h, r) => h + Math.abs(areaFirmata(r)), 0), 0);
  const bboxAnelli = (rings) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const r of rings) for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    return { minX: a, minY: b, maxX: c, maxY: d }; };
  function dentroAnello(p, r) {
    let ok = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ok = !ok;
    return ok;
  }
  // anelli shapefile (esterni orari, buchi antiorari) -> multipoligono [[esterno, buchi...], ...]
  function multipoligono(rings) {
    const est = [], buchi = [], orfani = [];
    for (const r of rings) (areaFirmata(r) < 0 ? est : buchi).push(r);
    const mp = est.map((r) => [r]);
    for (const h of buchi) { const p = mp.find((q) => dentroAnello(h[0], q[0])); p ? p.push(h) : orfani.push(h); }
    return { mp, esterni: est.length, orfani: orfani.length };
  }
  function intersezioneSegmenti(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const su = (p, q, r) => Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    if (o1 !== o2 && o3 !== o4) {
      const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
      if (!den) return a;
      const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    if (!o1 && su(a, c, b)) return c; if (!o2 && su(a, d, b)) return d;
    if (!o3 && su(c, a, d)) return a; if (!o4 && su(c, b, d)) return b;
    return null;
  }
  // autointersezioni di un anello chiuso (segmenti non adiacenti che si toccano o si incrociano)
  function autointersezioni(r) {
    const n = r.length - 1, idx = new RBush(), out = [];
    if (n < 4) return out;
    const seg = []; for (let i = 0; i < n; i++) { const a = r[i], b = r[i + 1];
      seg.push({ minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]), i }); }
    idx.load(seg);
    for (const s of seg) for (const t of idx.search(s)) {
      const i = s.i, j = t.i;
      if (j <= i + 1 || (i === 0 && j === n - 1)) continue;
      const p = intersezioneSegmenti(r[i], r[i + 1], r[j], r[j + 1]);
      if (p) out.push(p);
      if (out.length > 50) return out;
    }
    return out;
  }
  function angolo(a, b, c) {
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]], n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
    if (!n1 || !n2) return 180;
    return (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))) * 180) / Math.PI;
  }
  // Operazioni tra poligoni con Clipper su coordinate intere al millimetro: robusto sulle geometrie complesse
  // (polygon-clipping, in virgola mobile, andava in errore di precisione o non terminava).
  const C = G.ClipperLib, S = 1000;
  function percorsi(mp) {
    const out = [];
    for (const pol of mp) pol.forEach((r, k) => {
      const p = (chiuso(r) ? r.slice(0, -1) : r).map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
      if (p.length < 3) return;
      if (C.Clipper.Orientation(p) !== (k === 0)) p.reverse(); // esterni orientati in un verso, buchi nell'altro
      out.push(p);
    });
    return out;
  }
  function esegui2(tipo, soggetto, taglio) {
    const c = new C.Clipper(), t = new C.PolyTree();
    c.AddPaths(soggetto, C.PolyType.ptSubject, true);
    if (taglio) c.AddPaths(taglio, C.PolyType.ptClip, true);
    c.Execute(tipo, t, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    return t;
  }
  // PolyTree -> pezzi separati [[esterno, buchi...]] in coordinate reali, con l'area di ciascuno
  function pezzi(t) {
    const out = [], reale = (p) => { const r = p.map((q) => [q.X / S, q.Y / S]); r.push(r[0]); return r; };
    const visita = (nodo) => {
      for (const est of nodo.Childs()) {
        if (est.IsHole()) continue;
        const buchi = est.Childs();
        const area = (Math.abs(C.Clipper.Area(est.Contour())) - buchi.reduce((s, h) => s + Math.abs(C.Clipper.Area(h.Contour())), 0)) / (S * S);
        out.push({ g: [reale(est.Contour()), ...buchi.map((h) => reale(h.Contour()))], area });
        for (const h of buchi) visita(h); // isole dentro i buchi
      }
    };
    visita(t);
    return out;
  }
  const intersezione = (a, b) => pezzi(esegui2(C.ClipType.ctIntersection, percorsi(a), percorsi(b)));
  // Percorsi Clipper calcolati una volta per poligono, con il riquadro di ogni anello: nei confronti tra un
  // poligono piccolo e uno enorme (es. una rete stradale di 180.000 vertici) si passano a Clipper solo gli
  // anelli del grande che toccano il riquadro del piccolo; gli altri non possono contribuire all'intersezione.
  function preparato(mp) {
    const pp = percorsi(mp).map((p) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const q of p) { if (q.X < a) a = q.X; if (q.Y < b) b = q.Y; if (q.X > c) c = q.X; if (q.Y > d) d = q.Y; }
      return { p, a, b, c, d }; });
    return { pp, n: pp.reduce((s, x) => s + x.p.length, 0) };
  }
  const nelRiquadro = (pp, r) => pp.filter((x) => x.c >= r.a && x.a <= r.c && x.d >= r.b && x.b <= r.d).map((x) => x.p);
  const riquadro = (pp) => pp.reduce((r, x) => ({ a: Math.min(r.a, x.a), b: Math.min(r.b, x.b), c: Math.max(r.c, x.c), d: Math.max(r.d, x.d) }),
    { a: Infinity, b: Infinity, c: -Infinity, d: -Infinity });
  // Buchi di copertura calcolati a tasselli: per ogni tassello si sottraggono al territorio comunale solo i
  // poligoni che lo toccano (quelli enormi ritagliati sul tassello insieme ai loro buchi); i buchi parziali
  // vengono poi riuniti, cosi' un buco a cavallo di piu' tasselli torna intero.
  async function buchiCopertura(interno, validi, lato) {
    const I = percorsi(interno), r = riquadro(I.map((p) => ({ a: Math.min(...p.map((q) => q.X)), b: Math.min(...p.map((q) => q.Y)),
      c: Math.max(...p.map((q) => q.X)), d: Math.max(...p.map((q) => q.Y)) }))), L = lato * S, parziali = [];
    for (const v of validi) v.prep ??= preparato(v.mp);
    const idx = new RBush(); idx.load(validi.map((v, i) => { const q = riquadro(v.prep.pp); return { minX: q.a, minY: q.b, maxX: q.c, maxY: q.d, i }; }));
    for (let x = r.a; x < r.c; x += L) for (let y = r.b; y < r.d; y += L) {
      const t = { a: x, b: y, c: x + L, d: y + L }, rett = [[{ X: t.a, Y: t.b }, { X: t.c, Y: t.b }, { X: t.c, Y: t.d }, { X: t.a, Y: t.d }]];
      const base = C.Clipper.PolyTreeToPaths(esegui2(C.ClipType.ctIntersection, I, rett));
      if (!base.length) continue;
      const tagli = [];
      for (const c of idx.search({ minX: t.a, minY: t.b, maxX: t.c, maxY: t.d })) {
        const pp = validi[c.i].prep, anelli = nelRiquadro(pp.pp, t);
        if (!anelli.length) continue;
        tagli.push(...(pp.n > 5000 ? C.Clipper.PolyTreeToPaths(esegui2(C.ClipType.ctIntersection, anelli, rett)) : anelli));
      }
      parziali.push(...C.Clipper.PolyTreeToPaths(esegui2(C.ClipType.ctDifference, base, tagli)));
      await pausa();
    }
    return pezzi(esegui2(C.ClipType.ctUnion, parziali, null));
  }
  // Suddivisione ricorsiva in quattro di un poligono enorme, fino a pezzi di poche migliaia di vertici: si fa
  // una volta sola, poi ogni confronto usa solo i pezzi vicini. I pezzi conservano i buchi (ritaglio con Clipper).
  function quadtree(paths, r, liv) {
    const n = paths.reduce((s, p) => s + p.length, 0);
    if (n <= 4000 || liv >= 10) return [{ ...r, paths }];
    const mx = Math.round((r.a + r.c) / 2), my = Math.round((r.b + r.d) / 2), out = [];
    for (const q of [{ a: r.a, b: r.b, c: mx, d: my }, { a: mx, b: r.b, c: r.c, d: my }, { a: r.a, b: my, c: mx, d: r.d }, { a: mx, b: my, c: r.c, d: r.d }]) {
      const rett = [[{ X: q.a, Y: q.b }, { X: q.c, Y: q.b }, { X: q.c, Y: q.d }, { X: q.a, Y: q.d }]];
      const sub = C.Clipper.PolyTreeToPaths(esegui2(C.ClipType.ctIntersection, paths, rett));
      if (sub.length) out.push(...quadtree(sub, q, liv + 1));
    }
    return out;
  }
  function intersezionePreparata(A, B) {
    const [pic, gra] = A.n <= B.n ? [A, B] : [B, A], r = riquadro(pic.pp);
    let g = nelRiquadro(gra.pp, r);
    if (!g.length) return [];
    // poligono enorme: si usano solo i pezzi del suo quadtree che toccano il riquadro del piccolo
    if (gra.n > 20000) {
      gra.quad ??= quadtree(gra.pp.map((x) => x.p), riquadro(gra.pp), 0);
      g = gra.quad.filter((f) => f.c >= r.a && f.a <= r.c && f.d >= r.b && f.b <= r.d).flatMap((f) => f.paths);
      if (!g.length) return [];
    }
    return pezzi(esegui2(C.ClipType.ctIntersection, pic.pp.map((x) => x.p), g));
  }
  const differenza = (a, b) => pezzi(esegui2(C.ClipType.ctDifference, percorsi(a), percorsi(b)));
  const unionePercorsi = (mps) => C.Clipper.PolyTreeToPaths(esegui2(C.ClipType.ctUnion, mps.flatMap(percorsi), null));

  // ---------------------------------------------------------------- lettura shapefile (solo poligoni)
  function leggiShp(buf) {
    const dv = new DataView(buf), out = [];
    for (let off = 100, rec = 0; off + 12 <= buf.byteLength; rec++) {
      const len = dv.getInt32(off + 4, false) * 2, c = off + 8, tipo = dv.getInt32(c, true), rings = [];
      if (tipo !== 0) {
        const np = dv.getInt32(c + 36, true), npt = dv.getInt32(c + 40, true), p0 = c + 44 + np * 4;
        for (let i = 0; i < np; i++) {
          const a = dv.getInt32(c + 44 + i * 4, true), b = i + 1 < np ? dv.getInt32(c + 48 + i * 4, true) : npt, r = [];
          for (let k = a; k < b; k++) r.push([dv.getFloat64(p0 + k * 16, true), dv.getFloat64(p0 + k * 16 + 8, true)]);
          rings.push(r);
        }
      }
      out.push({ oid: rec, rings });
      off = c + len;
    }
    return out;
  }

  // ---------------------------------------------------------------- scrittura shapefile e dbf
  const CAMPI = [["nome_layer", "C", 40], ["controllo", "C", 60], ["livello", "C", 10], ["oid_1", "N", 10], ["oid_2", "N", 10], ["area_m2", "N", 15, 2], ["dettaglio", "C", 200]];
  function scriviShp(tipo, righe) {
    const rec = righe.map(({ g }) => {
      if (tipo === "POINT") return { bb: { minX: g[0], minY: g[1], maxX: g[0], maxY: g[1] }, parti: [], punti: [g] };
      const anelli = [];
      for (const pol of g) pol.forEach((r, k) => { const rr = chiuso(r) ? r.slice() : r.concat([r[0]]);
        const cw = areaFirmata(rr) < 0; if ((k === 0) !== cw) rr.reverse(); anelli.push(rr); });
      const parti = [], punti = []; for (const r of anelli) { parti.push(punti.length); punti.push(...r); }
      return { bb: bboxAnelli(anelli), parti, punti };
    });
    const lunghi = rec.map((r) => (tipo === "POINT" ? 20 : 44 + 4 * r.parti.length + 16 * r.punti.length));
    const totale = 100 + lunghi.reduce((s, l) => s + 8 + l, 0);
    const shp = new DataView(new ArrayBuffer(totale)), shx = new DataView(new ArrayBuffer(100 + 8 * rec.length));
    const bb = rec.reduce((a, r) => ({ minX: Math.min(a.minX, r.bb.minX), minY: Math.min(a.minY, r.bb.minY), maxX: Math.max(a.maxX, r.bb.maxX), maxY: Math.max(a.maxY, r.bb.maxY) }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const codice = tipo === "POINT" ? 1 : 5;
    for (const [dv, lun] of [[shp, totale], [shx, 100 + 8 * rec.length]]) {
      dv.setInt32(0, 9994, false); dv.setInt32(24, lun / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, codice, true);
      [bb.minX, bb.minY, bb.maxX, bb.maxY].forEach((v, i) => dv.setFloat64(36 + i * 8, isFinite(v) ? v : 0, true));
    }
    let off = 100;
    rec.forEach((r, i) => {
      shx.setInt32(100 + i * 8, off / 2, false); shx.setInt32(104 + i * 8, lunghi[i] / 2, false);
      shp.setInt32(off, i + 1, false); shp.setInt32(off + 4, lunghi[i] / 2, false);
      const c = off + 8; shp.setInt32(c, codice, true);
      if (tipo === "POINT") { shp.setFloat64(c + 4, r.punti[0][0], true); shp.setFloat64(c + 12, r.punti[0][1], true); }
      else {
        [r.bb.minX, r.bb.minY, r.bb.maxX, r.bb.maxY].forEach((v, k) => shp.setFloat64(c + 4 + k * 8, v, true));
        shp.setInt32(c + 36, r.parti.length, true); shp.setInt32(c + 40, r.punti.length, true);
        r.parti.forEach((p, k) => shp.setInt32(c + 44 + k * 4, p, true));
        const p0 = c + 44 + 4 * r.parti.length;
        r.punti.forEach(([x, y], k) => { shp.setFloat64(p0 + k * 16, x, true); shp.setFloat64(p0 + k * 16 + 8, y, true); });
      }
      off += 8 + lunghi[i];
    });
    return { shp: shp.buffer, shx: shx.buffer };
  }
  function scriviDbf(righe) {
    const enc = new TextEncoder(), lr = 1 + CAMPI.reduce((s, c) => s + c[2], 0), lh = 32 + 32 * CAMPI.length + 1;
    const buf = new Uint8Array(lh + lr * righe.length + 1), dv = new DataView(buf.buffer), d = new Date();
    buf[0] = 3; buf[1] = d.getFullYear() - 1900; buf[2] = d.getMonth() + 1; buf[3] = d.getDate();
    dv.setUint32(4, righe.length, true); dv.setUint16(8, lh, true); dv.setUint16(10, lr, true);
    CAMPI.forEach(([n, t, l, dec], i) => { const p = 32 + i * 32; buf.set(enc.encode(n), p); buf[p + 11] = t.charCodeAt(0); buf[p + 16] = l; buf[p + 17] = dec || 0; });
    buf[lh - 1] = 0x0d;
    righe.forEach(({ a }, k) => {
      let p = lh + k * lr; buf[p++] = 0x20;
      CAMPI.forEach(([, t, l, dec], i) => {
        const v = a[i];
        let s = v === null || v === undefined ? "" : t === "N" ? Number(v).toFixed(dec || 0) : String(v);
        let b = enc.encode(s);
        while (b.length > l) { s = s.slice(0, -1); b = enc.encode(s); }
        const pad = new Uint8Array(l).fill(0x20);
        pad.set(b, t === "N" ? l - b.length : 0); buf.set(pad, p); p += l;
      });
    });
    buf[buf.length - 1] = 0x1a;
    return buf.buffer;
  }

  // ---------------------------------------------------------------- controllo
  // dati: dbf gia' letti dal controllo attributi ({layer: {campi, righe}}), per la chiave di disgiunzione
  async function esegui(zip, shp, dati, comune, avanzamento) {
    const R = await (await fetch(BASE + "js/regole_topologia.json" + V)).json();
    const T = R.tolleranze, LV = R.livelli, AMIN = T.area_minima_errore_m2, STRATI = Object.keys(R.strati);
    const E = [], uscite = {}, quadro = {};
    const errore = (layer, controllo, livello, o = {}) => {
      E.push({ layer, oid: o.oid ?? "", oid2: o.oid2 ?? "", livello, controllo, area: o.area == null ? "" : o.area.toFixed(1) + " m²", dettaglio: o.dettaglio || "" });
      if (o.g && o.uscita) (uscite[o.uscita] ??= { tipo: o.tipo || "POLYGON", righe: [] }).righe.push({ g: o.g,
        a: [layer, controllo, livello, o.oid ?? -1, o.oid2 ?? -1, o.area ?? 0, (o.dettaglio || "").slice(0, 200)] });
    };
    // limite comunale con le fasce di tolleranza
    let dentro = null, interno = null, segConfine = null;
    try {
      const indice = await (await fetch(BASE + "confini/indice.json" + V)).json();
      const c = await (await fetch(BASE + "confini/" + indice[comune] + V)).json();
      dentro = multipoligono(c.dentro).mp; interno = multipoligono(c.interno).mp;
      segConfine = new RBush(); const s = [];
      for (const p of dentro) for (const r of p) for (let i = 0; i < r.length - 1; i++)
        s.push({ minX: Math.min(r[i][0], r[i + 1][0]), minY: Math.min(r[i][1], r[i + 1][1]), maxX: Math.max(r[i][0], r[i + 1][0]), maxY: Math.max(r[i][1], r[i + 1][1]) });
      segConfine.load(s);
    } catch (e) { errore("—", "Contenimento e copertura non eseguiti", "AVVISO", { dettaglio: "limite comunale non disponibile per " + comune }); }
    let prj = "";

    const avanzamentoBase = avanzamento;
    for (const [ix, nome] of STRATI.entries()) {
      avanzamento = (f) => avanzamentoBase(`layer ${ix + 1} di ${STRATI.length} – ${f}`);
      const regola = R.strati[nome], s = shp[nome.toLowerCase()], L = nome.toUpperCase();
      if (!s || !s.shp) { quadro[nome] = { stato: "MANCANTE", record: "–" }; continue; }
      avanzamento(`${nome}: lettura`);
      if (!prj && s.prj) prj = await zip.file(s.prj).async("string");
      const feats = leggiShp(await zip.file(s.shp).async("arraybuffer"));
      quadro[nome] = { stato: "presente", record: feats.length };
      const chiave = regola.disgiunzione && regola.disgiunzione !== "tutti" ? regola.disgiunzione : null;
      const dbf = dati[nome], campoK = chiave && dbf ? (dbf.campi.find((c) => c.nome.toLowerCase() === chiave.toLowerCase()) || {}).nome : null;
      const valoreK = {}; if (campoK) for (const r of dbf.righe) valoreK[r.__oid] = (r[campoK] || "").trim();
      const validi = [], firme = new Map();
      avanzamento(`${nome}: qualità delle geometrie`); await pausa();
      for (const f of feats) {
        if (!f.rings.length) { errore(nome, "Geometria vuota", "ERRORE", { oid: f.oid }); continue; }
        const { mp, esterni, orfani } = multipoligono(f.rings), problemi = [];
        if (orfani) problemi.push("anello interno fuori dal poligono");
        if (!esterni) problemi.push("nessun anello esterno");
        for (const r of f.rings) {
          if (!chiuso(r)) problemi.push("anello non chiuso");
          for (let i = 1; i < r.length; i++) if (r[i][0] === r[i - 1][0] && r[i][1] === r[i - 1][1]) { problemi.push("vertici duplicati"); break; }
          if (autointersezioni(r).length) problemi.push("autointersezione");
          const k = r.length - 1;
          for (let i = 0; i < k; i++) if (angolo(r[i ? i - 1 : k - 1], r[i], r[i + 1]) < T.cuspide_angolo_gradi)
            errore(nome, "Cuspide", LV.cuspide, { oid: f.oid, dettaglio: `vertice (${r[i][0].toFixed(1)}, ${r[i][1].toFixed(1)})`, g: r[i], uscita: `${L}_CUSPIDI`, tipo: "POINT" });
        }
        if (problemi.length) errore(nome, "Geometria non valida", "ERRORE", { oid: f.oid, dettaglio: [...new Set(problemi)].join(", "), g: mp, uscita: `${L}_GEOMETRIA` });
        if (esterni > 1) errore(nome, "Poligono multiparte (shell not unique)", LV.multiparte, { oid: f.oid, dettaglio: `${esterni} parti` });
        const area = areaMp(mp), per = f.rings.reduce((t, r) => t + lunghezza(r), 0);
        if (per && area < T.sliver_area_m2 && (4 * Math.PI * area) / per ** 2 < T.sliver_sottigliezza)
          errore(nome, "Sliver polygon", "ERRORE", { oid: f.oid, area, g: mp, uscita: `${L}_SLIVER` });
        const firma = JSON.stringify(f.rings.map((r) => r.map(([x, y]) => [x.toFixed(3), y.toFixed(3)])));
        (firme.get(firma) || firme.set(firma, []).get(firma)).push({ oid: f.oid, mp, area });
        if (esterni) validi.push({ oid: f.oid, mp, bb: bboxAnelli(f.rings), k: chiave ? valoreK[f.oid] ?? null : null });
      }
      for (const grp of firme.values()) if (grp.length > 1)
        for (const x of grp) errore(nome, "Poligono duplicato", "ERRORE", { oid: x.oid, oid2: grp.find((y) => y.oid !== x.oid).oid, area: x.area, g: x.mp, uscita: `${L}_DUPLICATI_POLY` });

      // disgiunzione intraclasse
      if (regola.disgiunzione) {
        avanzamento(`${nome}: sovrapposizioni`); await pausa();
        const idx = new RBush(); idx.load(validi.map((v, i) => ({ ...v.bb, i })));
        for (let i = 0; i < validi.length; i++) {
          const a = validi[i];
          for (const c of idx.search(a.bb)) {
            if (c.i <= i) continue;
            const b = validi[c.i];
            if (chiave && a.k !== b.k) continue;
            a.prep ??= preparato(a.mp); b.prep ??= preparato(b.mp);
            const ix = intersezionePreparata(a.prep, b.prep), area = ix.reduce((t, p) => t + p.area, 0);
            if (area >= AMIN) errore(nome, "Sovrapposizione (disgiunzione intraclasse)", "ERRORE", { oid: a.oid, oid2: b.oid, area,
              dettaglio: chiave ? `${chiave} = ${a.k}` : "", g: ix.map((p) => p.g), uscita: `${L}_INTRA_POLY` });
          }
          if (i % 200 === 0) await pausa();
        }
      }
      // contenimento nel limite comunale (fascia di tolleranza gia' inclusa in "dentro")
      if (dentro) {
        avanzamento(`${nome}: confine comunale`); await pausa();
        let nc = 0;
        for (const v of validi) {
          const vicino = segConfine.collides(v.bb);
          if (!vicino && dentro.some((p) => dentroAnello(v.mp[0][0][0], p[0]))) continue;
          const fuori = vicino ? differenza(v.mp, dentro) : v.mp.map((p) => ({ g: p, area: areaMp([p]) }));
          for (const pz of fuori)
            if (pz.area >= AMIN) errore(nome, "Sconfinamento dal limite comunale", LV.contenimento_fuori_tolleranza, { oid: v.oid, area: pz.area,
              dettaglio: `oltre ${T.distanza_confine_m} m dal limite ISTAT`, g: [pz.g], uscita: `${L}_SCONFINAMENTO` });
          if (++nc % 200 === 0) await pausa();
        }
      }
      // copertura completa del territorio comunale
      if (regola.copertura && interno && validi.length) {
        avanzamento(`${nome}: copertura del territorio`); await pausa();
        try {
          // tasselli solo se il layer contiene poligoni enormi; altrimenti unione del layer e differenza
          const enorme = validi.some((v) => (v.prep ??= preparato(v.mp)).n > 50000);
          const buchi = enorme ? await buchiCopertura(interno, validi, 2000)
            : pezzi(esegui2(C.ClipType.ctDifference, percorsi(interno), unionePercorsi(validi.map((v) => v.mp))));
          for (const pz of buchi)
            if (pz.area >= AMIN) errore(nome, "Territorio non coperto (buco)", LV.copertura_fuori_tolleranza, { area: pz.area,
              dettaglio: "area del Comune non coperta dal layer", g: [pz.g], uscita: `${L}_GAPS` });
        } catch (e) { errore(nome, "Copertura non verificabile", "AVVISO", { dettaglio: String(e.message || e).slice(0, 120) }); }
      }
    }

    // pacchetto errori shapefile
    avanzamento = avanzamentoBase;
    avanzamento("scrittura del pacchetto errori"); await pausa();
    const z = new JSZip(), cartella = z.folder("errori_topologia"), fileErrori = [];
    for (const [n, u] of Object.entries(uscite).sort()) {
      const { shp: s1, shx } = scriviShp(u.tipo, u.righe);
      cartella.file(n + ".shp", s1); cartella.file(n + ".shx", shx); cartella.file(n + ".dbf", scriviDbf(u.righe));
      cartella.file(n + ".cpg", "UTF-8"); if (prj) cartella.file(n + ".prj", prj);
      fileErrori.push([n, u.tipo === "POINT" ? "punti" : "poligoni", u.righe.length]);
    }
    const nErr = E.filter((e) => e.livello === "ERRORE").length;
    for (const [k, v] of Object.entries(quadro)) {
      v.errori = E.filter((e) => e.layer === k && e.livello === "ERRORE").length;
      v.avvisi = E.filter((e) => e.layer === k && e.livello === "AVVISO").length;
    }
    const sint = new Map();
    for (const e of E) { const k = [e.livello, e.controllo, e.layer].join("|"); sint.set(k, (sint.get(k) || 0) + 1); }
    const rep = { comune, esito: nErr ? "NON CONFORME" : "CONFORME", errori: nErr, avvisi: E.length - nErr, quadro,
      sintesi: [...sint].map(([k, n]) => [...k.split("|"), n]).sort((a, b) => (a[0] !== b[0] ? (a[0] === "ERRORE" ? -1 : 1) : a[1].localeCompare(b[1]))),
      file_errori: fileErrori, segnalazioni: E, tolleranze: T, prj: (/PROJCS\["([^"]+)"/.exec(prj) || [])[1] || "" };
    return { rep, zip: await z.generateAsync({ type: "blob", compression: "DEFLATE" }) };
  }

  // ---------------------------------------------------------------- report PDF (stesso impianto del report attributi)
  function pdf(rep, meta) {
    const { jsPDF } = G.jspdf, doc = new jsPDF({ unit: "mm", format: "a4" });
    const ROSSO = [192, 0, 0], VERDE = [46, 125, 50], AV = [178, 106, 0];
    doc.setFillColor(0, 102, 204); doc.rect(0, 0, 210, 24, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Regione Calabria – Geoportale", 14, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Dipartimento Territorio e Tutela dell'Ambiente · Consegna digitale PSC/PSA", 14, 18);
    doc.setTextColor(0, 38, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Report di controllo topologico", 14, 36);
    doc.setFontSize(9); doc.setTextColor(40);
    let y = 43;
    const T = rep.tolleranze;
    for (const [k, v] of [["Fornitura", meta.titolo || meta.nomeFile], ["File", meta.nomeFile], ["Comune", rep.comune], ["Sistema di riferimento", rep.prj || "–"],
      ["Tolleranze", `errori da ${T.area_minima_errore_m2} m², confine ${T.distanza_confine_m} m, sliver ${T.sliver_area_m2} m² / ${T.sliver_sottigliezza}`],
      ["Controllo n.", meta.id], ["Data", meta.data]]) {
      doc.setFont("helvetica", "bold"); doc.text(k + ":", 14, y); doc.setFont("helvetica", "normal"); doc.text(String(v), 58, y); y += 5;
    }
    doc.setFillColor(...(rep.errori ? ROSSO : VERDE)); doc.rect(14, y + 2, 182, 12, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`Esito: ${rep.esito}  –  ${rep.errori} errori, ${rep.avvisi} avvisi`, 18, y + 10); y += 20;
    const tit = (t) => { doc.setTextColor(0, 38, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(t, 14, y); y += 3; };
    const tab = (head, body, colori, extra = {}) => {
      doc.autoTable(Object.assign({ startY: y, head: [head], body, theme: "grid", margin: { left: 14, right: 14, bottom: 16 },
        styles: { fontSize: 8, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1, overflow: "linebreak" },
        headStyles: { fillColor: [217, 226, 243], textColor: [0, 38, 77], fontStyle: "bold" },
        didParseCell: (d) => { if (d.section === "body" && colori && colori[d.row.index]) d.cell.styles.textColor = colori[d.row.index]; } }, extra));
      y = doc.lastAutoTable.finalY + 9;
    };
    tit("1. Quadro della consegna");
    const q = Object.entries(rep.quadro).map(([l, x]) => [l, x.stato, x.record, x.errori ?? 0, x.avvisi ?? 0]);
    tab(["Layer", "Stato", "Record", "Errori", "Avvisi"], q, q.map((r) => (r[3] ? ROSSO : null)));
    tit("2. Sintesi per controllo");
    tab(["Livello", "Controllo", "Layer", "Occorrenze"], rep.sintesi, rep.sintesi.map((r) => (r[0] === "ERRORE" ? ROSSO : AV)));
    tit("3. Elenco analitico");
    const righe = rep.segnalazioni.slice().sort((a, b) => a.layer.localeCompare(b.layer) || (a.livello === b.livello ? 0 : a.livello === "ERRORE" ? -1 : 1));
    const max = 3000;
    if (righe.length > max) { doc.setFontSize(8); doc.setTextColor(...AV); doc.text(`Mostrate le prime ${max} di ${righe.length} segnalazioni: l'elenco completo è nel pacchetto errori.`, 14, y + 2); y += 6; }
    tab(["Layer", "OID", "OID 2", "Liv.", "Controllo", "Area", "Dettaglio"], righe.slice(0, max).map((e) => [e.layer, e.oid, e.oid2, e.livello, e.controllo, e.area, e.dettaglio]),
      righe.slice(0, max).map((e) => (e.livello === "ERRORE" ? ROSSO : AV)), { styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" } });
    tit("4. Layer di errore nel pacchetto");
    tab(["Layer di errore", "Geometria", "Elementi"], rep.file_errori);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130); doc.text(`Controllo n. ${meta.id} · ${rep.comune}`, 14, 290); doc.text(`Pagina ${i} di ${n}`, 196, 290, { align: "right" }); }
    return doc.output("blob");
  }

  G.TOPOLOGIA = { esegui, pdf, _interne: { leggiShp, multipoligono, autointersezioni, intersezione, differenza, buchiCopertura, areaMp } };
})();
