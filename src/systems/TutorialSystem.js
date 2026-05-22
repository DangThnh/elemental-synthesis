import Card from '../objects/Card';
import { playSfx } from '../audio/GameAudio';

export default class TutorialSystem {
    
    static startTutorial1(scene) {
        scene.isTutorialMode = true;
        scene.tutorialStep = 1;
        
        const { width, height } = scene.scale;

        // 1. ÉP BÀI CỐ ĐỊNH CHO HAI BÊN
        const elements = ['Metal', 'Wood', 'Water', 'Fire', 'Earth'];
        [...scene.getPlayerReserveList(), ...scene.enemyReserveCards, scene.playerCoreCard, scene.enemyCoreCard].forEach(c => c && c.destroy());
        scene.playerReserveSlots = Array(5).fill(null);

        // Tạo tay bài Player (Scale 0.85)
        for (let i = 0; i < 5; i++) {
            const x = scene.playerReserveStartX + i * scene.playerReserveSpacing;
            const card = new Card(scene, x, scene.playerReserveY, {
                name: elements[i], type: 'Single', level: 1, elements: [elements[i]], color: scene.poolSystem.drawCards(1, 1)[0].color
            }, true);
            card.setScale(0.85);
            card.setDepth(10 + i);
            scene.playerReserveSlots[i] = card;
        }

        // FIX 1: Vẽ tay bài đối thủ ngăn nắp chuẩn tọa độ y mới (enemyZoneH * 0.35)
        const enemyStartX = width / 2 - 180;
        const enemySpacing = 90;
        const enemyY = scene.enemyZoneH * 0.35; 
        
        scene.enemyReserveCards = elements.map((el, i) => {
            let c = new Card(scene, enemyStartX + i * enemySpacing, enemyY, {
                name: el, type: 'Single', level: 1, elements: [el], color: scene.poolSystem.drawCards(1, 1)[0].color
            }, false);
            c.setScale(0.65); c.setDepth(1 + i); return c;
        });

        // 2. ÉP BÀI ĐỐI THỦ LÊN CORE (Hỏa - Fire)
        const fireCard = scene.enemyReserveCards.find(c => c.cardData.name === 'Fire');
        scene.enemyReserveCards = scene.enemyReserveCards.filter(c => c !== fireCard);
        fireCard.setPosition(width / 2, scene.enemyCoreY);
        fireCard.setScale(0.75);
        scene.enemyCoreCard = fireCard;

        // 3. ÉP BÀI PLAYER LÊN CORE (Mộc - Wood)
        const woodCard = scene.playerReserveSlots.find(c => c.cardData.name === 'Wood');
        const woodIdx = scene.playerReserveSlots.indexOf(woodCard);
        scene.playerReserveSlots[woodIdx] = null;
        woodCard.setPosition(scene.coreX, scene.coreY);
        woodCard.setScale(0.85);
        scene.playerCoreCard = woodCard;

        scene.layoutPlayerReserveSlots(0);

        // 4. Chữ hướng dẫn chạm nhẹ lúc màn hình đang sáng
        scene.time.delayedCall(500, () => {
            woodCard.setCrackPreview(true);
            scene.refreshCombatPreview();

            scene.tapPromptText = scene.add.text(width / 2, height * 0.52, 'Chạm vào màn hình để bắt đầu hướng dẫn...', {
                fontSize: '18px', color: '#ffd700', fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(20);
            scene.tweens.add({ targets: scene.tapPromptText, alpha: 0.3, yoyo: true, repeat: -1, duration: 600 });

            scene.input.once('pointerdown', () => {
                scene.tapPromptText.destroy();
                this.showStep1(scene);
            });
        });
    }

    static createDialogueBox(scene, x, y, text) {
        const container = scene.add.container(x, y).setDepth(600);
        const textStyle = { fontSize: '18px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: 340 } };
        const tempText = scene.add.text(0, 0, text, textStyle).setOrigin(0.5);
        const boxW = Math.max(380, tempText.width + 40);
        const boxH = tempText.height + 40;
        const bg = scene.add.rectangle(0, 0, boxW, boxH, 0x2c3e50, 0.95).setStrokeStyle(3, 0xffd700);
        container.add([bg, tempText]);
        return container;
    }

    static showStep1(scene) {
        const { width, height } = scene.scale;
        scene.tutorialOverlay = scene.add.rectangle(width/2, height/2, width, height, 0x000000, 0.8).setDepth(500).setInteractive();
        scene.playerCoreCard.setDepth(501);

        scene.tutorialDialog = this.createDialogueBox(scene, width / 2, height * 0.48, 
            'Quân bài của bạn (Mộc) đang yếu hơn đối thủ (Hỏa)!\nHãy tìm cách khắc chế chúng.'
        );

        scene.tutorialArrow = scene.add.text(scene.coreX, scene.coreY - 140, '⬇', { fontSize: '50px', color: '#ff4444', fontStyle: 'bold' }).setOrigin(0.5).setDepth(502);
        scene.tweens.add({ targets: scene.tutorialArrow, y: scene.coreY - 160, duration: 400, yoyo: true, repeat: -1 });

        scene.tutorialOverlay.once('pointerdown', () => { this.showStep2(scene); });
    }

    static showStep2(scene) {
        const { width, height } = scene.scale;
        scene.playerCoreCard.setDepth(10);
        scene.tutorialDialog.destroy();
        scene.tutorialArrow.destroy();

        const helpY = scene.arenaTopY + 40;
        scene.fakeHelpBtn = scene.add.rectangle(40, helpY, 44, 44, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setDepth(501).setInteractive({ useHandCursor: true });
        scene.fakeHelpText = scene.add.text(40, helpY, '?', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(502);

        scene.tutorialDialog = this.createDialogueBox(scene, width / 2, height * 0.48, 'Hãy bấm vào nút Hỏi Chấm (?) để xem quy luật khắc chế.');
        scene.tutorialArrow = scene.add.text(100, helpY, '⬅', { fontSize: '40px', color: '#ffcc00', fontStyle: 'bold' }).setOrigin(0.5).setDepth(502);
        scene.tweens.add({ targets: scene.tutorialArrow, x: 120, duration: 400, yoyo: true, repeat: -1 });

        scene.fakeHelpBtn.on('pointerdown', () => { playSfx(scene, 'sfx_swap'); this.showStep3(scene); });
    }

    static showStep3(scene) {
        const { width, height } = scene.scale;
        scene.fakeHelpBtn.destroy(); scene.fakeHelpText.destroy(); scene.tutorialDialog.destroy(); scene.tutorialArrow.destroy();

        scene.helpUi.setVisible(true);
        scene.helpUi.container.setDepth(505); 
        scene.helpUi.closeBtn.disableInteractive();

        scene.tutorialDialog = this.createDialogueBox(scene, width / 2, height * 0.48, 'Quy luật ngũ hành: Hỏa > Kim > Mộc > Thổ > Thủy > Hỏa.\nĐể khắc chế Hỏa (Đỏ) ta cần Thủy (Xanh dương)!');
        scene.tutorialDialog.setDepth(506);

        scene.blockOverlay = scene.add.rectangle(width/2, height/2, width, height, 0x000000, 0).setDepth(507).setInteractive();
        scene.blockOverlay.once('pointerdown', () => { this.showStep4(scene); });
    }

    static showStep4(scene) {
        const { width, height } = scene.scale;
        scene.blockOverlay.destroy(); scene.tutorialDialog.destroy();
        scene.helpUi.closeBtn.setInteractive({ useHandCursor: true });

        scene.tutorialDialog = this.createDialogueBox(scene, width / 2, height * 0.48, 'Bây giờ hãy nhấn ĐÓNG để quay lại trận đấu.');
        scene.tutorialDialog.setDepth(506);

        const closeBtnX = scene.helpUi.closeBtn.x + scene.helpUi.container.x;
        const closeBtnY = scene.helpUi.closeBtn.y + scene.helpUi.container.y;

        scene.tutorialArrow = scene.add.text(closeBtnX, closeBtnY - 50, '⬇', { fontSize: '40px', color: '#ff7675', fontStyle: 'bold' }).setOrigin(0.5).setDepth(507);
        scene.tweens.add({ targets: scene.tutorialArrow, y: closeBtnY - 70, duration: 400, yoyo: true, repeat: -1 });

        scene.helpUi.closeBtn.once('pointerdown', () => {
            scene.tutorialDialog.destroy(); scene.tutorialArrow.destroy();
            this.showStep5(scene);
        });
    }

    static showStep5(scene) {
        const { width, height } = scene.scale;
        scene.tutorialOverlay.destroy();

        scene.playerReserveSlots.forEach(card => {
            if (card && card.cardData.name !== 'Water') {
                card.isLocked = true; card.bg.setAlpha(0.25); card.elementIcon.setAlpha(0.25); card.text.setAlpha(0.25);
            }
        });

        const waterCard = scene.playerReserveSlots.find(c => c && c.cardData.name === 'Water');
        waterCard.setDepth(20);

        scene.tutorialDialog = this.createDialogueBox(scene, width / 2, height * 0.48, 'Hãy kéo quân bài hệ Thủy (Xanh dương) lên ô Core Slot chiến đấu để khắc chế kẻ địch!');
        scene.tutorialArrow = scene.add.text(waterCard.x, waterCard.y - 120, '⬇', { fontSize: '45px', color: '#00cec9', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(25);
        scene.tweens.add({ targets: scene.tutorialArrow, y: waterCard.y - 140, duration: 400, yoyo: true, repeat: -1 });

        scene.tutorialTargetCard = waterCard;
    }

    // --- FIX 5: BẢNG CHIẾN THẮNG CHUẨN ĐÚNG THEO MÔ TẢ ---
    static showVictoryDialogue(scene) {
        const { width, height } = scene.scale;
        playSfx(scene, 'sfx_win');

        // Phủ tối màn hình
        const victoryOverlay = scene.add.rectangle(width/2, height/2, width, height, 0x000000, 0.85).setDepth(9999).setInteractive();

        // Khung gỗ viền vàng rực rỡ ở chính giữa
        const winBox = scene.add.container(width / 2, height * 0.50).setDepth(10000);
        const bg = scene.add.rectangle(0, 0, 420, 240, 0x2c3e50, 0.95).setStrokeStyle(3, 0xffd700);
        
        const txt1 = scene.add.text(0, -40, 'BẠN ĐÃ HOÀN THÀNH\nTUTORIAL 1!', {
            fontSize: '28px', color: '#55efc4', fontStyle: 'bold', align: 'center', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        const btn = scene.add.rectangle(0, 50, 280, 52, 0xffa500).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
        const btnTxt = scene.add.text(0, 50, 'TRỞ VỀ MÀN HÌNH CHÍNH', {
            fontSize: '18px', color: '#000', fontStyle: 'bold'
        }).setOrigin(0.5);

        winBox.add([bg, txt1, btn, btnTxt]);

        btn.once('pointerdown', () => {
            winBox.destroy();
            victoryOverlay.destroy();
            
            // RESET TOÀN BỘ GAME VỀ LẠI MAIN MENU
            scene.isTutorialMode = false;
            scene.audioUnlocked = false;
            scene.matchRound = 1;
            scene.currentStage = 1;
            scene.playerHealth = 100;
            scene.enemyHealth = 100;

            scene.scene.restart({ audioUnlocked: false });
        });
    }
}