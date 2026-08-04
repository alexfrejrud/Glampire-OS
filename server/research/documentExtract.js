/**
 * Brand guide / GTM document text extraction (PDF + text-like uploads).
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract text from an onboarding asset on disk.
 * @param {string} absolutePath
 */
export function extractDocumentText(absolutePath) {
    if (!absolutePath || !fs.existsSync(absolutePath)) {
        return { ok: false, error: 'File not found', text: '', kind: null };
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const buf = fs.readFileSync(absolutePath);

    if (['.txt', '.md', '.markdown', '.csv'].includes(ext)) {
        return {
            ok: true,
            kind: 'text',
            text: buf.toString('utf8').slice(0, 50000),
            filename: path.basename(absolutePath),
        };
    }

    if (['.html', '.htm'].includes(ext)) {
        const raw = buf.toString('utf8');
        const text = raw
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return {
            ok: true,
            kind: 'html',
            text: text.slice(0, 50000),
            filename: path.basename(absolutePath),
        };
    }

    if (ext === '.pdf') {
        const text = crudePdfText(buf);
        return {
            ok: text.length > 40,
            kind: 'pdf',
            text: text.slice(0, 50000),
            filename: path.basename(absolutePath),
            note: text.length > 40 ? null : 'PDF had little extractable text (may be scanned)',
        };
    }

    return {
        ok: false,
        kind: ext.replace('.', '') || 'bin',
        error: 'Unsupported document type for text extract',
        text: '',
        filename: path.basename(absolutePath),
    };
}

/**
 * Very lightweight PDF text extraction (uncompressed streams / parentheses).
 * Good enough for many text-based brand PDFs; scanned PDFs need OCR later.
 */
function crudePdfText(buf) {
    const raw = buf.toString('latin1');
    const chunks = [];

    // Parenthesized strings
    const re = /\((?:\\.|[^\\)]){3,200}\)/g;
    let m;
    while ((m = re.exec(raw))) {
        let s = m[0].slice(1, -1);
        s = s
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\t/g, ' ')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
            .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
        if (/[a-zA-Z]{3,}/.test(s)) chunks.push(s);
    }

    // Tj / TJ operators adjacent text sometimes already captured
    let text = chunks.join(' ');
    text = text.replace(/\s+/g, ' ').trim();
    // Drop binary noise
    text = text.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Pull Brand OS–ish signals from document text.
 */
export function signalsFromDocumentText(text) {
    const t = String(text || '');
    const lower = t.toLowerCase();
    const doNotSay = [];
    const icp = [];
    const voice = [];

    // Lines near "do not" / "don't say" / "never claim"
    for (const line of t.split(/\n|\. /)) {
        const s = line.trim();
        if (s.length < 8 || s.length > 160) continue;
        if (/do not say|don't say|never claim|never say|avoid saying|we don't|not ready/i.test(s)) {
            doNotSay.push(s);
        }
        if (/target|icp|customer|buyer|persona|for (solo|small|enterprise)/i.test(s)) {
            icp.push(s);
        }
        if (/tone|voice|we sound|brand voice|personality/i.test(s)) {
            voice.push(s);
        }
    }

    const colorHits = t.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) || [];

    return {
        doNotSay: uniq(doNotSay).slice(0, 15),
        icpHints: uniq(icp).slice(0, 12),
        voiceHints: uniq(voice).slice(0, 8),
        colorHints: uniq(colorHits).slice(0, 8),
        hasBeta: /\bbeta\b/i.test(lower),
        hasPricing: /\$|pricing|per month|\/mo/i.test(lower),
        excerpt: t.slice(0, 4000),
    };
}

function uniq(arr) {
    return [...new Set((arr || []).map((s) => String(s).trim()).filter(Boolean))];
}

/**
 * Extract from workspace onboarding assets (brand guide etc.)
 */
export function researchDocuments(workspaceDir, assets = {}) {
    const sources = [];
    const docs = [];
    const allSignals = {
        doNotSay: [],
        icpHints: [],
        voiceHints: [],
        colorHints: [],
        excerpts: [],
    };

    const candidates = [];
    if (assets.brandGuide?.path) candidates.push(assets.brandGuide);
    for (const r of assets.refs || []) {
        if (r?.path && /\.(pdf|txt|md|html?)$/i.test(r.path || r.filename || '')) {
            candidates.push(r);
        }
    }

    for (const asset of candidates.slice(0, 4)) {
        const abs = path.join(workspaceDir, asset.path);
        const extracted = extractDocumentText(abs);
        sources.push({
            type: 'document',
            path: asset.path,
            filename: asset.filename || path.basename(asset.path),
            ok: extracted.ok,
            kind: extracted.kind,
            error: extracted.error || extracted.note || null,
        });
        if (!extracted.ok || !extracted.text) continue;
        const sig = signalsFromDocumentText(extracted.text);
        docs.push({ filename: extracted.filename, ...sig });
        allSignals.doNotSay.push(...sig.doNotSay);
        allSignals.icpHints.push(...sig.icpHints);
        allSignals.voiceHints.push(...sig.voiceHints);
        allSignals.colorHints.push(...sig.colorHints);
        allSignals.excerpts.push(sig.excerpt);
    }

    return {
        ok: docs.length > 0,
        documents: docs,
        signals: {
            doNotSay: uniq(allSignals.doNotSay).slice(0, 20),
            icpHints: uniq(allSignals.icpHints).slice(0, 15),
            voiceHints: uniq(allSignals.voiceHints).slice(0, 10),
            colorHints: uniq(allSignals.colorHints).slice(0, 8),
            combinedExcerpt: allSignals.excerpts.join('\n\n').slice(0, 12000),
        },
        sources,
        count: docs.length,
    };
}
