// Pièces jointes des requêtes IA (/api/v1/ai/query, /api/v1/ai/query-async) : images et PDF envoyés en base64
// pour que le modèle (multimodal) fasse lui-même l'OCR / la lecture du document.
//   - images (PNG, JPEG, WebP, GIF) : transmises en JPEG (les photos très grandes sont d'abord réduites) ;
//   - PDF : selon le mode de lecture (« pdf_mode ») — chaque page rendue en image (« complet »), ou, pour un PDF NUMÉRIQUE (couche texte présente),
//     le texte de toutes les pages + l'image des seules pages de signature (« rapide »), ou le texte seul (« texte »). « auto » = rapide pour un PDF numérique,
//     complet pour un scan. Le texte extrait est toujours joint au prompt quand il existe ; le prompt précise les pages fournies en image.
//   Une page en image coûte plusieurs milliers de jetons à lire : le mode rapide divise le temps d'analyse d'un contrat numérique, au prix des paraphes des pages intermédiaires.
const MAX_ATTACHMENTS = 5;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
// Pages rendues par PDF : 40 par défaut (un bail complet avec annexes), réglable par la variable d'environnement AI_MAX_PDF_PAGES.
const MAX_PDF_PAGES = Math.max(1, parseInt(process.env.AI_MAX_PDF_PAGES || '40', 10) || 40);
const PDF_SCALE = Math.max(0.8, Math.min(3, Number(process.env.AI_PDF_SCALE) || 1.6));   // ≈ 115 dpi : lisible pour de l'OCR sans exploser le nombre de jetons
const IMAGE_MAX_PX = Math.max(600, parseInt(process.env.AI_IMAGE_MAX_PX || '1800', 10) || 1800);
const JPEG_QUALITE = 82;
const SEUIL_TEXTE = 200;             // caractères par page pour qu'une page soit considérée « numérique »
const PAGES_SIGNATURE_FIN = 2;       // mode rapide : première page + N dernières pages en image
const MODES = ['auto', 'complet', 'rapide', 'texte'];

const decode = (data) => Buffer.from(String(data || '').replace(/^data:[^;]+;base64,/, ''), 'base64');

function typeReel(buf) {
    if (buf.length < 8) return null;
    if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
    return null;   // type reconnu par le CONTENU uniquement (le type annoncé n'est pas fiable)
}

let pdfjs = null; let canvasLib = null;
async function charger() {
    if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (canvasLib === null) {
        try { canvasLib = require('@napi-rs/canvas'); } catch { canvasLib = false; }
    }
}

const jpeg = (canvas) => `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', JPEG_QUALITE).toString('base64')}`;

// Image : réduite si elle dépasse IMAGE_MAX_PX (les photos de téléphone font plusieurs mégapixels : inutiles pour un modèle, lourdes à transférer), puis encodée en JPEG.
async function preparerImage(buf, mime, maxPx) {
    await charger();
    if (!canvasLib) return `data:${mime};base64,${buf.toString('base64')}`;
    try {
        const img = await canvasLib.loadImage(buf);
        const plus = Math.max(img.width, img.height); const k = plus > maxPx ? maxPx / plus : 1;
        if (k === 1 && mime === 'image/jpeg') return `data:image/jpeg;base64,${buf.toString('base64')}`;   // déjà petite et au bon format
        const canvas = canvasLib.createCanvas(Math.round(img.width * k), Math.round(img.height * k)); const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return jpeg(canvas);
    } catch { return `data:${mime};base64,${buf.toString('base64')}`; }
}

const plage = (pages) => {   // [1, 15, 16] → « 1, 15-16 »
    const out = []; let debut = null; let prec = null;
    for (const p of [...pages, null]) {
        if (debut === null) { debut = p; prec = p; continue; }
        if (p === prec + 1) { prec = p; continue; }
        out.push(debut === prec ? String(debut) : `${debut}-${prec}`); debut = p; prec = p;
    }
    return out.join(', ');
};

