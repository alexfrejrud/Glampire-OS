/**
 * Glampire OS theme — monochrome only.
 * Client brand colors are NEVER applied to the dashboard chrome.
 */
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

export const glampireTheme = defineTheme({
    name: 'glampire-os',
    extends: neutralTheme,
    color: {
        // Pure monochrome accent — no purple / brand chroma on the OS
        accent: '#FFFFFF',
        neutralStyle: 'neutral',
    },
    radius: {
        base: 6,
        multiplier: 1,
    },
});

export const THEME_MODE_KEY = 'glampire-os-theme-mode';

export function loadThemeMode() {
    try {
        const m = localStorage.getItem(THEME_MODE_KEY);
        if (m === 'light' || m === 'dark' || m === 'system') return m;
    } catch {
        /* ignore */
    }
    return 'system';
}

export function saveThemeMode(mode) {
    try {
        localStorage.setItem(THEME_MODE_KEY, mode);
    } catch {
        /* ignore */
    }
}
