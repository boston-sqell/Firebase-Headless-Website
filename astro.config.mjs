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

  server: {
    host: true,
    port: 4322, // Different port so both sites run simultaneously
  },
});
