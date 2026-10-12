// Pièces jointes des requêtes IA (/api/v1/ai/query, /api/v1/ai/query-async) : images et PDF envoyés en base64
// pour que le modèle (multimodal) fasse lui-même l'OCR / la lecture du document.
//   - image/png, image/jpeg, image/webp, image/gif : transmises telles quelles (data URL, format image_url OpenAI-compatible) ;
//   - application/pdf : chaque page (jusqu'à MAX_PDF_PAGES, 40 par défaut) est rendue en PNG (pdfjs-dist + @napi-rs/canvas) ; la couche texte du PDF,
//     quand elle existe, est aussi extraite et jointe au prompt (aide le modèle, notamment pour les chiffres). Si le rendu des pages est
//     impossible (module canvas absent), seule la couche texte est transmise et un avertissement est renvoyé.
const MAX_ATTACHMENTS = 5;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
// Pages rendues par PDF : 40 par défaut (un bail complet avec annexes), réglable par la variable d'environnement AI_MAX_PDF_PAGES.
const MAX_PDF_PAGES = Math.max(1, parseInt(process.env.AI_MAX_PDF_PAGES || '40', 10) || 40);
const PDF_SCALE = 1.6;               // ≈ 115 dpi : lisible pour de l'OCR sans exploser la taille des images
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

let pdfjs = null; let createCanvas = null;
async function charger() {
    if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (createCanvas === null) {
        try { createCanvas = require('@napi-rs/canvas').createCanvas; } catch { createCanvas = false; }
    }
}

async function lirePdf(buf, nom, warnings) {
    await charger();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
    const nbPages = Math.min(doc.numPages, MAX_PDF_PAGES);
    if (doc.numPages > nbPages) warnings.push(`${nom} : seules les ${nbPages} premières pages sur ${doc.numPages} sont analysées`);
    const images = []; let texte = '';
    for (let n = 1; n <= nbPages; n++) {
        const page = await doc.getPage(n);
        const contenu = await page.getTextContent().catch(() => null);
        const t = contenu ? contenu.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() : '';
        if (t) texte += `\n[Page ${n}] ${t}`;
        if (createCanvas) {
            const vp = page.getViewport({ scale: PDF_SCALE });
            const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
            images.push(`data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`);
        }
        page.cleanup();
    }
    if (!createCanvas) warnings.push(`${nom} : rendu des pages indisponible sur ce serveur, seule la couche texte du PDF est transmise (un scan sans texte ne sera pas lisible)`);
    await doc.destroy();
    return { images, texte: texte.trim() };
}

/** attachments : [{ name?, mime?, data (base64) }] → { images: [dataUrl], texte, warnings } ; lève une Error (400) si invalide. */
async function prepareAttachments(attachments) {
    if (attachments === undefined || attachments === null) return { images: [], texte: '', warnings: [] };
    if (!Array.isArray(attachments)) throw Object.assign(new Error('attachments doit être un tableau'), { status: 400 });
    if (attachments.length > MAX_ATTACHMENTS) throw Object.assign(new Error(`Trop de pièces jointes (${MAX_ATTACHMENTS} maximum)`), { status: 400 });
    const warnings = []; const images = []; let texte = ''; let total = 0;
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
            try { r = await lirePdf(buf, nom, warnings); } catch (e) { throw Object.assign(new Error(`${nom} : PDF illisible (${e.message})`), { status: 400 }); }
            images.push(...r.images); if (r.texte) texte += `${texte ? '\n\n' : ''}--- Couche texte de « ${nom} » ---\n${r.texte}`;
        } else images.push(`data:${mime};base64,${buf.toString('base64')}`);
    }
    return { images, texte, warnings };
}

module.exports = { prepareAttachments, MAX_ATTACHMENTS, MAX_PDF_PAGES };
