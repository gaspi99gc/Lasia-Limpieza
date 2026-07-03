import crypto from 'crypto';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { candidatesOnText, buildBlacklist, resolveCuil } from '@/lib/recibos';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sha256(str) {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// Extrae el texto de cada página con pdfjs (fake worker en Node).
async function extractPageTexts(bytes) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
    const doc = await loadingTask.promise;
    const texts = [];
    try {
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            texts.push(content.items.map(it => it.str).join(' '));
        }
    } finally {
        await loadingTask.destroy();
    }
    return texts;
}

export async function POST(request) {
    try {
        const form = await request.formData();
        const file = form.get('file');

        if (!file || typeof file.arrayBuffer !== 'function') {
            return Response.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
        }
        if (file.type && file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
            return Response.json({ error: 'El archivo debe ser un PDF.' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        // pdfjs puede "detachar" el buffer que recibe, así que le paso una copia propia.
        const bytesForPdfjs = new Uint8Array(arrayBuffer.slice(0));
        const bytesForPdfLib = new Uint8Array(arrayBuffer.slice(0));

        const texts = await extractPageTexts(bytesForPdfjs);
        const numPages = texts.length;

        if (numPages === 0) {
            return Response.json({ error: 'El PDF no tiene páginas.' }, { status: 400 });
        }

        const pageCandidates = texts.map(candidatesOnText);
        const blacklist = buildBlacklist(pageCandidates);

        const srcDoc = await PDFDocument.load(bytesForPdfLib);
        const zip = new JSZip();

        const seenHashesByKey = {}; // key(cuil o pagina_N) -> Set de hashes ya guardados
        const usedNames = new Set();
        const stats = { total: numPages, saved: 0, duplicates: 0, sinCuil: 0, blacklist: [...blacklist] };

        for (let i = 0; i < numPages; i++) {
            const text = texts[i];
            const cuil = resolveCuil(text, pageCandidates[i], blacklist);

            let filename, key;
            if (cuil) {
                filename = `${cuil}.pdf`;
                key = cuil;
            } else {
                filename = `pagina_${i + 1}.pdf`;
                key = `pagina_${i + 1}`;
                stats.sinCuil++;
            }

            const pHash = sha256(text);
            if (!seenHashesByKey[key]) seenHashesByKey[key] = new Set();
            if (seenHashesByKey[key].has(pHash)) {
                stats.duplicates++;
                continue; // duplicado idéntico, se omite
            }

            let finalName = filename;
            if (usedNames.has(finalName)) {
                finalName = `${filename.replace(/\.pdf$/i, '')}_p${i + 1}.pdf`;
            }

            const single = await PDFDocument.create();
            const [copied] = await single.copyPages(srcDoc, [i]);
            single.addPage(copied);
            const singleBytes = await single.save();

            zip.file(finalName, singleBytes);
            usedNames.add(finalName);
            seenHashesByKey[key].add(pHash);
            stats.saved++;
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

        return new Response(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="recibos-lasia.zip"',
                'X-Recibos-Summary': encodeURIComponent(JSON.stringify(stats)),
            },
        });
    } catch (err) {
        console.error('Error procesando recibos:', err);
        return Response.json({ error: 'No se pudo procesar el PDF. ¿Es un archivo válido?' }, { status: 500 });
    }
}
