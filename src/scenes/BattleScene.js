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
            console.warn('[Audio] Không tải được (có thể thiếu file hoặc sai đường dẫn):', file?.src ?? file);
        });
        // Tự động load các key như 'sfx_win', 'sfx_lose' từ audioConfig.js
        preloadBattleAudio(this);

        // Placeholder cho icon nguyên tố và hiệu ứng: hãy đặt file PNG thật vào public/assets/icons và public/assets/effects
        this.load.image('icon_fire', 'assets/icons/fire.png');
        this.load.image('icon_water', 'assets/icons/water.png');
        this.load.image('icon_wood', 'assets/icons/wood.png');
        this.load.image('icon_metal', 'assets/icons/metal.png');
        this.load.image('icon_earth', 'assets/icons/earth.png');
        this.load.image('icon_ready', 'assets/icons/ready.png');
        this.load.image('icon_ready_done', 'assets/icons/ready_done.png');
        this.load.image('effect_crack', 'assets/effects/crack.png');
        this.load.image('effect_shatter', 'assets/effects/shatter.png');
    }

    create() {
        const { width, height } = this.scale;

        // Kiểm tra xem đã unlock audio chưa
        if (!this.audioUnlocked) {
            this.createStartScreen();
            return;
        }

        // Tiếp tục tạo game bình thường
        this.initializeGame(width, height);
    }

    createStartScreen() {
        const { width, height } = this.scale;

        // Background
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e, 0.9);

        // Title
        this.add.text(width / 2, height * 0.3, 'ELEMENTAL SYNTHESIS', {
            fontSize: '48px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(width / 2, height * 0.4, 'Ngũ Hành Tương Sinh Tương Khắc', {
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Instructions
        const instructions = [
            '🎮 Nhấn để bắt đầu game',
            '🔊 Nhấn để kích hoạt âm thanh',
            '⚔️ Chiến đấu với các nguyên tố ngũ hành',
            '💡 Nhấn "?" để xem bảng tra cứu'
        ];

        instructions.forEach((text, index) => {
            this.add.text(width / 2, height * 0.5 + index * 40, text, {
                fontSize: '20px',
                color: '#cccccc'
            }).setOrigin(0.5);
        });

        // Start button
        const startBtn = this.add.rectangle(width / 2, height * 0.75, 300, 80, 0xffa500)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.unlockAudio();
                this.scene.restart(); // Restart scene để vào game
            });

        this.add.text(width / 2, height * 0.75, 'BẮT ĐẦU', {
            fontSize: '32px',
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
        // Loại bỏ text OPPONENT và PLAYER

        this.createHealthUI();

        // Thay READY! bằng icon ba chấm nhấp nháy
        this.enemyStateIcon = this.add.image(width - 120, height * 0.1, 'icon_ready').setVisible(false).setScale(0.75).setDepth(15);
        this.enemyStateFallback = this.add.text(width - 120, height * 0.1, '…', { fontSize: '32px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(15);
        this.enemyReadyTween = null;

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
        helpBtn.on('pointerdown', () => this.toggleHelpPanel());

        this.fightBtn = this.add
            .rectangle(width / 2, height * 0.93, 200, 60, 0xffa500)
            .setInteractive()
            .on('pointerdown', () => this.executeFight());
        // Thay text FIGHT bằng icon ⚔️
        this.fightIcon = this.add.text(width / 2, height * 0.93, '⚔️', { fontSize: '40px' }).setOrigin(0.5);

        this.fightCenter = { x: width / 2, y: height * 0.45 };
        this.slotFrameG = this.add.graphics().setDepth(0);
        this.drawSlotFrames();
        this.createSwapButton();

        // Loại bỏ các text gây đè: CORE ZONE, PLAYER RESERVE, ENEMY RESERVE

        this.startStage();
    }

    toggleHelpPanel() {
        const visible = !this.helpUi.container.visible;
        this.helpUi.setVisible(visible);
        this.setPlayerCardsInteractive(!visible);
    }

    setPlayerCardsInteractive(enabled) {
        this.getPlayerReserveList().forEach(card => {
            if (enabled) {
                card.setInteractive({ draggable: true, useHandCursor: true });
            } else {
                card.disableInteractive();
            }
        });
        if (this.playerCoreCard) {
            if (enabled) {
                this.playerCoreCard.setInteractive({ draggable: true, useHandCursor: true });
            } else {
                this.playerCoreCard.disableInteractive();
            }
        }
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

        // Loại bỏ text PLAYER và ENEMY

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
        if (result === 'WIN') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth + 1, 0, MAX_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - 1, 0, MAX_HEALTH);
        } else if (result === 'LOSE') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - 1, 0, MAX_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth + 1, 0, MAX_HEALTH);
        } else if (result === 'DRAW') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - 1, 0, MAX_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - 1, 0, MAX_HEALTH);
        }
        this.updateHealthUI();
    }

    showMatchResult(finalWinner) {
        this.matchOver = true;
        const { width, height } = this.scale;
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(100).setInteractive();
        overlay.on('pointerdown', () => {});
        const message = finalWinner === 'WIN'
            ? 'Bạn đã thắng trận đấu này.'
            : finalWinner === 'LOSE'
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
        const finalWinner = this.playerHealth > this.enemyHealth ? 'WIN' : this.playerHealth < this.enemyHealth ? 'LOSE' : 'DRAW';
        if (finalWinner === 'WIN') playSfx(this, 'sfx_win');
        if (finalWinner === 'LOSE') playSfx(this, 'sfx_lose');
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
        playerCard.setDepth(30);
        enemyCard.setDepth(30);

        const playerTarget = { x: center.x - 40, y: center.y };
        const enemyTarget = { x: center.x + 40, y: center.y };

        playerCard.scene.tweens.killTweensOf(playerCard);
        enemyCard.scene.tweens.killTweensOf(enemyCard);

        await Promise.all([
            this.tweenPromise({ targets: playerCard, x: playerTarget.x, y: playerTarget.y, duration: 340, ease: 'Cubic.easeIn' }),
            this.tweenPromise({ targets: enemyCard, x: enemyTarget.x, y: enemyTarget.y, duration: 340, ease: 'Cubic.easeIn' })
        ]);

        await this.wait(120);
        return this.tweenPromise({ targets: [playerCard, enemyCard], y: `+=8`, duration: 180, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
    }

    setEnemyStateIcon(state) {
        const validReady = state === 'pending' ? 'icon_ready' : state === 'ready' ? 'icon_ready_done' : null;
        if (validReady && this.textures.exists(validReady)) {
            this.enemyStateIcon.setTexture(validReady).setVisible(true);
            this.enemyStateFallback.setVisible(false);
        } else if (state === 'pending') {
            this.enemyStateIcon.setVisible(false);
            this.enemyStateFallback.setText('…').setVisible(true);
        } else if (state === 'ready') {
            this.enemyStateIcon.setVisible(false);
            this.enemyStateFallback.setText('✓').setVisible(true);
        } else {
            this.enemyStateIcon.setVisible(false);
            this.enemyStateFallback.setVisible(false);
        }
    }

    async animateFightImpact(winnerCard, loserCard) {
        const center = this.fightCenter;
        winnerCard.setDepth(32);
        loserCard.setDepth(31);

        await this.tweenPromise({ targets: loserCard, x: center.x, y: center.y, duration: 260, ease: 'Sine.easeInOut' });
        await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 120, duration: 260, ease: 'Sine.easeOut' });
        await this.tweenPromise({ targets: winnerCard, y: center.y + 10, duration: 160, ease: 'Quad.easeIn' });

        this.cameras.main.shake(180, 0.014);
        playSfx(this, 'sfx_impact', { volume: 0.8 });

        loserCard.disableInteractive();
        loserCard.setVisible(false);
        await this.createShatterPieces(loserCard);
        loserCard.destroy();
        await this.wait(240);
    }

    async createShatterPieces(card) {
        const pieceCount = 8;
        const pieces = [];
        const color = card.cardData.color || 0xffffff;
        const baseX = card.x;
        const baseY = card.y;
        const sizes = [18, 22, 24, 16, 20, 14, 18, 20];

        for (let i = 0; i < pieceCount; i++) {
            const w = sizes[i];
            const h = sizes[(i + 3) % sizes.length];
            const px = baseX + Phaser.Math.Between(-24, 24);
            const py = baseY + Phaser.Math.Between(-28, 28);
            const rect = this.add.rectangle(px, py, w, h, color, 1).setDepth(40).setStrokeStyle(1, 0x000000, 0.65);
            pieces.push(rect);
        }

        const tweens = pieces.map((piece) => {
            const sx = Phaser.Math.FloatBetween(0.8, 1.2);
            const sy = Phaser.Math.FloatBetween(0.8, 1.2);
            const dx = Phaser.Math.Between(-120, 120);
            const dy = Phaser.Math.Between(-120, 120);
            const rot = Phaser.Math.FloatBetween(-2, 2);
            return this.tweenPromise({
                targets: piece,
                x: piece.x + dx,
                y: piece.y + dy,
                angle: rot * 45,
                scaleX: sx,
                scaleY: sy,
                alpha: 0,
                duration: 520,
                ease: 'Cubic.easeOut'
            });
        });

        await Promise.all(tweens);
        pieces.forEach((piece) => piece.destroy());
    }

    startStage() {
        this.setEnemyStateIcon('pending');
        if (this.enemyReadyTween) {
            this.enemyReadyTween.remove();
            this.enemyReadyTween = null;
        }
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

        const randomCoreIdx = Phaser.Math.Between(0, RESERVE_SLOT_COUNT - 1);
        const coreCard = this.playerReserveSlots[randomCoreIdx];
        const coreData = coreCard.cardData;
        coreCard.destroy();
        this.playerReserveSlots[randomCoreIdx] = null;
        this.playerCoreCard = new Card(this, this.coreX, this.coreY, coreData, true);

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
        this.setEnemyStateIcon('ready');
        if (this.enemyReadyTween) {
            this.enemyReadyTween.remove();
        }
        const activeTarget = this.enemyStateIcon.visible ? this.enemyStateIcon : this.enemyStateFallback;
        this.enemyReadyTween = this.tweens.add({
            targets: activeTarget,
            alpha: { from: 0.4, to: 1 },
            yoyo: true,
            repeat: -1,
            duration: 600
        });
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
                const newCard = new Card(this, anchor.x, anchor.y, mergeResult.cardData, true);
                playSfx(this, 'sfx_merge');

                this.clearSlotForCard(draggedCard); if (draggedIsCore) this.playerCoreCard = null;
                this.clearSlotForCard(bestTarget); if (targetIsCore) this.playerCoreCard = null;

                if (coreInvolved) {
                    this.playerCoreCard = newCard;
                    newCard.originalPos = { x: this.coreX, y: this.coreY };
                    this.tweens.add({ targets: newCard, x: this.coreX, y: this.coreY, duration: 220 });
                } else {
                    const putIdx = targetInReserve ? targetSlot : draggedSlot >= 0 ? draggedSlot : 0;
                    this.playerReserveSlots[putIdx] = newCard;
                    this.layoutPlayerReserveSlots();
                }

                draggedCard.destroy();
                bestTarget.destroy();
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

        const waitScreen = this.add.rectangle(this.scale.width / 2, 100, this.scale.width, 160, 0x000000, 0.75).setDepth(100).setInteractive();
        const clashText = this.add.text(this.scale.width / 2, 100, 'ĐANG ĐẤU...\nTÍNH TOÁN NGUYÊN TỐ', {
            fontSize: '28px', color: '#ffcc00', align: 'center', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

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

        await this.animateFightOrbit(playerCard, enemyCard);

        const winnerCard = finalResult === 'WIN' ? playerCard : finalResult === 'LOSE' ? enemyCard : null;
        const loserCard = finalResult === 'WIN' ? enemyCard : finalResult === 'LOSE' ? playerCard : null;
        if (winnerCard && loserCard) {
            await this.animateFightImpact(winnerCard, loserCard);
        }

        clashText.setText(`KẾT QUẢ: ${finalResult}!`);
        this.tweens.killTweensOf(clashText);
        clashText.setAlpha(1);

        if (finalResult === 'WIN' || finalResult === 'LOSE') {
            this.applyRoundOutcome(finalResult);
            playSfx(this, finalResult === 'WIN' ? 'sfx_win' : 'sfx_lose');
        }

        if (finalResult === 'DRAW') {
            waitScreen.destroy();
            clashText.setDepth(100);
            this.time.delayedCall(800, () => {
                clashText.setText('HÒA!\nTÀN CUỘC...');
                this.reserveWarSpeedMult = 2.85;

                this.resolveReserveWar().then((final) => {
                    this.reserveWarSpeedMult = 1;
                    this.applyRoundOutcome(final);
                    clashText.setText(`CUỐI CÙNG: ${final}!`);

                    if (final === 'WIN') playSfx(this, 'sfx_win');
                    if (final === 'LOSE') playSfx(this, 'sfx_lose');

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

        let pRow = [...this.getPlayerReserveList()];
        let eRow = [...this.enemyReserveCards];

        await Promise.all([
            this.layoutReserveWarRow(pRow, playerRowY),
            this.layoutReserveWarRow(eRow, enemyRowY)
        ]);

        let pCanMerge = true;
        let eCanMerge = true;
        while (pCanMerge || eCanMerge) {
            pCanMerge = await this.mergeOneLeftPair(pRow, playerRowY, true);
            eCanMerge = await this.mergeOneLeftPair(eRow, enemyRowY, false);
        }

        await this.wait(500);

        while (true) {
            pRow = this.sortLeftToRight(pRow);
            eRow = this.sortLeftToRight(eRow);

            if (pRow.length === 0 && eRow.length === 0) {
                this.syncPlayerSlotsAfterWar(pRow);
                return 'DRAW';
            }
            if (pRow.length === 0) {
                this.syncPlayerSlotsAfterWar(pRow);
                return 'LOSE';
            }
            if (eRow.length === 0) {
                this.syncPlayerSlotsAfterWar(pRow);
                return 'WIN';
            }

            const pCard = pRow[0];
            const eCard = eRow[0];

            await Promise.all([
                this.tweenPromise({ targets: pCard, y: playerRowY - 50, duration: 200 }),
                this.tweenPromise({ targets: eCard, y: enemyRowY + 50, duration: 200 })
            ]);

            if (pCard.cardData.type === 'Dual' && eCard.cardData.type === 'Dual') {
                this.notifyDualDiscovery(pCard.cardData.name, eCard.cardData.name);
            }

            const result = compareCards(pCard.cardData, eCard.cardData);

            if (result === 'WIN') {
                this.tweens.add({ targets: pCard, y: playerRowY, duration: 200 }); 
                eCard.destroy();
                eRow.shift();
                playSfx(this, 'sfx_fight');
                await this.wait(300);
                this.syncPlayerSlotsAfterWar(pRow);
                return 'WIN';
                
            } else if (result === 'LOSE') {
                this.tweens.add({ targets: eCard, y: enemyRowY, duration: 200 });
                pCard.destroy();
                pRow.shift();
                playSfx(this, 'sfx_fight');
                await this.wait(300);
                this.syncPlayerSlotsAfterWar(pRow);
                return 'LOSE';
                
            } else {
                pCard.destroy(); pRow.shift();
                eCard.destroy(); eRow.shift();
                playSfx(this, 'sfx_crack');
                
                await Promise.all([
                    this.layoutReserveWarRow(pRow, playerRowY),
                    this.layoutReserveWarRow(eRow, enemyRowY)
                ]);
                await this.wait(300);
                // note
            }
        }
    }
}