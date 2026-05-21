import { playSfx } from '../audio/GameAudio';

export default class BossSkillEngine {
    
    static executeTrigger(scene, enemyData, trigger, context = {}) {
        if (!enemyData || !enemyData.skills) return;

        enemyData.skills.forEach(skill => {
            if (skill.trigger === trigger) {
                if (skill.condition && skill.condition.rounds) {
                    if (!skill.condition.rounds.includes(context.matchRound)) return;
                }
                this.runAction(scene, skill, context);
            }
        });
    }

    static runAction(scene, skill, context) {
        console.log(`[BOSS SKILL] Kích hoạt: ${skill.name}`);

        switch (skill.action) {
            
            case 'lock_random_card':
                const availableCards = scene.getPlayerReserveList();
                if (availableCards.length > 0) {
                    const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                    randomCard.setLock(true);
                    this.showFloatingText(scene, scene.playerSprite, `Trói Buộc!`, '#a29bfe');
                    this.showFloatingText(scene, scene.enemySprite, `Skill: ${skill.name}`, '#ffcc00');
                    scene.cameras.main.shake(100, 0.01);
                }
                break;

            // TẠO LỚP GIÁP MỘC (Khởi tạo vòng 1 và 3)
            case 'gain_wood_shield':
                // Chỉ tạo nếu chưa có giáp
                if (!scene.bossHasWoodShield) {
                    scene.bossHasWoodShield = true;
                    
                    if (!scene.woodShieldGraphic) {
                        scene.woodShieldGraphic = scene.add.circle(scene.enemySprite.x, scene.enemySprite.y, 80, 0x27ae60, 0.4)
                            .setStrokeStyle(4, 0x2ecc71).setDepth(15);
                    }
                    scene.woodShieldGraphic.setVisible(true);

                    this.showFloatingText(scene, scene.enemySprite, `+ GIÁP MỘC\n(Cần hệ Hỏa)`, '#2ecc71');
                }
                break;

            case 'reduce_damage_50':
                if (context.attackElement === skill.condition.attack_element) {
                    context.damageRef.value = Math.floor(context.damageRef.value / 2);
                    this.showFloatingText(scene, scene.enemySprite, `Kháng 50% Sát Thương!`, '#3498db');
                }
                break;
        }
    }

    /**
     * KIỂM TRA ĐẶC BIỆT KHI BOSS BỊ TẤN CÔNG HOẶC PHẢN CÔNG
     * Xử lý riêng cho cơ chế Giáp Mộc (Treant Boss)
     */
    static checkSpecialDefenses(scene, playerCardData, damageRef) {
        // Kiểm tra xem Boss có đang cầm Giáp Mộc không
        if (scene.bossHasWoodShield) {
            // Xem lá bài của Player có chứa nguyên tố Fire không (dù là Single hay Dual)
            const hasFire = playerCardData.name.includes('Fire') || 
                            (playerCardData.elements && playerCardData.elements.includes('Fire'));

            if (hasFire) {
                // CÓ HỎA -> VỠ GIÁP
                scene.bossHasWoodShield = false;
                if (scene.woodShieldGraphic) {
                    // Hiệu ứng vỡ giáp
                    scene.tweens.add({
                        targets: scene.woodShieldGraphic, scale: 1.5, alpha: 0, duration: 400,
                        onComplete: () => {
                            scene.woodShieldGraphic.setVisible(false);
                            scene.woodShieldGraphic.setScale(1); // Reset
                        }
                    });
                }
                this.showFloatingText(scene, scene.enemySprite, `GIÁP ĐÃ VỠ!`, '#e74c3c');
                
                // Trừ Damage đòn đánh đó về 0 (Theo GDD: Đập vỡ giáp nhưng bị mất lượt đánh đó)
                damageRef.value = 0; 

            } else {
                // KHÔNG CÓ HỎA -> VÔ HIỆU HÓA ĐÒN ĐÁNH
                damageRef.value = 0;
                
                // Hiển thị chữ KHÁNG! bên trái Boss
                const blockText = scene.add.text(scene.enemySprite.x - 100, scene.enemySprite.y, 'KHÁNG!', {
                    fontSize: '28px', color: '#aaaaaa', fontStyle: 'bold', stroke: '#000', strokeThickness: 5
                }).setOrigin(0.5).setDepth(200);

                scene.tweens.add({
                    targets: blockText, y: blockText.y - 40, alpha: 0, duration: 2000,
                    onComplete: () => blockText.destroy()
                });
            }
        }
    }

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