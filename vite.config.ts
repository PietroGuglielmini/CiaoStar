import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';

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
      plugins: [react(), obfuscatorPlugin()],
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
