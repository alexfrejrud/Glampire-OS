import { getWorkspaceId } from './workspace';

const empty = () => ({
    items: [],
    packLabel: null,
    packId: null,
    generatedAt: null,
});

function storageKey() {
    const ws = getWorkspaceId() || 'default';
    return `glampire-os-queue-v1:${ws}`;
}

export function loadStore() {
    try {
        const raw = localStorage.getItem(storageKey());
        if (!raw) return empty();
        return { ...empty(), ...JSON.parse(raw) };
    } catch {
        return empty();
    }
}

export function saveStore(state) {
    localStorage.setItem(
        storageKey(),
        JSON.stringify({
            items: state.items,
            packLabel: state.packLabel,
            packId: state.packId,
            generatedAt: state.generatedAt,
        })
    );
}

export function upsertItem(items, next) {
    const i = items.findIndex((x) => x.id === next.id);
    if (i === -1) return [...items, next];
    const copy = [...items];
    copy[i] = next;
    return copy;
}
