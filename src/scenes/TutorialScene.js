import Phaser from 'phaser';
import Card from '../objects/Card';
import { compareCards, getWeakSideForPreview, Elements } from '../utils/GameLogic';
import { createHelpReferencePanel } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

const RESERVE_SLOT_COUNT = 5;

/**
 * TutorialScene – Tutorial 1: Elemental Advantage (Tương Khắc)
 *
 * Flow:
 * 1. Both sides have 5 fixed cards (Thổ, Kim, Hỏa, Mộc, Thủy)
 * 2. Enemy auto-places Hỏa → Player auto-places Mộc → Crack appears
 * 3. Spotlight on cracking card + message: "Your card is weaker..."
 * 4. Click → spotlight moves to help "?" button + message
 * 5. Click help → spotlight on help panel + rule text
 * 6. Click → spotlight on X close button
 * 7. Click X → back to game + message: "Choose Thủy to counter" + arrow
 * 8. Screen brightens → Only Thủy card is draggable (merge disabled)
 * 9. Drag Thủy to core → fight button becomes active
 * 10. Fight → normal battle → player wins
 * 11. Congratulations overlay → end tutorial → transition to BattleScene
 */
export default class TutorialScene extends Phaser.Scene {
    constructor() {
        super('TutorialScene');
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
        this.waterCard = null;
        this.waterCardSlotIndex = -1;
        this.playerHeartIcons = [];
        this.enemyHeartIcons = [];
        this.playerHealth = 5;
        this.enemyHealth = 5;
        this.arrowTween = null;
        this.clickCatcher = null;
        this.messageBg = null;
        this.messageText = null;
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
        // Receive audioUnlocked flag from BattleScene
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

        // Round text
        this.roundText = this.add.text(width / 2, 30, 'HƯỚNG DẪN', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);

        this.createHealthUI();
        this.drawSlotFrames();
        this.createCoreLabel();
        this.createHelpButton();
        this.createFightButton();

        // Fixed decks for tutorial
        const playerDeck = this.createTutorialDeck();
        const enemyDeck = this.createTutorialDeck();

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

            // Track the Water card
            if (playerDeck[i].name === 'Water') {
                this.waterCard = card;
                this.waterCardSlotIndex = i;
            }
        }

        // Disable all player card interactions initially
        this.disableAllPlayerCards();

        // Dark overlay for tutorial spotlight (non-interactive; clicks are handled per-step)
        this.tutorialOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(50);
        // Invisible click-catcher that covers the screen to advance tutorial steps
        this.clickCatcher = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(90).setInteractive();
        this.clickCatcher.on('pointerdown', () => this.onOverlayClick());
        this.clickCatcher.setVisible(false); // hidden by default, shown only during "click anywhere" steps

        // Message box (hidden initially)
        this.messageBox = this.add.container(width / 2, height * 0.52).setDepth(60).setVisible(false);
        this.messageBg = this.add.rectangle(0, 0, 500, 80, 0x0a0a1a, 0.95).setStrokeStyle(2, 0xffd700);
        this.messageText = this.add.text(0, 0, '', {
            fontSize: '22px', color: '#ffffff', fontStyle: 'bold', align: 'center',
            wordWrap: { width: 460 }, lineSpacing: 4
        }).setOrigin(0.5);
        this.messageBox.add([this.messageBg, this.messageText]);

