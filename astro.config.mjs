// @ts-check
import { defineConfig } from 'astro/config';
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://sosunfihaara.com",
  output: "server",
  adapter: node({ mode: "standalone" }),
  // No UI framework integration: the whole site (including the admin panel)
  // is plain Astro + vanilla <script> tags. @astrojs/react + react were
  // previously installed with zero components actually using them -- removed
  // to cut build/dependency weight (see engineering audit, PERF-3).

  vite: {
    plugins: [
      // Compiles src/styles/homepage.css (Tailwind source) at build/dev
      // time instead of it being a hand-frozen, one-time-generated file
      // with no pipeline -- see homepage-custom.css for the hand-written
      // CSS that lives alongside it.
      tailwindcss(),
    ],
  },

  image: {
    // Allow images from Firebase Storage CDN + old Wix CDN (for migrated images)
    domains: ["firebasestorage.googleapis.com", "storage.googleapis.com", "static.wixstatic.com"],
  },

  security: {
    // Astro 7's Host-header validation trusts nothing by default, which
    // silently forces every request's derived origin to "localhost" behind
    // Firebase Hosting's Cloud Run rewrite. That breaks the built-in
    // CSRF/origin check for every POST form (e.g. the admin panel) with
    // "Cross-site POST form submissions are forbidden", even though the
    // submission is genuinely same-origin. Allowlisting the real domains
    // restores correct origin detection without disabling the check.
    allowedDomains: [
      { hostname: "website-c3acf.web.app" },
      { hostname: "website-c3acf.firebaseapp.com" },
      { hostname: "sosunfihaara.com" },
      { hostname: "www.sosunfihaara.com" },
    ],
  },

  server: {
    host: true,
    port: 4322, // Different port so both sites run simultaneously
  },
});
