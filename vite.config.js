import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // Bind IPv4 so http://127.0.0.1:5173 works (macOS often only had ::1)
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8787',
                changeOrigin: true,
                timeout: 300000,
                proxyTimeout: 300000,
            },
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 5173,
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            'lucide-react',
            '@astryxdesign/core/theme',
            '@astryxdesign/core/AppShell',
            '@astryxdesign/core/SideNav',
            '@astryxdesign/core/NavMenu',
            '@astryxdesign/core/Badge',
            '@astryxdesign/core/Button',
            '@astryxdesign/core/SegmentedControl',
            '@astryxdesign/core/Text',
            '@astryxdesign/core/Stack',
            '@astryxdesign/core/StatusDot',
            '@astryxdesign/theme-neutral',
        ],
    },
});
