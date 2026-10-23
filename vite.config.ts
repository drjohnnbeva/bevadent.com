/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const root = import.meta.dirname;

/** En la vista previa no hay servidor: los enlaces del sitio pasan a rutas relativas a cada página. */
function previewLinks(): Plugin {
  const to: Record<string, string> = {
    "/app/cuenta": "app/index.html#cuenta", "/app/planes": "app/index.html#planes", "/app/": "app/index.html",
    "/privacidad/": "privacidad/index.html", "/terminos/": "terminos/index.html", "/": "index.html",
  };
  return {
    name: "odontocostos-preview-links",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const up = "../".repeat(Math.max(0, ctx.path.split("/").filter(Boolean).length - 1));
        return html.replace(/href="(\/[^"]*)"/g, (m, p: string) => {
          if (to[p]) return `href="${up}${to[p]}"`;
          const hash = p.match(/^\/(#.*)$/);
          return hash ? `href="${up}index.html${hash[1]}"` : m;
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "preview" ? [previewLinks()] : [])],
  // La vista previa se publica en una carpeta cualquiera: rutas relativas.
  base: mode === "preview" ? "./" : "/",
  define: { __PREVIEW__: JSON.stringify(mode === "preview") },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        app: resolve(root, "app/index.html"),
        privacidad: resolve(root, "privacidad/index.html"),
        terminos: resolve(root, "terminos/index.html"),
      },
    },
  },
  server: { proxy: { "/api": "http://localhost:3000" } },
  test: { include: ["tests/**/*.test.ts"] },
}));
