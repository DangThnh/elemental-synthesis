import { Elements } from '../utils/GameLogic';

export default class PoolSystem {
    constructor() {
        this.deck = []; // Bể bài chung chứa 60 lá
        this.initializePool();
    }

    /**
     * Khởi tạo 60 lá bài (12 lá x 5 nguyên tố)
     */
    initializePool() {
        this.deck = [];
        const elements = ['Fire', 'Water', 'Wood', 'Metal', 'Earth'];
        
        for (const el of elements) {
            for (let i = 0; i < 12; i++) {
                this.deck.push({
                    name: el,
                    type: 'Single',
                    level: 1, // Mặc định Lvl 1, sẽ nâng cấp tùy vòng đấu
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
     * Áp dụng The Climax Curve (Vòng càng cao, tỉ lệ ra bài Lvl 2 càng lớn)
     */
    drawCards(amount, currentRound) {
        let hand = [];
        
        // Tỉ lệ bài Lvl 2 theo The Climax Curve
        let level2Chance = 0;
        if (currentRound === 2) level2Chance = 0.10; // 10%
        else if (currentRound === 3) level2Chance = 0.30; // 30%
        else if (currentRound === 4) level2Chance = 0.50; // 50%
        else if (currentRound >= 5) level2Chance = 0.80; // 80%

        for (let i = 0; i < amount; i++) {
            if (this.deck.length === 0) {
                console.warn("Hết bài! Khởi tạo lại bể bài (Trong thực tế có thể thua/hòa).");
                this.initializePool(); 
            }

            // Rút 1 lá từ đỉnh bộ bài
            let card = this.deck.pop();

            // Nâng cấp Lvl 2 nếu trúng tỉ lệ
            if (Math.random() < level2Chance) {
                card.level = 2;
            }

            hand.push(card);
        }
        
        return hand;
    }
}