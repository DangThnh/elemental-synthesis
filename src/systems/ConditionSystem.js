import BossSkillEngine from './BossSkillEngine';

export default class ConditionSystem {
    /**
     * Kích hoạt hiệu ứng môi trường khi bắt đầu lượt đấu
     */
    static executeStageSetup(scene, stageData) {
        if (!stageData || !stageData.condition_id) return;

        const cond = stageData.condition_id;

        // --- 1. SƯƠNG MÙ DÀY ĐẶC (Dense Fog) ---
        if (cond === 'dense_fog') {
            if (Math.random() < 0.60) { // Tỉ lệ 60%
                const playerReserve = scene.getPlayerReserveList();
                if (playerReserve.length > 0) {
                    
                    // FIX: Sử dụng Math thuần của JS để tránh lỗi "Phaser is not defined"
                    const randomIndex = Math.floor(Math.random() * playerReserve.length);
                    const randomCard = playerReserve[randomIndex];
                    
                    randomCard.setFlipped(true);

                    // Anim lật bài
                    scene.tweens.add({ 
                        targets: randomCard, 
                        angle: 180, 
                        duration: 250, 
                        yoyo: true, 
                        onYoyo: () => randomCard.setAngle(0) 
                    });
                    
                    this.showEnvText(scene, 'SƯƠNG MÙ DÀY ĐẶC!\nMột lá bài bị lật úp!');
                }
            }
        }

        // --- 2. SỨC NÓNG CỰC HẠN (Extreme Heat) ---
        if (cond === 'extreme_heat' || cond === 'rumble_and_heat') {
            if (scene.matchRound % 2 === 0) {
                this.showEnvText(scene, '🔥 SỨC NÓNG CỰC HẠN!\nMôi trường thiêu đốt!');

                const playerHasWater = scene.getPlayerReserveList().some(card => {
                    const name = card.cardData.name;
                    const els = card.cardData.elements || [];
                    return name === 'Water' || els.includes('Water');
                });

                const coreHasWater = scene.playerCoreCard && (
                    scene.playerCoreCard.cardData.name === 'Water' || 
                    (scene.playerCoreCard.cardData.elements && scene.playerCoreCard.cardData.elements.includes('Water'))
                );

                const isPlayerSafe = playerHasWater || coreHasWater;

                scene.time.delayedCall(1000, () => {
                    if (!isPlayerSafe) {
                        scene.playerHealth = Math.max(0, scene.playerHealth - 10);
                        BossSkillEngine.showFloatingText(scene, scene.playerSprite, '-10 HP\n(Thiêu Đốt)', '#ff3333');
                    } else {
                        BossSkillEngine.showFloatingText(scene, scene.playerSprite, 'AN TOÀN\n(Hệ Thủy bảo vệ)', '#3498db');
                    }

                    const isEnemyImmune = ['ch2_2_duc_long', 'ch2_boss_efreet'].includes(scene.currentEnemyData.id);
                    if (!isEnemyImmune) {
                        scene.enemyHealth = Math.max(0, scene.enemyHealth - 10);
                        BossSkillEngine.showFloatingText(scene, scene.enemySprite, '-10 HP\n(Thiêu Đốt)', '#ff3333');
                    } else {
                        BossSkillEngine.showFloatingText(scene, scene.enemySprite, 'MIỄN NHIỄM\n(Hệ Hỏa)', '#e67e22');
                    }

                    scene.updateHealthUI();
                });
            }
        }
    }

    static showEnvText(scene, text) {
        const txt = scene.add.text(scene.scale.width / 2, scene.arenaTopY + 150, text, {
            fontSize: '22px', color: '#ffcc00', fontStyle: 'bold', align: 'center', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(200);

        scene.tweens.add({
            targets: txt, y: txt.y - 40, alpha: 0, duration: 2500, ease: 'Power2.out',
            onComplete: () => txt.destroy()
        });
    }
}