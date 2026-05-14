/**
 * Key Phaser cache.audio ↔ đường dẫn trong public/
 * Thêm file vào thư mục: public/sounds/
 *   swap.mp3, merge.mp3, crack.mp3, fight.mp3
 * (đổi tên trong manifest nếu cần)
 *
 * import.meta.env.BASE_URL được Vite thay bằng giá trị `base` trong vite.config.js
 * → đảm bảo đường dẫn luôn đúng khi deploy lên sub-path (GitHub Pages).
 */
const BASE = import.meta.env.BASE_URL;

export const AUDIO_MANIFEST = {
    sfx_swap:   `${BASE}sounds/swap.mp3`,
    sfx_merge:  `${BASE}sounds/merge.mp3`,
    sfx_crack:  `${BASE}sounds/crack.mp3`,
    sfx_fight:  `${BASE}sounds/fight.mp3`,
    sfx_lose:   `${BASE}sounds/lose.mp3`,
    sfx_win:    `${BASE}sounds/win.mp3`,
    sfx_impact: `${BASE}sounds/impact.mp3`
};