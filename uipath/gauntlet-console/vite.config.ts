import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// UiPath Coded Web App: must use relative base so assets resolve under
// the platform's non-root mount path. The platform handles routing.
export default defineConfig({
  base: './',
  plugins: [react()],
})
