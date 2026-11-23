// DevisExpress — génération du devis en PDF (format A4), sans serveur.
// Utilise pdf-lib (vendor/pdf-lib.min.js, licence MIT), chargé en global : window.PDFLib.

const W = 595.28, H = 841.89, M = 42, FOOT = 46;

// Les polices standard des PDF utilisent l'encodage WinAnsi : on remplace
// les caractères qu'elles ne savent pas afficher (espaces fines, emojis…).
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const MAP = { ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '‐': '-', '‑': '-', '−': '-', 'ʼ': '’', '′': '\'', '✓': '-', '✔': '-', '­': '' };
export function clean(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    if (MAP[ch] !== undefined) { out += MAP[ch]; continue; }
    const c = ch.codePointAt(0);
    if (ch === '\t') { out += ' '; continue; }
    if (ch === '\n') { out += '\n'; continue; }
    if (ch === '\r') continue;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch)) out += ch;
    else if (c >= 0x1f000) out += ''; // emojis
    else out += '?';
  }
  return out;
}

function hexToRgb(hex, rgb) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const v = m ? m[1] : '1e40af';
  return rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
}

function dataUrlToBytes(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * @param dv devis, @param p profil entreprise, @param t totaux calculés,
 * @param f fonctions de formatage { money, qty, date, addDays }
 * @returns Uint8Array (contenu du fichier PDF)
 */
export async function generatePDF(dv, p, t, f) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Devis ${dv.numero}${dv.chantier.objet ? ' - ' + dv.chantier.objet : ''}`));
  doc.setAuthor(clean(p.nom || ''));
  doc.setCreator('DevisExpress');
  doc.setProducer('DevisExpress');

  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const accent = hexToRgb(p.couleur, rgb);
  const dark = rgb(0.11, 0.13, 0.17);
  const gray = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.86, 0.88, 0.91);
  const soft = rgb(0.965, 0.97, 0.98);
  const white = rgb(1, 1, 1);

  let page, y;
  const pages = [];
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
  newPage();

  const width = (s, font, size) => font.widthOfTextAtSize(clean(s), size);
  const text = (s, x, yy, o = {}) => {
    const v = clean(s);
    if (v) page.drawText(v, { x, y: yy, size: o.size || 9, font: o.font || reg, color: o.color || dark });
  };
  const textR = (s, xr, yy, o = {}) => text(s, xr - width(s, o.font || reg, o.size || 9), yy, o);
  const wrap = (s, font, size, maxW) => {
    const out = [];
    for (const para of clean(s).split('\n')) {
      const words = para.split(/ +/);
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; continue; }
        if (cur) out.push(cur);
        // mot plus long que la ligne : on le coupe
        let rest = w;
        while (font.widthOfTextAtSize(rest, size) > maxW && rest.length > 1) {
          let i = rest.length;
          while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > maxW) i--;
          out.push(rest.slice(0, i));
          rest = rest.slice(i);
        }
        cur = rest;
      }
      out.push(cur);
    }
    return out;
  };
  const ensure = (h) => { if (y - h < M + FOOT) { newPage(); return true; } return false; };

  // ---------- En-tête ----------
  const topY = y;
  let leftY = topY;
  if (p.logo) {
    try {
      const bytes = dataUrlToBytes(p.logo);
      const img = String(p.logo).startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const sc = Math.min(130 / img.width, 58 / img.height, 1);
      const iw = img.width * sc, ih = img.height * sc;
      page.drawImage(img, { x: M, y: leftY - ih, width: iw, height: ih });
      leftY -= ih + 10;
    } catch (e) { /* logo illisible : on l'ignore */ }
  }
  text(p.nom || 'Votre entreprise', M, leftY - 12, { font: bold, size: 13 });
  leftY -= 26;
  const infos = [
    [p.formeJuridique, p.capital ? `au capital de ${p.capital}` : ''].filter(Boolean).join(' '),
    p.adresse,
    [p.cp, p.ville].filter(Boolean).join(' '),
    [p.tel ? `Tél. ${p.tel}` : '', p.email].filter(Boolean).join('  ·  '),
    p.siret ? `SIRET ${p.siret}` : '',
    p.rm,
    p.tvaRegime !== 'franchise' && p.tvaNum ? `TVA intracom. ${p.tvaNum}` : '',
  ].filter(Boolean);
  for (const l of infos) { for (const w of wrap(l, reg, 8.5, 250)) { text(w, M, leftY, { size: 8.5, color: gray }); leftY -= 11.5; } }

  const xr = W - M;
  textR('DEVIS', xr, topY - 24, { font: bold, size: 26, color: accent });
  let ry = topY - 44;
  textR(`N° ${dv.numero}`, xr, ry, { font: bold, size: 10 }); ry -= 14;
  textR(`Date : ${f.date(dv.date)}`, xr, ry, { size: 9, color: gray }); ry -= 12.5;
  textR(`Valable jusqu'au : ${f.date(f.addDays(dv.date, Number(dv.validiteJours) || 30))}`, xr, ry, { size: 9, color: gray }); ry -= 20;

  // Bloc client
  const c = dv.client;
  const clientLines = [c.adresse, [c.cp, c.ville].filter(Boolean).join(' '), c.tel, c.email].filter(Boolean);
  const bw = 230, bx = xr - bw;
  const nameLines = wrap(c.nom || 'Client', bold, 10.5, bw - 24);
  const addrLines = clientLines.flatMap(l => wrap(l, reg, 9, bw - 24));
  const bh = 26 + nameLines.length * 13 + addrLines.length * 11.5 + 8;
  page.drawRectangle({ x: bx, y: ry - bh, width: bw, height: bh, color: soft, borderColor: line, borderWidth: 0.8 });
  let cy = ry - 15;
  text('CLIENT', bx + 12, cy, { font: bold, size: 7.5, color: accent }); cy -= 14;
  for (const l of nameLines) { text(l, bx + 12, cy, { font: bold, size: 10.5 }); cy -= 13; }
  for (const l of addrLines) { text(l, bx + 12, cy, { size: 9, color: dark }); cy -= 11.5; }
  ry -= bh;

  y = Math.min(leftY, ry) - 18;

  // Objet et infos chantier
  if (dv.chantier.objet) {
    for (const l of wrap(`Objet : ${dv.chantier.objet}`, bold, 11.5, W - 2 * M)) { text(l, M, y, { font: bold, size: 11.5 }); y -= 15; }
  }
  const chantierInfos = [
    dv.chantier.adresse ? `Adresse du chantier : ${dv.chantier.adresse}` : '',
    [dv.chantier.dateDebut ? `Début des travaux prévu : ${f.date(dv.chantier.dateDebut)}` : '', dv.chantier.duree ? `Durée estimée : ${dv.chantier.duree}` : ''].filter(Boolean).join('   ·   '),
  ].filter(Boolean);
  for (const l of chantierInfos) { for (const w of wrap(l, reg, 9, W - 2 * M)) { text(w, M, y, { size: 9, color: gray }); y -= 12; } }
  y -= 6;

  // Texte de présentation
  if (dv.intro && dv.intro.trim()) {
    const lines = wrap(dv.intro.trim(), reg, 9.5, W - 2 * M);
    for (const l of lines) { ensure(13); text(l, M, y, { size: 9.5 }); y -= 13; }
    y -= 10;
  }

  // ---------- Tableau des prestations ----------
  const franchise = t.franchise;
  const cols = franchise
    ? [{ k: 'des', w: 0 }, { k: 'qte', w: 46, l: 'Qté' }, { k: 'u', w: 44, l: 'Unité' }, { k: 'pu', w: 74, l: 'Prix unit. HT' }, { k: 'tot', w: 80, l: 'Total HT' }]
    : [{ k: 'des', w: 0 }, { k: 'qte', w: 42, l: 'Qté' }, { k: 'u', w: 40, l: 'Unité' }, { k: 'pu', w: 70, l: 'Prix unit. HT' }, { k: 'tva', w: 38, l: 'TVA' }, { k: 'tot', w: 76, l: 'Total HT' }];
  const fixed = cols.reduce((s, c2) => s + c2.w, 0);
  cols[0].w = W - 2 * M - fixed; cols[0].l = 'Désignation';
  let cx = M; for (const c2 of cols) { c2.x = cx; cx += c2.w; }

  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: accent });
    for (const c2 of cols) {
      if (c2.k === 'des') text(c2.l, c2.x + 8, y - 13.5, { font: bold, size: 8.5, color: white });
      else textR(c2.l, c2.x + c2.w - 6, y - 13.5, { font: bold, size: 8.5, color: white });
    }
    y -= 20;
  };
  ensure(60);
  drawHeader();

  const lignes = dv.lignes.filter(l => (l.designation || '').trim() || Number(l.pu) || Number(l.qte));
  if (!lignes.length) {
    text('Aucune prestation.', M + 8, y - 15, { font: ital, size: 9, color: gray }); y -= 24;
  }
  lignes.forEach((l, i) => {
    const dLines = wrap(l.designation || '', bold, 9, cols[0].w - 16);
    const detLines = l.details ? wrap(l.details, reg, 8, cols[0].w - 16) : [];
    const rh = 10 + dLines.length * 11.5 + detLines.length * 10 + 4;
    if (ensure(rh)) drawHeader();
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rh, width: W - 2 * M, height: rh, color: soft });
    let ly = y - 14;
    for (const d of dLines) { text(d, M + 8, ly, { font: bold, size: 9 }); ly -= 11.5; }
    for (const d of detLines) { text(d, M + 8, ly + 1, { size: 8, color: gray }); ly -= 10; }
    const tot = (Number(l.qte) || 0) * (Number(l.pu) || 0);
    const vals = { qte: f.qty(l.qte), u: l.unite || '', pu: f.money(l.pu), tva: `${String(l.tva).replace('.', ',')} %`, tot: f.money(tot) };
    for (const c2 of cols) if (c2.k !== 'des') textR(vals[c2.k], c2.x + c2.w - 6, y - 14, { size: 9 });
    page.drawLine({ start: { x: M, y: y - rh }, end: { x: W - M, y: y - rh }, thickness: 0.5, color: line });
    y -= rh;
  });
  y -= 14;

  // ---------- Totaux ----------
  const rows = [];
  if (t.remiseMontant > 0) {
    rows.push(['Total HT brut', f.money(t.brut)]);
    rows.push([`Remise (${String(dv.remisePct).replace('.', ',')} %)`, '- ' + f.money(t.remiseMontant)]);
    rows.push(['Total HT net', f.money(t.htNet)]);
  } else rows.push(['Total HT', f.money(t.htNet)]);
  if (!franchise) for (const tv of t.tvaLines) rows.push([`TVA ${String(tv.rate).replace('.', ',')} % (base ${f.money(tv.base)})`, f.money(tv.montant)]);
  const tw = 260, tx = W - M - tw;
  const totH = rows.length * 16 + 26 + (t.acompte > 0 ? 18 : 0);
  ensure(totH + 10);
  for (const [lab, val] of rows) {
    text(lab, tx + 10, y - 11, { size: 9, color: gray });
    textR(val, W - M - 10, y - 11, { size: 9.5 });
    y -= 16;
  }
  page.drawRectangle({ x: tx, y: y - 24, width: tw, height: 24, color: accent });
  text(franchise ? 'Net à payer' : 'Total TTC', tx + 10, y - 16, { font: bold, size: 11, color: white });
  textR(f.money(t.ttc), W - M - 10, y - 16, { font: bold, size: 12, color: white });
  y -= 24;
  if (t.acompte > 0) {
    y -= 15;
    text(`Acompte à la signature (${String(dv.acomptePct).replace('.', ',')} %)`, tx + 10, y, { size: 9, color: gray });
    textR(f.money(t.acompte), W - M - 10, y, { font: bold, size: 9.5 });
    y -= 4;
  }
  if (franchise) { y -= 14; textR('TVA non applicable, art. 293 B du CGI', W - M, y, { font: ital, size: 8.5, color: gray }); }
  y -= 22;

  // ---------- Conditions et mentions ----------
  const cond = [];
  cond.push(`Validité du devis : ${Number(dv.validiteJours) || 30} jours, soit jusqu'au ${f.date(f.addDays(dv.date, Number(dv.validiteJours) || 30))}.`);
  if (p.conditionsPaiement) cond.push(`Conditions de paiement : ${p.conditionsPaiement}`);
  if (dv.notes && dv.notes.trim()) cond.push(dv.notes.trim());
  if (p.assureur) cond.push(`Assurance professionnelle${p.assuranceType ? ' (' + p.assuranceType + ')' : ''} : ${p.assureur}${p.assuranceNum ? ', contrat n° ' + p.assuranceNum : ''}${p.assuranceZone ? ', couverture géographique : ' + p.assuranceZone : ''}.`);
  if (p.mediateur) cond.push(`Médiateur de la consommation : ${p.mediateur}`);
  if (p.mentionsSupp) cond.push(p.mentionsSupp);
  ensure(30);
  text('Conditions', M, y, { font: bold, size: 9.5, color: accent }); y -= 14;
  for (const cnd of cond) {
    for (const l of wrap(cnd, reg, 8.5, W - 2 * M)) { ensure(11); text(l, M, y, { size: 8.5, color: dark }); y -= 11; }
    y -= 3;
  }
  y -= 14;

  // ---------- Signatures ----------
  const sh = 92;
  ensure(sh + 10);
  const half = (W - 2 * M - 16) / 2;
  page.drawRectangle({ x: M, y: y - sh, width: half, height: sh, borderColor: line, borderWidth: 0.8 });
  text("L'entreprise", M + 10, y - 15, { font: bold, size: 9 });
  text(p.nom || '', M + 10, y - 28, { size: 8.5, color: gray });
  const sx = M + half + 16;
  page.drawRectangle({ x: sx, y: y - sh, width: half, height: sh, borderColor: accent, borderWidth: 1 });
  text('Bon pour accord du client', sx + 10, y - 15, { font: bold, size: 9, color: accent });
  let sy = y - 28;
  for (const l of wrap('Date, signature et mention manuscrite « Devis reçu avant l\'exécution des travaux, bon pour accord »', ital, 8, half - 20)) { text(l, sx + 10, sy, { font: ital, size: 8, color: gray }); sy -= 10; }
  y -= sh;

  // ---------- Pied de page ----------
  const footer = [p.nom, p.formeJuridique, p.siret ? `SIRET ${p.siret}` : '', [p.adresse, p.cp, p.ville].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M + 18 }, end: { x: W - M, y: M + 18 }, thickness: 0.5, color: line });
    const fl = wrap(footer, reg, 7, W - 2 * M - 70)[0] || '';
    pg.drawText(fl, { x: M, y: M + 6, size: 7, font: reg, color: gray });
    const pn = `Devis ${clean(dv.numero)} — page ${i + 1}/${pages.length}`;
    pg.drawText(pn, { x: W - M - reg.widthOfTextAtSize(pn, 7), y: M + 6, size: 7, font: reg, color: gray });
  });

  return await doc.save();
}
