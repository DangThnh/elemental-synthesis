import { defineConfig } from 'vite'

export default defineConfig({
  // Đây là phần quan trọng nhất để chạy được trên GitHub Pages
  base: '/elemental-synthesis/', 
  
  build: {
    // Đảm bảo thư mục đầu ra khớp với lệnh deploy của bạn (thường là dist)
    outDir: 'dist',
    assetsDir: 'assets',
  }
})