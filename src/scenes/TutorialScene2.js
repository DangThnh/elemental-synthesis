import Phaser from 'phaser';
import Card from '../objects/Card';
import { compareCards, getWeakSideForPreview, Elements, checkMerge } from '../utils/GameLogic';
import { createHelpReferencePanel } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

const RESERVE_SLOT_COUNT = 5;

/**
 * TutorialScene2 – Tutorial 2: Dual Cards & Elemental Combinations
 *
 * Flow:
 * 1. Enemy has Water+Metal → auto-merges into Hàn Băng (dual) → places in core
 * 2. Screen dims → messages about dual cards
 * 3. Spotlight on ? button → player opens help panel
 * 4. Messages about controlling/generation cycles
 * 5. Close help → screen dims → drag Earth onto Fire → Ma Thạch
 * 6. Drag Ma Thạch to core → click fight → player wins
 * 7. Victory screen → transition to BattleScene
 */
export default class TutorialScene2 extends Phaser.Scene {
    constructor() {
        super('TutorialScene2');
        this.tutorialStep = 0;
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;
        this.tutorialOverlay = null;
        this.messageBox = null;
        this.arrowIndicator = null;
        this.helpBtn = null;
        this.helpBtnText = null;
        this.helpUi = null;
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
        // Tutorial 2 specific
        this.earthCard = null;
        this.fireCard = null;
        this.mergedCard = null;
        this.highlightGraphics = null;
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

        this.roundText = this.add.text(width / 2, 30, 'HƯỚNG DẪN 2', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);

        this.createHealthUI();
        this.drawSlotFrames();
        this.createCoreLabel();
        this.createHelpButton();
        this.createFightButton();

        const playerDeck = this.createPlayerDeck();
        const enemyDeck = this.createEnemyDeck();

        // Create enemy reserve cards
        const startX = width / 2 - 220;
        const spacing = 110;
        this.enemyReserveCards = enemyDeck.map((data, i) => {
            const card = new Card(this, startX + i * spacing, height * 0.15, data, false);
            card.setDepth(1 + i);
            return card;
        });

        // Create player reserve cards
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            const card = new Card(this, x, y, playerDeck[i], true);
            this.playerReserveSlots[i] = card;

            if (playerDeck[i].name === 'Earth') {
                this.earthCard = card;
            }
            if (playerDeck[i].name === 'Fire') {
                this.fireCard = card;
            }
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

        this.highlightGraphics = this.add.graphics().setDepth(9998).setVisible(false);

        this.time.delayedCall(800, () => this.startTutorialSequence());
    }

