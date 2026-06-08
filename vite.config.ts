import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { VitePWA } from 'vite-plugin-pwa';

function obfuscatorPlugin() {
  return {
    name: 'vite-plugin-obfuscator',
    apply: 'build' as const,
    generateBundle(options: any, bundle: any) {
      for (const fileName in bundle) {
        const file = bundle[fileName];
        if (file.type === 'chunk' && file.code && fileName.endsWith('.js')) {
          try {
            const obfuscationResult = JavaScriptObfuscator.obfuscate(file.code, {
              compact: true,
              controlFlowFlattening: false,
              deadCodeInjection: true,
              deadCodeInjectionThreshold: 0.1,
              debugProtection: true,
              debugProtectionInterval: 4000,
              disableConsoleOutput: true,
              stringArray: true,
              stringArrayThreshold: 0.75,
            });
            file.code = obfuscationResult.getObfuscatedCode();
          } catch (err) {
            console.error('Error during bundle obfuscation:', err);
          }
        }
      }
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(), 
        obfuscatorPlugin(),
        VitePWA({
          registerType: 'autoUpdate',
          workbox: {
            maximumFileSizeToCacheInBytes: 6000000,
          },
          manifest: {
            name: "CiaoStar VIP Video Messaggi",
            short_name: "CiaoStar",
            description: "Ricevi videomessaggi personalizzati dai tuoi VIP e influencer preferiti.",
            theme_color: "#D4AF37",
            background_color: "#121212",
            display: "standalone",
            orientation: "portrait",
            icons: [
              {
                src: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=192&h=192",
                sizes: "192x192",
                type: "image/jpeg",
                purpose: "any maskable"
              },
              {
                src: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=512&h=512",
                sizes: "512x512",
                type: "image/jpeg",
                purpose: "any maskable"
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
