import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 🔥 重要：請將底下的路徑改為您在 GitHub 上的 Repository 名稱（前後都要有斜線）
  // 假設您的 Repo 叫 Haidian-Library，就寫 '/Haidian-Library/'
  base: '/Haidian-Library-Book-Purchase-System/', 
})