    createPlayerDeck() {
        return [
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color },
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Wood',  type: 'Single', level: 1, elements: ['Wood'],  color: Elements.WOOD.color },
            { name: 'Water', type: 'Single', level: 1, elements: ['Water'], color: Elements.WATER.color },
            { name: 'Metal', type: 'Single', level: 1, elements: ['Metal'], color: Elements.METAL.color }
        ];
    }

    createEnemyDeck() {
        return [
            { name: 'Water', type: 'Single', level: 1, elements: ['Water'], color: Elements.WATER.color },
            { name: 'Metal', type: 'Single', level: 1, elements: ['Metal'], color: Elements.METAL.color },
            { name: 'Wood',  type: 'Single', level: 1, elements: ['Wood'],  color: Elements.WOOD.color },
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color }
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
        const playerCount = Phaser.Math.Clamp(this.playerHealth, 0, 10);
        const enemyCount = Phaser.Math.Clamp(this.enemyHealth, 0, 10);
        this.playerHeartIcons.forEach((icon, index) => {
            icon.setColor(index < playerCount ? '#ff4d4d' : '#4d4d4d');
        });
        this.enemyHeartIcons.forEach((icon, index) => {
            icon.setColor(index < enemyCount ? '#ff4d4d' : '#4d4d4d');
        });
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

    createHelpButton() {
        const { height } = this.scale;
        this.helpBtn = this.add.rectangle(52, height * 0.5, 44, 44, 0x2a2a3d, 0.95)
            .setStrokeStyle(2, 0xffd700)
            .setInteractive({ useHandCursor: true })
            .setDepth(25);
        this.helpBtnText = this.add.text(52, height * 0.5, '?', {
            fontSize: '28px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(26);

        this.helpUi = createHelpReferencePanel(this);
        this.helpBtn.on('pointerdown', () => {
            if (this.tutorialStep === 3) {
                this.helpUi.setVisible(true);
                this.tutorialStep = 4;
                this.hideArrow();
                this.hideMessage();
                this.time.delayedCall(300, () => {
                    this.spotlightOnHelpPanel();
                    this.showMessage('Để xác định một lá bài kép của bạn có mạnh hơn đối thủ hay không, ta sẽ so từng thành phần của 2 lá bài với nhau');
                });
            }
        });
    }

    createFightButton() {
        const { height } = this.scale;
        this.fightBtn = this.add.rectangle(this.coreX, height * 0.93, 200, 60, 0x555555)
            .setDepth(25);
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
    // Tutorial spotlight & visual effects
    // ==========================================

    dimScreen(alpha = 0.7) {
        this.tweens.add({
            targets: this.tutorialOverlay,
            alpha: alpha,
            duration: 500,
            ease: 'Sine.easeOut'
        });
    }

    brightenScreen() {
        this.tweens.add({
            targets: this.tutorialOverlay,
            alpha: 0,
            duration: 500,
            ease: 'Sine.easeOut'
        });
    }

    spotlightOnElement(target, radius = 80) {
        this.dimScreen(0.75);
        if (target) target.setDepth(58);
    }

    spotlightOnArea(x, y, radius = 80, targets = []) {
        this.dimScreen(0.75);
        targets.forEach(t => {
            if (t) t.setDepth(58);
        });
    }

    // ==========================================
    // Message & Arrow helpers
    // ==========================================

    showMessage(text, y = null) {
        this.messageBox.setVisible(true);
        this.messageText.setText(text);
        const bounds = this.messageText.getBounds();
        const padX = 40;
        const padY = 24;
        this.messageBg.setSize(Math.max(bounds.width + padX, 300), Math.max(bounds.height + padY, 60));
        if (y !== null) {
            this.messageBox.setY(y);
        }
    }

    hideMessage() {
        this.messageBox.setVisible(false);
    }

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
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    hideArrow() {
        this.arrowIndicator.setVisible(false);
        if (this.arrowTween) {
            this.tweens.killTweensOf(this.arrowIndicator);
            this.arrowTween = null;
        }
    }

    // ==========================================
    // Tutorial Sequence Steps
    // ==========================================

    startTutorialSequence() {
        this.tutorialStep = 1;
        this.autoEnemyMergeAndPlace();
    }

    autoEnemyMergeAndPlace() {
        const { width, height } = this.scale;

        const waterCard = this.enemyReserveCards.find(c => c.cardData.name === 'Water');
        const metalCard = this.enemyReserveCards.find(c => c.cardData.name === 'Metal');
        if (!waterCard || !metalCard) return;

        const waterIdx = this.enemyReserveCards.indexOf(waterCard);
        const metalIdx = this.enemyReserveCards.indexOf(metalCard);
        this.enemyReserveCards.splice(Math.max(waterIdx, metalIdx), 1);
        this.enemyReserveCards.splice(Math.min(waterIdx, metalIdx), 1);

        // Animate Water toward Metal
        this.tweens.add({
            targets: waterCard,
            x: metalCard.x,
            y: metalCard.y,
            duration: 500,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                waterCard.destroy();
                metalCard.destroy();

                // Create dual card at Metal's position
                const dualData = {
                    name: 'Hàn Băng',
                    type: 'Dual',
                    level: 1,
                    elements: ['Water', 'Metal'],
                    color: 0x5533aa
                };
                const dualCard = new Card(this, metalCard.x, metalCard.y, dualData, false);
                dualCard.setDepth(10);

                // Animate to enemy core
                this.tweens.add({
                    targets: dualCard,
                    x: width / 2,
                    y: height * 0.35,
                    duration: 800,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        this.enemyCoreCard = dualCard;
                        dualCard.setDepth(12);
                        this.refreshCombatPreview();
                        // Start tutorial messages
                        this.time.delayedCall(500, () => this.showStep2());
                    }
                });
            }
        });
    }

    showStep2() {
        this.tutorialStep = 2;
        this.dimScreen(0.75);
        this.clickCatcher.setVisible(true).setDepth(90);
        this.showMessage('Ôi không, đối thủ của bạn đã dùng 1 lá bài kép!');
    }

    showStep3() {
        this.tutorialStep = 3;
        this.showMessage('lá bài kép là lá bài được kết hợp từ 2 nguyên tố khác nhau, để chiến thắng 1 lá bài kép bạn cần tạo 1 lá bài kép mới mạnh hơn.');
    }

    showStep4() {
        this.tutorialStep = 3; // Will transition to 4 when help clicked
        this.clickCatcher.setVisible(false);
        this.hideMessage();

        // Spotlight on help button
        const { height } = this.scale;
        this.helpBtn.setDepth(58);
        this.helpBtnText.setDepth(59);

        this.showMessage('Hãy cùng tra bảng ngũ hành ngay thôi!', height * 0.42);
        this.showArrow(52 + 50, height * 0.5, 'left');
    }

    spotlightOnHelpPanel() {
        this.tutorialStep = 4;
        this.helpUi.container.setDepth(58);
        this.messageBox.setDepth(10001);
        this.arrowIndicator.setDepth(10002);
        this.clickCatcher.setVisible(true).setDepth(10000);
    }

    showStep5() {
        // Stay in step 4 for click-catcher cycling
        this.showMessage('Theo hướng dẫn, những nguyên tố này khắc chế nhau với 1 điểm cách biệt:\nHỏa > Kim > Mộc > Thổ > Thủy > Hỏa');
        this.showArrow(150, 250, 'right');
    }

    showStep6() {
        // Stay in step 4 for click-catcher cycling
        this.showMessage('Và cũng theo hướng dẫn, những nguyên tố này phản nhau với 0,5 điểm cách biệt:\nHỏa > Mộc > Thủy > Kim > Thổ > Hỏa', 900);
        this.showArrow(150, 600, 'right');
    }

    showStep7() {
        // Stay in step 4 for click-catcher cycling
        this.showMessage('Như vậy, để tạo ra combo mạnh nhất ta sẽ sử dụng Thổ (khắc thủy) và Hỏa (khắc kim)',900);
    }

    showStep8() {
        this.tutorialStep = 8;
        this.clickCatcher.setVisible(false);
        this.hideMessage();

        const closeBtn = this.helpUi.closeBtn;
        if (closeBtn) {
            const { width, height } = this.scale;
            const panelW = Math.min(680, width - 24);
            const panelH = Math.min(1180, height - 24);
            const closeX = width / 2 + panelW / 2 - 28;
            const closeY = height / 2 - panelH / 2 + 22;
            this.showArrow(closeX, closeY - 30, 'down');
            this.showMessage('Hãy đóng bảng hướng dẫn lại.');

            closeBtn.off('pointerdown');
            closeBtn.on('pointerdown', () => {
                this.helpUi.setVisible(false);
                this.hideMessage();
                this.hideArrow();
                this.time.delayedCall(300, () => this.showStep9());
            });
        }
    }

    showStep9() {
        this.tutorialStep = 9;
        // Reset help button depth
        this.helpBtn.setDepth(25);
        this.helpBtnText.setDepth(26);

        // Wait 1s then dim screen and show merge tutorial
        this.time.delayedCall(1000, () => {
            this.dimScreen(0.75);
            this.clickCatcher.setVisible(true).setDepth(90);
            this.messageBox.setDepth(91);
            this.arrowIndicator.setDepth(92);

            if (this.earthCard) {
                this.earthCard.setDepth(58);
            }

            this.showMessage('Bấm giữ và kéo');
            if (this.earthCard) {
                this.showArrow(this.earthCard.x, this.earthCard.y - 90, 'down');
            }
        });
    }

    showStep10() {
        this.tutorialStep = 10;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();

        // Keep dim but allow interaction with Earth and Fire
        this.tweens.add({
            targets: this.tutorialOverlay,
            alpha: 0.6,
            duration: 400
        });

        // Bring both cards above overlay
        if (this.earthCard) this.earthCard.setDepth(58);
        if (this.fireCard) this.fireCard.setDepth(58);

        this.setupEarthCardDrag();
    }

    setupEarthCardDrag() {
        if (!this.earthCard || !this.fireCard) return;
        const scene = this;

        this.earthCard.setInteractive({ draggable: true, useHandCursor: true });
        this.earthCard.off('dragend');
        this.earthCard.off('drag');

        this.earthCard.on('drag', (pointer, dragX, dragY) => {
            scene.earthCard.x = dragX;
            scene.earthCard.y = dragY;
        });

        this.earthCard.on('dragstart', () => {
            // When drag starts, show message pointing to Fire
            scene.showMessage('Thả vào đây');
            scene.showArrow(scene.fireCard.x, scene.fireCard.y - 90, 'down');
        });

        this.earthCard.on('dragend', () => {
            scene.tweens.add({ targets: scene.earthCard, scale: 1, duration: 100 });
            scene.earthCard.iconPlus.setVisible(false);
            scene.earthCard.iconCross.setVisible(false);
            if (scene.earthCard.strokeTween) {
                scene.earthCard.strokeTween.remove();
                scene.earthCard.strokeTween = null;
            }
            scene.earthCard.hoverTargets.forEach(target => {
                if (target.strokeTween) {
                    target.strokeTween.remove();
                    target.strokeTween = null;
                }
            });
            scene.earthCard.hoverTargets = [];

            const dist = Phaser.Math.Distance.Between(scene.earthCard.x, scene.earthCard.y, scene.fireCard.x, scene.fireCard.y);

            if (dist < 70) {
                // Merge Earth + Fire → Ma Thạch
                scene.executeMergeEarthFire();
            } else {
                scene.earthCard.snapBack();
                scene.hideMessage();
                scene.hideArrow();
            }
        });
    }

    executeMergeEarthFire() {
        const earthSlot = this.getReserveSlotIndexOfCard(this.earthCard);
        const fireSlot = this.getReserveSlotIndexOfCard(this.fireCard);

        if (earthSlot >= 0) this.playerReserveSlots[earthSlot] = null;
        if (fireSlot >= 0) this.playerReserveSlots[fireSlot] = null;

        // Destroy both cards
        const mergeX = this.fireCard.x;
        const mergeY = this.fireCard.y;
        this.earthCard.destroy();
        this.fireCard.destroy();

        playSfx(this, 'sfx_merge', { volume: 0.7 });

        // Create Ma Thạch dual card
        const dualData = {
            name: 'Ma Thạch',
            type: 'Dual',
            level: 1,
            elements: ['Earth', 'Fire'],
            color: 0x5533aa
        };
        this.mergedCard = new Card(this, mergeX, mergeY, dualData, true);
        this.mergedCard.setDepth(58);

        // Put in Fire's slot (lower index or whichever was filled)
        const targetSlot = fireSlot >= 0 ? fireSlot : (earthSlot >= 0 ? earthSlot : 0);
        this.playerReserveSlots[targetSlot] = this.mergedCard;
        this.mergedCard.originalPos = { x: mergeX, y: mergeY };

        this.layoutPlayerReserveSlots(300);

        // Move to next step after a brief delay
        this.time.delayedCall(600, () => this.showStep11());
    }

    showStep11() {
        this.tutorialStep = 11;
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

    showStep12() {
        this.tutorialStep = 12;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();

        this.tweens.add({
            targets: this.tutorialOverlay,
            alpha: 0.6,
            duration: 400
        });

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
            scene.mergedCard.iconPlus.setVisible(false);
            scene.mergedCard.iconCross.setVisible(false);
            if (scene.mergedCard.strokeTween) {
                scene.mergedCard.strokeTween.remove();
                scene.mergedCard.strokeTween = null;
            }
            scene.mergedCard.hoverTargets.forEach(target => {
                if (target.strokeTween) {
                    target.strokeTween.remove();
                    target.strokeTween = null;
                }
            });
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
                    duration: 260,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        scene.mergedCard.originalPos = { x: z.x, y: z.y };
                        scene.layoutPlayerReserveSlots();
                        scene.refreshCombatPreview();
                        scene.showStep13();
                    }
                });
                playSfx(scene, 'sfx_swap');
            } else {
                scene.mergedCard.snapBack();
            }

            scene.time.delayedCall(400, () => {
                scene.refreshCombatPreview();
            });
        });
    }

    showStep13() {
        this.tutorialStep = 13;
        this.dimScreen(0.75);
        this.clickCatcher.setVisible(true).setDepth(90);
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        // Spotlight on fight button
        this.fightBtn.setDepth(58);
        this.fightIcon.setDepth(59);

        this.showMessage('Bấm để chiến đấu');
        const { height } = this.scale;
        this.showArrow(this.coreX, height * 0.93 - 50, 'down');
    }

    showStep14() {
        this.tutorialStep = 14;
        this.clickCatcher.setVisible(false);
        this.hideMessage();
        this.hideArrow();

        this.fightBtn.setInteractive({ useHandCursor: true });
        this.fightBtn.fillColor = 0xffa500;
        this.fightBtn.on('pointerdown', () => this.executeTutorialFight());
    }

    // ==========================================
    // Overlay click handler
    // ==========================================

    onOverlayClick() {
        switch (this.tutorialStep) {
            case 2:
                this.showStep3();
                break;
            case 3:
                this.showStep4();
                break;
            case 4:
                // Step 4 inside help panel - messages about charts
                if (this.tutorialMessageSubStep === undefined) {
                    this.tutorialMessageSubStep = 0;
                }
                this.tutorialMessageSubStep++;
                if (this.tutorialMessageSubStep === 1) {
                    this.showStep5();
                } else if (this.tutorialMessageSubStep === 2) {
                    this.showStep6();
                } else if (this.tutorialMessageSubStep === 3) {
                    this.showStep7();
                } else {
                    this.tutorialMessageSubStep = undefined;
                    this.showStep8();
                }
                break;
            case 9:
                this.showStep10();
                break;
            case 11:
                this.showStep12();
                break;
            case 13:
                this.showStep14();
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
    // Tutorial Fight
    // ==========================================

    async executeTutorialFight() {
        this.fightBtn.disableInteractive();
        this.fightBtn.off('pointerdown');
        this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });

        const playerCard = this.playerCoreCard;
        const enemyCard = this.enemyCoreCard;

        if (!playerCard?.active || !enemyCard?.active) {
            this.input.enabled = true;
            return;
        }

        const finalResult = compareCards(playerCard.cardData, enemyCard.cardData);

        const center = this.fightCenter;
        playerCard.setDepth(20);
        enemyCard.setDepth(20);

        await Promise.all([
            this.tweenPromise({
                targets: playerCard, x: center.x - 60, y: center.y, duration: 350, ease: 'Power2.easeIn'
            }),
            this.tweenPromise({
                targets: enemyCard, x: center.x + 60, y: center.y, duration: 350, ease: 'Power2.easeIn'
            })
        ]);

        playerCard.setRotation(0);
        enemyCard.setRotation(0);

        const winnerCard = finalResult === 'THẮNG' ? playerCard : enemyCard;
        const loserCard = finalResult === 'THẮNG' ? enemyCard : playerCard;

        winnerCard.setDepth(22);
        loserCard.setDepth(21);

        await Promise.all([
            this.tweenPromise({
                targets: winnerCard, x: center.x - 40, y: center.y, duration: 220, ease: 'Power2.easeIn'
            }),
            this.tweenPromise({
                targets: loserCard, x: center.x + 40, y: center.y, duration: 220, ease: 'Power2.easeIn'
            })
        ]);

        await this.tweenPromise({
            targets: winnerCard, x: center.x, y: center.y - 30, duration: 180, ease: 'Power2.easeOut'
        });

        await this.tweenPromise({
            targets: winnerCard, y: center.y + 12, duration: 120, ease: 'Quad.easeIn'
        });

        const shards = this.createShatterPieces(loserCard);
        loserCard.setVisible(false);
        this.cameras.main.shake(200, 0.018);
        playSfx(this, 'sfx_impact', { volume: 0.8 });

        await Promise.all(shards.map(piece => {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.Between(80, 140);
            const targetX = center.x + Math.cos(angle) * distance;
            const targetY = center.y + Math.sin(angle) * distance;
            const rotation = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            return this.tweenPromise({
                targets: piece, x: targetX, y: targetY, alpha: 0, rotation,
                duration: 650, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
            });
        }));

        await this.wait(200);

        playSfx(this, 'sfx_win');

        // Re-enable input so victory screen buttons work
        this.input.enabled = true;

        this.time.delayedCall(800, () => this.showVictoryScreen());
    }

    createShatterPieces(card) {
        const pieces = [];
        const count = 10;
        const color = card.cardData?.color ?? 0xffffff;
        const centerX = card.x;
        const centerY = card.y;

        for (let i = 0; i < count; i++) {
            const w = Phaser.Math.Between(14, 24);
            const h = Phaser.Math.Between(10, 20);
            const piece = this.add.rectangle(centerX, centerY, w, h, color, 1).setDepth(25);
            piece.setOrigin(0.5);
            piece.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
            pieces.push(piece);
        }
        return pieces;
    }

    showVictoryScreen() {
        this.tutorialStep = 15;
        const { width, height } = this.scale;

        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(100);

        const victoryTitle = this.add.text(width / 2, height * 0.3, 'CHIẾN THẮNG!', {
            fontSize: '56px', color: '#ffd700', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setDepth(101);

        victoryTitle.setScale(0);
        this.tweens.add({
            targets: victoryTitle,
            scale: 1,
            duration: 600,
            ease: 'Back.easeOut'
        });

        const congratsText = this.add.text(width / 2, height * 0.42, 'Chúc mừng bạn đã chiến thắng\nván đấu thứ hai!', {
            fontSize: '28px', color: '#ffffff', fontStyle: 'bold', align: 'center', lineSpacing: 8
        }).setOrigin(0.5).setDepth(101);

        congratsText.setAlpha(0);
        this.tweens.add({
            targets: congratsText,
            alpha: 1,
            duration: 500,
            delay: 400,
            ease: 'Sine.easeOut'
        });

        const explainText = this.add.text(width / 2, height * 0.58, 'Thổ khắc Thủy & Hỏa khắc Kim\n– kết hợp nguyên tố khắc chế\nđể chiến thắng lá bài kép!', {
            fontSize: '22px', color: '#aaddff', align: 'center', lineSpacing: 6
        }).setOrigin(0.5).setDepth(101);

        explainText.setAlpha(0);
        this.tweens.add({
            targets: explainText,
            alpha: 1,
            duration: 500,
            delay: 800,
            ease: 'Sine.easeOut'
        });

        const continueBtn = this.add.rectangle(width / 2, height * 0.74, 280, 70, 0xffa500)
            .setDepth(101).setInteractive({ useHandCursor: true });
        const continueText = this.add.text(width / 2, height * 0.74, 'TIẾP TỤC', {
            fontSize: '26px', color: '#000000', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(102);

        continueBtn.setAlpha(0);
        continueText.setAlpha(0);
        this.tweens.add({
            targets: [continueBtn, continueText],
            alpha: 1,
            duration: 500,
            delay: 1200,
            ease: 'Sine.easeOut'
        });

        continueBtn.on('pointerdown', () => {
            // Transition to TutorialScene3 for endgame tutorial
            this.scene.start('TutorialScene3', { audioUnlocked: true });
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
                    color: '#ffd700',
                    fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(100).setAlpha(0);

                this.tweens.add({
                    targets: sparkle,
                    alpha: { from: 0, to: 1 },
                    scale: { from: 0.5, to: 1.2 },
                    duration: 400,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                    onComplete: () => sparkle.destroy()
                });
            });
        }
    }

    // ==========================================
    // Utility
    // ==========================================

    wait(ms) {
        return new Promise(resolve => this.time.delayedCall(ms, resolve));
    }

    tweenPromise(config) {
        return new Promise(resolve => {
            this.tweens.add({
                ...config,
                onComplete: () => {
                    if (config.onComplete) config.onComplete();
                    resolve();
                }
            });
        });
    }
}
