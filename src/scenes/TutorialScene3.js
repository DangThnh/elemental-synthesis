import Phaser from 'phaser';
import Card from '../objects/Card';
import { compareCards, getWeakSideForPreview, Elements, checkMerge } from '../utils/GameLogic';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

const RESERVE_SLOT_COUNT = 5;

/**
 * TutorialScene3 – Tutorial 3: Tàn Cuộc (Endgame / Reserve War)
 *
 * Setup:
 *   Player: Hỏa, Thổ, Hỏa, Thổ, Thủy
 *   Enemy:  Thổ, Hỏa, Thổ, Hỏa, Kim
 *
 * Flow:
 * 1. Enemy auto-merges Thổ+Hỏa → Ma Thạch, places in core
 * 2. Message: "What happens when both sides can only create one dual?"
 * 3. Player merges Hỏa+Thổ → Ma Thạch, places in core, clicks fight
 * 4. Round 1 result: HÒA (both Ma Thạch are identical) → pause
 * 5. Message about entering tàn cuộc
 * 6. Auto-merge remaining reserve cards (slow animation with arrows)
 * 7. Round 2 fight: Ma Thạch vs Ma Thạch → HÒA (both destroyed)
 * 8. Message: "Still tied, let's see the final round"
 * 9. Round 3 fight: Thủy vs Kim → Player wins
 * 10. Endgame explanation messages
 * 11. Victory screen → BattleScene
 */
export default class TutorialScene3 extends Phaser.Scene {
    constructor() {
        super('TutorialScene3');
        this.tutorialStep = 0;
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;
        this.tutorialOverlay = null;
        this.messageBox = null;
        this.arrowIndicator = null;
        this.fightBtn = null;
        this.fightIcon = null;
        this.coreX = 0;
        this.coreY = 0;
        this.coreDropRadius = 88;
        this.playerReserveStartX = 0;
        this.playerReserveSpacing = 110;
        this.playerReserveY = 0;
        this.slotFrameG = null;
        this.fightCenter = null;
        this.roundText = null;
        this.playerHeartIcons = [];
        this.enemyHeartIcons = [];
        this.playerHealth = 5;
        this.enemyHealth = 5;
        this.arrowTween = null;
        this.clickCatcher = null;
        this.messageBg = null;
        this.messageText = null;
        // Tutorial 3 specific
        this.fireCard = null;
        this.earthCard = null;
        this.mergedCard = null;
        this.endgameMessageSubStep = 0;
        this.resultText = null;
    }

    preload() {
        this.load.on('loaderror', (file) => {
            console.warn('[Asset] preload error:', file?.src ?? file);
        });
        this.load.image('icon_fire', 'assets/icons/fire.png');
        this.load.image('icon_water', 'assets/icons/water.png');
        this.load.image('icon_wood', 'assets/icons/wood.png');
        this.load.image('icon_metal', 'assets/icons/metal.png');
        this.load.image('icon_earth', 'assets/icons/earth.png');
        this.load.image('crack_overlay', 'assets/crack.png');
        this.load.image('icon_swords', 'assets/swords.png');
        preloadBattleAudio(this);
    }

    create(data) {
        this.audioUnlocked = data?.audioUnlocked ?? false;

        const { width, height } = this.scale;

        this.playerReserveStartX = width / 2 - 220;
        this.playerReserveSpacing = 110;
        this.playerReserveY = height * 0.8;
        this.coreX = width / 2;
        this.coreY = height * 0.65;
        this.coreDropRadius = 88;
        this.fightCenter = { x: width / 2, y: height * 0.45 };

        // Background
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e, 1);

        this.roundText = this.add.text(width / 2, 30, 'HƯỚNG DẪN 3', {
            fontSize: '28px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.createHealthUI();
        this.drawSlotFrames();
        this.createCoreLabel();
        this.createFightButton();

        const playerDeck = this.createPlayerDeck();
        const enemyDeck = this.createEnemyDeck();

        // Create enemy reserve cards
        const startX = width / 2 - 220;
        const spacing = 110;
        this.enemyReserveCards = enemyDeck.map((d, i) => {
            const card = new Card(this, startX + i * spacing, height * 0.15, d, false);
            card.setDepth(1 + i);
            return card;
        });

        // Create player reserve cards
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            const card = new Card(this, x, y, playerDeck[i], true);
            this.playerReserveSlots[i] = card;

            if (i === 0) this.fireCard = card;   // Hỏa at slot 0
            if (i === 1) this.earthCard = card;   // Thổ at slot 1
        }

        this.disableAllPlayerCards();

        this.tutorialOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(50);
        this.clickCatcher = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(90).setInteractive();
        this.clickCatcher.on('pointerdown', () => this.onOverlayClick());
        this.clickCatcher.setVisible(false);

        this.messageBox = this.add.container(width / 2, height * 0.52).setDepth(60).setVisible(false);
        this.messageBg = this.add.rectangle(0, 0, 500, 80, 0x0a0a1a, 0.95).setStrokeStyle(2, 0xffd700);
        this.messageText = this.add.text(0, 0, '', {
            fontSize: '22px', color: '#ffffff', fontStyle: 'bold', align: 'center',
            wordWrap: { width: 460 }, lineSpacing: 4
        }).setOrigin(0.5);
        this.messageBox.add([this.messageBg, this.messageText]);

        this.arrowIndicator = this.add.text(0, 0, '▼', {
            fontSize: '36px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(61).setVisible(false);

        // Result text for fight outcomes
        this.resultText = this.add.text(width / 2, height * 0.45, '', {
            fontSize: '36px', color: '#ffcc00', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setDepth(100).setVisible(false);

        this.time.delayedCall(800, () => this.startTutorialSequence());
    }

    createPlayerDeck() {
        return [
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color },
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color },
            { name: 'Water', type: 'Single', level: 1, elements: ['Water'], color: Elements.WATER.color }
        ];
    }

    createEnemyDeck() {
        return [
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color },
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color },
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Metal', type: 'Single', level: 1, elements: ['Metal'], color: Elements.METAL.color }
        ];
    }