        // Arrow indicator (hidden initially)
        this.arrowIndicator = this.add.text(0, 0, '▼', {
            fontSize: '36px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(61).setVisible(false);

        // Start tutorial sequence after a brief delay
        this.time.delayedCall(800, () => this.startTutorialSequence());
    }

    createTutorialDeck() {
        // Fixed order: Earth, Metal, Fire, Wood, Water
        return [
            { name: 'Earth', type: 'Single', level: 1, elements: ['Earth'], color: Elements.EARTH.color },
            { name: 'Metal', type: 'Single', level: 1, elements: ['Metal'], color: Elements.METAL.color },
            { name: 'Fire',  type: 'Single', level: 1, elements: ['Fire'],  color: Elements.FIRE.color },
            { name: 'Wood',  type: 'Single', level: 1, elements: ['Wood'],  color: Elements.WOOD.color },
            { name: 'Water', type: 'Single', level: 1, elements: ['Water'], color: Elements.WATER.color }
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
            if (this.tutorialStep === 4) {
                // Tutorial step: open help panel
                this.helpUi.setVisible(true);
                this.tutorialStep = 5;
                this.hideArrow();
                this.hideMessage();
                this.time.delayedCall(300, () => {
                    this.spotlightOnHelpPanel();
                    this.showMessage('Theo quy luật: Hỏa > Kim > Mộc > Thổ > Thủy > Hỏa');
                    this.showArrow(150, 250, 'right');
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

    enableWaterCardOnly() {
        // Disable all cards first
        this.disableAllPlayerCards();
        // Only enable Water card for dragging
        if (this.waterCard && this.waterCard.active) {
            this.waterCard.setInteractive({ draggable: true, useHandCursor: true });
            // Note: setupPlayerInteractions was already called in Card constructor,
            // so just re-enable interactivity (don't call it again to avoid duplicate listeners)
        }
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

    /**
     * Spotlight effect: dims the screen with a bright "hole" around the target area.
     * Uses a Graphics object to draw a dark overlay with a circular cutout.
     */
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
        // Adjust background size based on text
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

        // Pulsing animation
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
        // Step 1: Enemy auto-places Fire card
        this.autoEnemyPlaceFire();
    }

    autoEnemyPlaceFire() {
        const { width, height } = this.scale;

        // Find the Fire card in enemy reserve
        const fireCard = this.enemyReserveCards.find(c => c.cardData.name === 'Fire');
        if (!fireCard) return;

        // Animate Fire card to enemy core
        const idx = this.enemyReserveCards.indexOf(fireCard);
        this.enemyReserveCards.splice(idx, 1);

        this.tweens.add({
            targets: fireCard,
            x: width / 2,
            y: height * 0.35,
            duration: 800,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.enemyCoreCard = fireCard;
                fireCard.setDepth(12);
                // Step 2: Auto-place Wood card for player
                this.time.delayedCall(500, () => this.autoPlayerPlaceWood());
            }
        });
    }

    autoPlayerPlaceWood() {
        // Find the Wood card in player reserve
        const woodCard = this.playerReserveSlots.find(c => c && c.cardData.name === 'Wood');
        if (!woodCard) return;

        const slotIdx = this.playerReserveSlots.indexOf(woodCard);

        // Animate Wood card to player core
        this.playerReserveSlots[slotIdx] = null;
        this.playerCoreCard = woodCard;

        this.tweens.add({
            targets: woodCard,
            x: this.coreX,
            y: this.coreY,
            duration: 600,
            ease: 'Sine.easeOut',
            onComplete: () => {
                woodCard.originalPos = { x: this.coreX, y: this.coreY };
                // Layout remaining reserve cards
                this.layoutPlayerReserveSlots(300);
                // Show combat preview - Wood vs Fire = Wood loses
                this.time.delayedCall(400, () => {
                    this.refreshCombatPreview();
                    // Step 3: Show spotlight on cracking card
                    this.time.delayedCall(600, () => this.showStep3());
                });
            }
        });
    }

    showStep3() {
        this.tutorialStep = 3;
        // Dim screen and spotlight on the cracking player card
        this.dimScreen(0.75);
        // Show click catcher so player can click anywhere to proceed
        this.clickCatcher.setVisible(true).setDepth(90);

        // Bring both core cards above overlay so the comparison is visible
        if (this.playerCoreCard) {
            this.playerCoreCard.setDepth(58);
        }
        if (this.enemyCoreCard) {
            this.enemyCoreCard.setDepth(58);
        }

        // Show message
        this.showMessage('Quân bài của bạn đang yếu hơn đối thủ!\nHãy chọn quân bài mạnh hơn.', this.scale.height * 0.52);

        // Show arrow pointing to cracking card
        this.showArrow(this.playerCoreCard.x, this.playerCoreCard.y - 90, 'down');
    }

    showStep4() {
        this.tutorialStep = 4;
        // Hide click catcher so help button is clickable
        this.clickCatcher.setVisible(false);

        // Reset core card depths
        if (this.playerCoreCard) this.playerCoreCard.setDepth(2);
        if (this.enemyCoreCard) this.enemyCoreCard.setDepth(12);

        this.hideMessage();
        this.hideArrow();

        // Spotlight on help button
        const { height } = this.scale;
        this.helpBtn.setDepth(58);
        this.helpBtnText.setDepth(59);

        // Show message pointing to help button
        this.showMessage('Hãy bấm vào đây để xem quy luật khắc chế!', height * 0.42);

        // Arrow pointing to help button
        this.showArrow(52 + 50, height * 0.5, 'left');
    }

    spotlightOnHelpPanel() {
        this.tutorialStep = 5;
        // Bring help panel above overlay
        this.helpUi.container.setDepth(58);
        // Bring message box and arrow above the click catcher
        this.messageBox.setDepth(10001);
        this.arrowIndicator.setDepth(10002);
        // Show click catcher ABOVE help panel so player can click anywhere to proceed
        this.clickCatcher.setVisible(true).setDepth(10000);
    }

    showStep6() {
        this.tutorialStep = 6;
        // Hide click catcher so close button is clickable
        this.clickCatcher.setVisible(false);

        this.hideMessage();

        const closeBtn = this.helpUi.closeBtn;
        if (closeBtn) {
            // Show arrow pointing to close button
            const { width, height } = this.scale;
            const panelW = Math.min(680, width - 24);
            const panelH = Math.min(1180, height - 24);
            const closeX = width / 2 + panelW / 2 - 28;
            const closeY = height / 2 - panelH / 2 + 22;
            this.showArrow(closeX, closeY - 30, 'down');
        }

        this.showMessage('Hãy đóng bảng hướng dẫn lại.');

        // Override close button behavior for tutorial
        if (closeBtn) {
            closeBtn.off('pointerdown');
            closeBtn.on('pointerdown', () => {
                this.helpUi.setVisible(false);
                this.hideMessage();
                this.hideArrow();
                this.time.delayedCall(300, () => this.showStep7());
            });
        }
    }

   showStep7() {
        this.tutorialStep = 7;
        // Show click catcher for "click anywhere" step
        this.clickCatcher.setVisible(true).setDepth(90);
        // Ensure message box is above click catcher
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        // Reset help button depth
        this.helpBtn.setDepth(25);
        this.helpBtnText.setDepth(26);

        // Find water card in reserve
        if (!this.waterCard || !this.waterCard.active) {
            for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
                const c = this.playerReserveSlots[i];
                if (c && c.cardData.name === 'Water') {
                    this.waterCard = c;
                    this.waterCardSlotIndex = i;
                    break;
                }
            }
        }

        // Keep dim but slightly less
        this.tweens.add({
            targets: this.tutorialOverlay,
            alpha: 0.6,
            duration: 400
        });

        this.showMessage('Như vậy hãy chọn Thủy để khắc chế lá bài của đối thủ!', this.scale.height * 0.52);
    }

    showStep8() {
        this.tutorialStep = 8;
        // Hide click catcher - let player interact with card
        this.clickCatcher.setVisible(false);

        if (this.waterCard) {
            this.waterCard.setDepth(58);
        }

        // Đổi thông điệp và mũi tên chỉ vào lá Thủy
        this.showMessage('Hãy bấm giữ và kéo lá bài này');
        this.showArrow(this.waterCard.x, this.waterCard.y - 90, 'down');

        // Enable ONLY the Water card for dragging
        this.enableWaterCardOnly();

        // Override the Water card's drag end to handle tutorial logic
        this.setupWaterCardDrag();
    }

    setupWaterCardDrag() {
        if (!this.waterCard) return;
        const scene = this;

        this.waterCard.off('dragstart');
        this.waterCard.off('dragend');
        this.waterCard.off('drag');
        
        // Khi bắt đầu kéo -> Trỏ mũi tên vào ô Core Zone
        this.waterCard.on('dragstart', () => {
            scene.showMessage('Thả vào đây');
            scene.showArrow(scene.coreX, scene.coreY - 90, 'down');
        });

        this.waterCard.on('drag', (pointer, dragX, dragY) => {
            scene.waterCard.x = dragX;
            scene.waterCard.y = dragY;
        });

        this.waterCard.on('dragend', () => {
            scene.tweens.add({ targets: scene.waterCard, scale: 1, duration: 100 });
            scene.waterCard.iconPlus.setVisible(false);
            scene.waterCard.iconCross.setVisible(false);
            if (scene.waterCard.strokeTween) {
                scene.waterCard.strokeTween.remove();
                scene.waterCard.strokeTween = null;
            }
            scene.waterCard.hoverTargets.forEach(target => {
                if (target.strokeTween) {
                    target.strokeTween.remove();
                    target.strokeTween = null;
                }
            });
            scene.waterCard.hoverTargets = [];

            // Kiểm tra xem có thả vào ô Core không
            const z = scene.getCoreZone();
            const dist = Phaser.Math.Distance.Between(scene.waterCard.x, scene.waterCard.y, z.x, z.y);

            if (dist < z.r) {
                // Ẩn UI thông báo
                scene.hideMessage();
                scene.hideArrow();

                const slotIdx = scene.getReserveSlotIndexOfCard(scene.waterCard);
                if (slotIdx >= 0) scene.playerReserveSlots[slotIdx] = null;

                // Move existing core card back to reserve
                if (scene.playerCoreCard && scene.playerCoreCard !== scene.waterCard) {
                    const oldCore = scene.playerCoreCard;
                    oldCore.clearCrackPreview();
                    let emptyIdx = -1;
                    for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
                        if (!scene.playerReserveSlots[i]) { emptyIdx = i; break; }
                    }
                    if (emptyIdx >= 0) {
                        scene.playerReserveSlots[emptyIdx] = oldCore;
                    }
                    oldCore.disableInteractive();
                }

                scene.playerCoreCard = scene.waterCard;
                scene.tweens.add({
                    targets: scene.waterCard,
                    x: z.x, y: z.y,
                    duration: 260,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        scene.waterCard.originalPos = { x: z.x, y: z.y };
                        scene.layoutPlayerReserveSlots();
                        scene.refreshCombatPreview();
                        // Chuyển sang step chỉ dẫn nút đánh
                        scene.showStep9(); 
                    }
                });
                playSfx(scene, 'sfx_swap');
            } else {
                // Kéo trượt -> Snap back và báo lại
                scene.waterCard.snapBack();
                scene.showMessage('Hãy bấm giữ và kéo lá bài này');
                scene.showArrow(scene.waterCard.x, scene.waterCard.y - 90, 'down');
            }

            scene.time.delayedCall(400, () => {
                scene.refreshCombatPreview();
            });
        });
    }

    showStep9() {
        this.tutorialStep = 9;
        this.clickCatcher.setVisible(false);
        
        // Spotlight lên nút Fight
        this.dimScreen(0.75);
        this.messageBox.setDepth(91);
        this.arrowIndicator.setDepth(92);

        this.fightBtn.setDepth(58);
        this.fightIcon.setDepth(59);

        // Hiển thị thông điệp và mũi tên
        this.showMessage('Bấm vào đây để chiến đấu');
        this.showArrow(this.coreX, this.scale.height * 0.93 - 50, 'down');

        this.fightBtn.setInteractive({ useHandCursor: true });
        this.fightBtn.fillColor = 0xffa500;
        this.fightBtn.on('pointerdown', () => {
            this.hideMessage();
            this.hideArrow();
            // Xóa mờ màn hình để nhìn rõ hiệu ứng đánh nhau
            this.brightenScreen(); 
            this.executeTutorialFight();
        });
    }

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
    // Overlay click handler
    // ==========================================

    onOverlayClick() {
        switch (this.tutorialStep) {
            case 3:
                this.showStep4();
                break;
            case 5:
                this.showStep6();
                break;
            case 7:
                this.showStep8();
                break;
        }
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

        // Orbit animation
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

        // Impact animation
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

        // Shatter effect
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

        // Step 10: Victory! Show congratulations
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
        this.tutorialStep = 10;
        const { width, height } = this.scale;

        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(100);

        // Victory text
        const victoryTitle = this.add.text(width / 2, height * 0.3, 'CHIẾN THẮNG!', {
            fontSize: '56px', color: '#ffd700', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setDepth(101);

        // Scale-in animation
        victoryTitle.setScale(0);
        this.tweens.add({
            targets: victoryTitle,
            scale: 1,
            duration: 600,
            ease: 'Back.easeOut'
        });

        const congratsText = this.add.text(width / 2, height * 0.42, 'Chúc mừng bạn đã chiến thắng\nván đấu đầu tiên!', {
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

        // Explanation text
        const explainText = this.add.text(width / 2, height * 0.58, 'Thủy khắc Hỏa – nguyên tố khắc chế\nsẽ giúp bạn giành chiến thắng!', {
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

        // Continue button
        const continueBtn = this.add.rectangle(width / 2, height * 0.72, 280, 70, 0xffa500)
            .setDepth(101).setInteractive({ useHandCursor: true });
        const continueText = this.add.text(width / 2, height * 0.72, 'TIẾP TỤC', {
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
            // Transition to TutorialScene2 for dual-card tutorial
            this.scene.start('TutorialScene2', { audioUnlocked: true });
        });

        // Sparkle particles effect
        this.createSparkles(width, height);
    }

    createSparkles(width, height) {
        // Simple sparkle effect using text objects
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
