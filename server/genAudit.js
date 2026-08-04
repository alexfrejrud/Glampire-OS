/**
 * Generation audit log — cost/ops memory across sessions (Arcads-style learnings,
 * without Arcads). Append-only JSONL under server/data/gen-audit.jsonl
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, 'data', 'gen-audit.jsonl');

function ensure() {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '');
}

/**
 * @param {object} entry
 */
export function logGeneration(entry = {}) {
    try {
        ensure();
        const row = {
            ts: new Date().toISOString(),
            ...entry,
        };
        fs.appendFileSync(LOG_PATH, `${JSON.stringify(row)}\n`);
        return row;
    } catch (err) {
        console.warn('[genAudit] write failed', err.message);
        return null;
    }
}

/**
 * Recent entries (newest last in file → reverse for UI).
 */
export function listGenerations({ limit = 50, kind } = {}) {
    try {
        ensure();
        const raw = fs.readFileSync(LOG_PATH, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        let rows = lines.map((l) => {
            try {
                return JSON.parse(l);
            } catch {
                return null;
            }
        }).filter(Boolean);
        if (kind) rows = rows.filter((r) => r.kind === kind);
        return rows.slice(-Math.max(1, Math.min(200, limit))).reverse();
    } catch {
        return [];
    }
}

export function auditStats() {
    const rows = listGenerations({ limit: 200 });
    const byKind = {};
    let estUsd = 0;
    for (const r of rows) {
        byKind[r.kind || 'unknown'] = (byKind[r.kind || 'unknown'] || 0) + 1;
        estUsd += Number(r.estUsd) || 0;
    }
    return {
        total: rows.length,
        byKind,
        estUsdRecent: Math.round(estUsd * 1000) / 1000,
        latest: rows[0] || null,
    };
}
