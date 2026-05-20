import { checkMerge } from '../utils/GameLogic';

export default class AISystem {
    /**
     * Phân tích và quyết định hành động của AI
     * @param {Array} enemyReserveCards - Danh sách bài trên tay AI
     * @param {number} matchRound - Vòng hiện tại
     * @returns {Object} { action: 'MERGE' | 'PLAY', ...data }
     */
    static determineAction(enemyReserveCards, matchRound) {
        // 1. Phân tích ưu tiên: Cố gắng ghép bài nếu từ Vòng 2 trở đi
        if (matchRound >= 2) {
            for (let i = 0; i < enemyReserveCards.length; i++) {
                for (let j = i + 1; j < enemyReserveCards.length; j++) {
                    const res = checkMerge(enemyReserveCards[i].cardData, enemyReserveCards[j].cardData);
                    if (res.valid) {
                        return {
                            action: 'MERGE',
                            cardA: enemyReserveCards[i],
                            cardB: enemyReserveCards[j],
                            resultData: res.cardData
                        };
                    }
                }
            }
        }

        // 2. Nếu không ghép được, chọn đánh 1 lá ngẫu nhiên
        const randomIdx = Math.floor(Math.random() * enemyReserveCards.length);
        const chosenCard = enemyReserveCards[randomIdx];
        
        return {
            action: 'PLAY',
            card: chosenCard,
            index: randomIdx
        };
    }
}