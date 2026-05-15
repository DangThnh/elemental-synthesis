import Phaser from 'phaser';
import Card from '../objects/Card';
import { drawFiveCards, checkMerge, compareCards, getWeakSideForPreview } from '../utils/GameLogic';
import { createHelpReferencePanel, discoverDualPairFromFight } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

const RESERVE_SLOT_COUNT = 5;
const ON_CARD_RADIUS = 62;
const SLOT_SNAP_RADIUS = 58;
const MAX_MATCH_ROUNDS = 5;
const START_HEALTH = 5;
const MAX_HEALTH = 10;

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
        this.logic = { drawFiveCards, checkMerge };
        this.currentStage = 1;
        this.matchRound = 1;
        this.maxRounds = MAX_MATCH_ROUNDS;
        this.playerHealth = START_HEALTH;
        this.enemyHealth = START_HEALTH;
        this.reserveWarSpeedMult = 1;
        this.slotFrameG = null;
        this.fightCenter = null;
        this.playerHeartIcons = [];
        this.enemyHeartIcons = [];
        this.matchOver = false;
        this.roundText = null;
        this.swapBtn = null;
        this.swapTooltip = null;
        this.matchResultContainer = null;
        this.audioUnlocked = false;
    }

    preload() {
        this.load.on('loaderror', (file) => {
            console.warn('[Asset] Không tải được (có thể thiếu file hoặc sai đường dẫn):', file?.src ?? file);
        });
        // Load element icons
        this.load.image('icon_fire', 'assets/icons/fire.png');
        this.load.image('icon_water', 'assets/icons/water.png');
        this.load.image('icon_wood', 'assets/icons/wood.png');
        this.load.image('icon_metal', 'assets/icons/metal.png');
        this.load.image('icon_earth', 'assets/icons/earth.png');
        // Load crack overlay
        this.load.image('crack_overlay', 'assets/crack.png');
        // Load swords icon
        this.load.image('icon_swords', 'assets/swords.png');
        // Tự động load các key như 'sfx_win', 'sfx_lose' từ audioConfig.js
        preloadBattleAudio(this);
    }

    create(data) {
        const { width, height } = this.scale;

        // Accept audioUnlocked from scene data (e.g., from TutorialScene)
        if (data?.audioUnlocked) {
            this.audioUnlocked = true;
        }

        // Nếu đã unlock audio thì vào game luôn
        if (this.audioUnlocked) {
            this.initializeGame(width, height);
            return;
        }

        // Chưa unlock audio → hiển thị màn hình bắt đầu
        this.createStartScreen();
    }

    createStartScreen() {
        const { width, height } = this.scale;

        // Background
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e, 0.9);

        // Title
        this.add.text(width / 2, height * 0.25, 'ELEMENTAL SYNTHESIS', {
            fontSize: '48px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(width / 2, height * 0.34, 'Ngũ Hành Tương Sinh Tương Khắc', {
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Instructions
        const instructions = [
            '🔊 Nhấn để kích hoạt âm thanh',
            '⚔️ Chiến đấu với các nguyên tố ngũ hành',
            '💡 Nhấn "?" để xem bảng tra cứu'
        ];

        instructions.forEach((text, index) => {
            this.add.text(width / 2, height * 0.44 + index * 36, text, {
                fontSize: '20px',
                color: '#cccccc'
            }).setOrigin(0.5);
        });

        // Tutorial button
        const tutorialBtn = this.add.rectangle(width / 2, height * 0.64, 320, 70, 0x2a6e2a)
            .setStrokeStyle(3, 0x66ff66)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.unlockAudio();
                this.scene.start('TutorialScene', { audioUnlocked: true });
            });
        this.add.text(width / 2, height * 0.64, 'HƯỚNG DẪN', {
            fontSize: '30px',
            color: '#aaffaa',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Play button
        const startBtn = this.add.rectangle(width / 2, height * 0.78, 320, 70, 0xffa500)
            .setStrokeStyle(3, 0xffdd44)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.unlockAudio();
                this.scene.restart();
            });
        this.add.text(width / 2, height * 0.78, 'BẮT ĐẦU', {
            fontSize: '30px',
            color: '#000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    unlockAudio() {
        // Thử phát một âm thanh ngắn để unlock audio context
        try {
            const audioContext = this.sound.context || (window.AudioContext || window.webkitAudioContext);
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            // Phát một âm thanh test (nếu có file)
            if (this.cache.audio.exists('sfx_fight')) {
                this.sound.play('sfx_fight', { volume: 0.1 });
            }
            this.audioUnlocked = true;
        } catch (e) {
            console.warn('Không thể unlock audio:', e);
            this.audioUnlocked = true; // Vẫn cho phép chơi game
        }
    }

    initializeGame(width, height) {

        this.playerReserveStartX = width / 2 - 220;
        this.playerReserveSpacing = 110;
        this.playerReserveY = height * 0.8;
        this.coreX = width / 2;
        this.coreY = height * 0.65;
        this.coreDropRadius = 88;

        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;

        this.roundText = this.add.text(width / 2, 30, `VÒNG ${this.matchRound}/${this.maxRounds}`, { fontSize: '28px', color: '#fff' }).setOrigin(0.5);

        this.createHealthUI();

        const helpBtn = this.add
            .rectangle(52, height * 0.5, 44, 44, 0x2a2a3d, 0.95)
            .setStrokeStyle(2, 0xffd700)
            .setInteractive({ useHandCursor: true })
            .setDepth(25);
        this.add
            .text(52, height * 0.5, '?', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' })
            .setOrigin(0.5)
            .setDepth(26);
        
        this.helpUi = createHelpReferencePanel(this);
        helpBtn.on('pointerdown', () => this.helpUi.setVisible(!this.helpUi.container.visible));

        this.fightBtn = this.add
            .rectangle(width / 2, height * 0.93, 200, 60, 0xffa500)
            .setInteractive()
            .on('pointerdown', () => this.executeFight());
        this.fightIcon = this.add
            .image(width / 2, height * 0.93, 'icon_swords')
            .setDisplaySize(40, 40);

        this.fightCenter = { x: width / 2, y: height * 0.45 };
        this.slotFrameG = this.add.graphics().setDepth(0);
        this.drawSlotFrames();
        this.createSwapButton();

        this.add.text(this.coreX, this.coreY - this.coreDropRadius - 30, 'CORE ZONE', { fontSize: '16px', color: '#ffee88', fontStyle: 'bold' })
            .setOrigin(0.5)
            .setDepth(1);

        this.startStage();
    }

    getCoreZone() { return { x: this.coreX, y: this.coreY, r: this.coreDropRadius }; }
    getPlayerReserveSlotWorldXY(slotIndex) { return { x: this.playerReserveStartX + slotIndex * this.playerReserveSpacing, y: this.playerReserveY }; }
    getPlayerReserveList() { return this.playerReserveSlots.filter((c) => c != null && c.active); }

    drawSlotFrames() {
        if (!this.slotFrameG) return;
        this.slotFrameG.clear();
        const g = this.slotFrameG;
        const { width, height } = this.scale;

        g.lineStyle(2, 0xffffff, 0.85);
        g.strokeCircle(this.coreX, this.coreY, this.coreDropRadius + 8);

        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const pos = this.getPlayerReserveSlotWorldXY(i);
            g.strokeRoundedRect(pos.x - 52, pos.y - 70, 104, 140, 14);
        }

        const enemyY = height * 0.15;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const x = width / 2 - 220 + i * 110;
            g.strokeRoundedRect(x - 52, enemyY - 70, 104, 140, 14);
        }
    }

    assignEnemyReserveDepths() {
        this.enemyReserveCards.forEach((card, index) => {
            if (card && card.active) card.setDepth(1 + index);
        });
    }

    setEnemyCoreDepth() {
        if (this.enemyCoreCard && this.enemyCoreCard.active) {
            this.enemyCoreCard.setDepth(12);
        }
    }

    createHealthUI() {
        const { width } = this.scale;
        const topY = 60;

        this.add.text(20, 20, 'PLAYER', { fontSize: '18px', color: '#aaffaa', fontStyle: 'bold' }).setOrigin(0, 0);
        this.add.text(width - 20, 20, 'ENEMY', { fontSize: '18px', color: '#ffaaaa', fontStyle: 'bold' }).setOrigin(1, 0);

        for (let i = 0; i < MAX_HEALTH; i++) {
            const x = 20 + i * 22;
            const icon = this.add.text(x, topY, '♥', { fontSize: '22px', color: '#4d4d4d' }).setOrigin(0, 0.5).setDepth(5);
            this.playerHeartIcons.push(icon);
        }
        for (let i = 0; i < MAX_HEALTH; i++) {
            const x = width - 20 - i * 22;
            const icon = this.add.text(x, topY, '♥', { fontSize: '22px', color: '#4d4d4d' }).setOrigin(1, 0.5).setDepth(5);
            this.enemyHeartIcons.push(icon);
        }
        this.updateHealthUI();
    }

    updateHealthUI() {
        const playerCount = Phaser.Math.Clamp(this.playerHealth, 0, MAX_HEALTH);
        const enemyCount = Phaser.Math.Clamp(this.enemyHealth, 0, MAX_HEALTH);

        this.playerHeartIcons.forEach((icon, index) => {
            icon.setColor(index < playerCount ? '#ff4d4d' : '#4d4d4d');
            icon.setVisible(index < MAX_HEALTH);
        });
        this.enemyHeartIcons.forEach((icon, index) => {
            icon.setColor(index < enemyCount ? '#ff4d4d' : '#4d4d4d');
            icon.setVisible(index < MAX_HEALTH);
        });
        this.setSwapButtonState(this.playerHealth > 0 && !this.matchOver);
    }

    createSwapButton() {
        const { x, y } = this.getPlayerReserveSlotWorldXY(0);
        this.swapBtn = this.add.rectangle(x, y - 110, 44, 44, 0x2a2a3d, 0.95)
            .setStrokeStyle(2, 0xffd700)
            .setInteractive({ useHandCursor: true })
            .setDepth(20);
        this.add.text(x, y - 110, '↻', { fontSize: '26px', color: '#ffd700', fontStyle: 'bold' })
            .setOrigin(0.5)
            .setDepth(21);

        this.swapTooltip = this.add.text(x, y - 150, 'Đổi bài: tiêu tốn 1 máu', {
            fontSize: '16px', color: '#ffee88', backgroundColor: '#1a1a1a', padding: { x: 8, y: 6 }
        }).setOrigin(0.5).setDepth(25).setVisible(false);

        this.swapBtn.on('pointerover', () => this.swapTooltip.setVisible(true));
        this.swapBtn.on('pointerout', () => this.swapTooltip.setVisible(false));
        this.swapBtn.on('pointerdown', () => this.trySwapReserve());
    }

    setSwapButtonState(enabled) {
        if (!this.swapBtn) return;
        if (enabled) {
            this.swapBtn.setFillStyle(0x2a2a3d, 0.95);
            this.swapBtn.setStrokeStyle(2, 0xffd700);
            this.swapBtn.setInteractive({ useHandCursor: true });
        } else {
            this.swapBtn.setFillStyle(0x222222, 0.6);
            this.swapBtn.disableInteractive();
        }
    }

    trySwapReserve() {
        if (this.matchOver || this.playerHealth <= 0) return;
        if (!this.playerReserveSlots.some((card) => card?.active)) return;
        this.playerHealth = Math.max(this.playerHealth - 1, 0);
        this.updateHealthUI();
        this.animateReserveSwap();
    }

    async animateReserveSwap() {
        const exitTweens = [];
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const card = this.playerReserveSlots[i];
            if (!card?.active) continue;
            exitTweens.push(this.tweenPromise({ targets: card, y: card.y + 180, duration: 260, ease: 'Cubic.easeIn' }));
        }
        await Promise.all(exitTweens);
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const card = this.playerReserveSlots[i];
            if (card?.active) card.destroy();
            this.playerReserveSlots[i] = null;
        }

        const newReserve = drawFiveCards();
        const sourceY = this.playerReserveY - 220;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            const card = new Card(this, x, sourceY, newReserve[i], true);
            card.setDepth(10 + i);
            this.playerReserveSlots[i] = card;
            this.tweens.add({ targets: card, x, y, duration: 320, ease: 'Sine.easeOut' });
        }
        this.refreshCombatPreview();
    }

    applyRoundOutcome(result) {
        if (result === 'THẮNG') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth + 1, 0, MAX_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - 1, 0, MAX_HEALTH);
        } else if (result === 'THUA') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - 1, 0, MAX_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth + 1, 0, MAX_HEALTH);
        } else if (result === 'HÒA') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - 1, 0, MAX_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - 1, 0, MAX_HEALTH);
        }
        this.updateHealthUI();
    }

    showMatchResult(finalWinner) {
        this.matchOver = true;
        const { width, height } = this.scale;
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(100);
        const message = finalWinner === 'THẮNG'
            ? 'Bạn đã chiến thắng trận đấu này.'
            : finalWinner === 'THUA'
                ? 'Bạn đã thua trận đấu này.'
                : 'Trận đấu hòa.';
        const messageText = this.add.text(width / 2, height * 0.35, message, {
            fontSize: '48px', color: '#fff', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setDepth(101);
        const buttonBg = this.add.rectangle(width / 2, height * 0.55, 220, 60, 0xffa500).setDepth(101).setInteractive({ useHandCursor: true });
        const buttonText = this.add.text(width / 2, height * 0.55, 'CHƠI LẠI', {
            fontSize: '24px', color: '#000', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(102);
        buttonBg.on('pointerdown', () => {
            buttonBg.destroy();
            buttonText.destroy();
            messageText.destroy();
            overlay.destroy();
            this.resetMatch();
        });
        this.matchResultContainer = [overlay, messageText, buttonBg, buttonText];
    }

    resetMatch() {
        this.matchOver = false;
        this.matchRound = 1;
        this.currentStage = 1;
        this.playerHealth = START_HEALTH;
        this.enemyHealth = START_HEALTH;
        this.updateHealthUI();
        this.startStage();
    }

    finishMatch() {
        const finalWinner = this.playerHealth > this.enemyHealth ? 'THẮNG' : this.playerHealth < this.enemyHealth ? 'THUA' : 'HÒA';
        if (finalWinner === 'THẮNG') playSfx(this, 'sfx_win');
        if (finalWinner === 'THUA') playSfx(this, 'sfx_lose');
        this.showMatchResult(finalWinner);
        this.fightBtn.disableInteractive();
        this.setSwapButtonState(false);
    }

    getReserveSlotIndexOfCard(card) {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) { if (this.playerReserveSlots[i] === card) return i; }
        return -1;
    }

    getNearestEmptyReserveSlotIndex(worldX, worldY) {
        let best = -1; let bestD = SLOT_SNAP_RADIUS + 1;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            if (this.playerReserveSlots[i] != null) continue;
            const p = this.getPlayerReserveSlotWorldXY(i);
            const d = Phaser.Math.Distance.Between(worldX, worldY, p.x, p.y);
            if (d < bestD) { bestD = d; best = i; }
        }
        return bestD <= SLOT_SNAP_RADIUS ? best : -1;
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

    clearSlotForCard(card) {
        const i = this.getReserveSlotIndexOfCard(card);
        if (i >= 0) this.playerReserveSlots[i] = null;
    }

    placeCardInReserveSlot(slotIndex, card) {
        this.clearSlotForCard(card);
        if (this.playerCoreCard === card) this.playerCoreCard = null;
        this.playerReserveSlots[slotIndex] = card;
        this.layoutPlayerReserveSlots();
    }

    swapReserveSlots(ia, ib) {
        const t = this.playerReserveSlots[ia];
        this.playerReserveSlots[ia] = this.playerReserveSlots[ib];
        this.playerReserveSlots[ib] = t;
        this.layoutPlayerReserveSlots();
    }

    ensurePlayerCoreFilled(duration = 400) {
        if (this.playerCoreCard != null) return;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const card = this.playerReserveSlots[i];
            if (card?.active) {
                this.playerReserveSlots[i] = null;
                this.playerCoreCard = card;
                this.tweens.add({
                    targets: card, x: this.coreX, y: this.coreY, duration, ease: 'Sine.easeOut',
                    onComplete: () => {
                        card.originalPos = { x: this.coreX, y: this.coreY };
                        this.refreshCombatPreview();
                    }
                });
                this.layoutPlayerReserveSlots(duration);
                return;
            }
        }
    }

    refreshCombatPreview() {
        const p = this.playerCoreCard; const e = this.enemyCoreCard;
        this.getPlayerReserveList().forEach(c => c.clearCrackPreview());
        if (!p?.active || !e?.active) { p?.clearCrackPreview(); e?.clearCrackPreview(); return; }

        const pWasCracked = p.crackActive; const eWasCracked = e.crackActive;
        p.clearCrackPreview(); e.clearCrackPreview();

        const w = getWeakSideForPreview(p.cardData, e.cardData);
        let shouldPlaySound = false;

        if (w === 'player') { p.setCrackPreview(true); if (!pWasCracked) shouldPlaySound = true; } 
        else if (w === 'enemy') { e.setCrackPreview(true); if (!eWasCracked) shouldPlaySound = true; } 
        else if (w === 'both') { p.setCrackPreview(true); e.setCrackPreview(true); if (!pWasCracked || !eWasCracked) shouldPlaySound = true; }

        if (shouldPlaySound) playSfx(this, 'sfx_crack', { volume: 0.4 });
    }

    notifyDualDiscovery(nameA, nameB) {
        discoverDualPairFromFight(nameA, nameB);
        if (this.helpUi?.refreshDiscoveryList) this.helpUi.refreshDiscoveryList();
    }

    async animateFightOrbit(playerCard, enemyCard) {
        const center = this.fightCenter;
        playerCard.setDepth(20);
        enemyCard.setDepth(20);

        return Promise.all([
            this.tweenPromise({
                targets: playerCard,
                x: center.x - 60,
                y: center.y,
                duration: 350,
                ease: 'Power2.easeIn'
            }),
            this.tweenPromise({
                targets: enemyCard,
                x: center.x + 60,
                y: center.y,
                duration: 350,
                ease: 'Power2.easeIn'
            })
        ]).then(() => {
            playerCard.setRotation(0);
            enemyCard.setRotation(0);
        });
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

    async animateFightImpact(winnerCard, loserCard) {
        const center = this.fightCenter;
        winnerCard.setDepth(22);
        loserCard.setDepth(21);

        await Promise.all([
            this.tweenPromise({
                targets: winnerCard,
                x: center.x - 40,
                y: center.y,
                duration: 220,
                ease: 'Power2.easeIn'
            }),
            this.tweenPromise({
                targets: loserCard,
                x: center.x + 40,
                y: center.y,
                duration: 220,
                ease: 'Power2.easeIn'
            })
        ]);

        await this.tweenPromise({
            targets: winnerCard,
            x: center.x,
            y: center.y - 30,
            duration: 180,
            ease: 'Power2.easeOut'
        });
        await this.tweenPromise({
            targets: winnerCard,
            y: center.y + 12,
            duration: 120,
            ease: 'Quad.easeIn'
        });

        const shards = this.createShatterPieces(loserCard);
        loserCard.setVisible(false);
        this.cameras.main.shake(200, 0.018);
        playSfx(this, 'sfx_impact', { volume: 0.8 });

        await Promise.all(shards.map((piece) => {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.Between(80, 140);
            const targetX = center.x + Math.cos(angle) * distance;
            const targetY = center.y + Math.sin(angle) * distance;
            const rotation = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            return this.tweenPromise({
                targets: piece,
                x: targetX,
                y: targetY,
                alpha: 0,
                rotation: rotation,
                duration: 650,
                ease: 'Cubic.easeOut',
                onComplete: () => piece.destroy()
            });
        }));

        await this.wait(200);
    }

    startStage() {
        this.fightBtn.disableInteractive();
        this.fightBtn.fillColor = 0x555555;
        this.matchOver = false;
        this.currentStage = Math.min(this.matchRound, 3);
        this.roundText?.setText(`VÒNG ${this.matchRound}/${this.maxRounds}`);
        this.updateHealthUI();

        [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.playerCoreCard = null; this.enemyCoreCard = null;

        const playerDeck = drawFiveCards(); const enemyDeck = drawFiveCards();
        const { width, height } = this.scale;
        const startX = width / 2 - 220; const spacing = 110;

        this.enemyReserveCards = enemyDeck.map((data, i) => {
            const card = new Card(this, startX + i * spacing, height * 0.15, data, false);
            card.setDepth(1 + i);
            return card;
        });
        this.reorderEnemyReserveNoAdjacentSame(startX, spacing, height * 0.15);

        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            this.playerReserveSlots[i] = new Card(this, x, y, playerDeck[i], true);
        }

        // Do not auto-fill core slot during setup phase
        // this.playerCoreCard will be null until fight button is pressed

        this.layoutPlayerReserveSlots(0);
        this.time.delayedCall(400, () => this.refreshCombatPreview());
        this.time.delayedCall(1000, () => this.playAITurn());
    }

    playAITurn() {
        const { width, height } = this.scale;
        if (this.currentStage >= 2) {
            let cardA = null, cardB = null;
            for (let i = 0; i < this.enemyReserveCards.length; i++) {
                for (let j = i + 1; j < this.enemyReserveCards.length; j++) {
                    const res = checkMerge(this.enemyReserveCards[i].cardData, this.enemyReserveCards[j].cardData);
                    if (res.valid) { cardA = this.enemyReserveCards[i]; cardB = this.enemyReserveCards[j]; break; }
                }
                if (cardA) break;
            }

            if (cardA && cardB) {
                this.tweens.add({
                    targets: cardA, x: cardB.x, y: cardB.y, duration: 500,
                    onComplete: () => {
                        const res = checkMerge(cardA.cardData, cardB.cardData);
                        cardA.destroy(); cardB.destroy();
                        this.enemyReserveCards = this.enemyReserveCards.filter((c) => c !== cardA && c !== cardB);
                        const newDual = new Card(this, cardB.x, cardB.y, res.cardData, false);
                        newDual.setDepth(12);
                        this.time.delayedCall(500, () => {
                            this.tweens.add({
                                targets: newDual, x: width / 2, y: height * 0.35, duration: 500,
                                onComplete: () => {
                                    this.enemyCoreCard = newDual;
                                    this.setEnemyCoreDepth();
                                    this.enemyReady();
                                    this.refreshCombatPreview();
                                }
                            });
                        });
                    }
                });
                return;
            }
        }

        const randomIdx = Phaser.Math.Between(0, this.enemyReserveCards.length - 1);
        const chosenCard = this.enemyReserveCards[randomIdx];
        this.enemyReserveCards.splice(randomIdx, 1);
        this.assignEnemyReserveDepths();

        this.tweens.add({
            targets: chosenCard, x: width / 2, y: height * 0.35, duration: 800,
            onComplete: () => {
                this.enemyCoreCard = chosenCard;
                this.setEnemyCoreDepth();
                this.enemyReady();
                this.refreshCombatPreview();
            }
        });
    }

    enemyReady() {
        this.fightBtn.setInteractive();
        this.fightBtn.fillColor = 0xffa500;
    }

    reorderEnemyReserveNoAdjacentSame(startX, spacing, y) {
        let cards = [...this.enemyReserveCards]; cards.sort((a, b) => a.x - b.x);
        const n = cards.length;
        for (let i = 0; i < n - 1; i++) {
            if (cards[i].cardData.name !== cards[i + 1].cardData.name) continue;
            let moved = false;
            for (let j = i + 2; j < n; j++) {
                if (cards[j].cardData.name !== cards[i].cardData.name) {
                    const t = cards[i + 1]; cards[i + 1] = cards[j]; cards[j] = t;
                    moved = true; break;
                }
            }
            if (!moved) {
                for (let j = 0; j < i; j++) {
                    if (cards[j].cardData.name !== cards[i].cardData.name) {
                        const t = cards[i + 1]; cards[i + 1] = cards[j]; cards[j] = t;
                        break;
                    }
                }
            }
        }
        this.enemyReserveCards = cards;
        cards.forEach((c, i) => { const tx = startX + i * spacing; c.originalPos = { x: tx, y }; c.setPosition(tx, y); });
        this.assignEnemyReserveDepths();
    }

    findClosestPlayerTargetCard(worldX, worldY, draggedCard) {
        const list = this.getPlayerReserveList().concat(this.playerCoreCard ? [this.playerCoreCard] : []);
        let best = null; let bestD = ON_CARD_RADIUS + 1;
        for (const c of list) {
            if (!c || c === draggedCard || !c.active) continue;
            const d = Phaser.Math.Distance.Between(worldX, worldY, c.x, c.y);
            if (d < bestD) { bestD = d; best = c; }
        }
        return bestD <= ON_CARD_RADIUS ? best : null;
    }

    handleCardDrop(draggedCard) {
        const wx = draggedCard.x; const wy = draggedCard.y;
        const z = this.getCoreZone();
        const draggedIsCore = this.playerCoreCard === draggedCard;
        const draggedSlot = this.getReserveSlotIndexOfCard(draggedCard);

        const bestTarget = this.findClosestPlayerTargetCard(wx, wy, draggedCard);
        let done = false;

        if (bestTarget) {
            const mergeResult = checkMerge(draggedCard.cardData, bestTarget.cardData);
            const targetIsCore = bestTarget === this.playerCoreCard;
            const targetSlot = this.getReserveSlotIndexOfCard(bestTarget);
            const targetInReserve = targetSlot >= 0;

            if (mergeResult.valid) {
                const coreInvolved = draggedIsCore || targetIsCore;
                const anchor = bestTarget;

                this.clearSlotForCard(draggedCard); if (draggedIsCore) this.playerCoreCard = null;
                this.clearSlotForCard(bestTarget); if (targetIsCore) this.playerCoreCard = null;

                draggedCard.destroy(); bestTarget.destroy();

                const newCard = new Card(this, anchor.x, anchor.y, mergeResult.cardData, true);
                playSfx(this, 'sfx_merge');

                if (coreInvolved) {
                    this.playerCoreCard = newCard;
                    newCard.originalPos = { x: this.coreX, y: this.coreY };
                    this.tweens.add({ targets: newCard, x: this.coreX, y: this.coreY, duration: 220 });
                } else {
                    const putIdx = targetInReserve ? targetSlot : draggedSlot >= 0 ? draggedSlot : 0;
                    this.playerReserveSlots[putIdx] = newCard;
                    this.layoutPlayerReserveSlots();
                }
                done = true;
            } else if (draggedIsCore && targetInReserve) {
                this.clearSlotForCard(bestTarget);
                this.playerReserveSlots[targetSlot] = draggedCard;
                this.playerCoreCard = bestTarget;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: bestTarget, x: z.x, y: z.y, duration: 220, ease: 'Sine.easeOut', onComplete: () => { bestTarget.originalPos = { x: z.x, y: z.y }; } });
                playSfx(this, 'sfx_swap');
                done = true;
            } else if (targetIsCore && draggedSlot >= 0) {
                this.playerReserveSlots[draggedSlot] = bestTarget;
                this.playerCoreCard = draggedCard;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, duration: 220, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
                playSfx(this, 'sfx_swap');
                done = true;
            } else if (draggedSlot >= 0 && targetSlot >= 0) {
                this.swapReserveSlots(draggedSlot, targetSlot);
                playSfx(this, 'sfx_swap');
                done = true;
            }
        }

        if (!done && !draggedIsCore && Phaser.Math.Distance.Between(wx, wy, z.x, z.y) < z.r) {
            const draggedSlot = this.getReserveSlotIndexOfCard(draggedCard);
            this.clearSlotForCard(draggedCard);
            if (this.playerCoreCard) {
                this.playerReserveSlots[draggedSlot] = this.playerCoreCard;
                this.playerCoreCard.originalPos = this.getPlayerReserveSlotWorldXY(draggedSlot);
            }
            this.playerCoreCard = draggedCard;
            this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, duration: 260, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
            this.layoutPlayerReserveSlots();
            playSfx(this, 'sfx_swap');
            done = true;
        }

        if (!done) {
            const emptyIdx = this.getNearestEmptyReserveSlotIndex(wx, wy);
            if (emptyIdx >= 0) {
                if (draggedIsCore) {
                    this.playerCoreCard = null;
                    this.playerReserveSlots[emptyIdx] = draggedCard;
                    this.layoutPlayerReserveSlots();
                    playSfx(this, 'sfx_swap');
                    done = true;
                } else if (draggedSlot >= 0 && emptyIdx !== draggedSlot) {
                    this.playerReserveSlots[draggedSlot] = null;
                    this.playerReserveSlots[emptyIdx] = draggedCard;
                    this.layoutPlayerReserveSlots();
                    playSfx(this, 'sfx_swap');
                    done = true;
                }
            }
        }

        if (!done) { draggedCard.snapBack(); }

        this.time.delayedCall(400, () => {
            this.ensurePlayerCoreFilled();
            this.refreshCombatPreview();
        });
    }

    // ==============================================
    // LOGIC ÂM THANH NẰM TẬP TRUNG TẠI ĐÂY
    // ==============================================
   async executeFight() {
        this.fightBtn.disableInteractive();
        this.swapBtn?.disableInteractive();
        this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });

        // Auto-fill core if empty
        if (!this.playerCoreCard) {
            this.ensurePlayerCoreFilled(0); // Instant fill
        }

        const waitScreen = this.add.rectangle(this.scale.width / 2, 100, this.scale.width, 160, 0x000000, 0.75).setDepth(10);
        const clashText = this.add.text(this.scale.width / 2, 100, 'CHIẾN ĐẤU...\nTÍNH TOÁN NGUYÊN TỐ', {
            fontSize: '28px', color: '#ffcc00', align: 'center', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);

        this.tweens.add({ targets: clashText, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });

        const playerCard = this.playerCoreCard;
        const enemyCard = this.enemyCoreCard;
        if (!playerCard?.active || !enemyCard?.active) {
            waitScreen.destroy();
            clashText.destroy();
            this.input.enabled = true;
            this.swapBtn?.setInteractive({ useHandCursor: true });
            return;
        }

        const finalResult = compareCards(playerCard.cardData, enemyCard.cardData);

        if (playerCard.cardData.type === 'Dual' && enemyCard.cardData.type === 'Dual') {
            this.notifyDualDiscovery(playerCard.cardData.name, enemyCard.cardData.name);
        }

        // 1. Phóng ra giữa sân
        await this.animateFightOrbit(playerCard, enemyCard);

        // 2. Phân nhánh hoạt ảnh dựa trên kết quả
        if (finalResult === 'HÒA') {
            // --- NẾU HÒA: Rung màn hình, nứt và vỡ cả 2 lá ---
            this.cameras.main.shake(150, 0.012);
            playSfx(this, 'sfx_crack', { volume: 0.6 });
            
            await this.wait(400);

            const pShards = this.createShatterPieces(playerCard);
            const eShards = this.createShatterPieces(enemyCard);
            playerCard.setVisible(false);
            enemyCard.setVisible(false);

            const center = this.fightCenter;
            await Promise.all([...pShards, ...eShards].map(piece => {
                const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const d = Phaser.Math.Between(60, 120);
                return this.tweenPromise({
                    targets: piece, 
                    x: center.x + Math.cos(a) * d, 
                    y: center.y + Math.sin(a) * d, 
                    alpha: 0, 
                    rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI),
                    duration: 600, 
                    ease: 'Cubic.easeOut', 
                    onComplete: () => piece.destroy()
                });
            }));

            playerCard.destroy();
            enemyCard.destroy();

        } else {
            // --- NẾU CÓ THẮNG/THUA: Áp sát, nện nhau và vỡ lá thua ---
            const winnerCard = finalResult === 'THẮNG' ? playerCard : enemyCard;
            const loserCard = finalResult === 'THẮNG' ? enemyCard : playerCard;
            await this.animateFightImpact(winnerCard, loserCard);
        }

        // 3. Hiển thị text kết quả
        clashText.setText(`KẾT QUẢ: ${finalResult}!`);
        this.tweens.killTweensOf(clashText);
        clashText.setAlpha(1);

        if (finalResult === 'THẮNG' || finalResult === 'THUA') {
            this.applyRoundOutcome(finalResult);
            playSfx(this, finalResult === 'THẮNG' ? 'sfx_win' : 'sfx_lose');
        }

        // 4. Xử lý sau khi hiển thị kết quả
        if (finalResult === 'HÒA') {
            waitScreen.destroy();
            clashText.setDepth(100);
            
            // Dừng 400ms để người chơi kịp nhìn text "HÒA" rồi mới chuyển Tàn Cuộc
            this.time.delayedCall(400, () => {
                clashText.setText('HÒA!\nTÀN CUỘC...');
                this.reserveWarSpeedMult = 2.85;

                this.resolveReserveWar().then((final) => {
                    this.reserveWarSpeedMult = 1;
                    this.applyRoundOutcome(final);
                    clashText.setText(`FINAL: ${final}!`);

                    if (final === 'THẮNG') playSfx(this, 'sfx_win');
                    if (final === 'THUA') playSfx(this, 'sfx_lose');

                    this.time.delayedCall(1600, () => {
                        clashText.destroy();
                        this.input.enabled = true;
                        this.matchRound++;
                        if (this.matchRound > this.maxRounds) {
                            this.finishMatch();
                        } else {
                            this.startStage();
                        }
                    });
                });
            });
            return;
        }

        // Nếu kết thúc Thắng/Thua bình thường thì qua vòng luôn
        this.time.delayedCall(2000, () => {
            waitScreen.destroy();
            clashText.destroy();
            this.input.enabled = true;
            this.matchRound++;
            if (this.matchRound > this.maxRounds) {
                this.finishMatch();
            } else {
                this.startStage();
            }
        });
    }
    
    // ==========================================
    // CÁC HÀM BỔ TRỢ TÀN CUỘC (RESERVE WAR)
    // ==========================================

    wait(ms) { return new Promise((resolve) => this.time.delayedCall(ms, resolve)); }

    tweenPromise(config) {
        return new Promise((resolve) => {
            this.tweens.add({
                ...config,
                onComplete: () => {
                    if (config.onComplete) config.onComplete();
                    resolve();
                }
            });
        });
    }

    sortLeftToRight(cards) { return cards.filter((c) => c && c.active).sort((a, b) => a.x - b.x); }

    removeCardFromRow(row, card) {
        const i = row.indexOf(card);
        if (i >= 0) row.splice(i, 1);
    }

    syncPlayerSlotsAfterWar(workingList) {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) this.playerReserveSlots[i] = null;
        const alive = this.sortLeftToRight(workingList);
        for (let i = 0; i < Math.min(alive.length, RESERVE_SLOT_COUNT); i++) {
            this.playerReserveSlots[i] = alive[i];
        }
        this.layoutPlayerReserveSlots(0);
    }

    async layoutReserveWarRow(row, y) {
        const m = this.reserveWarSpeedMult || 1;
        const dur = Math.round(220 / m);
        const alive = this.sortLeftToRight(row);
        if (alive.length === 0) return;
        
        const spacing = 110;
        const startX = this.scale.width / 2 - ((alive.length - 1) * spacing) / 2;
        
        const tweens = alive.map((c, i) => {
            const tx = startX + i * spacing;
            c.originalPos = { x: tx, y };
            return this.tweenPromise({ targets: c, x: tx, y, duration: dur, ease: 'Sine.easeOut' });
        });
        await Promise.all(tweens);
    }

    async mergeOneLeftPair(row, y, isPlayerCard) {
        const m = this.reserveWarSpeedMult || 1;
        const mv = Math.round(240 / m);
        
        const sorted = this.sortLeftToRight(row);
        const singles = sorted.filter((c) => c.cardData.type === 'Single');
        
        for (let i = 0; i < singles.length; i++) {
            for (let j = i + 1; j < singles.length; j++) {
                const a = singles[i];
                const b = singles[j];
                const res = checkMerge(a.cardData, b.cardData);
                
                if (res.valid) {
                    const midX = (a.x + b.x) / 2;
                    await Promise.all([
                        this.tweenPromise({ targets: a, x: midX, y, duration: mv }),
                        this.tweenPromise({ targets: b, x: midX, y, duration: mv })
                    ]);

                    this.removeCardFromRow(row, a);
                    this.removeCardFromRow(row, b);
                    a.destroy(); b.destroy();

                    const newCard = new Card(this, midX, y, res.cardData, isPlayerCard);
                    row.push(newCard);
                    playSfx(this, 'sfx_merge', { volume: 0.4 });
                    
                    await this.layoutReserveWarRow(row, y);
                    await this.wait(Math.round(160 / m));
                    return true;
                }
            }
        }
        return false;
    }

   async resolveReserveWar() {
        const playerRowY = this.scale.height * 0.8;
        const enemyRowY = this.scale.height * 0.15;
        const center = this.fightCenter; // Lấy tâm điểm màn hình đấu

        let pRow = [...this.getPlayerReserveList()];
        let eRow = [...this.enemyReserveCards];

        const persistReserveRows = () => {
            this.enemyReserveCards = eRow.slice();
        };

        // Bố cục lại hàng ngang
        await Promise.all([
            this.layoutReserveWarRow(pRow, playerRowY),
            this.layoutReserveWarRow(eRow, enemyRowY)
        ]);

        // Tiến hành Auto-merge cho cả 2 bên
        let pCanMerge = true;
        let eCanMerge = true;
        while (pCanMerge || eCanMerge) {
            pCanMerge = await this.mergeOneLeftPair(pRow, playerRowY, true);
            eCanMerge = await this.mergeOneLeftPair(eRow, enemyRowY, false);
        }

        await this.wait(500);

        // Bắt đầu từng lượt đấu trong Tàn Cuộc
        while (true) {
            pRow = this.sortLeftToRight(pRow);
            eRow = this.sortLeftToRight(eRow);
            persistReserveRows();

            // Kiểm tra điều kiện kết thúc tàn cuộc
            if (pRow.length === 0 && eRow.length === 0) {
                this.syncPlayerSlotsAfterWar(pRow);
                return 'HÒA';
            }
            if (pRow.length === 0) {
                this.syncPlayerSlotsAfterWar(pRow);
                return 'THUA';
            }
            if (eRow.length === 0) {
                this.syncPlayerSlotsAfterWar(pRow);
                return 'THẮNG';
            }

            const pCard = pRow[0];
            const eCard = eRow[0];

            // TỐC ĐỘ ANIMATION (sẽ được nhân lên để đánh nhanh hơn)
            const spd = this.reserveWarSpeedMult || 2;

            if (pCard.cardData.type === 'Dual' && eCard.cardData.type === 'Dual') {
                this.notifyDualDiscovery(pCard.cardData.name, eCard.cardData.name);
            }

            // 1. Phóng ra giữa sân đấu (Orbit Animation)
            playSfx(this, 'sfx_fight', { volume: 0.55 });
            pCard.setDepth(20);
            eCard.setDepth(20);

            await Promise.all([
                this.tweenPromise({ targets: pCard, x: center.x - 60, y: center.y, duration: 350 / spd, ease: 'Power2.easeIn' }),
                this.tweenPromise({ targets: eCard, x: center.x + 60, y: center.y, duration: 350 / spd, ease: 'Power2.easeIn' })
            ]);

            const result = compareCards(pCard.cardData, eCard.cardData);

            if (result === 'THẮNG' || result === 'THUA') {
                // Phân loại kẻ thắng người thua
                const winnerCard = result === 'THẮNG' ? pCard : eCard;
                const loserCard = result === 'THẮNG' ? eCard : pCard;

                winnerCard.setDepth(22);
                loserCard.setDepth(21);

                // 2. Kẻ thắng và kẻ thua áp sát nhau
                await Promise.all([
                    this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 220 / spd, ease: 'Power2.easeIn' }),
                    this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 220 / spd, ease: 'Power2.easeIn' })
                ]);

                // 3. Kẻ thắng vươn lên cao và nện mạnh xuống
                await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 180 / spd, ease: 'Power2.easeOut' });
                await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 120 / spd, ease: 'Quad.easeIn' });

                // 4. Rung màn hình + vỡ vụn lá bài thua
                this.cameras.main.shake(150, 0.015);
                playSfx(this, 'sfx_impact', { volume: 0.8 });

                const shards = this.createShatterPieces(loserCard);
                loserCard.setVisible(false);

                await Promise.all(shards.map(piece => {
                    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    const d = Phaser.Math.Between(80, 140);
                    return this.tweenPromise({
                        targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI),
                        duration: 650 / spd, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
                    });
                }));

                loserCard.destroy();
                
                // 5. Trả lá bài chiến thắng về hàng ngang (Slot)
                if (result === 'THẮNG') {
                    eRow.shift();
                    this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: playerRowY, duration: 300 / spd });
                } else {
                    pRow.shift();
                    this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: enemyRowY, duration: 300 / spd });
                }

                persistReserveRows();
                await this.wait(300 / spd);
                this.syncPlayerSlotsAfterWar(pRow);
                
                // Tàn cuộc: Gặp trận phân định thắng thua sẽ kết thúc chuỗi luôn
                return result;

            } else { // HÒA
                // Rung màn hình và nứt vỡ cả 2 lá bài
                this.cameras.main.shake(150, 0.012);
                playSfx(this, 'sfx_crack', { volume: 0.6 });
                
                await this.wait(200 / spd);

                const pShards = this.createShatterPieces(pCard);
                const eShards = this.createShatterPieces(eCard);
                pCard.setVisible(false);
                eCard.setVisible(false);

                // Hiệu ứng bay mảnh vỡ của 2 bên
                await Promise.all([...pShards, ...eShards].map(piece => {
                    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    const d = Phaser.Math.Between(60, 120);
                    return this.tweenPromise({
                        targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI),
                        duration: 600 / spd, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
                    });
                }));

                pCard.destroy(); pRow.shift();
                eCard.destroy(); eRow.shift();
                persistReserveRows();

                // Gom và dồn các lá bài còn lại lấp vào chỗ trống (nếu có)
                await Promise.all([
                    this.layoutReserveWarRow(pRow, playerRowY),
                    this.layoutReserveWarRow(eRow, enemyRowY)
                ]);
                await this.wait(200 / spd);
            }
        }
    }
}