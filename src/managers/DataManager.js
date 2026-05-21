import enemiesData from '../data/enemies.json';
import stagesData from '../data/stages.json';

class DataManager {
    constructor() {
        this.enemies = new Map();
        this.stages = new Map();
        this.parseData();
    }

    parseData() {
        enemiesData.enemies.forEach(enemy => {
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

    getStageData(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) {
            console.warn(`Stage ${stageId} không tồn tại!`);
            return null;
        }
        const enemy = this.enemies.get(stage.enemy_id);
        return {
            ...stage,
            enemy: enemy
        };
    }

    /**
     * MỚI: Lấy danh sách toàn bộ màn chơi thuộc một Chapter
     * và đính kèm luôn Tên của con Quái vật trong màn đó
     */
    getStagesByChapter(chapterNum) {
        const stageList = [];
        this.stages.forEach(stage => {
            if (stage.chapter === chapterNum) {
                const enemy = this.enemies.get(stage.enemy_id);
                stageList.push({
                    stageId: stage.stage_id,
                    enemyName: enemy ? enemy.name : "UNKNOWN"
                });
            }
        });
        // Sắp xếp màn chơi từ nhỏ đến lớn
        return stageList.sort((a, b) => a.stageId - b.stageId);
    }
}

const instance = new DataManager();
export default instance;