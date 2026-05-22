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
     * Rút bài thông minh từ bể bài chung
     * @param {number} amount - Số lá cần rút
     * @param {number} currentRound - Vòng hiện tại để tính tỉ lệ Lvl 2
     * @param {string} conditionId - ID điều kiện môi trường (Dùng chữ "d" viết thường)
     */
    drawCards(amount, currentRound = 1, conditionId = null) {
        let hand = [];
        
        let level2Chance = 0;
        if (currentRound === 2) level2Chance = 0.10;
        else if (currentRound === 3) level2Chance = 0.30;
        else if (currentRound === 4) level2Chance = 0.50;
        else if (currentRound >= 5) level2Chance = 0.80;

        // KIỂM TRA ĐIỀU KIỆN SỨC NÓNG
        const isExtremeHeat = (conditionId === 'extreme_heat' || conditionId === 'rumble_and_heat');

        for (let i = 0; i < amount; i++) {
            if (this.deck.length === 0) {
                this.initializePool(); 
            }

            let card;

            // Nếu là môi trường Sức Nóng -> 35% tỷ lệ ép ra thẻ Hỏa (Fire)
            if (isExtremeHeat && Math.random() < 0.35) {
                card = {
                    name: 'Fire',
                    type: 'Single',
                    level: 1,
                    elements: ['Fire'],
                    color: Elements.FIRE.color
                };
            } else {
                card = this.deck.pop();
            }

            if (Math.random() < level2Chance) {
                card = { ...card, level: 2 };
            }

            hand.push(card);
        }
        
        return hand;
    }
}