import { checkMerge } from '../utils/GameLogic';

export default class AISystem {
    /**
     * Phân tích và quyết định hành động của Kẻ địch
     * @param {Array} enemyReserveCards - Danh sách bài trên tay Địch (các đối tượng Card)
     * @param {number} currentRound - Vòng đấu hiện tại
     * @returns {Object|null} Lệnh gửi về cho BattleScene thực thi
     */
    static decideMove(enemyReserveCards, currentRound) {
        
        // 1. Lọc ra các lá bài còn tồn tại (active) trên bàn
        const availableCards = enemyReserveCards.filter(c => c && c.active);
        if (availableCards.length === 0) return null; // Hết bài để đánh

        // 2. TỪ VÒNG 2 TRỞ ĐI: Ưu tiên dò tìm xem có bài để GHÉP hay không
        if (currentRound >= 2) {
            for (let i = 0; i < availableCards.length; i++) {
                for (let j = i + 1; j < availableCards.length; j++) {
                    const cardA = availableCards[i];
                    const cardB = availableCards[j];
                    
                    const res = checkMerge(cardA.cardData, cardB.cardData);
                    
                    if (res.valid) {
                        // AI tìm thấy 2 lá có thể ghép, trả về lệnh MERGE
                        return {
                            action: 'MERGE',
                            cardA: cardA,
                            cardB: cardB,
                            resultData: res.cardData
                        };
                    }
                }
            }
        }

        // 3. NẾU KHÔNG GHÉP ĐƯỢC (hoặc đang ở Vòng 1): Chọn 1 lá ngẫu nhiên để ĐÁNH
        const randomIdx = Math.floor(Math.random() * availableCards.length);
        const chosenCard = availableCards[randomIdx];
        
        return {
            action: 'PLAY',
            card: chosenCard,
            index: randomIdx // Index trong mảng availableCards
        };
    }
}