    // ==========================================
    // UI Creation helpers
    // ==========================================

    createHealthUI() {
        const { width } = this.scale;
        const topY = 60;
        this.add.text(20, 20, 'PLAYER', { fontSize: '18px', color: '#aaffaa', fontStyle: 'bold' }).setOrigin(0, 0);
        this.add.text(width - 20, 20, 'ENEMY', { fontSize: '18px', color: '#ffaaaa', fontStyle: 'bold' }).setOrigin(1, 0);
        for (let i = 0; i < 10; i++) {
            const x = 20 + i * 22;
            const icon = this.add.text(x, topY, '♥', { fontSize: '22px', color: '#4d4d4d' }).setOrigin(0, 0.5).setDepth(5);
            this.playerHeartIcons.push(icon);
        }
        for (let i = 0; i < 10; i++) {
            const x = width - 20 - i * 22;
            const icon = this.add.text(x, topY, '♥', { fontSize: '22px', color: '#4d4d4d' }).setOrigin(1, 0.5).setDepth(5);
            this.enemyHeartIcons.push(icon);
        }
        this.updateHealthUI();
    }

    updateHealthUI() {
        const pc = Phaser.Math.Clamp(this.playerHealth, 0, 10);
        const ec = Phaser.Math.Clamp(this.enemyHealth, 0, 10);
        this.playerHeartIcons.forEach((icon, i) => icon.setColor(i < pc ? '#ff4d4d' : '#4d4d4d'));
        this.enemyHeartIcons.forEach((icon, i) => icon.setColor(i < ec ? '#ff4d4d' : '#4d4d4d'));
    }

