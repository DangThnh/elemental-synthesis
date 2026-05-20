import { playSfx } from '../audio/GameAudio';

export default class BossSkillEngine {
    
    /**
     * Kích hoạt skill dựa vào thời điểm (trigger)
     */
    static executeTrigger(scene, enemyData, trigger, context = {}) {
        if (!enemyData || !enemyData.skills) return;

        enemyData.skills.forEach(skill => {
            if (skill.trigger === trigger) {
                // Kiểm tra điều kiện vòng đấu (nếu có)
                if (skill.condition && skill.condition.rounds) {
                    if (!skill.condition.rounds.includes(context.matchRound)) return;
                }
                
                // Thực thi hành động
                this.runAction(scene, skill, context);
            }
        });
    }

    /**
     * Dịch lệnh JSON thành hiệu ứng thật trong game
     */
    static runAction(scene, skill, context) {
        console.log(`[BOSS SKILL] Kích hoạt: ${skill.name}`);

        switch (skill.action) {
            
            case 'lock_random_card':
                const availableCards = scene.getPlayerReserveList();
                if (availableCards.length > 0) {
                    const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                    randomCard.setLock(true); // Khóa lá bài
                    
                    this.showFloatingText(scene, scene.playerSprite, `Trói Buộc!`, '#a29bfe');
                    this.showFloatingText(scene, scene.enemySprite, `Skill: ${skill.name}`, '#ffcc00');
                    scene.cameras.main.shake(100, 0.01);
                }
                break;

            case 'gain_wood_shield':
                scene.bossHasWoodShield = true; // Bật cờ khiên
                
                // Vẽ hiệu ứng khiên mộc (Màu xanh lá) đè lên Boss
                if (!scene.woodShieldGraphic) {
                    scene.woodShieldGraphic = scene.add.circle(scene.enemySprite.x, scene.enemySprite.y, 70, 0x27ae60, 0.5).setStrokeStyle(4, 0x2ecc71).setDepth(15);
                }
                scene.woodShieldGraphic.setVisible(true);

                this.showFloatingText(scene, scene.enemySprite, `+ GIÁP MỘC`, '#2ecc71');
                break;

            // Xử lý khi Boss bị nhận sát thương (Dùng cho Giáp và Kháng)
            case 'reduce_damage_50':
                // Chỉ giảm nếu nguyên tố tấn công trùng với điều kiện (VD: Fire)
                if (context.attackElement === skill.condition.attack_element) {
                    context.damageRef.value = Math.floor(context.damageRef.value / 2);
                    this.showFloatingText(scene, scene.enemySprite, `Kháng 50% Sát Thương!`, '#3498db');
                }
                break;
        }
    }

    // Tiện ích hiển thị chữ bay lên (Visual Feedback)
    static showFloatingText(scene, targetSprite, text, color) {
        const floatingText = scene.add.text(targetSprite.x, targetSprite.y - 80, text, {
            fontSize: '22px', color: color, fontStyle: 'bold', align: 'center', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(200);

        scene.tweens.add({
            targets: floatingText, y: floatingText.y - 60, alpha: 0, duration: 2000, ease: 'Power2.easeOut',
            onComplete: () => floatingText.destroy()
        });
    }
}