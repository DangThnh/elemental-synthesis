import { checkMerge } from '../utils/GameLogic';

export default class AISystem {
    /**
     * Đọc các lá bài trên tay AI và quyết định nước đi.
     * @param {Array} enemyReserveCards - Danh sách bài dự bị (chứa các đối tượng Card)
     * @param {number} currentRound - Vòng đấu hiện tại
     * @returns {Object} Lệnh gửi về cho BattleScene thực thi
     */
    static decideMove(enemyReserveCards, currentRound) {
        
        // Lọc ra các lá bài còn tồn tại trên bàn
        const availableCards = enemyReserveCards.filter(c => c && c.active);
        if (availableCards.length === 0) return null;

        // TỪ VÒNG 2 TRỞ ĐI: AI MỚI BIẾT GHÉP BÀI
        if (currentRound >= 2) {
            for (let i = 0; i < availableCards.length; i++) {
                for (let j = i + 1; j < availableCards.length; j++) {
                    const cardA = availableCards[i];
                    const cardB = availableCards[j];
                    
                    const res = checkMerge(cardA.cardData, cardB.cardData);
                    if (res.valid) {
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

        // NẾU KHÔNG GHÉP ĐƯỢC (hoặc Vòng 1): CHỌN BÀI NGẪU NHIÊN ĐỂ ĐÁNH
        const randomIdx = Math.floor(Math.random() * availableCards.length);
        return {
            action: 'PLAY',
            card: availableCards[randomIdx]
        };
    }
}