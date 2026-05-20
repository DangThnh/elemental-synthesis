import Phaser from 'phaser';
import Card from '../objects/Card';
import PoolSystem from '../systems/PoolSystem';
import AISystem from '../systems/AISystem';

import { checkMerge, compareCards, getWeakSideForPreview } from '../utils/GameLogic'; // Bỏ drawFiveCards
import { createHelpReferencePanel, discoverDualPairFromFight } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

// --- IMPORT CÁC SYSTEM MỚI ---
import PoolSystem from '../systems/PoolSystem';
import AISystem from '../systems/AISystem';

const RESERVE_SLOT_COUNT = 5;
const ON_CARD_RADIUS = 62;
const SLOT_SNAP_RADIUS = 58;
const MAX_MATCH_ROUNDS = 5;
const START_HEALTH = 100;
const MAX_HEALTH = 100;

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
        this.poolSystem = new PoolSystem();
        this.logic = { checkMerge };
        this.currentStage = 1;
        this.matchRound = 1;
        this.maxRounds = MAX_MATCH_ROUNDS;
        this.playerHealth = START_HEALTH;
        this.enemyHealth = START_HEALTH;
        this.reserveWarSpeedMult = 1;
        
        this.slotFrameG = null;
        this.fightCenter = null;
        this.playerHealthBarBg = null;
        this.playerHealthBarFill = null;
        this.enemyHealthBarBg = null;
        this.enemyHealthBarFill = null;
        this.playerHealthLabel = null;
        this.enemyHealthLabel = null;
        this.matchOver = false;
        this.roundText = null;
        this.swapBtn = null;
        this.swapTooltip = null;
        this.matchResultContainer = null;
        this.audioUnlocked = false;

        // --- KHỞI TẠO HỆ THỐNG ---
        this.poolSystem = new PoolSystem();
    }

    preload() {
        this.load.on('loaderror', (file) => console.warn('[Asset] Không tải được:', file?.src ?? file));
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
        const { width, height } = this.scale;
        if (data?.audioUnlocked) this.audioUnlocked = true;
        if (this.audioUnlocked) { this.initializeGame(width, height); return; }
        this.createStartScreen();
    }

    createStartScreen() {
        const { width, height } = this.scale;
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e, 0.9);
        this.add.text(width / 2, height * 0.25, 'ELEMENTAL SYNTHESIS', { fontSize: '48px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(width / 2, height * 0.34, 'Ngũ Hành Tương Sinh Tương Khắc', { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);

        const instructions = ['🔊 Nhấn để kích hoạt âm thanh', '⚔️ Chiến đấu với các nguyên tố ngũ hành', '💡 Nhấn "?" để xem bảng tra cứu'];
        instructions.forEach((text, index) => {
            this.add.text(width / 2, height * 0.44 + index * 36, text, { fontSize: '20px', color: '#cccccc' }).setOrigin(0.5);
        });

        const tutorialBtn = this.add.rectangle(width / 2, height * 0.64, 320, 70, 0x2a6e2a).setStrokeStyle(3, 0x66ff66).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.unlockAudio(); this.scene.start('TutorialScene', { audioUnlocked: true }); });
        this.add.text(width / 2, height * 0.64, 'HƯỚNG DẪN', { fontSize: '30px', color: '#aaffaa', fontStyle: 'bold' }).setOrigin(0.5);

        const startBtn = this.add.rectangle(width / 2, height * 0.78, 320, 70, 0xffa500).setStrokeStyle(3, 0xffdd44).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.unlockAudio(); this.scene.restart(); });
        this.add.text(width / 2, height * 0.78, 'BẮT ĐẦU', { fontSize: '30px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    }

    unlockAudio() {
        try {
            const audioContext = this.sound.context || (window.AudioContext || window.webkitAudioContext);
            if (audioContext && audioContext.state === 'suspended') audioContext.resume();
            if (this.cache.audio.exists('sfx_fight')) this.sound.play('sfx_fight', { volume: 0.1 });
            this.audioUnlocked = true;
        } catch (e) {
            console.warn('Không thể unlock audio:', e);
            this.audioUnlocked = true;
        }
    }

    initializeGame(width, height) {
        this.enemyZoneH = height * 0.25;
        this.arenaZoneH = height * 0.45;
        this.arenaTopY = this.enemyZoneH;
        this.arenaBottomY = this.enemyZoneH + this.arenaZoneH;

        this.add.rectangle(width/2, this.arenaTopY + this.arenaZoneH/4, width, this.arenaZoneH/2, 0x1a2a6c); 
        this.add.rectangle(width/2, this.arenaBottomY - this.arenaZoneH/4, width, this.arenaZoneH/2, 0x2e4053); 
        this.add.line(0, 0, 0, this.arenaTopY, width, this.arenaTopY, 0xffd700).setOrigin(0).setLineWidth(4);
        this.add.line(0, 0, 0, this.arenaBottomY, width, this.arenaBottomY, 0xffd700).setOrigin(0).setLineWidth(4);

        this.enemySprite = this.add.rectangle(width - 120, this.arenaTopY + 150, 100, 130, 0xe74c3c).setStrokeStyle(4, 0x000);
        this.add.text(width - 120, this.arenaTopY + 70, 'BOSS', { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

        this.playerSprite = this.add.rectangle(140, this.arenaBottomY - 140, 140, 180, 0x3498db).setStrokeStyle(4, 0x000);
        this.add.text(140, this.arenaBottomY - 250, 'PLAYER', { fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

        this.playerReserveStartX = width / 2 - 190;
        this.playerReserveSpacing = 95;
        this.playerReserveY = height * 0.92;

        this.coreX = width / 2;
        this.coreY = this.arenaBottomY + 110;
        this.coreDropRadius = 88;

        this.enemyCoreX = width / 2;
        this.enemyCoreDropRadius = 60;
        this.enemyCoreY = Math.max(this.enemyCoreDropRadius + 20, this.enemyZoneH - this.enemyCoreDropRadius - 10);

        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;

        this.fightCenter = { x: width / 2, y: this.arenaTopY + (this.arenaZoneH / 2) };

        this.roundText = this.add.text(width / 2, 30, `VÒNG ${this.matchRound}/${this.maxRounds}`, { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
        this.createHealthUI();

        this.slotFrameG = this.add.graphics().setDepth(0);
        this.drawSlotFrames();
        
        this.createSwapButton();

        const helpBtn = this.add.rectangle(40, this.arenaTopY + 40, 44, 44, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setInteractive({ useHandCursor: true }).setDepth(25);
        this.add.text(40, this.arenaTopY + 40, '?', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(26);
        this.helpUi = createHelpReferencePanel(this);
        helpBtn.on('pointerdown', () => this.helpUi.setVisible(!this.helpUi.container.visible));

        this.fightBtn = this.add.circle(width - 50, this.fightCenter.y, 45, 0xffa500)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.executeFight())
            .setStrokeStyle(3, 0xffffff);
        this.fightIcon = this.add.image(width - 50, this.fightCenter.y, 'icon_swords').setDisplaySize(40, 40);

        this.createDrawerUI();
        this.startStage();
    }

    createDrawerUI() {
        const { height } = this.scale;
        this.drawerOpen = false;
        const cardWidth = 85; 
        const drawerWidth = (cardWidth * 3) + 60; 
        const startX = -drawerWidth; 
        
        this.drawerCont = this.add.container(startX, this.playerReserveY - 20).setDepth(30);
        const bg = this.add.rectangle(drawerWidth/2, 0, drawerWidth, 140, 0x2c3e50, 0.95)
            .setStrokeStyle(2, 0xffffff).setInteractive().on('pointerdown', (p, lx, ly, e) => e.stopPropagation());
        
        const drawerSlots = [];
        for(let i=0; i<3; i++) {
            const slot = this.add.rectangle(50 + i*(cardWidth + 10), 0, cardWidth, 120).setStrokeStyle(2, 0xaaaaaa);
            drawerSlots.push(slot);
        }

        const tab = this.add.rectangle(drawerWidth + 15, 0, 30, 80, 0x34495e).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
        const tabIcon = this.add.text(drawerWidth + 15, 0, '>', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        this.drawerCont.add([bg, ...drawerSlots, tab, tabIcon]);

        tab.on('pointerdown', () => {
            this.drawerOpen = !this.drawerOpen;
            this.tweens.add({ targets: this.drawerCont, x: this.drawerOpen ? 0 : startX, duration: 300, ease: 'Back.easeOut' });
            tabIcon.setText(this.drawerOpen ? '<' : '>');
        });
    }

    drawSlotFrames() {
        if (!this.slotFrameG) return;
        this.slotFrameG.clear();
        const g = this.slotFrameG;
        const { width } = this.scale;

        g.lineStyle(2, 0xffffff, 0.85);
        g.strokeCircle(this.coreX, this.coreY, this.coreDropRadius + 8);
        g.strokeCircle(this.enemyCoreX, this.enemyCoreY, this.enemyCoreDropRadius + 6);

        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const pos = this.getPlayerReserveSlotWorldXY(i);
            g.strokeRoundedRect(pos.x - 42, pos.y - 60, 84, 120, 10); 
        }

        const enemyY = this.enemyZoneH * 0.35;
        const enemyStartX = width / 2 - 180;
        const enemySpacing = 90;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const x = enemyStartX + i * enemySpacing;
            g.strokeRoundedRect(x - 28, enemyY - 40, 56, 80, 8); 
        }
    }

    createHealthUI() {
        const barWidth = 260; const barHeight = 18;
        const playerBarX = 140; const playerBarY = this.playerSprite.y - 112;
        const enemyBarX = this.scale.width - 120; const enemyBarY = this.enemySprite.y - 100;

        this.playerHealthBarBg = this.add.rectangle(playerBarX, playerBarY, barWidth, barHeight, 0x222222, 0.95).setStrokeStyle(2, 0x88ff88).setOrigin(0.5).setDepth(5);
        this.playerHealthBarFill = this.add.rectangle(playerBarX - barWidth / 2, playerBarY, barWidth, barHeight, 0x2ecc71).setOrigin(0, 0.5).setDepth(6);

        this.enemyHealthBarBg = this.add.rectangle(enemyBarX, enemyBarY, barWidth, barHeight, 0x222222, 0.95).setStrokeStyle(2, 0xff8888).setOrigin(0.5).setDepth(5);
        this.enemyHealthBarFill = this.add.rectangle(enemyBarX - barWidth / 2, enemyBarY, barWidth, barHeight, 0xe74c3c).setOrigin(0, 0.5).setDepth(6);
        this.enemyReadyText = this.add.text(this.enemySprite.x - 140, this.enemySprite.y - 10, 'READY!', {
            fontSize: '22px', color: '#ffee88', fontStyle: 'bold', backgroundColor: 'rgba(30,30,30,0.8)', padding: { x: 10, y: 6 }
        }).setOrigin(1, 0.5).setDepth(20).setVisible(false);

        this.updateHealthUI();
    }

    updateHealthUI() {
        const clampedPlayer = Phaser.Math.Clamp(this.playerHealth, 0, START_HEALTH);
        const clampedEnemy = Phaser.Math.Clamp(this.enemyHealth, 0, START_HEALTH);
        const maxBarWidth = this.playerHealthBarBg.width;

        if (this.playerHealthBarFill) this.playerHealthBarFill.width = Math.max(0, maxBarWidth * (clampedPlayer / START_HEALTH));
        if (this.enemyHealthBarFill) this.enemyHealthBarFill.width = Math.max(0, maxBarWidth * (clampedEnemy / START_HEALTH));

        this.setSwapButtonState(this.playerHealth > 0 && !this.matchOver);
    }

    createSwapButton() {
        const { x, y } = this.getPlayerReserveSlotWorldXY(4); 
        this.swapBtn = this.add.rectangle(x + 80, this.coreY, 44, 44, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setInteractive({ useHandCursor: true }).setDepth(20);
        this.add.text(x + 80, this.coreY, '↻', { fontSize: '26px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(21);

        this.swapTooltip = this.add.text(x + 80, this.coreY - 40, 'Đổi bài: tiêu tốn 10 máu', {
            fontSize: '16px', color: '#ffee88', backgroundColor: '#1a1a1a', padding: { x: 8, y: 6 }
        }).setOrigin(0.5).setDepth(25).setVisible(false);

        this.swapBtn.on('pointerover', () => this.swapTooltip.setVisible(true));
        this.swapBtn.on('pointerout', () => this.swapTooltip.setVisible(false));
        this.swapBtn.on('pointerdown', () => this.trySwapReserve());
    }

    setSwapButtonState(enabled) {
        if (!this.swapBtn) return;
        if (enabled) {
            this.swapBtn.setFillStyle(0x2a2a3d, 0.95); this.swapBtn.setStrokeStyle(2, 0xffd700); this.swapBtn.setInteractive({ useHandCursor: true });
        } else {
            this.swapBtn.setFillStyle(0x222222, 0.6); this.swapBtn.disableInteractive();
        }
    }

    trySwapReserve() {
        if (this.matchOver || this.playerHealth <= 10) return;
        if (!this.playerReserveSlots.some((card) => card?.active)) return;
        this.playerHealth = Math.max(this.playerHealth - 10, 0);
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

        // TÁCH LOGIC: Dùng PoolSystem để rút bài
        const newReserve = this.poolSystem.drawCards(this.matchRound);
        
        const sourceY = this.playerReserveY - 220;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            const card = new Card(this, x, sourceY, newReserve[i], true);
            card.setDepth(10 + i); card.setScale(0.85);
            this.playerReserveSlots[i] = card;
            this.tweens.add({ targets: card, x, y, duration: 320, ease: 'Sine.easeOut' });
        }
        this.refreshCombatPreview();
    }

    // ==========================================
    // LOGIC SPAWN BÀI & TRẬN ĐẤU
    // ==========================================

    getCoreZone() { return { x: this.coreX, y: this.coreY, r: this.coreDropRadius }; }
    getEnemyCoreZone() { return { x: this.enemyCoreX, y: this.enemyCoreY, r: this.enemyCoreDropRadius }; }
    getPlayerReserveSlotWorldXY(slotIndex) { return { x: this.playerReserveStartX + slotIndex * this.playerReserveSpacing, y: this.playerReserveY }; }
    getPlayerReserveList() { return this.playerReserveSlots.filter((c) => c != null && c.active); }

    startStage() {
        this.fightBtn.disableInteractive();
        this.fightIcon.setAlpha(0.5);
        this.matchOver = false;
        this.currentStage = Math.min(this.matchRound, 3);
        this.roundText?.setText(`VÒNG ${this.matchRound}/${this.maxRounds}`);
        this.updateHealthUI();

        [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.playerCoreCard = null; this.enemyCoreCard = null;

        // TÁCH LOGIC: Dùng PoolSystem để bốc bài
        const playerDeck = this.poolSystem.drawCards(this.matchRound); 
        const enemyDeck = this.poolSystem.drawCards(this.matchRound);
        
        const { width } = this.scale;
        
        const enemyStartX = width / 2 - 180;
        const enemySpacing = 90;
        const enemyY = this.enemyZoneH * 0.35;
        this.enemyReserveCards = enemyDeck.map((data, i) => {
            let c = new Card(this, enemyStartX + i * enemySpacing, enemyY, data, false);
            c.setScale(0.55); c.setDepth(1+i); return c;
        });

        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            this.playerReserveSlots[i] = new Card(this, x, y, playerDeck[i], true);
            this.playerReserveSlots[i].setScale(0.85); this.playerReserveSlots[i].setDepth(10+i);
        }

        this.layoutPlayerReserveSlots(0);
        this.time.delayedCall(400, () => this.refreshCombatPreview());
        this.time.delayedCall(1000, () => this.playAITurn());
    }

    // TÁCH LOGIC: GỌI AISYSTEM TRONG PLAY AI TURN
    playAITurn() {
        const { width } = this.scale;
        
        // Gọi AI System quyết định làm gì
        const aiDecision = AISystem.determineAction(this.enemyReserveCards, this.matchRound);

        if (aiDecision.action === 'MERGE') {
            const { cardA, cardB, resultData } = aiDecision;
            
            this.tweens.add({
                targets: cardA, x: cardB.x, y: cardB.y, duration: 500,
                onComplete: () => {
                    cardA.destroy(); cardB.destroy();
                    this.enemyReserveCards = this.enemyReserveCards.filter((c) => c !== cardA && c !== cardB);

                    const newDual = new Card(this, cardB.x, cardB.y, resultData, false);
                    newDual.setScale(0.55);

                    this.time.delayedCall(500, () => {
                        this.tweens.add({
                            targets: newDual, x: width / 2, y: this.enemyCoreY, duration: 500,
                            onComplete: () => {
                                newDual.setScale(0.75);
                                this.enemyCoreCard = newDual;
                                this.enemyReady();
                                this.refreshCombatPreview();
                            }
                        });
                    });
                }
            });
        } 
        else if (aiDecision.action === 'PLAY') {
            const chosenCard = aiDecision.card;
            this.enemyReserveCards.splice(aiDecision.index, 1);

            this.tweens.add({
                targets: chosenCard, x: width / 2, y: this.enemyCoreY, duration: 800,
                onComplete: () => {
                    chosenCard.setScale(0.75);
                    this.enemyCoreCard = chosenCard;
                    this.enemyReady();
                    this.refreshCombatPreview();
                }
            });
        }
    }

    enemyReady() {
        this.fightBtn.setInteractive();
        this.fightIcon.setAlpha(1);
        if (this.enemyReadyText) {
            this.enemyReadyText.setVisible(true);
            if (this.enemyReadyTimer) this.enemyReadyTimer.remove();
            this.enemyReadyTimer = this.time.delayedCall(2000, () => {
                this.enemyReadyText?.setVisible(false);
            });
        }
    }

    getReserveSlotIndexOfCard(card) { for (let i = 0; i < RESERVE_SLOT_COUNT; i++) { if (this.playerReserveSlots[i] === card) return i; } return -1; }
    
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
    
    clearSlotForCard(card) { const i = this.getReserveSlotIndexOfCard(card); if (i >= 0) this.playerReserveSlots[i] = null; }
    swapReserveSlots(ia, ib) { const t = this.playerReserveSlots[ia]; this.playerReserveSlots[ia] = this.playerReserveSlots[ib]; this.playerReserveSlots[ib] = t; this.layoutPlayerReserveSlots(); }

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
            // TÁCH LOGIC: Hàm checkMerge từ GameLogic
            const mergeResult = this.logic.checkMerge(draggedCard.cardData, bestTarget.cardData);
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
                newCard.setScale(0.85);
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
                this.clearSlotForCard(bestTarget); this.playerReserveSlots[targetSlot] = draggedCard; this.playerCoreCard = bestTarget;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: bestTarget, x: z.x, y: z.y, duration: 220, ease: 'Sine.easeOut', onComplete: () => { bestTarget.originalPos = { x: z.x, y: z.y }; } });
                playSfx(this, 'sfx_swap'); done = true;
            } else if (targetIsCore && draggedSlot >= 0) {
                this.playerReserveSlots[draggedSlot] = bestTarget; this.playerCoreCard = draggedCard;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, duration: 220, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
                playSfx(this, 'sfx_swap'); done = true;
            } else if (draggedSlot >= 0 && targetSlot >= 0) {
                this.swapReserveSlots(draggedSlot, targetSlot); playSfx(this, 'sfx_swap'); done = true;
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
                if (draggedIsCore) { this.playerCoreCard = null; this.playerReserveSlots[emptyIdx] = draggedCard; this.layoutPlayerReserveSlots(); playSfx(this, 'sfx_swap'); done = true; } 
                else if (draggedSlot >= 0 && emptyIdx !== draggedSlot) { this.playerReserveSlots[draggedSlot] = null; this.playerReserveSlots[emptyIdx] = draggedCard; this.layoutPlayerReserveSlots(); playSfx(this, 'sfx_swap'); done = true; }
            }
        }

        if (!done) { draggedCard.snapBack(); }
        this.time.delayedCall(280, () => { this.ensurePlayerCoreFilled(); this.refreshCombatPreview(); });
    }

    async animateFightOrbit(playerCard, enemyCard) {
        const center = this.fightCenter;
        playerCard.setDepth(20); enemyCard.setDepth(20);

        return Promise.all([
            this.tweenPromise({ targets: playerCard, x: center.x - 60, y: center.y, duration: 350, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: enemyCard, x: center.x + 60, y: center.y, duration: 350, ease: 'Power2.easeIn' })
        ]).then(() => { playerCard.setRotation(0); enemyCard.setRotation(0); });
    }

    createShatterPieces(card) {
        const pieces = []; const count = 10; const color = card.cardData?.color ?? 0xffffff;
        const centerX = card.x; const centerY = card.y;
        for (let i = 0; i < count; i++) {
            const w = Phaser.Math.Between(14, 24); const h = Phaser.Math.Between(10, 20);
            const piece = this.add.rectangle(centerX, centerY, w, h, color, 1).setDepth(25).setOrigin(0.5);
            piece.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
            pieces.push(piece);
        }
        return pieces;
    }

    async animateFightImpact(winnerCard, loserCard) {
        const center = this.fightCenter;
        winnerCard.setDepth(22); loserCard.setDepth(21);

        await Promise.all([
            this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 220, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 220, ease: 'Power2.easeIn' })
        ]);

        await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 180, ease: 'Power2.easeOut' });
        await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 120, ease: 'Quad.easeIn' });

        const shards = this.createShatterPieces(loserCard);
        loserCard.setVisible(false);
        this.cameras.main.shake(200, 0.018); playSfx(this, 'sfx_impact', { volume: 0.8 });

        await Promise.all(shards.map((piece) => {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2); const distance = Phaser.Math.Between(80, 140);
            return this.tweenPromise({ targets: piece, x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 650, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
        }));
        await this.wait(200);
    }

    getDamageForVictory(cardData) {
        if (!cardData) return 25;
        if (cardData.type === 'Single') return cardData.level === 2 ? 15 : 10;
        if (cardData.type === 'Dual') return cardData.level === 2 ? 45 : 25;
        return 25;
    }

    applyRoundOutcome(result, winnerCardData = null, loserCardData = null) {
        if (result === 'THẮNG') {
            const damage = this.getDamageForVictory(winnerCardData ?? this.playerCoreCard?.cardData);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - damage, 0, START_HEALTH);
            this.tweens.add({ targets: this.enemySprite, x: this.enemySprite.x + 10, duration: 50, yoyo: true, repeat: 3 });
        } else if (result === 'THUA') {
            const damage = this.getDamageForVictory(winnerCardData ?? this.enemyCoreCard?.cardData);
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - damage, 0, START_HEALTH);
            this.tweens.add({ targets: this.playerSprite, x: this.playerSprite.x - 10, duration: 50, yoyo: true, repeat: 3 });
        } else if (result === 'HÒA') {
            const tieDamage = 10;
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - tieDamage, 0, START_HEALTH);
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - tieDamage, 0, START_HEALTH);
            this.tweens.add({ targets: this.enemySprite, x: this.enemySprite.x + 10, duration: 50, yoyo: true, repeat: 3 });
            this.tweens.add({ targets: this.playerSprite, x: this.playerSprite.x - 10, duration: 50, yoyo: true, repeat: 3 });
        }
        this.updateHealthUI();
    }

    async executeFight() {
        this.fightBtn.disableInteractive(); this.swapBtn?.disableInteractive(); this.fightIcon.setAlpha(0.5); this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });

        if (!this.playerCoreCard) this.ensurePlayerCoreFilled(0);

        const waitScreen = this.add.rectangle(this.scale.width / 2, this.fightCenter.y, this.scale.width, 160, 0x000000, 0.75).setDepth(210);
        const clashText = this.add.text(this.scale.width / 2, this.fightCenter.y, 'CHIẾN ĐẤU...', { fontSize: '28px', color: '#ffcc00', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(211);
        this.tweens.add({ targets: clashText, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });

        const playerCard = this.playerCoreCard; const enemyCard = this.enemyCoreCard;
        if (!playerCard?.active || !enemyCard?.active) { waitScreen.destroy(); clashText.destroy(); this.input.enabled = true; this.swapBtn?.setInteractive({ useHandCursor: true }); return; }

        const finalResult = compareCards(playerCard.cardData, enemyCard.cardData);
        if (playerCard.cardData.type === 'Dual' && enemyCard.cardData.type === 'Dual') this.notifyDualDiscovery(playerCard.cardData.name, enemyCard.cardData.name);

        this.tweens.add({ targets: this.playerSprite, y: this.playerSprite.y - 30, scale: 1.1, duration: 150, yoyo: true, ease: 'Power2' });
        await this.animateFightOrbit(playerCard, enemyCard);

        if (finalResult === 'HÒA') {
            this.cameras.main.shake(150, 0.012); playSfx(this, 'sfx_crack', { volume: 0.6 }); await this.wait(400);
            const pShards = this.createShatterPieces(playerCard); const eShards = this.createShatterPieces(enemyCard);
            playerCard.setVisible(false); enemyCard.setVisible(false);
            const center = this.fightCenter;
            await Promise.all([...pShards, ...eShards].map(piece => {
                const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(60, 120);
                return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 600, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
            }));
            playerCard.destroy(); enemyCard.destroy();
        } else {
            const winnerCard = finalResult === 'THẮNG' ? playerCard : enemyCard; const loserCard = finalResult === 'THẮNG' ? enemyCard : playerCard;
            await this.animateFightImpact(winnerCard, loserCard);
        }

        clashText.setText(`KẾT QUẢ: ${finalResult}!`); this.tweens.killTweensOf(clashText); clashText.setAlpha(1);

        if (finalResult === 'THẮNG' || finalResult === 'THUA') {
            const winnerCardData = finalResult === 'THẮNG' ? playerCard.cardData : enemyCard.cardData;
            this.applyRoundOutcome(finalResult, winnerCardData);
            playSfx(this, finalResult === 'THẮNG' ? 'sfx_win' : 'sfx_lose');
        }

        if (finalResult === 'HÒA') {
            waitScreen.destroy(); clashText.setDepth(211);
            this.time.delayedCall(400, () => {
                clashText.setText('HÒA!\nTÀN CUỘC...'); this.reserveWarSpeedMult = 2.85;
                this.resolveReserveWar().then((resultObj) => {
                    this.reserveWarSpeedMult = 1; this.applyRoundOutcome(resultObj.result, resultObj.winnerCardData); clashText.setText(`FINAL: ${resultObj.result}!`);
                    if (resultObj.result === 'THẮNG') playSfx(this, 'sfx_win'); if (resultObj.result === 'THUA') playSfx(this, 'sfx_lose');
                    this.time.delayedCall(1600, () => {
                        clashText.destroy(); this.input.enabled = true;
                        if (this.playerHealth <= 0 || this.enemyHealth <= 0) { this.finishMatch(); return; }
                        this.matchRound++; if (this.matchRound > this.maxRounds) { this.finishMatch(); } else { this.startStage(); }
                    });
                });
            });
            return;
        }

        this.time.delayedCall(2000, () => {
            waitScreen.destroy(); clashText.destroy(); this.input.enabled = true;
            if (this.playerHealth <= 0 || this.enemyHealth <= 0) { this.finishMatch(); return; }
            this.matchRound++; if (this.matchRound > this.maxRounds) { this.finishMatch(); } else { this.startStage(); }
        });
    }

    wait(ms) { return new Promise((resolve) => this.time.delayedCall(ms, resolve)); }
    tweenPromise(config) { return new Promise((resolve) => { this.tweens.add({ ...config, onComplete: () => { if (config.onComplete) config.onComplete(); resolve(); }}); }); }
    sortLeftToRight(cards) { return cards.filter((c) => c && c.active).sort((a, b) => a.x - b.x); }
    removeCardFromRow(row, card) { const i = row.indexOf(card); if (i >= 0) row.splice(i, 1); }

    syncPlayerSlotsAfterWar(workingList) {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) this.playerReserveSlots[i] = null;
        const alive = this.sortLeftToRight(workingList);
        for (let i = 0; i < Math.min(alive.length, RESERVE_SLOT_COUNT); i++) { this.playerReserveSlots[i] = alive[i]; }
        this.layoutPlayerReserveSlots(0);
    }
    syncEnemyReserveCardsAfterWar(workingList) {
        this.enemyReserveCards = workingList.filter((c) => c && c.active);
        for (let i = 0; i < this.enemyReserveCards.length; i++) {
            const card = this.enemyReserveCards[i]; card.setDepth(1 + i);
            if (!card.originalPos) card.originalPos = { x: card.x, y: card.y };
        }
    }

    async layoutReserveWarRow(row, y) {
        const m = this.reserveWarSpeedMult || 1; const dur = Math.round(220 / m);
        const alive = this.sortLeftToRight(row); if (alive.length === 0) return;
        const spacing = 110; const startX = this.scale.width / 2 - ((alive.length - 1) * spacing) / 2;
        const tweens = alive.map((c, i) => {
            const tx = startX + i * spacing; c.originalPos = { x: tx, y };
            return this.tweenPromise({ targets: c, x: tx, y, duration: dur, ease: 'Sine.easeOut' });
        });
        await Promise.all(tweens);
    }

    async mergeOneLeftPair(row, y, isPlayerCard) {
        const m = this.reserveWarSpeedMult || 1; const mv = Math.round(240 / m);
        const sorted = this.sortLeftToRight(row); const singles = sorted.filter((c) => c.cardData.type === 'Single');
        for (let i = 0; i < singles.length; i++) {
            for (let j = i + 1; j < singles.length; j++) {
                const a = singles[i]; const b = singles[j]; const res = checkMerge(a.cardData, b.cardData);
                if (res.valid) {
                    const midX = (a.x + b.x) / 2;
                    await Promise.all([ this.tweenPromise({ targets: a, x: midX, y, duration: mv }), this.tweenPromise({ targets: b, x: midX, y, duration: mv }) ]);
                    this.removeCardFromRow(row, a); this.removeCardFromRow(row, b); a.destroy(); b.destroy();
                    const newCard = new Card(this, midX, y, res.cardData, isPlayerCard); newCard.setScale(isPlayerCard ? 0.85 : 0.55);
                    row.push(newCard); playSfx(this, 'sfx_merge', { volume: 0.4 });
                    await this.layoutReserveWarRow(row, y); await this.wait(Math.round(160 / m)); return true;
                }
            }
        }
        return false;
    }

    async resolveReserveWar() {
        const playerRowY = this.playerReserveY; const enemyRowY = this.scale.height * 0.07; const center = this.fightCenter;
        let pRow = [...this.getPlayerReserveList()]; let eRow = [...this.enemyReserveCards];

        await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY), this.layoutReserveWarRow(eRow, enemyRowY) ]);
        let pCanMerge = true; let eCanMerge = true;
        while (pCanMerge || eCanMerge) {
            pCanMerge = await this.mergeOneLeftPair(pRow, playerRowY, true); eCanMerge = await this.mergeOneLeftPair(eRow, enemyRowY, false);
        }
        await this.wait(500);

        while (true) {
            pRow = this.sortLeftToRight(pRow); eRow = this.sortLeftToRight(eRow);
            if (pRow.length === 0 && eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); this.syncEnemyReserveCardsAfterWar(eRow); return { result: 'HÒA' }; }
            if (pRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); this.syncEnemyReserveCardsAfterWar(eRow); return { result: 'THUA', winnerCardData: null }; }
            if (eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); this.syncEnemyReserveCardsAfterWar(eRow); return { result: 'THẮNG', winnerCardData: null }; }

            const pCard = pRow[0]; const eCard = eRow[0]; const spd = this.reserveWarSpeedMult || 2;
            playSfx(this, 'sfx_fight', { volume: 0.55 }); pCard.setDepth(20); eCard.setDepth(20);

            await Promise.all([
                this.tweenPromise({ targets: pCard, x: center.x - 60, y: center.y, duration: 350 / spd, ease: 'Power2.easeIn' }),
                this.tweenPromise({ targets: eCard, x: center.x + 60, y: center.y, duration: 350 / spd, ease: 'Power2.easeIn' })
            ]);

            const result = compareCards(pCard.cardData, eCard.cardData);
            if (result === 'THẮNG' || result === 'THUA') {
                const winnerCard = result === 'THẮNG' ? pCard : eCard; const loserCard = result === 'THẮNG' ? eCard : pCard;
                winnerCard.setDepth(22); loserCard.setDepth(21);
                await Promise.all([
                    this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 220 / spd, ease: 'Power2.easeIn' }),
                    this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 220 / spd, ease: 'Power2.easeIn' })
                ]);
                await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 180 / spd, ease: 'Power2.easeOut' });
                await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 120 / spd, ease: 'Quad.easeIn' });

                this.cameras.main.shake(150, 0.015); playSfx(this, 'sfx_impact', { volume: 0.8 });
                const shards = this.createShatterPieces(loserCard); loserCard.setVisible(false);
                await Promise.all(shards.map(piece => {
                    const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(80, 140);
                    return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 650 / spd, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
                }));
                loserCard.destroy();

                if (result === 'THẮNG') { eRow.shift(); this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: playerRowY, duration: 300 / spd }); } 
                else { pRow.shift(); this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: enemyRowY, duration: 300 / spd }); }

                await this.wait(300 / spd); this.syncPlayerSlotsAfterWar(pRow); this.syncEnemyReserveCardsAfterWar(eRow); return { result, winnerCardData: winnerCard.cardData };
            } else {
                this.cameras.main.shake(150, 0.012); playSfx(this, 'sfx_crack', { volume: 0.6 }); await this.wait(200 / spd);
                const pShards = this.createShatterPieces(pCard); const eShards = this.createShatterPieces(eCard); pCard.setVisible(false); eCard.setVisible(false);
                await Promise.all([...pShards, ...eShards].map(piece => {
                    const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(60, 120);
                    return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 600 / spd, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
                }));
                pCard.destroy(); pRow.shift(); eCard.destroy(); eRow.shift();
                await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY), this.layoutReserveWarRow(eRow, enemyRowY) ]); await this.wait(200 / spd);
            }
        }
    }

    showMatchResult(finalWinner) {
        this.matchOver = true; const { width, height } = this.scale;
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(9998);
        const message = finalWinner === 'THẮNG' ? 'CHIẾN THẮNG!' : finalWinner === 'THUA' ? 'THẤT BẠI!' : 'HÒA MẠNG!';
        const messageText = this.add.text(width / 2, height * 0.35, message, { fontSize: '48px', color: '#fff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(9999);
        const buttonBg = this.add.rectangle(width / 2, height * 0.55, 220, 60, 0xffa500).setDepth(9999).setInteractive({ useHandCursor: true });
        const buttonText = this.add.text(width / 2, height * 0.55, 'CHƠI LẠI', { fontSize: '24px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10000);
        buttonBg.on('pointerdown', () => { buttonBg.destroy(); buttonText.destroy(); messageText.destroy(); overlay.destroy(); this.resetMatch(); });
        this.matchResultContainer = [overlay, messageText, buttonBg, buttonText];
    }

    resetMatch() {
        this.matchOver = false; this.matchRound = 1; this.currentStage = 1;
        this.playerHealth = START_HEALTH; this.enemyHealth = START_HEALTH;
        this.updateHealthUI(); this.startStage();
    }

    finishMatch() {
        this.input.enabled = true; 
        const finalWinner = this.playerHealth > this.enemyHealth ? 'THẮNG' : this.playerHealth < this.enemyHealth ? 'THUA' : 'HÒA';
        if (finalWinner === 'THẮNG') playSfx(this, 'sfx_win'); if (finalWinner === 'THUA') playSfx(this, 'sfx_lose');
        this.showMatchResult(finalWinner); this.fightBtn.disableInteractive(); this.setSwapButtonState(false);
    }
}