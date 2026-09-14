import fs from "fs";
import { defineConfig, createLogger, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import {
  manualVendorChunk,
  PREVIEW_ALLOWED_HOSTS,
  resolveVitePort,
} from "./policy";
import {
  createAstridAcpBridgeProxyOptions,
  createAstridBridgeAuthPlugin,
  createAstridBridgeProxyOptions,
  resolveAstridAcpBridgePort,
  resolveAstridBridgePort,
  resolveAstridBridgeProxyPolicy,
} from "./astridBridgeProxy";
import { createWorkspaceRuntimeProxyOptions, RUNTIME_TOKEN_FILE_ENV } from "./runtimeProxy";
import { resolveAstridSource } from "./astridSource";
import { createBundleBudgetPlugin } from "./bundleBudget";
import { createRemoteFontModePlugin } from "./remoteFonts";

export { createRemoteFontModePlugin, stripRemoteFontLinks } from "./remoteFonts";

const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes('postcss.parse') && msg.includes('from')) return;
  originalWarn(msg, options);
};

export default defineConfig(() => {
  const port = resolveVitePort(process.env.PORT);
  const astridBridgePort = resolveAstridBridgePort(process.env.VITE_ASTRID_BRIDGE_PORT);
  const astridAcpBridgePort = resolveAstridAcpBridgePort(process.env.VITE_ASTRID_ACP_BRIDGE_PORT);
  const astridBridgeProxyPolicy = resolveAstridBridgeProxyPolicy(process.env);
  const astridBridgeAuthPlugin = createAstridBridgeAuthPlugin(astridBridgeProxyPolicy);
  const astridBridgeProxy = {
    "/api/astrid": createAstridBridgeProxyOptions(
      astridBridgeProxyPolicy,
      astridBridgePort,
    ),
  };
  const astridAcpBridgeProxy = {
    "/api/astrid/acp": createAstridAcpBridgeProxyOptions(
      astridBridgeProxyPolicy,
      astridAcpBridgePort,
    ),
  };
  const runtimeTarget = process.env.VITE_WORKSPACE_RUNTIME_URL?.trim() || null;
  const astridSource = resolveAstridSource();
  const runtimeTokenFile = process.env[RUNTIME_TOKEN_FILE_ENV]?.trim() || null;
  const runtimeToken = runtimeTokenFile && fs.existsSync(runtimeTokenFile)
    ? fs.readFileSync(runtimeTokenFile, 'utf8').trim()
    : null;
  const runtimeProxy: Record<string, string | ProxyOptions> = runtimeTarget
    ? { "/api/runtime": createWorkspaceRuntimeProxyOptions(runtimeTarget, runtimeToken) }
    : {};
  const disableRemoteFonts = process.env.VITE_DISABLE_REMOTE_FONTS === "1";
  const generatedRegistryPath = path.resolve(
    __dirname,
    "../../node_modules/@banodoco/timeline-composition/typescript/src/registry.generated.ts",
  );
  const generatedRegistryFallbackPath = path.resolve(
    __dirname,
    "../../src/tools/video-editor/lib/registry.generated.fallback.ts",
  );
  const themeApiPath = path.resolve(
    __dirname,
    "../../node_modules/@banodoco/timeline-composition/typescript/src/theme-api.ts",
  );
  const themeApiFallbackPath = path.resolve(
    __dirname,
    "../../src/tools/video-editor/lib/theme-api.fallback.tsx",
  );
  const timelineSchemaPath = path.resolve(
    __dirname,
    "../../node_modules/@banodoco/timeline-schema/typescript/dist/src/index.js",
  );
  const timelineSchemaFallbackPath = path.resolve(
    __dirname,
    "../../src/tools/video-editor/lib/timeline-schema.fallback.ts",
  );

  return {
    customLogger: logger,
    server: {
      host: "::",
      port: port,
      proxy: { ...astridAcpBridgeProxy, ...astridBridgeProxy, ...runtimeProxy },
      // Sprint 5: allow Vite to read from the sibling banodoco-workspace
      // (timeline-theme-2rp file: link).
      fs: {
        allow: [path.resolve(__dirname, "../../../.."), ...(astridSource ? [astridSource.checkout] : [])],
      },
    },
    preview: {
      host: "0.0.0.0",
      port: port,
      allowedHosts: [...PREVIEW_ALLOWED_HOSTS],
      proxy: { ...astridAcpBridgeProxy, ...astridBridgeProxy, ...runtimeProxy },
    },
    plugins: [
      astridBridgeAuthPlugin,
      createRemoteFontModePlugin(disableRemoteFonts),
      react(),
      createBundleBudgetPlugin(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "../../src"),
        "@reigh/editor-sdk": path.resolve(__dirname, "../../src/sdk/index.ts"),
        ...(astridSource ? { "@astrid": astridSource.sourceRoot } : {}),
        // Sprint 5: deduplicate React / Remotion / @banodoco/* across the
        // linked timeline-composition + timeline-theme-* packages so a
        // single React runtime drives the @remotion/player preview.
        "react": path.resolve(__dirname, "../../node_modules/react"),
        "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
        "remotion": path.resolve(__dirname, "../../node_modules/remotion"),
        "@remotion/layout-utils": path.resolve(__dirname, "../../node_modules/@remotion/layout-utils"),
        "@banodoco/timeline-composition/registry.generated": fs.existsSync(generatedRegistryPath)
          ? generatedRegistryPath
          : generatedRegistryFallbackPath,
        "@banodoco/timeline-composition/theme-api": fs.existsSync(themeApiPath)
          ? themeApiPath
          : themeApiFallbackPath,
        "@banodoco/timeline-schema": fs.existsSync(timelineSchemaPath)
          ? timelineSchemaPath
          : timelineSchemaFallbackPath,
        "@banodoco/timeline-composition": path.resolve(__dirname, "../../node_modules/@banodoco/timeline-composition"),
        // Workspace-primitive aliases (mirrors banodoco shell webpack-alias.mjs).
        // Vendored into reigh-app/vendor/ so the Docker build context can resolve them
        // — the original ../../../../banodoco-workspace paths sit outside the build context.
        "@workspace-effects": path.resolve(__dirname, "../../vendor/banodoco-effects"),
        "@workspace-animations": path.resolve(__dirname, "../../vendor/banodoco-animations"),
        "@workspace-transitions": path.resolve(__dirname, "../../vendor/banodoco-transitions"),
      },
      dedupe: ['react', 'react-dom', 'react-reconciler', 'remotion', '@banodoco/timeline-composition', '@banodoco/timeline-theme-2rp'],
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: manualVendorChunk,
        }
      }
    },
    optimizeDeps: {
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
  };
});
