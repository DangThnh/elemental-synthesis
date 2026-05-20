import { Elements } from '../utils/GameLogic';

export default class PoolSystem {
    constructor() {
        this.deck = []; // Bể bài chung 60 lá
        this.initializePool();
    }

    /**
     * Khởi tạo 60 lá bài (12 lá x 5 nguyên tố cơ bản)
     */
    initializePool() {
        this.deck = [];
        const elements = ['Fire', 'Water', 'Wood', 'Metal', 'Earth'];
        
        for (const el of elements) {
            for (let i = 0; i < 12; i++) {
                this.deck.push({
                    name: el,
                    type: 'Single',
                    level: 1, // Mặc định Lvl 1
                    elements: [el],
                    color: Elements[el.toUpperCase()].color
                });
            }
        }
        this.shuffleDeck();
    }

    /**
     * Trộn bài (Thuật toán Fisher-Yates)
     */
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    /**
     * Rút số lượng lá bài yêu cầu từ bể
     * Áp dụng "The Climax Curve": Vòng càng cao, tỉ lệ bài Lvl 2 càng lớn
     * @param {number} amount - Số lượng lá bài cần rút
     * @param {number} currentRound - Vòng đấu hiện tại
     * @returns {Array} Mảng các lá bài đã rút
     */
    drawCards(amount, currentRound = 1) {
        let hand = [];
        
        // Cấu hình tỉ lệ bài Lvl 2 theo The Climax Curve (như GDD)
        let level2Chance = 0;
        if (currentRound === 2) level2Chance = 0.10; // 10%
        else if (currentRound === 3) level2Chance = 0.30; // 30%
        else if (currentRound === 4) level2Chance = 0.50; // 50%
        else if (currentRound >= 5) level2Chance = 0.80; // 80%

        for (let i = 0; i < amount; i++) {
            // Nếu bể bài hết, tự động nạp lại (trong thực tế có thể xử lý khác)
            if (this.deck.length === 0) {
                console.warn("Bể bài đã cạn! Tự động khởi tạo lại.");
                this.initializePool(); 
            }

            // Rút 1 lá từ đỉnh bộ bài
            let card = this.deck.pop();

            // Nếu may mắn trúng tỉ lệ, nâng cấp thành lá Lvl 2
            if (Math.random() < level2Chance) {
                card = { ...card, level: 2 }; // Tạo bản sao để tránh lỗi tham chiếu
            }

            hand.push(card);
        }
        
        return hand;
    }
}