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
        this.currentStage = 1;
        this.reserveWarSpeedMult = 1;
        
        // HP giả lập cho bản hiển thị
        this.playerHp = 100;
        this.enemyHp = 100;
    }

    preload() {
        this.load.on('loaderror', (file) => {
            console.warn('[Audio] Không tải được:', file?.src ?? file);
        });
        preloadBattleAudio(this);
    }

    create() {
        const { width, height } = this.scale;

        // ==========================================
        // 1. TÍNH TOÁN TỈ LỆ KHU VỰC (ZONES)
        // ==========================================
        const enemyZoneH = height * 0.15; // 15% Top
        const arenaZoneH = height * 0.55; // 55% Middle

        const arenaTopY = enemyZoneH;
        const arenaBottomY = enemyZoneH + arenaZoneH;

        // ==========================================
        // 2. VẼ SÂN KHẤU CHIẾN ĐẤU (55% MID)
        // ==========================================
        // Background Trời và Đất
        this.add.rectangle(width/2, arenaTopY + arenaZoneH/4, width, arenaZoneH/2, 0x1a2a6c); 
        this.add.rectangle(width/2, arenaBottomY - arenaZoneH/4, width, arenaZoneH/2, 0x2e4053);
        
        // Viền kẻ vàng
        this.add.line(0, 0, 0, arenaTopY, width, arenaTopY, 0xffd700).setOrigin(0).setLineWidth(4);
        this.add.line(0, 0, 0, arenaBottomY, width, arenaBottomY, 0xffd700).setOrigin(0).setLineWidth(4);

        // --- ENEMY SPRITE & HP BAR ---
        this.enemySprite = this.add.rectangle(width - 120, arenaTopY + 120, 100, 130, 0xe74c3c).setStrokeStyle(4, 0x000);
        this.add.text(width - 120, arenaTopY + 40, 'BOSS', { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.enemyHpBar = this.createHpBar(width - 120, arenaTopY + 70, 100, 12, 0xff0000);

        // --- PLAYER SPRITE & HP BAR ---
        this.playerSprite = this.add.rectangle(140, arenaBottomY - 140, 140, 180, 0x3498db).setStrokeStyle(4, 0x000);
        this.add.text(140, arenaBottomY - 250, 'PLAYER', { fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.playerHpBar = this.createHpBar(140, arenaBottomY - 220, 140, 16, 0x00ff00);

        // --- NÚT HELP UI ---
        const helpBtn = this.add.rectangle(40, arenaTopY + 40, 44, 44, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setInteractive({ useHandCursor: true }).setDepth(25);
        this.add.text(40, arenaTopY + 40, '?', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(26);
        this.helpUi = createHelpReferencePanel(this);
        helpBtn.on('pointerdown', () => this.helpUi.setVisible(!this.helpUi.container.visible));

        // --- NÚT FIGHT HÌNH TRÒN ---
        const fightY = arenaTopY + (arenaZoneH / 2);
        this.fightBtn = this.add.circle(width - 50, fightY, 45, 0xffa500).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.executeFight())
            .setStrokeStyle(3, 0xffffff);
        this.fightText = this.add.text(width - 50, fightY, 'FIGHT', { fontSize: '20px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);

        // ==========================================
        // 3. THIẾT LẬP TỌA ĐỘ SLOT BÀI
        // ==========================================
        this.playerReserveStartX = width / 2 - 190;
        this.playerReserveSpacing = 95;
        this.playerReserveY = height * 0.90;

        this.coreX = width / 2;
        this.coreY = height * 0.77; 
        this.coreDropRadius = 88;

        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;

        // ==========================================
        // 4. GỌI NGĂN KÉO VÀ CHẠY GAME
        // ==========================================
        this.createDrawerUI();
        
        // Nếu không lỗi ở Drawer, Game sẽ chạy hàm này và đẻ ra Bài
        this.startStage(); 
    }

    // --- HÀM TẠO THANH MÁU ---
    createHpBar(x, y, w, h, color) {
        const bg = this.add.rectangle(x, y, w, h, 0x000000).setStrokeStyle(2, 0xffffff);
        const fill = this.add.rectangle(x - w/2, y, w, h, color).setOrigin(0, 0.5);
        return { bg, fill, maxW: w };
    }

    updateHpBar(bar, currentHp, maxHp) {
        const pct = Math.max(0, currentHp / maxHp);
        this.tweens.add({ targets: bar.fill, displayWidth: bar.maxW * pct, duration: 300, ease: 'Power2' });
    }

    // --- HÀM TẠO NGĂN KÉO (SỬA LỖI CRASH Ở ĐÂY) ---
    createDrawerUI() {
        const { height } = this.scale;
        this.drawerOpen = false;
        
        // Đặt container thụt vào lề trái (X = -200)
        this.drawerCont = this.add.container(-200, height * 0.88).setDepth(20);
        
        // Nền ngăn kéo
        const bg = this.add.rectangle(100, 0, 200, 100, 0x2c3e50, 0.95).setStrokeStyle(2, 0xffffff);
        
        // Tạo 3 ô trống bằng vòng lặp (Bỏ hàm lỗi setIsStroked)
        for(let i=0; i<3; i++) {
            this.add.rectangle(40 + i*60, 0, 50, 70).setStrokeStyle(2, 0xaaaaaa);
        }

        // Tab kéo (Lòi ra khỏi lề ở X = 215)
        const tab = this.add.rectangle(215, 0, 30, 80, 0x34495e).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
        const tabIcon = this.add.text(215, 0, '>', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        this.drawerCont.add([bg, tab, tabIcon]);

        tab.on('pointerdown', () => {
            this.drawerOpen = !this.drawerOpen;
            this.tweens.add({
                targets: this.drawerCont,
                x: this.drawerOpen ? 0 : -200,
                duration: 300,
                ease: 'Back.easeOut'
            });
            tabIcon.setText(this.drawerOpen ? '<' : '>');
        });
    }

    // --- HÀM TẠO ANIMATION NHÂN VẬT ---
    playHitAnim(isPlayer) {
        const target = isPlayer ? this.playerSprite : this.enemySprite;
        this.tweens.add({ targets: target, x: target.x + (isPlayer ? -10 : 10), duration: 50, yoyo: true, repeat: 3 });
    }

    playAttackAnim(isPlayer) {
        const target = isPlayer ? this.playerSprite : this.enemySprite;
        this.tweens.add({ targets: target, y: target.y - 30, scale: 1.1, duration: 150, yoyo: true, ease: 'Power2' });
    }

    // ==========================================
    // LOGIC SPAWN BÀI & DRAG DROP
    // ==========================================

    getCoreZone() { return { x: this.coreX, y: this.coreY, r: this.coreDropRadius }; }
    getPlayerReserveSlotWorldXY(slotIndex) { return { x: this.playerReserveStartX + slotIndex * this.playerReserveSpacing, y: this.playerReserveY }; }
    getPlayerReserveList() { return this.playerReserveSlots.filter((c) => c != null && c.active); }
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

    startStage() {
        this.enemyReadyText.setVisible(false);
        this.fightBtn.disableInteractive();
        this.fightBtn.fillColor = 0x555555;

        [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.playerCoreCard = null; this.enemyCoreCard = null;

        const playerDeck = drawFiveCards(); const enemyDeck = drawFiveCards();
        const { width, height } = this.scale;
        
        // BÀI ĐỊCH - SIZE NHỎ (0.55)
        const enemyStartX = width / 2 - 160; const enemySpacing = 80;
        this.enemyReserveCards = enemyDeck.map((data, i) => {
            let c = new Card(this, enemyStartX + i * enemySpacing, height * 0.07, data, false);
            c.setScale(0.55);
            return c;
        });
        // Căn lại vị trí thẻ đích đúng 0.07 (Top)
        this.reorderEnemyReserveNoAdjacentSame(enemyStartX, enemySpacing, height * 0.07);

        // BÀI PLAYER - SIZE VỪA (0.85)
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            this.playerReserveSlots[i] = new Card(this, x, y, playerDeck[i], true);
            this.playerReserveSlots[i].setScale(0.85);
        }

        const randomCoreIdx = Phaser.Math.Between(0, RESERVE_SLOT_COUNT - 1);
        const coreCard = this.playerReserveSlots[randomCoreIdx];
        const coreData = coreCard.cardData;
        coreCard.destroy();
        this.playerReserveSlots[randomCoreIdx] = null;
        
        this.playerCoreCard = new Card(this, this.coreX, this.coreY, coreData, true);
        this.playerCoreCard.setScale(0.85);

        this.layoutPlayerReserveSlots(0);
        this.time.delayedCall(400, () => this.refreshCombatPreview());
        this.time.delayedCall(1000, () => this.playAITurn());
    }

    playAITurn() {
        const { width, height } = this.scale;
        const enemyCoreY = height * 0.22; // Core địch nằm ở mép trên sân khấu

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
                        newDual.setScale(0.55);

                        this.time.delayedCall(500, () => {
                            this.tweens.add({
                                targets: newDual, x: width / 2, y: enemyCoreY, duration: 500,
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
            targets: chosenCard, x: width / 2, y: enemyCoreY, duration: 800,
            onComplete: () => {
                this.enemyCoreCard = chosenCard;
                this.enemyReady();
                this.refreshCombatPreview();
            }
        });
    }

    enemyReady() {
        this.enemyReadyText.setVisible(true);
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
                newCard.setScale(0.85); // Đảm bảo lá bài mới sinh ra có size đúng
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
            this.clearSlotForCard(draggedCard);
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

        this.time.delayedCall(280, () => {
            this.ensurePlayerCoreFilled();
            this.refreshCombatPreview();
        });
    }

    executeFight() {
        this.fightBtn.disableInteractive();
        this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });
        
        // Diễn hoạt ảnh Tấn công
        this.playAttackAnim(true);
        this.time.delayedCall(150, () => this.playAttackAnim(false));

        const waitScreen = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.8).setDepth(10);
        const clashText = this.add.text(this.scale.width / 2, this.scale.height / 2, 'CLASHING...\nCALCULATING ELEMENTS', {
            fontSize: '36px', color: '#ffcc00', align: 'center', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);

        this.tweens.add({ targets: clashText, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });

        const finalResult = compareCards(this.playerCoreCard.cardData, this.enemyCoreCard.cardData);

        if (this.playerCoreCard?.cardData?.type === 'Dual' && this.enemyCoreCard?.cardData?.type === 'Dual') {
            this.notifyDualDiscovery(this.playerCoreCard.cardData.name, this.enemyCoreCard.cardData.name);
        }

        this.time.delayedCall(3000, () => {
            clashText.setText(`RESULT: ${finalResult}!`);
            this.tweens.killTweensOf(clashText);
            clashText.setAlpha(1);

            // Giả lập trừ máu & Hoạt ảnh Hit
            if (finalResult === 'WIN') { 
                playSfx(this, 'sfx_win'); 
                this.playHitAnim(false); 
                this.enemyHp -= 20; 
                this.updateHpBar(this.enemyHpBar, this.enemyHp, 100); 
            }
            if (finalResult === 'LOSE') { 
                playSfx(this, 'sfx_lose'); 
                this.playHitAnim(true); 
                this.playerHp -= 20;
                this.updateHpBar(this.playerHpBar, this.playerHp, 100);
            }

            if (finalResult === 'DRAW') {
                waitScreen.destroy();
                clashText.setDepth(100);
                this.time.delayedCall(800, () => {
                    clashText.setText('DRAW!\nTÀN CUỘC...');
                    this.reserveWarSpeedMult = 2.85;
                    this.resolveReserveWar().then((final) => {
                        this.reserveWarSpeedMult = 1;
                        clashText.setText(`FINAL: ${final}!`);
                        
                        if (final === 'WIN') { playSfx(this, 'sfx_win'); this.playHitAnim(false); this.updateHpBar(this.enemyHpBar, 50, 100); }
                        if (final === 'LOSE') { playSfx(this, 'sfx_lose'); this.playHitAnim(true); this.updateHpBar(this.playerHpBar, 50, 100); }

                        this.time.delayedCall(1600, () => {
                            clashText.destroy();
                            this.input.enabled = true;
                            if (final === 'WIN') this.currentStage++;
                            this.startStage();
                        });
                    });
                });
                return;
            }

            this.time.delayedCall(2000, () => {
                waitScreen.destroy(); clashText.destroy(); this.input.enabled = true;
                if (finalResult === 'WIN') this.currentStage++;
                this.startStage();
            });
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

    async layoutReserveWarRow(row, y) {
        const m = this.reserveWarSpeedMult || 1;
        const dur = Math.round(220 / m);
        const alive = this.sortLeftToRight(row);
        if (alive.length === 0) return;
        const spacing = 110;
        const startX = this.scale.width / 2 - ((alive.length - 1) * spacing) / 2;
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
                    this.removeCardFromRow(row, a); this.removeCardFromRow(row, b);
                    a.destroy(); b.destroy();
                    const newCard = new Card(this, midX, y, res.cardData, isPlayerCard);
                    newCard.setScale(isPlayerCard ? 0.85 : 0.55);
                    row.push(newCard); playSfx(this, 'sfx_merge', { volume: 0.4 });
                    await this.layoutReserveWarRow(row, y); await this.wait(Math.round(160 / m)); return true;
                }
            }
        }
        return false;
    }

    async resolveReserveWar() {
        const playerRowY = this.playerReserveY; const enemyRowY = this.scale.height * 0.07;
        let pRow = [...this.getPlayerReserveList()]; let eRow = [...this.enemyReserveCards];

        await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY), this.layoutReserveWarRow(eRow, enemyRowY) ]);
        let pCanMerge = true; let eCanMerge = true;
        while (pCanMerge || eCanMerge) { pCanMerge = await this.mergeOneLeftPair(pRow, playerRowY, true); eCanMerge = await this.mergeOneLeftPair(eRow, enemyRowY, false); }
        await this.wait(500);

        while (true) {
            pRow = this.sortLeftToRight(pRow); eRow = this.sortLeftToRight(eRow);
            if (pRow.length === 0 && eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'DRAW'; }
            if (pRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'LOSE'; }
            if (eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'WIN'; }

            const pCard = pRow[0]; const eCard = eRow[0];
            await Promise.all([ this.tweenPromise({ targets: pCard, y: playerRowY - 50, duration: 200 }), this.tweenPromise({ targets: eCard, y: enemyRowY + 50, duration: 200 }) ]);
            if (pCard.cardData.type === 'Dual' && eCard.cardData.type === 'Dual') this.notifyDualDiscovery(pCard.cardData.name, eCard.cardData.name);

            const result = compareCards(pCard.cardData, eCard.cardData);
            if (result === 'WIN') {
                this.tweens.add({ targets: pCard, y: playerRowY, duration: 200 }); eCard.destroy(); eRow.shift(); playSfx(this, 'sfx_fight');
                await this.wait(300); this.syncPlayerSlotsAfterWar(pRow); return 'WIN';
            } else if (result === 'LOSE') {
                this.tweens.add({ targets: eCard, y: enemyRowY, duration: 200 }); pCard.destroy(); pRow.shift(); playSfx(this, 'sfx_fight');
                await this.wait(300); this.syncPlayerSlotsAfterWar(pRow); return 'LOSE';
            } else {
                pCard.destroy(); pRow.shift(); eCard.destroy(); eRow.shift(); playSfx(this, 'sfx_crack');
                await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY), this.layoutReserveWarRow(eRow, enemyRowY) ]);
                await this.wait(300);
            }
        }
    }
}