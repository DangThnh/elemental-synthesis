import Phaser from 'phaser';
import Card from '../objects/Card';
import { drawFiveCards, checkMerge, compareCards, getWeakSideForPreview } from '../utils/GameLogic';
import { createHelpReferencePanel, discoverDualPairFromFight } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

const RESERVE_SLOT_COUNT = 5;
const ON_CARD_RADIUS = 62;
const SLOT_SNAP_RADIUS = 58;

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
        this.logic = { drawFiveCards, checkMerge };
        
        // Trạng thái trận đấu
        this.matchRound = 1;
        this.maxRounds = 5;
        this.playerHealth = 100;
        this.enemyHealth = 100;
        
        this.slotFrameG = null;
        this.matchOver = false;
        this.audioUnlocked = true;
    }

    preload() {
        this.load.image('icon_swords', 'assets/swords.png');
        preloadBattleAudio(this);
    }

    create() {
        const { width, height } = this.scale;

        // ==========================================
        // 1. TÍNH TOÁN TỈ LỆ 3 KHU VỰC 
        // (Enemy: 25%, Arena: 45%, Player: 30%)
        // ==========================================
        this.enemyZoneH = height * 0.25; 
        this.arenaZoneH = height * 0.45; 
        this.playerZoneH = height * 0.30;

        this.arenaTopY = this.enemyZoneH;
        this.arenaBottomY = this.enemyZoneH + this.arenaZoneH;

        // ==========================================
        // 2. KHU VỰC ARENA (45% - OVER-SHOULDER VIEW)
        // ==========================================
        // Background (Có thể thay thế ảnh xịn vào đây sau)
        this.add.rectangle(width/2, this.arenaTopY + this.arenaZoneH/4, width, this.arenaZoneH/2, 0x1a2a6c); // Bầu trời
        this.add.rectangle(width/2, this.arenaBottomY - this.arenaZoneH/4, width, this.arenaZoneH/2, 0x2e4053); // Mặt đất
        
        // Line phân cách
        this.add.line(0, 0, 0, this.arenaTopY, width, this.arenaTopY, 0xffd700).setOrigin(0).setLineWidth(4);
        this.add.line(0, 0, 0, this.arenaBottomY, width, this.arenaBottomY, 0xffd700).setOrigin(0).setLineWidth(4);

        // --- ENEMY (Xa, Nhỏ, Góc Phải Trên) ---
        // Placeholder cho ảnh Boss sau này
        this.enemySprite = this.add.rectangle(width - 100, this.arenaTopY + 100, 100, 130, 0xe74c3c).setStrokeStyle(4, 0x000);
        this.enemyHpBar = this.createHpBar(width - 100, this.arenaTopY + 20, 100, 12, 0xff0000);

        // --- PLAYER (Gần, To, Góc Trái Dưới) ---
        // Placeholder cho ảnh Main Character sau này
        this.playerSprite = this.add.rectangle(120, this.arenaBottomY - 120, 140, 180, 0x3498db).setStrokeStyle(4, 0x000);
        this.playerHpBar = this.createHpBar(120, this.arenaBottomY - 230, 140, 16, 0x00ff00);

        // Nơi đập bài ở giữa màn hình Arena
        this.fightCenter = { x: width / 2, y: this.arenaTopY + (this.arenaZoneH / 2) };

        // Nút Help UI nằm trong khu vực Arena
        const helpBtn = this.add.rectangle(40, this.arenaTopY + 40, 44, 44, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setInteractive({ useHandCursor: true }).setDepth(25);
        this.add.text(40, this.arenaTopY + 40, '?', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(26);
        this.helpUi = createHelpReferencePanel(this);
        helpBtn.on('pointerdown', () => this.helpUi.setVisible(!this.helpUi.container.visible));

        this.roundText = this.add.text(width / 2, this.arenaTopY + 30, `VÒNG ${this.matchRound}/${this.maxRounds}`, { fontSize: '28px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);

        // ==========================================
        // 3. KHU VỰC PLAYER (30% Đáy màn hình)
        // ==========================================
        // Tọa độ bài dự bị (Nằm sát lề dưới)
        this.playerReserveStartX = width / 2 - 150; // Dịch qua phải để chừa chỗ cho Drawer
        this.playerReserveSpacing = 85;
        this.playerReserveY = height * 0.92;

        // Tọa độ Core Slot (Nằm trên bài dự bị)
        this.coreX = width / 2 - 50; // Hơi lệch trái
        this.coreY = this.arenaBottomY + 70; 
        this.coreDropRadius = 80;

        // Nút FIGHT Hình Tròn (Giữa & Sát phải khu vực 30%)
        this.fightBtn = this.add.circle(width - 60, this.coreY + 20, 50, 0xffa500)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.executeFight())
            .setStrokeStyle(4, 0xffffff);
        this.add.text(width - 60, this.coreY + 20, 'FIGHT', { fontSize: '20px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);

        // Drawer BÀI CHỨC NĂNG (Góc trái)
        this.createDrawerUI();

        // ==========================================
        // 4. KHU VỰC ENEMY (25% Đỉnh màn hình)
        // ==========================================
        // Tọa độ Địch
        this.enemyReserveY = height * 0.08;
        this.enemyCoreY = height * 0.18;

        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;

        // Viền các slot
        this.slotFrameG = this.add.graphics().setDepth(0);
        this.drawSlotFrames();
        this.updateHealthUI();
        this.startStage();
    }

    // --- HEALTH BAR CHUẨN RPG ---
    createHpBar(x, y, w, h, color) {
        const bg = this.add.rectangle(x, y, w, h, 0x000000).setOrigin(0.5).setStrokeStyle(2, 0xffffff);
        const fill = this.add.rectangle(x - w/2, y, w, h, color).setOrigin(0, 0.5);
        return { bg, fill, maxW: w };
    }

    updateHealthUI() {
        const pctP = Math.max(0, this.playerHealth / 100);
        const pctE = Math.max(0, this.enemyHealth / 100);
        this.tweens.add({ targets: this.playerHpBar.fill, displayWidth: this.playerHpBar.maxW * pctP, duration: 300 });
        this.tweens.add({ targets: this.enemyHpBar.fill, displayWidth: this.enemyHpBar.maxW * pctE, duration: 300 });
    }

    // --- DRAWER CHUẨN KÍCH THƯỚC BÀI DỰ BỊ ---
    createDrawerUI() {
        const { height } = this.scale;
        this.drawerOpen = false;
        
        // Kích thước Drawer bằng đúng lá bài scale 0.8
        const cardWidth = 80; 
        const drawerWidth = (cardWidth * 3) + 40; 
        const startX = -drawerWidth; 
        
        // Đặt Drawer ngang hàng với bài dự bị
        this.drawerCont = this.add.container(startX, this.playerReserveY).setDepth(100); 
        
        const bg = this.add.rectangle(drawerWidth/2, 0, drawerWidth, 120, 0x2c3e50, 0.95).setStrokeStyle(2, 0xffffff);
        
        // 3 Slot cho lá chức năng sau này
        for(let i=0; i<3; i++) {
            this.add.rectangle(50 + i*(cardWidth + 10), 0, cardWidth, 112).setStrokeStyle(2, 0xaaaaaa);
        }

        // Tab kéo ra màu cam để dễ nhìn
        const tab = this.add.rectangle(drawerWidth + 15, 0, 30, 80, 0xffa500).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
        const tabIcon = this.add.text(drawerWidth + 15, 0, '>', { fontSize: '20px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
        
        this.drawerCont.add([bg, tab, tabIcon]);

        tab.on('pointerdown', () => {
            this.drawerOpen = !this.drawerOpen;
            this.tweens.add({ targets: this.drawerCont, x: this.drawerOpen ? 0 : startX, duration: 300, ease: 'Back.easeOut' });
            tabIcon.setText(this.drawerOpen ? '<' : '>');
        });
    }

    drawSlotFrames() {
        this.slotFrameG.clear();
        const g = this.slotFrameG;
        const { width } = this.scale;

        g.lineStyle(2, 0xffffff, 0.5);
        
        // Player Core
        g.strokeCircle(this.coreX, this.coreY, this.coreDropRadius);
        // Player Reserve (Scale ~0.8 -> Size: 80x112)
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const pos = this.getPlayerReserveSlotWorldXY(i);
            g.strokeRoundedRect(pos.x - 40, pos.y - 56, 80, 112, 8);
        }

        // Enemy Reserve (Scale ~0.6 -> Size: 60x84)
        const enemyStartX = width / 2 - 140;
        const enemySpacing = 70;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const x = enemyStartX + i * enemySpacing;
            g.strokeRoundedRect(x - 30, this.enemyReserveY - 42, 60, 84, 6); 
        }
        // Enemy Core
        g.strokeCircle(width / 2, this.enemyCoreY, 50);
    }

    // ==========================================
    // LOGIC SPAWN BÀI & TRẬN ĐẤU
    // ==========================================

    startStage() {
        this.fightBtn.disableInteractive();
        this.fightBtn.fillColor = 0x555555;
        this.matchOver = false;
        this.roundText?.setText(`VÒNG ${this.matchRound}/${this.maxRounds}`);

        [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.playerCoreCard = null; this.enemyCoreCard = null;

        const playerDeck = drawFiveCards(); const enemyDeck = drawFiveCards();
        const { width } = this.scale;
        
        // ĐỊCH (Scale 0.6)
        const enemyStartX = width / 2 - 140; const enemySpacing = 70;
        this.enemyReserveCards = enemyDeck.map((data, i) => {
            let c = new Card(this, enemyStartX + i * enemySpacing, this.enemyReserveY, data, false);
            c.setScale(0.6);
            c.setDepth(1+i);
            return c;
        });
        
        // PLAYER (Scale 0.8)
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            this.playerReserveSlots[i] = new Card(this, x, y, playerDeck[i], true);
            this.playerReserveSlots[i].setScale(0.8);
            this.playerReserveSlots[i].setDepth(10+i);
        }

        this.layoutPlayerReserveSlots(0);
        this.time.delayedCall(400, () => this.refreshCombatPreview());
        this.time.delayedCall(1000, () => this.playAITurn());
    }

    playAITurn() {
        const { width } = this.scale;

        // KHI QUA VÒNG 1, ĐỊCH SẼ BIẾT GHÉP BÀI (Dùng matchRound >= 2)
        if (this.matchRound >= 2) { 
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
                        newDual.setScale(0.6); // Scale chuẩn của địch

                        this.time.delayedCall(500, () => {
                            this.tweens.add({
                                targets: newDual, x: width / 2, y: this.enemyCoreY, duration: 500,
                                onComplete: () => {
                                    this.enemyCoreCard = newDual;
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

        this.tweens.add({
            targets: chosenCard, x: width / 2, y: this.enemyCoreY, duration: 800,
            onComplete: () => {
                this.enemyCoreCard = chosenCard;
                this.enemyReady();
                this.refreshCombatPreview();
            }
        });
    }

    enemyReady() {
        this.fightBtn.setInteractive();
        this.fightBtn.fillColor = 0xffa500;
        
        // Pop-up text báo Địch đã chốt bài
        const readyText = this.add.text(this.scale.width / 2, this.enemyCoreY - 40, 'READY!', { fontSize: '24px', color: '#ffcc00', fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
            targets: readyText, y: this.enemyCoreY - 70, alpha: 0, duration: 1200, ease: 'Power1',
            onComplete: () => readyText.destroy()
        });
    }

    // ==========================================
    // CÁC HÀM GET, LAYOUT & DRAG DROP
    // ==========================================
    getCoreZone() { return { x: this.coreX, y: this.coreY, r: this.coreDropRadius }; }
    getPlayerReserveSlotWorldXY(slotIndex) { return { x: this.playerReserveStartX + slotIndex * this.playerReserveSpacing, y: this.playerReserveY }; }
    getPlayerReserveList() { return this.playerReserveSlots.filter((c) => c != null && c.active); }
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
            this.tweens.add({ targets: c, x: tx, y: ty, scale: 0.8, duration, ease: 'Sine.easeOut' }); // Luôn ép scale về 0.8
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
                    targets: card, x: this.coreX, y: this.coreY, scale: 0.8, duration, ease: 'Sine.easeOut',
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
                newCard.setScale(0.8); 
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
                this.tweens.add({ targets: bestTarget, x: z.x, y: z.y, scale: 0.8, duration: 220, ease: 'Sine.easeOut', onComplete: () => { bestTarget.originalPos = { x: z.x, y: z.y }; } });
                playSfx(this, 'sfx_swap'); done = true;
            } else if (targetIsCore && draggedSlot >= 0) {
                this.playerReserveSlots[draggedSlot] = bestTarget; this.playerCoreCard = draggedCard;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, scale: 0.8, duration: 220, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
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
            this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, scale: 0.8, duration: 260, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
            this.layoutPlayerReserveSlots();
            playSfx(this, 'sfx_swap'); done = true;
        }

        if (!done) {
            const emptyIdx = this.getNearestEmptyReserveSlotIndex(wx, wy);
            if (emptyIdx >= 0) {
                if (draggedIsCore) { this.playerCoreCard = null; this.playerReserveSlots[emptyIdx] = draggedCard; this.layoutPlayerReserveSlots(); playSfx(this, 'sfx_swap'); done = true; } 
                else if (draggedSlot >= 0 && emptyIdx !== draggedSlot) { this.playerReserveSlots[draggedSlot] = null; this.playerReserveSlots[emptyIdx] = draggedCard; this.layoutPlayerReserveSlots(); playSfx(this, 'sfx_swap'); done = true; }
            }
        }

        if (!done) { this.tweens.add({ targets: draggedCard, x: draggedCard.originalPos.x, y: draggedCard.originalPos.y, scale: 0.8, duration: 200, ease: 'Back.easeOut' }); }
        this.time.delayedCall(400, () => { this.ensurePlayerCoreFilled(); this.refreshCombatPreview(); });
    }

    // ==========================================
    // HOẠT ẢNH CHIẾN ĐẤU & KẾT QUẢ
    // ==========================================

    playHitAnim(isPlayer) {
        const target = isPlayer ? this.playerSprite : this.enemySprite;
        this.tweens.add({ targets: target, x: target.x + (isPlayer ? -10 : 10), duration: 50, yoyo: true, repeat: 3 });
    }

    playAttackAnim(isPlayer) {
        const target = isPlayer ? this.playerSprite : this.enemySprite;
        this.tweens.add({ targets: target, y: target.y - 30, scale: 1.1, duration: 150, yoyo: true, ease: 'Power2' });
    }

    async animateFightOrbit(playerCard, enemyCard) {
        const center = this.fightCenter;
        playerCard.setDepth(50);
        enemyCard.setDepth(50);

        // Đều Zoom lên kích thước thật (1.0) khi bay ra giữa sân cho máu lửa
        return Promise.all([
            this.tweenPromise({ targets: playerCard, x: center.x - 60, y: center.y, scale: 1, duration: 350, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: enemyCard, x: center.x + 60, y: center.y, scale: 1, duration: 350, ease: 'Power2.easeIn' })
        ]);
    }

    createShatterPieces(card) {
        const pieces = [];
        const color = card.cardData?.color ?? 0xffffff;
        for (let i = 0; i < 10; i++) {
            const piece = this.add.rectangle(card.x, card.y, Phaser.Math.Between(14, 24), Phaser.Math.Between(10, 20), color, 1).setDepth(25).setOrigin(0.5);
            piece.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
            pieces.push(piece);
        }
        return pieces;
    }

    async animateFightImpact(winnerCard, loserCard) {
        const center = this.fightCenter;
        winnerCard.setDepth(52); loserCard.setDepth(51);

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

    applyRoundOutcome(result) {
        if (result === 'WIN') { this.enemyHealth = Math.max(0, this.enemyHealth - 20); this.playHitAnim(false); } 
        else if (result === 'LOSE') { this.playerHealth = Math.max(0, this.playerHealth - 20); this.playHitAnim(true); } 
        else if (result === 'DRAW') {
            this.enemyHealth = Math.max(0, this.enemyHealth - 20); this.playerHealth = Math.max(0, this.playerHealth - 20);
            this.playHitAnim(false); this.playHitAnim(true); 
        }
        this.updateHealthUI();
    }

    async executeFight() {
        this.fightBtn.disableInteractive();
        this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });
        
        if (!this.playerCoreCard) this.ensurePlayerCoreFilled(0);

        this.playAttackAnim(true);
        this.time.delayedCall(150, () => this.playAttackAnim(false));

        // Screen tối màu khi combat
        const waitScreen = this.add.rectangle(this.scale.width / 2, this.fightCenter.y, this.scale.width, 160, 0x000000, 0.75).setDepth(10);
        const clashText = this.add.text(this.scale.width / 2, this.fightCenter.y, 'CHIẾN ĐẤU...', { fontSize: '28px', color: '#ffcc00', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
        this.tweens.add({ targets: clashText, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });

        const pCard = this.playerCoreCard; const eCard = this.enemyCoreCard;
        const finalResult = compareCards(pCard.cardData, eCard.cardData);

        await this.animateFightOrbit(pCard, eCard);

        if (finalResult === 'DRAW') {
            this.cameras.main.shake(150, 0.012); playSfx(this, 'sfx_crack', { volume: 0.6 }); await this.wait(400);
            const pShards = this.createShatterPieces(pCard); const eShards = this.createShatterPieces(eCard);
            pCard.setVisible(false); eCard.setVisible(false);
            const center = this.fightCenter;
            await Promise.all([...pShards, ...eShards].map(piece => {
                const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(60, 120);
                return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
            }));
            pCard.destroy(); eCard.destroy();
        } else {
            const winnerCard = finalResult === 'WIN' ? pCard : eCard; const loserCard = finalResult === 'WIN' ? eCard : pCard;
            await this.animateFightImpact(winnerCard, loserCard);
        }

        clashText.setText(`KẾT QUẢ: ${finalResult}!`);
        this.tweens.killTweensOf(clashText); clashText.setAlpha(1);

        if (finalResult === 'WIN' || finalResult === 'LOSE') {
            this.applyRoundOutcome(finalResult);
            playSfx(this, finalResult === 'WIN' ? 'sfx_win' : 'sfx_lose');
        }

        // Chuyển Tàn Cuộc
        if (finalResult === 'DRAW') {
            waitScreen.destroy(); clashText.setDepth(100);
            this.time.delayedCall(800, () => {
                clashText.setText('HÒA!\nTÀN CUỘC...');
                this.resolveReserveWar().then((final) => {
                    this.applyRoundOutcome(final);
                    clashText.setText(`FINAL: ${final}!`);
                    if (final === 'WIN') playSfx(this, 'sfx_win');
                    if (final === 'LOSE') playSfx(this, 'sfx_lose');

                    this.time.delayedCall(1600, () => {
                        clashText.destroy(); this.matchRound++;
                        if (this.matchRound > this.maxRounds || this.playerHealth <= 0 || this.enemyHealth <= 0) { this.finishMatch(); } else { this.input.enabled = true; this.startStage(); }
                    });
                });
            });
            return;
        }

        // Qua vòng
        this.time.delayedCall(2000, () => {
            waitScreen.destroy(); clashText.destroy(); this.matchRound++;
            if (this.matchRound > this.maxRounds || this.playerHealth <= 0 || this.enemyHealth <= 0) { this.finishMatch(); } else { this.input.enabled = true; this.startStage(); }
        });
    }

    // ==========================================
    // TÀN CUỘC (RESERVE WAR)
    // ==========================================
    wait(ms) { return new Promise((resolve) => this.time.delayedCall(ms, resolve)); }
    tweenPromise(config) { return new Promise((res) => { this.tweens.add({ ...config, onComplete: () => { if (config.onComplete) config.onComplete(); res(); }}); }); }
    sortLeftToRight(cards) { return cards.filter((c) => c && c.active).sort((a, b) => a.x - b.x); }
    removeCardFromRow(row, card) { const i = row.indexOf(card); if (i >= 0) row.splice(i, 1); }

    syncPlayerSlotsAfterWar(workingList) {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) this.playerReserveSlots[i] = null;
        const alive = this.sortLeftToRight(workingList);
        for (let i = 0; i < Math.min(alive.length, RESERVE_SLOT_COUNT); i++) { this.playerReserveSlots[i] = alive[i]; }
        this.layoutPlayerReserveSlots(0);
    }

    async layoutReserveWarRow(row, y, isPlayerRow) {
        const alive = this.sortLeftToRight(row); if (alive.length === 0) return;
        const spacing = isPlayerRow ? 85 : 70;
        const startX = this.scale.width / 2 - ((alive.length - 1) * spacing) / 2;
        const tweens = alive.map((c, i) => {
            const tx = startX + i * spacing; c.originalPos = { x: tx, y };
            return this.tweenPromise({ targets: c, x: tx, y, scale: isPlayerRow ? 0.8 : 0.6, duration: 220, ease: 'Sine.easeOut' });
        });
        await Promise.all(tweens);
    }

    async mergeOneLeftPair(row, y, isPlayerCard) {
        const sorted = this.sortLeftToRight(row); const singles = sorted.filter((c) => c.cardData.type === 'Single');
        for (let i = 0; i < singles.length; i++) {
            for (let j = i + 1; j < singles.length; j++) {
                const a = singles[i]; const b = singles[j]; const res = checkMerge(a.cardData, b.cardData);
                if (res.valid) {
                    const midX = (a.x + b.x) / 2;
                    await Promise.all([ this.tweenPromise({ targets: a, x: midX, y, duration: 240 }), this.tweenPromise({ targets: b, x: midX, y, duration: 240 }) ]);
                    this.removeCardFromRow(row, a); this.removeCardFromRow(row, b); a.destroy(); b.destroy();
                    const newCard = new Card(this, midX, y, res.cardData, isPlayerCard); newCard.setScale(isPlayerCard ? 0.8 : 0.6); row.push(newCard); playSfx(this, 'sfx_merge');
                    await this.layoutReserveWarRow(row, y, isPlayerCard); await this.wait(160); return true;
                }
            }
        }
        return false;
    }

    async resolveReserveWar() {
        const playerRowY = this.playerReserveY; const enemyRowY = this.enemyReserveY; const center = this.fightCenter;
        let pRow = [...this.getPlayerReserveList()]; let eRow = [...this.enemyReserveCards];

        await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY, true), this.layoutReserveWarRow(eRow, enemyRowY, false) ]);
        let pCanMerge = true; let eCanMerge = true;
        while (pCanMerge || eCanMerge) { pCanMerge = await this.mergeOneLeftPair(pRow, playerRowY, true); eCanMerge = await this.mergeOneLeftPair(eRow, enemyRowY, false); }
        await this.wait(500);

        while (true) {
            pRow = this.sortLeftToRight(pRow); eRow = this.sortLeftToRight(eRow);

            if (pRow.length === 0 && eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'DRAW'; }
            if (pRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'LOSE'; }
            if (eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'WIN'; }

            const pCard = pRow[0]; const eCard = eRow[0];
            playSfx(this, 'sfx_fight'); pCard.setDepth(50); eCard.setDepth(50);

            // Cả 2 phóng lên scale 1 để nện nhau
            await Promise.all([
                this.tweenPromise({ targets: pCard, x: center.x - 60, y: center.y, scale: 1, duration: 200, ease: 'Power2.easeIn' }),
                this.tweenPromise({ targets: eCard, x: center.x + 60, y: center.y, scale: 1, duration: 200, ease: 'Power2.easeIn' })
            ]);

            const result = compareCards(pCard.cardData, eCard.cardData);

            if (result === 'WIN' || result === 'LOSE') {
                const winnerCard = result === 'WIN' ? pCard : eCard; const loserCard = result === 'WIN' ? eCard : pCard;
                winnerCard.setDepth(52); loserCard.setDepth(51);
                await Promise.all([ this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 150 }), this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 150 }) ]);
                await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 100 });
                await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 100 });

                this.cameras.main.shake(150, 0.015); playSfx(this, 'sfx_impact');
                const shards = this.createShatterPieces(loserCard); loserCard.setVisible(false);
                await Promise.all(shards.map(p => this.tweenPromise({ targets: p, x: center.x + Math.cos(Phaser.Math.FloatBetween(0, Math.PI * 2)) * 100, y: center.y + Math.sin(Phaser.Math.FloatBetween(0, Math.PI * 2)) * 100, alpha: 0, duration: 400, onComplete: () => p.destroy() })));
                loserCard.destroy();
                
                // Trả về chỗ cũ, Thu nhỏ lại scale đúng
                if (result === 'WIN') { eRow.shift(); this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: playerRowY, scale: 0.8, duration: 250 }); } 
                else { pRow.shift(); this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: enemyRowY, scale: 0.6, duration: 250 }); }

                await this.wait(250); this.syncPlayerSlotsAfterWar(pRow); return result;
            } else { 
                this.cameras.main.shake(150, 0.012); playSfx(this, 'sfx_crack'); await this.wait(200);
                const pShards = this.createShatterPieces(pCard); const eShards = this.createShatterPieces(eCard); pCard.setVisible(false); eCard.setVisible(false);
                await Promise.all([...pShards, ...eShards].map(p => this.tweenPromise({ targets: p, x: center.x + Math.cos(Phaser.Math.FloatBetween(0, Math.PI * 2)) * 100, y: center.y + Math.sin(Phaser.Math.FloatBetween(0, Math.PI * 2)) * 100, alpha: 0, duration: 400, onComplete: () => p.destroy() })));
                pCard.destroy(); pRow.shift(); eCard.destroy(); eRow.shift();
                await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY, true), this.layoutReserveWarRow(eRow, enemyRowY, false) ]); await this.wait(200);
            }
        }
    }

    showMatchResult(finalWinner) {
        this.matchOver = true;
        const { width, height } = this.scale;
        
        // FIX UI ĐÈ BÀI: Gán Depth cực cao
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(9998);
        const message = finalWinner === 'WIN' ? 'CHIẾN THẮNG!' : finalWinner === 'LOSE' ? 'THẤT BẠI!' : 'HÒA MẠNG!';
        const messageText = this.add.text(width / 2, height * 0.35, message, { fontSize: '48px', color: '#fff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(9999);
        
        const buttonBg = this.add.rectangle(width / 2, height * 0.55, 220, 60, 0xffa500).setDepth(9999).setInteractive({ useHandCursor: true });
        const buttonText = this.add.text(width / 2, height * 0.55, 'CHƠI LẠI', { fontSize: '24px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10000);
        
        // FIX NÚT CHƠI LẠI
        buttonBg.on('pointerdown', () => { 
            buttonBg.destroy(); buttonText.destroy(); messageText.destroy(); overlay.destroy(); 
            this.resetMatch(); 
        });
    }

    resetMatch() {
        this.matchOver = false; this.matchRound = 1; this.currentStage = 1;
        this.playerHealth = 100; this.enemyHealth = 100;
        this.updateHealthUI(); this.startStage();
    }

    finishMatch() {
        this.input.enabled = true; // MỞ KHÓA MÀN HÌNH ĐỂ BẤM CHƠI LẠI ĐƯỢC
        const finalWinner = this.playerHealth > this.enemyHealth ? 'WIN' : this.playerHealth < this.enemyHealth ? 'LOSE' : 'DRAW';
        this.showMatchResult(finalWinner);
        this.fightBtn.disableInteractive();
    }
}