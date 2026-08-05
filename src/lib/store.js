import { getWorkspaceId } from './workspace';

const PREFIX = 'glampire-os-queue-v1:';

const empty = () => ({
    items: [],
    packLabel: null,
    packId: null,
    generatedAt: null,
});

function storageKey(wsId) {
    const ws = wsId || getWorkspaceId() || 'default';
    return `${PREFIX}${ws}`;
}

export function loadStore(wsId) {
    try {
        const raw = localStorage.getItem(storageKey(wsId));
        if (!raw) return empty();
        return { ...empty(), ...JSON.parse(raw) };
    } catch {
        return empty();
    }
}

export function saveStore(state, wsId) {
    // Never wipe a non-empty queue with an empty write (common after wrong-workspace boot)
    const key = storageKey(wsId);
    try {
        const items = state?.items;
        if (Array.isArray(items) && items.length === 0) {
            const existing = localStorage.getItem(key);
            if (existing) {
                try {
                    const prev = JSON.parse(existing);
                    if (Array.isArray(prev.items) && prev.items.length > 0) {
                        console.warn(
                            '[store] blocked empty overwrite of queue with',
                            prev.items.length,
                            'items at',
                            key
                        );
                        return;
                    }
                } catch {
                    /* allow write if corrupt */
                }
            }
        }
    } catch {
        /* ignore */
    }
    localStorage.setItem(
        key,
        JSON.stringify({
            items: state.items,
            packLabel: state.packLabel,
            packId: state.packId,
            generatedAt: state.generatedAt,
        })
    );
}

/**
 * Scan browser for all studio queues (recovery after workspace switch).
 * @returns {{ workspaceId: string, itemCount: number, packLabel: string|null, key: string }[]}
 */
export function listLocalQueues() {
    const out = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(PREFIX)) continue;
            const workspaceId = key.slice(PREFIX.length) || 'default';
            try {
                const raw = localStorage.getItem(key);
                const data = raw ? JSON.parse(raw) : null;
                const itemCount = Array.isArray(data?.items) ? data.items.length : 0;
                out.push({
                    workspaceId,
                    itemCount,
                    packLabel: data?.packLabel || null,
                    key,
                });
            } catch {
                out.push({ workspaceId, itemCount: 0, packLabel: null, key });
            }
        }
    } catch {
        /* private mode etc. */
    }
    return out.sort((a, b) => b.itemCount - a.itemCount);
}

/** Copy queue from one workspace key into another (does not delete source). */
export function copyQueue(fromWorkspaceId, toWorkspaceId) {
    const src = loadStore(fromWorkspaceId);
    if (!src.items?.length) {
        throw new Error(`No items in queue for workspace "${fromWorkspaceId}"`);
    }
    // Force write even if target empty protection — explicit restore
    const key = storageKey(toWorkspaceId);
    localStorage.setItem(
        key,
        JSON.stringify({
            items: src.items,
            packLabel: src.packLabel,
            packId: src.packId,
            generatedAt: src.generatedAt,
        })
    );
    return loadStore(toWorkspaceId);
}

export function upsertItem(items, next) {
    const i = items.findIndex((x) => x.id === next.id);
    if (i === -1) return [...items, next];
    const copy = [...items];
    copy[i] = next;
    return copy;
}
