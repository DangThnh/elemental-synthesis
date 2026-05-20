import { drawFiveCards } from '../utils/GameLogic';

export default class PoolSystem {
    constructor() {
        // Tương lai: Khởi tạo mảng 60 lá bài dùng chung ở đây
    }

    /**
     * Hàm rút bài (Tạm thời dùng logic cũ, sau này sẽ rút từ pool 60 lá)
     * @param {number} round - Vòng đấu hiện tại để tính tỉ lệ (The Climax Curve)
     * @returns {Array} Mảng 5 lá bài
     */
    drawCards(round = 1) {
        // Tương lai: Dựa vào 'round' để tính tỉ lệ ra bài Lvl 2
        return drawFiveCards();
    }
}