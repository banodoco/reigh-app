import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Custom logger to suppress known benign warnings
const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  // Suppress PostCSS "from" option warning (known issue with tailwindcss)
  if (msg.includes('postcss.parse') && msg.includes('from')) return;
  originalWarn(msg, options);
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 2222;

  return {
    customLogger: logger,
    server: {
      host: "::", // Allows access from other devices on the network
      port: port,
    },
    preview: {
      host: "0.0.0.0",
      port: port,
      allowedHosts: [
        "healthcheck.railway.app", 
        "reigh-production.up.railway.app",
        "reigh.art",
        "www.reigh.art"
      ],
    },
    plugins: [
      react(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Vendor chunk splitting for better caching and parallel loading
            if (id.includes('node_modules')) {
              // React core - rarely changes
              if (id.includes('react-dom') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              // TanStack Query - frequently used, benefits from caching
              if (id.includes('@tanstack/react-query') || id.includes('@tanstack/query-core')) {
                return 'vendor-query';
              }
              // Radix UI - large UI component library
              if (id.includes('@radix-ui')) {
                return 'vendor-radix';
              }
              // DnD Kit - drag and drop functionality
              if (id.includes('@dnd-kit')) {
                return 'vendor-dnd';
              }
              // Supabase client
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              // Date utilities
              if (id.includes('date-fns')) {
                return 'vendor-date';
              }
            }
          }
        }
      }
    },
    optimizeDeps: {
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
  };
});
