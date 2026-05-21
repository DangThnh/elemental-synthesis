import enemiesData from '../data/enemies.json';
import stagesData from '../data/stages.json';

class DataManager {
    constructor() {
        this.enemies = new Map();
        this.stages = new Map();
        this.parseData();
    }

    // Biến JSON thành Map để tra cứu siêu tốc bằng ID
    parseData() {
        enemiesData.enemies.forEach(enemy => {
            // Chuyển string "0x..." thành mã số màu thực tế cho Phaser
            if (enemy.color) {
                enemy.color = parseInt(enemy.color, 16); 
            }
            this.enemies.set(enemy.id, enemy);
        });

        stagesData.stages.forEach(stage => {
            this.stages.set(stage.stage_id, stage);
        });
        
        console.log("✅ DataManager Loaded Successfully!");
    }

    /**
     * Lấy toàn bộ thông tin của màn chơi (bao gồm cả data của Quái)
     * @param {number} stageId 
     * @returns {Object} Data tổng hợp
     */
    getStageData(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) {
            console.warn(`Stage ${stageId} không tồn tại!`);
            return null;
        }

        const enemy = this.enemies.get(stage.enemy_id);
        
        // Gộp data của Stage và Enemy lại trả về cho BattleScene
        return {
            stageId: stage.stage_id,
            chapter: stage.chapter,
            condition_id: stage.condition_id,
            enemy: enemy
        };
    }
}

// Export một instance duy nhất (Singleton Pattern) để dùng chung toàn game
const instance = new DataManager();
export default instance;