async function lirePdf(buf, nom, warnings, { mode, scale, maxPages }) {
    await charger();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
    const nbPages = Math.min(doc.numPages, maxPages);
    if (doc.numPages > nbPages) warnings.push(`${nom} : seules les ${nbPages} premières pages sur ${doc.numPages} sont analysées`);
    // 1) texte de chaque page (rapide, sans rendu) : permet de savoir si le PDF est numérique ou scanné
    const textes = [];
    for (let n = 1; n <= nbPages; n++) {
        const page = await doc.getPage(n);
        const c = await page.getTextContent().catch(() => null);
        textes.push(c ? c.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() : '');
        page.cleanup();
    }
    const numeriques = textes.filter((t) => t.length >= SEUIL_TEXTE).length;
    const numerique = nbPages > 0 && numeriques / nbPages >= 0.8;
    // 2) pages à fournir en image
    let effectif = mode;
    if (mode === 'auto') effectif = numerique ? 'rapide' : 'complet';
    if ((mode === 'rapide' || mode === 'texte') && !numerique) { effectif = 'complet'; warnings.push(`${nom} : PDF scanné (pas de texte exploitable), toutes les pages sont lues en image`); }
    let pagesImage;
    if (effectif === 'complet') pagesImage = textes.map((_, i) => i + 1);
    else if (effectif === 'texte') pagesImage = [];
    else { const s = new Set([1]); for (let k = 0; k < PAGES_SIGNATURE_FIN; k++) s.add(nbPages - k); pagesImage = [...s].filter((p) => p >= 1 && p <= nbPages).sort((a, b) => a - b); }
    if (pagesImage.length && !canvasLib) { warnings.push(`${nom} : rendu des pages indisponible sur ce serveur, seule la couche texte du PDF est transmise (un scan sans texte ne sera pas lisible)`); pagesImage = []; effectif = 'texte'; }
    // 3) rendu des pages choisies (JPEG)
    const images = [];
    for (const n of pagesImage) {
        const page = await doc.getPage(n); const vp = page.getViewport({ scale });
        const canvas = canvasLib.createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
        images.push(jpeg(canvas)); page.cleanup();
    }
    await doc.destroy();
    // 4) texte joint au prompt : toutes les pages, avec l'indication de celles fournies en image
    let texte = '';
    if (textes.some(Boolean)) {
        const autres = textes.map((_, i) => i + 1).filter((p) => !pagesImage.includes(p));
        const entete = effectif === 'complet' ? 'toutes les pages sont aussi fournies en image'
            : `pages fournies en image : ${pagesImage.length ? plage(pagesImage) : 'aucune'} ; pages fournies en TEXTE SEUL : ${autres.length ? plage(autres) : 'aucune'} (les signatures et paraphes de ces pages ne peuvent pas être vérifiés)`;
        texte = `--- Texte extrait de « ${nom} » (${numerique ? 'PDF numérique' : 'couche texte partielle'}, ${nbPages} page${nbPages > 1 ? 's' : ''} ; ${entete}) ---\n${textes.map((t, i) => (t ? `[Page ${i + 1}] ${t}` : `[Page ${i + 1}] (aucun texte : voir l'image)`)).join('\n')}`;
    }
    return { images, texte, lecture: { nom, type: 'pdf', mode: effectif, pages: nbPages, pages_image: pagesImage.length, numerique } };
}

/** attachments : [{ name?, mime?, data (base64) }] ; options : { pdfMode: auto|complet|rapide|texte, pdfScale, imageMaxPx }
 *  → { images: [dataUrl], texte, warnings, lecture: [{ nom, type, mode, pages, pages_image }] } ; lève une Error (400) si invalide. */
async function prepareAttachments(attachments, options = {}) {
    if (attachments === undefined || attachments === null) return { images: [], texte: '', warnings: [], lecture: [] };
    if (!Array.isArray(attachments)) throw Object.assign(new Error('attachments doit être un tableau'), { status: 400 });
    if (attachments.length > MAX_ATTACHMENTS) throw Object.assign(new Error(`Trop de pièces jointes (${MAX_ATTACHMENTS} maximum)`), { status: 400 });
    const mode = MODES.includes(String(options.pdfMode || '').toLowerCase()) ? String(options.pdfMode).toLowerCase() : 'complet';
    const scale = Number.isFinite(options.pdfScale) && options.pdfScale > 0 ? Math.max(0.8, Math.min(3, options.pdfScale)) : PDF_SCALE;
    const maxPx = Number.isFinite(options.imageMaxPx) && options.imageMaxPx >= 600 ? Math.min(4000, options.imageMaxPx) : IMAGE_MAX_PX;
    const warnings = []; const images = []; const lecture = []; let texte = ''; let total = 0;
    for (const [i, a] of attachments.entries()) {
        const nom = String(a?.name || `pièce ${i + 1}`).slice(0, 120);
        const buf = decode(a?.data);
        if (!buf.length) throw Object.assign(new Error(`${nom} : contenu vide ou base64 invalide`), { status: 400 });
        total += buf.length;
        if (total > MAX_TOTAL_BYTES) throw Object.assign(new Error(`Pièces jointes trop volumineuses (${MAX_TOTAL_BYTES / 1024 / 1024} Mo maximum au total)`), { status: 413 });
        const mime = typeReel(buf);
        if (!mime) throw Object.assign(new Error(`${nom} : format non pris en charge (PDF, PNG, JPEG, WebP ou GIF)`), { status: 400 });
        if (mime === 'application/pdf') {
            let r;
            try { r = await lirePdf(buf, nom, warnings, { mode, scale, maxPages: MAX_PDF_PAGES }); } catch (e) { throw Object.assign(new Error(`${nom} : PDF illisible (${e.message})`), { status: 400 }); }
            images.push(...r.images); lecture.push(r.lecture); if (r.texte) texte += `${texte ? '\n\n' : ''}${r.texte}`;
        } else { images.push(await preparerImage(buf, mime, maxPx)); lecture.push({ nom, type: 'image', mode: 'image', pages: 1, pages_image: 1 }); }
    }
    return { images, texte, warnings, lecture };
}

module.exports = { prepareAttachments, MAX_ATTACHMENTS, MAX_PDF_PAGES, MODES };
