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

                // --- SKILL DỰC LONG LỬA: THIÊU RỤI BÀI HỆ THỦY ---
            case 'destroy_water_cards':
                // 50% cơ hội kích hoạt
                if (Math.random() < 0.50) {
                    let pRow = [...scene.getPlayerReserveList()];
                    let destroyedAny = false;

                    pRow.forEach(card => {
                        const name = card.cardData.name;
                        const els = card.cardData.elements || [];
                        // Nếu là bài Thủy hoặc chứa nguyên tố Thủy
                        if (name === 'Water' || els.includes('Water')) {
                            card.destroy();
                            scene.removeCardFromRow(pRow, card);
                            destroyedAny = true;
                        }
                    });

                    if (destroyedAny) {
                        scene.syncPlayerSlotsAfterWar(pRow);
                        scene.refreshCombatPreview();
                        
                        this.showFloatingText(scene, scene.playerSprite, 'BỊ THIÊU RỤI!\nMất hết bài hệ Thủy!', '#ff5500');
                        this.showFloatingText(scene, scene.enemySprite, 'Skill: Thiêu Rụi', '#ffcc00');
                    }
                }
                break;

            // --- SKILL BOSS HỎA THẦN: TÍCH NHIỆT LƯỢNG / BÙNG NỔ DIỆN RỘNG ---
            case 'charge_heat_gauge':
                const playerCard = context.playerCard;
                if (!playerCard) return;

                // Kiểm tra xem người chơi có dùng hệ Thủy hay không
                const isWater = playerCard.name === 'Water' || 
                                (playerCard.elements && playerCard.elements.includes('Water'));

                if (!isWater) {
                    // TĂNG NHIỆT (+25%)
                    scene.bossHeatValue = Math.min(100, scene.bossHeatValue + 25);
                    scene.updateHeatBarUI();
                    this.showFloatingText(scene, scene.enemySprite, `Nhiệt Lượng +25%`, '#ff7700');
                    
                    // NẾU NHIỆT LƯỢNG ĐẦY 100% -> BÙNG NỔ CHÍ MẠNG
                    if (scene.bossHeatValue >= 100) {
                        scene.time.delayedCall(1000, () => {
                            scene.playerHealth = Math.max(0, scene.playerHealth - 40);
                            scene.updateHealthUI();
                            scene.cameras.main.shake(500, 0.02); // Rung lắc cực mạnh
                            playSfx(scene, 'sfx_impact'); // Tiếng nổ lớn
                            
                             const centerPos = { x: scene.scale.width / 2, y: scene.fightCenter.y };
                             this.showFloatingText(scene, centerPos, `🔥 BÙNG NỔ NHIỆT! -40 HP`, '#ff3333');
                            
                            // Reset thanh nhiệt về 0
                            scene.bossHeatValue = 0;
                            scene.updateHeatBarUI();
                        });
                    }
                } else {
                    // HẠ NHIỆT (-25%)
                    scene.bossHeatValue = Math.max(0, scene.bossHeatValue - 25);
                    scene.updateHeatBarUI();
                    this.showFloatingText(scene, scene.enemySprite, `Hạ Nhiệt -25%`, '#3498db');
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
        // Lấy tọa độ X
        const posX = targetSprite.x;
        
        // KIỂM TRA: Nếu là Thực thể Game (có hàm setVisible), ta trừ 80px để đẩy lên đầu.
        // Nếu là tọa độ thuần {x, y} truyền vào, ta giữ nguyên Y để hiện đúng tâm.
        const posY = targetSprite.y - (targetSprite.setVisible ? 80 : 0);

        const floatingText = scene.add.text(posX, posY, text, {
            fontSize: '22px', color: color, fontStyle: 'bold', align: 'center', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(200);

        scene.tweens.add({
            targets: floatingText, y: floatingText.y - 60, alpha: 0, duration: 2000, ease: 'Power2.easeOut',
            onComplete: () => floatingText.destroy()
        });
    }
}