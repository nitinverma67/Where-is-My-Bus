import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Actions sets VITE_BASE_PATH for the repository site.
  // Change it to '/' when publishing on a custom domain's root.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
})