    drawSlotFrames() {
        this.slotFrameG = this.add.graphics().setDepth(0);
        const g = this.slotFrameG;
        const { width, height } = this.scale;
        g.lineStyle(2, 0xffffff, 0.85);
        g.strokeCircle(this.coreX, this.coreY, this.coreDropRadius + 8);
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const pos = this.getPlayerReserveSlotWorldXY(i);
            g.strokeRoundedRect(pos.x - 52, pos.y - 70, 104, 140, 14);
        }
        const enemyY = height * 0.15;
        const spacing = 110;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const x = width / 2 - 220 + i * spacing;
            g.strokeRoundedRect(x - 52, enemyY - 70, 104, 140, 14);
        }
    }

    createCoreLabel() {
        this.add.text(this.coreX, this.coreY - this.coreDropRadius - 30, 'CORE ZONE', {
            fontSize: '16px', color: '#ffee88', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(1);
    }

    createFightButton() {
        const { height } = this.scale;
        this.fightBtn = this.add.rectangle(this.coreX, height * 0.93, 200, 60, 0x555555).setDepth(25);
        this.fightIcon = this.add.image(this.coreX, height * 0.93, 'icon_swords')
            .setDisplaySize(40, 40).setDepth(26);
        this.fightBtn.disableInteractive();
    }

    // ==========================================
    // Slot helpers
    // ==========================================

    getPlayerReserveSlotWorldXY(slotIndex) {
        return { x: this.playerReserveStartX + slotIndex * this.playerReserveSpacing, y: this.playerReserveY };
    }

    getPlayerReserveList() {
        return this.playerReserveSlots.filter(c => c != null && c.active);
    }

    getReserveSlotIndexOfCard(card) {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            if (this.playerReserveSlots[i] === card) return i;
        }
        return -1;
    }

    getCoreZone() {
        return { x: this.coreX, y: this.coreY, r: this.coreDropRadius };
    }

    // ==========================================
    // Card interaction control
    // ==========================================

    disableAllPlayerCards() {
        for (const card of this.playerReserveSlots) {
            if (card) card.disableInteractive();
        }
        if (this.playerCoreCard) this.playerCoreCard.disableInteractive();
    }

    // ==========================================
    // Spotlight & visual effects
    // ==========================================

    dimScreen(alpha = 0.7) {
        this.tweens.add({ targets: this.tutorialOverlay, alpha, duration: 500, ease: 'Sine.easeOut' });
    }

    brightenScreen() {
        this.tweens.add({ targets: this.tutorialOverlay, alpha: 0, duration: 500, ease: 'Sine.easeOut' });
    }

    // ==========================================
    // Message & Arrow helpers
    // ==========================================

    showMessage(text, y = null) {
        this.messageBox.setVisible(true);
        this.messageText.setText(text);
        const bounds = this.messageText.getBounds();
        this.messageBg.setSize(Math.max(bounds.width + 40, 300), Math.max(bounds.height + 24, 60));
        if (y !== null) this.messageBox.setY(y);
    }

    hideMessage() { this.messageBox.setVisible(false); }

    showArrow(x, y, direction = 'down') {
        const arrows = { down: '▼', up: '▲', left: '◀', right: '▶' };
        this.arrowIndicator.setText(arrows[direction] || '▼');
        this.arrowIndicator.setPosition(x, y);
        this.arrowIndicator.setVisible(true).setDepth(62);
        if (this.arrowTween) this.tweens.killTweensOf(this.arrowIndicator);
        this.arrowTween = this.tweens.add({
            targets: this.arrowIndicator,
            y: y + (direction === 'down' ? 8 : direction === 'up' ? -8 : 0),
            x: x + (direction === 'right' ? 8 : direction === 'left' ? -8 : 0),
            duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    hideArrow() {
        this.arrowIndicator.setVisible(false);
        if (this.arrowTween) { this.tweens.killTweensOf(this.arrowIndicator); this.arrowTween = null; }
    }

    showResultText(text, color = '#ffcc00') {
        this.resultText.setText(text).setColor(color).setVisible(true).setAlpha(1);
    }

    hideResultText() { this.resultText.setVisible(false); }

    // ==========================================
    // Tutorial Sequence Steps
    // ==========================================

    startTutorialSequence() {
        this.tutorialStep = 1;
        this.autoEnemyMergeAndPlace();
    }

    // --- Step 1: Enemy auto-merges Thổ+Hỏa → Ma Thạch ---
    autoEnemyMergeAndPlace() {
        const { width, height } = this.scale;

        const earthCard = this.enemyReserveCards.find(c => c.cardData.name === 'Earth');
        const fireCard = this.enemyReserveCards.find(c => c.cardData.name === 'Fire');
        if (!earthCard || !fireCard) return;

        const earthIdx = this.enemyReserveCards.indexOf(earthCard);
        const fireIdx = this.enemyReserveCards.indexOf(fireCard);
        this.enemyReserveCards.splice(Math.max(earthIdx, fireIdx), 1);
        this.enemyReserveCards.splice(Math.min(earthIdx, fireIdx), 1);

        // Animate Earth toward Fire
        this.tweens.add({
            targets: earthCard,
            x: fireCard.x, y: fireCard.y,
            duration: 500, ease: 'Sine.easeInOut',
            onComplete: () => {
                earthCard.destroy();
                fireCard.destroy();

                const dualData = {
                    name: 'Ma Thạch', type: 'Dual', level: 1,
                    elements: ['Earth', 'Fire'], color: 0x5533aa
                };
                const dualCard = new Card(this, fireCard.x, fireCard.y, dualData, false);
                dualCard.setDepth(10);

                // Animate to enemy core
                this.tweens.add({
                    targets: dualCard,
                    x: width / 2, y: height * 0.35,
                    duration: 800, ease: 'Sine.easeInOut',
                    onComplete: () => {
                        this.enemyCoreCard = dualCard;
                        dualCard.setDepth(12);
                        this.refreshCombatPreview();
                        this.time.delayedCall(500, () => this.showStep2());
                    }
                });
            }
        });
    }

    // --- Step 2: Message about the setup ---
    showStep2() {
        this.tutorialStep = 2;
        this.dimScreen(0.75);
        this.clickCatcher.setVisible(true).setDepth(90);
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        // Show both core cards above overlay
        if (this.enemyCoreCard) this.enemyCoreCard.setDepth(58);

        this.showMessage('Một trận đấu mà cả 2 bên chỉ có thể tạo ra một lá bài kép duy nhất, kết quả sẽ là gì đây?');
    }

    // --- Step 3: Guide player to merge Hỏa+Thổ ---
    showStep3() {
        this.tutorialStep = 3;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();

        this.tweens.add({ targets: this.tutorialOverlay, alpha: 0.6, duration: 400 });

        if (this.fireCard) this.fireCard.setDepth(58);
        if (this.earthCard) this.earthCard.setDepth(58);

        this.showMessage('Bấm giữ và kéo lá Hỏa', this.scale.height * 0.52);
        if (this.fireCard) {
            this.showArrow(this.fireCard.x, this.fireCard.y - 90, 'down');
        }

        this.setupFireCardDrag();
    }

    setupFireCardDrag() {
        if (!this.fireCard || !this.earthCard) return;
        const scene = this;

        this.fireCard.setInteractive({ draggable: true, useHandCursor: true });
        this.fireCard.off('dragend');
        this.fireCard.off('drag');

        this.fireCard.on('drag', (pointer, dragX, dragY) => {
            scene.fireCard.x = dragX;
            scene.fireCard.y = dragY;
        });

        this.fireCard.on('dragstart', () => {
            scene.showMessage('Thả vào đây');
            scene.showArrow(scene.earthCard.x, scene.earthCard.y - 90, 'down');
        });

        this.fireCard.on('dragend', () => {
            scene.tweens.add({ targets: scene.fireCard, scale: 1, duration: 100 });
            scene.fireCard.iconPlus?.setVisible(false);
            scene.fireCard.iconCross?.setVisible(false);
            if (scene.fireCard.strokeTween) { scene.fireCard.strokeTween.remove(); scene.fireCard.strokeTween = null; }
            scene.fireCard.hoverTargets.forEach(t => { if (t.strokeTween) { t.strokeTween.remove(); t.strokeTween = null; } });
            scene.fireCard.hoverTargets = [];

            const dist = Phaser.Math.Distance.Between(scene.fireCard.x, scene.fireCard.y, scene.earthCard.x, scene.earthCard.y);

            if (dist < 70) {
                scene.executeMergeFireEarth();
            } else {
                scene.fireCard.snapBack();
                scene.hideMessage();
                scene.hideArrow();
                // Re-show original message
                scene.showMessage('Bấm giữ và kéo lá Hỏa', scene.scale.height * 0.52);
                scene.showArrow(scene.fireCard.x, scene.fireCard.y - 90, 'down');
            }
        });
    }

    executeMergeFireEarth() {
        const fireSlot = this.getReserveSlotIndexOfCard(this.fireCard);
        const earthSlot = this.getReserveSlotIndexOfCard(this.earthCard);

        if (fireSlot >= 0) this.playerReserveSlots[fireSlot] = null;
        if (earthSlot >= 0) this.playerReserveSlots[earthSlot] = null;

        const mergeX = this.earthCard.x;
        const mergeY = this.earthCard.y;
        this.fireCard.destroy();
        this.earthCard.destroy();

        playSfx(this, 'sfx_merge', { volume: 0.7 });

        const dualData = {
            name: 'Ma Thạch', type: 'Dual', level: 1,
            elements: ['Fire', 'Earth'], color: 0x5533aa
        };
        this.mergedCard = new Card(this, mergeX, mergeY, dualData, true);
        this.mergedCard.setDepth(58);

        const targetSlot = earthSlot >= 0 ? earthSlot : (fireSlot >= 0 ? fireSlot : 0);
        this.playerReserveSlots[targetSlot] = this.mergedCard;
        this.mergedCard.originalPos = { x: mergeX, y: mergeY };

        this.layoutPlayerReserveSlots(300);
        this.time.delayedCall(600, () => this.showStep4());
    }

    // --- Step 4: Guide player to drag merged card to core ---
    showStep4() {
        this.tutorialStep = 4;
        this.dimScreen(0.75);
        this.clickCatcher.setVisible(true).setDepth(90);
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        if (this.mergedCard) {
            this.mergedCard.setDepth(58);
            this.showMessage('Kéo lá bài vừa kết hợp lên slot chiến đấu');
            this.showArrow(this.mergedCard.x, this.mergedCard.y - 90, 'down');
        }
    }

    showStep5() {
        this.tutorialStep = 5;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();

        this.tweens.add({ targets: this.tutorialOverlay, alpha: 0.6, duration: 400 });
        if (this.mergedCard) this.mergedCard.setDepth(58);
        this.setupMergedCardDrag();
    }

    setupMergedCardDrag() {
        if (!this.mergedCard) return;
        const scene = this;

        this.mergedCard.setInteractive({ draggable: true, useHandCursor: true });
        this.mergedCard.off('dragend');
        this.mergedCard.off('drag');

        this.mergedCard.on('drag', (pointer, dragX, dragY) => {
            scene.mergedCard.x = dragX;
            scene.mergedCard.y = dragY;
        });

        this.mergedCard.on('dragend', () => {
            scene.tweens.add({ targets: scene.mergedCard, scale: 1, duration: 100 });
            scene.mergedCard.iconPlus?.setVisible(false);
            scene.mergedCard.iconCross?.setVisible(false);
            if (scene.mergedCard.strokeTween) { scene.mergedCard.strokeTween.remove(); scene.mergedCard.strokeTween = null; }
            scene.mergedCard.hoverTargets.forEach(t => { if (t.strokeTween) { t.strokeTween.remove(); t.strokeTween = null; } });
            scene.mergedCard.hoverTargets = [];

            const z = scene.getCoreZone();
            const dist = Phaser.Math.Distance.Between(scene.mergedCard.x, scene.mergedCard.y, z.x, z.y);

            if (dist < z.r) {
                const slotIdx = scene.getReserveSlotIndexOfCard(scene.mergedCard);
                if (slotIdx >= 0) scene.playerReserveSlots[slotIdx] = null;

                scene.playerCoreCard = scene.mergedCard;
                scene.tweens.add({
                    targets: scene.mergedCard,
                    x: z.x, y: z.y,
                    duration: 260, ease: 'Sine.easeOut',
                    onComplete: () => {
                        scene.mergedCard.originalPos = { x: z.x, y: z.y };
                        scene.layoutPlayerReserveSlots();
                        scene.refreshCombatPreview();
                        scene.showStep6();
                    }
                });
                playSfx(scene, 'sfx_swap');
            } else {
                scene.mergedCard.snapBack();
            }

            scene.time.delayedCall(400, () => scene.refreshCombatPreview());
        });
    }

    // --- Step 6: Guide player to click fight ---
    showStep6() {
        this.tutorialStep = 6;
        this.dimScreen(0.75);
        this.clickCatcher.setVisible(true).setDepth(90);
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        this.fightBtn.setDepth(58);
        this.fightIcon.setDepth(59);

        this.showMessage('Bấm để chiến đấu');
        const { height } = this.scale;
        this.showArrow(this.coreX, height * 0.93 - 50, 'down');
    }

    showStep7() {
        this.tutorialStep = 7;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();
        this.brightenScreen();

        this.fightBtn.setInteractive({ useHandCursor: true });
        this.fightBtn.fillColor = 0xffa500;
        this.fightBtn.on('pointerdown', () => this.executeRound1Fight());
    }

    // ==========================================
    // Overlay click handler
    // ==========================================

    onOverlayClick() {
        switch (this.tutorialStep) {
            case 2: this.showStep3(); break;
            case 4: this.showStep5(); break;
            case 6: this.showStep7(); break;
            case 8:
                // After "entering tàn cuộc" message → start auto-merge
                this.startEndgameSequence();
                break;
            case 11:
                // After "still tied" message → start round 3
                this.startEndgameRound3();
                break;
            case 12:
                this.endgameMessageSubStep++;
                if (this.endgameMessageSubStep === 1) {
                    this.showMessage('Các lá bài còn lại ở các ô dự bị sẽ tự động được ghép lại để tạo thành lá kép trước khi đấu với đối thủ, vậy nên hãy xếp bài thật thông minh');
                } else if (this.endgameMessageSubStep === 2) {
                    this.showMessage('Một khi chiến thắng ở lượt đấu bất kỳ trong tàn cuộc, bạn sẽ chiến thắng cả vòng đấu đó.');
                } else {
                    this.endgameMessageSubStep = 0;
                    this.showVictoryScreen();
                }
                break;
        }
    }

    // ==========================================
    // Layout & Preview
    // ==========================================

    layoutPlayerReserveSlots(duration = 220) {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const c = this.playerReserveSlots[i];
            if (!c?.active) continue;
            c.clearCrackPreview();
            const { x: tx, y: ty } = this.getPlayerReserveSlotWorldXY(i);
            c.originalPos = { x: tx, y: ty };
            this.tweens.add({ targets: c, x: tx, y: ty, duration, ease: 'Sine.easeOut' });
        }
    }

    refreshCombatPreview() {
        const p = this.playerCoreCard;
        const e = this.enemyCoreCard;
        this.getPlayerReserveList().forEach(c => c.clearCrackPreview());
        if (!p?.active || !e?.active) { p?.clearCrackPreview(); e?.clearCrackPreview(); return; }
        p.clearCrackPreview();
        e.clearCrackPreview();
        const w = getWeakSideForPreview(p.cardData, e.cardData);
        if (w === 'player') p.setCrackPreview(true);
        else if (w === 'enemy') e.setCrackPreview(true);
        else if (w === 'both') { p.setCrackPreview(true); e.setCrackPreview(true); }
    }

    // ==========================================
    // Round 1 Fight → HÒA
    // ==========================================

    async executeRound1Fight() {
        this.fightBtn.disableInteractive();
        this.fightBtn.off('pointerdown');
        this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });

        const playerCard = this.playerCoreCard;
        const enemyCard = this.enemyCoreCard;
        if (!playerCard?.active || !enemyCard?.active) { this.input.enabled = true; return; }

        const finalResult = compareCards(playerCard.cardData, enemyCard.cardData);
        const center = this.fightCenter;

        playerCard.setDepth(20);
        enemyCard.setDepth(20);

        // Orbit animation
        await Promise.all([
            this.tweenPromise({ targets: playerCard, x: center.x - 60, y: center.y, duration: 350, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: enemyCard, x: center.x + 60, y: center.y, duration: 350, ease: 'Power2.easeIn' })
        ]);

        // Result is HÒA — both cards crack
        this.cameras.main.shake(200, 0.012);
        playSfx(this, 'sfx_crack', { volume: 0.6 });

        this.showResultText('HÒA!', '#ffcc00');

        // Flash both cards
        await this.wait(400);

        // Destroy both core cards (tie = both eliminated)
        const pShards = this.createShatterPieces(playerCard);
        const eShards = this.createShatterPieces(enemyCard);
        playerCard.setVisible(false);
        enemyCard.setVisible(false);

        await Promise.all([...pShards, ...eShards].map(piece => {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dist = Phaser.Math.Between(60, 120);
            const tx = center.x + Math.cos(angle) * dist;
            const ty = center.y + Math.sin(angle) * dist;
            const rot = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            return this.tweenPromise({
                targets: piece, x: tx, y: ty, alpha: 0, rotation: rot,
                duration: 600, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
            });
        }));

        this.input.enabled = true;
        this.time.delayedCall(600, () => this.showStep8());
    }

    // --- Step 8: Show "entering tàn cuộc" message ---
    showStep8() {
        this.tutorialStep = 8;
        this.hideResultText();
        this.dimScreen(0.75);
        this.clickCatcher.setVisible(true).setDepth(90);
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        this.showMessage('Một kết quả hòa, chúng ta sẽ tiến vào tàn cuộc');
    }

  // ==========================================
    // Endgame (Tàn Cuộc) — Auto-merge & Fight
    // ==========================================

    async startEndgameSequence() {
        this.tutorialStep = 9;
        this.hideResultText();
        this.hideMessage();
        this.hideArrow();
        this.brightenScreen();
        this.clickCatcher.setVisible(false);

        const { width, height } = this.scale;

        // Get remaining cards
        const playerRemaining = this.playerReserveSlots.filter(c => c && c.active);
        const enemyRemaining = [...this.enemyReserveCards];

        // --- Auto-merge player cards (slow animation) ---
        if (playerRemaining.length >= 2) {
            const p0 = playerRemaining[0];
            const p1 = playerRemaining[1];
            if (p0) { p0.setDepth(58); }
            if (p1) { p1.setDepth(58); }

            this.showArrow(p0.x, p0.y - 90, 'down');
            await this.wait(800);

            const mergeRes = checkMerge(p0.cardData, p1.cardData);
            if (mergeRes.valid) {
                const midX = (p0.x + p1.x) / 2;
                const midY = p0.y;

                await Promise.all([
                    this.tweenPromise({ targets: p0, x: midX, duration: 600, ease: 'Sine.easeInOut' }),
                    this.tweenPromise({ targets: p1, x: midX, duration: 600, ease: 'Sine.easeInOut' })
                ]);

                const s0 = this.getReserveSlotIndexOfCard(p0);
                const s1 = this.getReserveSlotIndexOfCard(p1);
                if (s0 >= 0) this.playerReserveSlots[s0] = null;
                if (s1 >= 0) this.playerReserveSlots[s1] = null;

                p0.destroy();
                p1.destroy();
                playSfx(this, 'sfx_merge', { volume: 0.5 });

                const pDual = new Card(this, midX, midY, mergeRes.cardData, true);
                pDual.setDepth(58);
                
                for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
                    if (!this.playerReserveSlots[i]) { this.playerReserveSlots[i] = pDual; break; }
                }
                pDual.originalPos = { x: midX, y: midY };
                this.layoutPlayerReserveSlots(300);
            }
        }

        // --- Auto-merge enemy cards (slow animation) ---
        if (enemyRemaining.length >= 2) {
            const e0 = enemyRemaining[0];
            const e1 = enemyRemaining[1];
            if (e0) e0.setDepth(58);
            if (e1) e1.setDepth(58);

            this.showArrow(e0.x, e0.y + 90, 'up');
            await this.wait(800);

            const mergeRes = checkMerge(e0.cardData, e1.cardData);
            if (mergeRes.valid) {
                const midX = (e0.x + e1.x) / 2;
                const midY = e0.y;

                await Promise.all([
                    this.tweenPromise({ targets: e0, x: midX, duration: 600, ease: 'Sine.easeInOut' }),
                    this.tweenPromise({ targets: e1, x: midX, duration: 600, ease: 'Sine.easeInOut' })
                ]);

                const idx0 = this.enemyReserveCards.indexOf(e0);
                const idx1 = this.enemyReserveCards.indexOf(e1);
                
                // Lấy vị trí nhỏ nhất để chèn bài mới vào đúng chỗ
                const insertIdx = Math.min(idx0, idx1);

                this.enemyReserveCards.splice(Math.max(idx0, idx1), 1);
                this.enemyReserveCards.splice(Math.min(idx0, idx1), 1);

                e0.destroy();
                e1.destroy();
                playSfx(this, 'sfx_merge', { volume: 0.5 });

                const eDual = new Card(this, midX, midY, mergeRes.cardData, false);
                eDual.setDepth(10);
                
                // Sửa lỗi: Chèn Ma Thạch vào đúng vị trí cũ thay vì đẩy xuống cuối (.push)
                this.enemyReserveCards.splice(insertIdx, 0, eDual);

                const exStart = width / 2 - ((this.enemyReserveCards.length - 1) * 110) / 2;
                for (let i = 0; i < this.enemyReserveCards.length; i++) {
                    const tx = exStart + i * 110;
                    this.tweens.add({ targets: this.enemyReserveCards[i], x: tx, duration: 300, ease: 'Sine.easeOut' });
                }
            }
        }

        this.hideArrow();
        await this.wait(600);

        // --- Endgame Round 2 Fight ---
        await this.executeEndgameFight(2);
    }

    async executeEndgameFight(roundNum) {
        // Sửa lỗi: Không sort theo tọa độ X nữa, lấy luôn lá bài hợp lệ đầu tiên theo logic mảng
        const pCard = this.playerReserveSlots.find(c => c && c.active);
        const eCard = this.enemyReserveCards.find(c => c && c.active);

        if (!pCard || !eCard) return;

        const center = this.fightCenter;

        playSfx(this, 'sfx_fight', { volume: 0.55 });

        pCard.setDepth(20);
        eCard.setDepth(20);

        // Orbit animation
        await Promise.all([
            this.tweenPromise({ targets: pCard, x: center.x - 60, y: center.y, duration: 350, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: eCard, x: center.x + 60, y: center.y, duration: 350, ease: 'Power2.easeIn' })
        ]);

        const result = compareCards(pCard.cardData, eCard.cardData);

        if (result === 'HÒA') {
            this.cameras.main.shake(200, 0.012);
            playSfx(this, 'sfx_crack', { volume: 0.6 });
            this.showResultText('HÒA!', '#ffcc00');

            await this.wait(400);

            const pShards = this.createShatterPieces(pCard);
            const eShards = this.createShatterPieces(eCard);
            pCard.setVisible(false);
            eCard.setVisible(false);

            await Promise.all([...pShards, ...eShards].map(piece => {
                const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const dist = Phaser.Math.Between(60, 120);
                const tx = center.x + Math.cos(angle) * dist;
                const ty = center.y + Math.sin(angle) * dist;
                const rot = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
                return this.tweenPromise({
                    targets: piece, x: tx, y: ty, alpha: 0, rotation: rot,
                    duration: 600, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
                });
            }));

            // Remove from rows
            const ps = this.getReserveSlotIndexOfCard(pCard);
            if (ps >= 0) this.playerReserveSlots[ps] = null;
            const ei = this.enemyReserveCards.indexOf(eCard);
            if (ei >= 0) this.enemyReserveCards.splice(ei, 1);

            this.layoutPlayerReserveSlots(200);
            const { width } = this.scale;
            const exStart = width / 2 - ((this.enemyReserveCards.length) * 110) / 2 + 55;
            for (let i = 0; i < this.enemyReserveCards.length; i++) {
                this.tweens.add({ targets: this.enemyReserveCards[i], x: exStart + i * 110, duration: 200, ease: 'Sine.easeOut' });
            }

            await this.wait(400);

            if (roundNum === 2) {
                this.hideResultText();
                this.tutorialStep = 11;
                this.dimScreen(0.75);
                this.clickCatcher.setVisible(true).setDepth(90);
                this.messageBox.setDepth(91);
                this.arrowIndicator.setDepth(92);
                this.showMessage('Chúng ta vẫn hòa, hãy xem lượt đấu cuối');
            }
        } else if (result === 'THẮNG') {
            const winnerCard = pCard;
            const loserCard = eCard;

            winnerCard.setDepth(22);
            loserCard.setDepth(21);

            await Promise.all([
                this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 220, ease: 'Power2.easeIn' }),
                this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 220, ease: 'Power2.easeIn' })
            ]);

            await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 180, ease: 'Power2.easeOut' });
            await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 120, ease: 'Quad.easeIn' });

            this.cameras.main.shake(200, 0.018);
            playSfx(this, 'sfx_impact', { volume: 0.8 });

            const eShards = this.createShatterPieces(loserCard);
            loserCard.setVisible(false);

            await Promise.all(eShards.map(piece => {
                const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const d = Phaser.Math.Between(80, 140);
                const tx = center.x + Math.cos(a) * d;
                const ty = center.y + Math.sin(a) * d;
                const rot = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
                return this.tweenPromise({
                    targets: piece, x: tx, y: ty, alpha: 0, rotation: rot,
                    duration: 650, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
                });
            }));

            const eidx = this.enemyReserveCards.indexOf(loserCard);
            if (eidx >= 0) this.enemyReserveCards.splice(eidx, 1);
            loserCard.destroy();

            this.showResultText('THẮNG!', '#44ff44');
            playSfx(this, 'sfx_win');

            await this.wait(1200);
            this.hideResultText();

            this.tutorialStep = 12;
            this.dimScreen(0.75);
            this.clickCatcher.setVisible(true).setDepth(90);
            this.messageBox.setDepth(91);
            this.arrowIndicator.setDepth(92);
            this.endgameMessageSubStep = 0;
            this.showMessage('Chúng ta vừa chứng kiến tàn cuộc. Tàn cuộc là khi bạn hòa lượt đầu và tiếp tục tiến vào các lượt đấu tiếp theo.');
        }
    }

    async startEndgameRound3() {
        this.tutorialStep = 9;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();
        this.hideResultText();

        // Sửa lỗi ở đây: Loại bỏ lệnh sort theo X
        const playerRemaining = this.playerReserveSlots.filter(c => c && c.active);
        const enemyRemaining = this.enemyReserveCards.filter(c => c && c.active);

        if (playerRemaining.length > 0) {
            playerRemaining[0].setDepth(58);
            this.showArrow(playerRemaining[0].x, playerRemaining[0].y - 90, 'down');
        }
        if (enemyRemaining.length > 0) {
            enemyRemaining[0].setDepth(58);
        }

        await this.wait(1000);

        // Execute round 3 fight (Thủy vs Kim → Player wins)
        await this.executeEndgameFight(3);
    }
    // ==========================================
    // Shatter effect
    // ==========================================

    createShatterPieces(card) {
        const pieces = [];
        const count = 8;
        const color = card.cardData?.color ?? 0xffffff;
        for (let i = 0; i < count; i++) {
            const w = Phaser.Math.Between(12, 22);
            const h = Phaser.Math.Between(8, 18);
            const piece = this.add.rectangle(card.x, card.y, w, h, color, 1).setDepth(25);
            piece.setOrigin(0.5);
            piece.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
            pieces.push(piece);
        }
        return pieces;
    }

    // ==========================================
    // Victory screen
    // ==========================================

    showVictoryScreen() {
        this.tutorialStep = 13;
        const { width, height } = this.scale;

        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(100);

        const victoryTitle = this.add.text(width / 2, height * 0.28, 'CHIẾN THẮNG!', {
            fontSize: '56px', color: '#ffd700', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setDepth(101);

        victoryTitle.setScale(0);
        this.tweens.add({ targets: victoryTitle, scale: 1, duration: 600, ease: 'Back.easeOut' });

        const congratsText = this.add.text(width / 2, height * 0.40, 'Bạn vừa hoàn thành tất cả màn chơi hướng dẫn!\nBây giờ bạn đã sẵn sàng cho một trận chiến thực thụ.', {
            fontSize: '24px', color: '#ffffff', fontStyle: 'bold', align: 'center', lineSpacing: 8
        }).setOrigin(0.5).setDepth(101);

        congratsText.setAlpha(0);
        this.tweens.add({ targets: congratsText, alpha: 1, duration: 500, delay: 400, ease: 'Sine.easeOut' });

        const explainText = this.add.text(width / 2, height * 0.56, 'Tàn cuộc: khi hòa ở lượt đầu,\ncác lá bài dự bị sẽ tự ghép và đấu tiếp.\nChiến thắng bất kỳ lượt nào trong tàn cuộc\n= chiến thắng cả vòng đấu!', {
            fontSize: '20px', color: '#aaddff', align: 'center', lineSpacing: 6
        }).setOrigin(0.5).setDepth(101);

        explainText.setAlpha(0);
        this.tweens.add({ targets: explainText, alpha: 1, duration: 500, delay: 800, ease: 'Sine.easeOut' });

        const continueBtn = this.add.rectangle(width / 2, height * 0.72, 280, 70, 0xffa500)
            .setDepth(101).setInteractive({ useHandCursor: true });
        const continueText = this.add.text(width / 2, height * 0.72, 'BẮT ĐẦU CHƠI', {
            fontSize: '26px', color: '#000000', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(102);

        continueBtn.setAlpha(0);
        continueText.setAlpha(0);
        this.tweens.add({
            targets: [continueBtn, continueText], alpha: 1,
            duration: 500, delay: 1200, ease: 'Sine.easeOut'
        });

        continueBtn.on('pointerdown', () => {
            localStorage.setItem('elemental-synthesis-tutorial-done', '1');
            this.scene.start('BattleScene', { audioUnlocked: true });
        });

        this.createSparkles(width, height);
    }

    createSparkles(width, height) {
        for (let i = 0; i < 12; i++) {
            this.time.delayedCall(Phaser.Math.Between(200, 2000), () => {
                const x = Phaser.Math.Between(50, width - 50);
                const y = Phaser.Math.Between(100, height - 100);
                const sparkle = this.add.text(x, y, '✦', {
                    fontSize: Phaser.Math.Between(16, 32) + 'px',
                    color: '#ffd700', fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(100).setAlpha(0);

                this.tweens.add({
                    targets: sparkle,
                    alpha: { from: 0, to: 1 }, scale: { from: 0.5, to: 1.2 },
                    duration: 400, yoyo: true, ease: 'Sine.easeInOut',
                    onComplete: () => sparkle.destroy()
                });
            });
        }
    }

    // ==========================================
    // Utility
    // ==========================================

    wait(ms) { return new Promise(resolve => this.time.delayedCall(ms, resolve)); }

    tweenPromise(config) {
        return new Promise(resolve => {
            this.tweens.add({
                ...config,
                onComplete: () => { if (config.onComplete) config.onComplete(); resolve(); }
            });
        });
    }
}
