/** Active workspace id for Glampire OS (persisted + in-memory). */

const KEY = 'glampire-os-workspace-id';

let memoryId = null;

export function getWorkspaceId() {
    if (memoryId) return memoryId;
    try {
        memoryId = localStorage.getItem(KEY) || null;
    } catch {
        memoryId = null;
    }
    return memoryId;
}

export function setWorkspaceId(id) {
    memoryId = id || null;
    try {
        if (id) localStorage.setItem(KEY, id);
        else localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}
