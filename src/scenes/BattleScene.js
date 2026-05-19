import Phaser from 'phaser';
import Card from '../objects/Card';
import { drawFiveCards, checkMerge, compareCards, getWeakSideForPreview } from '../utils/GameLogic';
import { createHelpReferencePanel, discoverDualPairFromFight } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

const RESERVE_SLOT_COUNT = 5;
const ON_CARD_RADIUS = 62;
const SLOT_SNAP_RADIUS = 58;
const MAX_MATCH_ROUNDS = 5;
const START_HEALTH = 100;
const MAX_HEALTH = 100;

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
        this.matchOver = false;
        this.roundText = null;
        this.swapBtn = null;
        this.audioUnlocked = true;
    }

    preload() {
        this.load.on('loaderror', (file) => console.warn('[Asset] Không tải được:', file?.src ?? file));
        this.load.image('icon_swords', 'assets/swords.png');
        preloadBattleAudio(this);
    }

    create(data) {
        if (data?.audioUnlocked) this.audioUnlocked = true;
        const { width, height } = this.scale;

        this.enemyZoneH = height * 0.25; 
        this.arenaZoneH = height * 0.45; 
        this.playerZoneH = height * 0.30;
        this.arenaTopY = this.enemyZoneH;
        this.arenaBottomY = this.enemyZoneH + this.arenaZoneH;

        this.add.rectangle(width/2, this.arenaTopY + this.arenaZoneH/4, width, this.arenaZoneH/2, 0x1a2a6c); 
        this.add.rectangle(width/2, this.arenaBottomY - this.arenaZoneH/4, width, this.arenaZoneH/2, 0x2e4053);
        this.add.line(0, 0, 0, this.arenaTopY, width, this.arenaTopY, 0xffd700).setOrigin(0).setLineWidth(4);
        this.add.line(0, 0, 0, this.arenaBottomY, width, this.arenaBottomY, 0xffd700).setOrigin(0).setLineWidth(4);

        this.enemySprite = this.add.rectangle(width - 120, this.arenaTopY + 100, 100, 130, 0xe74c3c).setStrokeStyle(4, 0x000);
        this.add.text(width - 120, this.arenaTopY + 20, 'BOSS', { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.enemyHpBar = this.createHpBar(width - 120, this.arenaTopY - 10, 100, 12, 0xff0000);

        this.enemyReadyText = this.add.text(width - 120, this.arenaTopY - 40, 'READY!', { fontSize: '24px', color: '#ffcc00', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(50);

        this.playerSprite = this.add.rectangle(140, this.arenaBottomY - 120, 140, 180, 0x3498db).setStrokeStyle(4, 0x000);
        this.add.text(140, this.arenaBottomY - 230, 'PLAYER', { fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.playerHpBar = this.createHpBar(140, this.arenaBottomY - 260, 140, 16, 0x00ff00);

        this.playerReserveStartX = width / 2 - 190;
        this.playerReserveSpacing = 95;
        this.playerReserveY = height * 0.92;
        this.coreX = width / 2;
        this.coreY = height * 0.76; 
        this.coreDropRadius = 88;

        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.enemyReserveCards = [];
        this.playerCoreCard = null;
        this.enemyCoreCard = null;

        this.fightCenter = { x: width / 2, y: this.arenaTopY + (this.arenaZoneH / 2) };

        this.roundText = this.add.text(width / 2, 30, `VÒNG ${this.matchRound}/${this.maxRounds}`, { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
        
        this.slotFrameG = this.add.graphics().setDepth(0);
        this.drawSlotFrames();
        
        this.createSwapButton();

        const helpBtn = this.add.rectangle(40, this.arenaTopY + 40, 44, 44, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setInteractive({ useHandCursor: true }).setDepth(25);
        this.add.text(40, this.arenaTopY + 40, '?', { fontSize: '28px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(26);
        this.helpUi = createHelpReferencePanel(this);
        helpBtn.on('pointerdown', () => this.helpUi.setVisible(!this.helpUi.container.visible));

        this.fightBtn = this.add.circle(width - 50, this.fightCenter.y, 45, 0xffa500).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.executeFight())
            .setStrokeStyle(3, 0xffffff);
        this.fightIcon = this.add.image(width - 50, this.fightCenter.y, 'icon_swords').setDisplaySize(40, 40);

        this.createDrawerUI();
        this.updateHealthUI();
        this.startStage();
    }

    createHpBar(x, y, w, h, color) {
        const bg = this.add.rectangle(x, y, w, h, 0x000000).setOrigin(0.5).setStrokeStyle(2, 0xffffff);
        const fill = this.add.rectangle(x - w/2, y, w, h, color).setOrigin(0, 0.5);
        return { bg, fill, maxW: w };
    }

    updateHealthUI() {
        const pctP = Math.max(0, this.playerHealth / MAX_HEALTH);
        const pctE = Math.max(0, this.enemyHealth / MAX_HEALTH);
        this.tweens.add({ targets: this.playerHpBar.fill, displayWidth: this.playerHpBar.maxW * pctP, duration: 300 });
        this.tweens.add({ targets: this.enemyHpBar.fill, displayWidth: this.enemyHpBar.maxW * pctE, duration: 300 });
        
        if (this.playerHealth <= 0 || this.enemyHealth <= 0) {
            this.finishMatch();
        }
    }

    // FIX 2: Set Depth 100 cho Drawer
    createDrawerUI() {
        const { height } = this.scale;
        this.drawerOpen = false;
        
        const cardWidth = 85; 
        const drawerWidth = (cardWidth * 3) + 40; 
        const startX = -drawerWidth; 
        
        this.drawerCont = this.add.container(startX, this.playerReserveY).setDepth(100); // FIXED DEPTH
        const bg = this.add.rectangle(drawerWidth/2, 0, drawerWidth, 120, 0x2c3e50, 0.95).setStrokeStyle(2, 0xffffff);
        
        for(let i=0; i<3; i++) {
            this.add.rectangle(50 + i*(cardWidth + 10), 0, cardWidth, 100).setStrokeStyle(2, 0xaaaaaa);
        }

        const tab = this.add.rectangle(drawerWidth + 15, 0, 30, 80, 0x34495e).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
        const tabIcon = this.add.text(drawerWidth + 15, 0, '>', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        this.drawerCont.add([bg, tab, tabIcon]);

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
        const { width, height } = this.scale;

        g.lineStyle(2, 0xffffff, 0.85);
        g.strokeCircle(this.coreX, this.coreY, this.coreDropRadius + 8);

        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const pos = this.getPlayerReserveSlotWorldXY(i);
            g.strokeRoundedRect(pos.x - 42, pos.y - 60, 84, 120, 10);
        }

        const enemyY = height * 0.10; 
        const enemyStartX = width / 2 - 180;
        const enemySpacing = 90;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const x = enemyStartX + i * enemySpacing;
            g.strokeRoundedRect(x - 33, enemyY - 46, 66, 92, 8); 
        }
    }

    createSwapButton() {
        const { x, y } = this.getPlayerReserveSlotWorldXY(4); 
        this.swapBtn = this.add.rectangle(x + 70, this.coreY, 40, 40, 0x2a2a3d, 0.95).setStrokeStyle(2, 0xffd700).setInteractive({ useHandCursor: true }).setDepth(20);
        this.add.text(x + 70, this.coreY, '↻', { fontSize: '24px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(21);
        this.swapBtn.on('pointerdown', () => this.trySwapReserve());
    }

    trySwapReserve() {
        if (this.matchOver || this.playerHealth <= 10) return; 
        if (!this.playerReserveSlots.some((card) => card?.active)) return;
        this.playerHealth -= 10;
        this.updateHealthUI();
        this.animateReserveSwap();
    }

    async animateReserveSwap() {
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const card = this.playerReserveSlots[i];
            if (card?.active) card.destroy();
            this.playerReserveSlots[i] = null;
        }

        const newReserve = drawFiveCards();
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            const card = new Card(this, x, y - 200, newReserve[i], true);
            card.setDepth(10 + i);
            card.setScale(0.85); 
            this.playerReserveSlots[i] = card;
            this.tweens.add({ targets: card, x, y, duration: 320, ease: 'Sine.easeOut' });
        }
    }

    startStage() {
        this.fightBtn.disableInteractive();
        this.fightIcon.setAlpha(0.5);
        this.matchOver = false;
        this.roundText?.setText(`VÒNG ${this.matchRound}/${this.maxRounds}`);

        [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.playerCoreCard = null; this.enemyCoreCard = null;

        const playerDeck = drawFiveCards(); const enemyDeck = drawFiveCards();
        const { width, height } = this.scale;
        
        const enemyStartX = width / 2 - 180; const enemySpacing = 90;
        this.enemyReserveCards = enemyDeck.map((data, i) => {
            let c = new Card(this, enemyStartX + i * enemySpacing, height * 0.10, data, false);
            c.setScale(0.65);
            c.setDepth(1+i);
            return c;
        });
        
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            this.playerReserveSlots[i] = new Card(this, x, y, playerDeck[i], true);
            this.playerReserveSlots[i].setScale(0.85);
            this.playerReserveSlots[i].setDepth(10+i);
        }

        this.layoutPlayerReserveSlots(0);
        this.time.delayedCall(400, () => this.refreshCombatPreview());
        this.time.delayedCall(1000, () => this.playAITurn());
    }

    // FIX 3: Sửa logic AI ghép bài (matchRound >= 2 thay vì currentStage)
    playAITurn() {
        const { width, height } = this.scale;
        const enemyCoreY = this.arenaTopY - 40; 

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
                        newDual.setScale(0.65);

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
        this.fightBtn.setInteractive();
        this.fightIcon.setAlpha(1);
        
        this.enemyReadyText.setVisible(true);
        this.enemyReadyText.setAlpha(1);
        this.enemyReadyText.setY(this.arenaTopY - 40);
        this.tweens.add({
            targets: this.enemyReadyText, y: this.arenaTopY - 70, alpha: 0,
            duration: 1200, ease: 'Power1',
            onComplete: () => this.enemyReadyText.setVisible(false)
        });
    }

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
            this.tweens.add({ targets: c, x: tx, y: ty, scale: 0.85, duration, ease: 'Sine.easeOut' });
        }
    }
    
    clearSlotForCard(card) { const i = this.getReserveSlotIndexOfCard(card); if (i >= 0) this.playerReserveSlots[i] = null; }
    
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
                    targets: card, x: this.coreX, y: this.coreY, scale: 0.85, duration, ease: 'Sine.easeOut',
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
                this.clearSlotForCard(bestTarget);
                this.playerReserveSlots[targetSlot] = draggedCard;
                this.playerCoreCard = bestTarget;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: bestTarget, x: z.x, y: z.y, scale: 0.85, duration: 220, ease: 'Sine.easeOut', onComplete: () => { bestTarget.originalPos = { x: z.x, y: z.y }; } });
                playSfx(this, 'sfx_swap');
                done = true;
            } else if (targetIsCore && draggedSlot >= 0) {
                this.playerReserveSlots[draggedSlot] = bestTarget;
                this.playerCoreCard = draggedCard;
                this.layoutPlayerReserveSlots();
                this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, scale: 0.85, duration: 220, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
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
            this.tweens.add({ targets: draggedCard, x: z.x, y: z.y, scale: 0.85, duration: 260, ease: 'Sine.easeOut', onComplete: () => { draggedCard.originalPos = { x: z.x, y: z.y }; } });
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

        if (!done) { 
            this.tweens.add({ targets: draggedCard, x: draggedCard.originalPos.x, y: draggedCard.originalPos.y, scale: 0.85, duration: 200, ease: 'Back.easeOut' });
        }

        this.time.delayedCall(400, () => {
            this.ensurePlayerCoreFilled();
            this.refreshCombatPreview();
        });
    }

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
        playerCard.setDepth(20);
        enemyCard.setDepth(20);

        return Promise.all([
            this.tweenPromise({ targets: playerCard, x: center.x - 60, y: center.y, scale: 0.8, duration: 350, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: enemyCard, x: center.x + 60, y: center.y, scale: 0.8, duration: 350, ease: 'Power2.easeIn' })
        ]);
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
            this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 220, ease: 'Power2.easeIn' }),
            this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 220, ease: 'Power2.easeIn' })
        ]);

        await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 180, ease: 'Power2.easeOut' });
        await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 120, ease: 'Quad.easeIn' });

        const shards = this.createShatterPieces(loserCard);
        loserCard.setVisible(false);
        this.cameras.main.shake(200, 0.018);
        playSfx(this, 'sfx_impact', { volume: 0.8 });

        await Promise.all(shards.map((piece) => {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.Between(80, 140);
            return this.tweenPromise({
                targets: piece, x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance,
                alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI),
                duration: 650, ease: 'Cubic.easeOut', onComplete: () => piece.destroy()
            });
        }));
        await this.wait(200);
    }

    applyRoundOutcome(result) {
        if (result === 'THẮNG') {
            this.enemyHealth = Math.max(0, this.enemyHealth - 25);
            this.playHitAnim(false); 
        } else if (result === 'THUA') {
            this.playerHealth = Math.max(0, this.playerHealth - 25);
            this.playHitAnim(true); 
        } else if (result === 'HÒA') {
            this.enemyHealth = Math.max(0, this.enemyHealth - 25);
            this.playerHealth = Math.max(0, this.playerHealth - 25);
            this.playHitAnim(false); 
            this.playHitAnim(true); 
        }
        this.updateHealthUI();
    }

    async executeFight() {
        this.fightBtn.disableInteractive();
        this.input.enabled = false; // KHÓA INPUT TOÀN CỤC
        playSfx(this, 'sfx_fight', { volume: 0.55 });
        
        if (!this.playerCoreCard) this.ensurePlayerCoreFilled(0);

        this.playAttackAnim(true);
        this.time.delayedCall(150, () => this.playAttackAnim(false));

        const waitScreen = this.add.rectangle(this.scale.width / 2, this.fightCenter.y, this.scale.width, 160, 0x000000, 0.75).setDepth(10);
        const clashText = this.add.text(this.scale.width / 2, this.fightCenter.y, 'CHIẾN ĐẤU...', { fontSize: '28px', color: '#ffcc00', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);

        this.tweens.add({ targets: clashText, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });

        const pCard = this.playerCoreCard;
        const eCard = this.enemyCoreCard;

        if (pCard.cardData.type === 'Dual' && eCard.cardData.type === 'Dual') {
            this.notifyDualDiscovery(pCard.cardData.name, eCard.cardData.name);
        }

        const finalResult = compareCards(pCard.cardData, eCard.cardData);

        await this.animateFightOrbit(pCard, eCard);

        if (finalResult === 'HÒA') {
            this.cameras.main.shake(150, 0.012);
            playSfx(this, 'sfx_crack', { volume: 0.6 });
            await this.wait(400);

            const pShards = this.createShatterPieces(pCard);
            const eShards = this.createShatterPieces(eCard);
            pCard.setVisible(false); eCard.setVisible(false);

            const center = this.fightCenter;
            await Promise.all([...pShards, ...eShards].map(piece => {
                const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(60, 120);
                return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 600, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
            }));
            pCard.destroy(); eCard.destroy();
        } else {
            const winnerCard = finalResult === 'THẮNG' ? pCard : eCard;
            const loserCard = finalResult === 'THẮNG' ? eCard : pCard;
            await this.animateFightImpact(winnerCard, loserCard);
        }

        clashText.setText(`KẾT QUẢ: ${finalResult}!`);
        this.tweens.killTweensOf(clashText);
        clashText.setAlpha(1);

        if (finalResult === 'THẮNG' || finalResult === 'THUA') {
            this.applyRoundOutcome(finalResult);
            playSfx(this, finalResult === 'THẮNG' ? 'sfx_win' : 'sfx_lose');
        }

        if (finalResult === 'HÒA') {
            waitScreen.destroy(); clashText.setDepth(100);
            this.time.delayedCall(800, () => {
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
                        this.matchRound++;
                        // NẾU HẾT VÒNG HOẶC CHẾT -> GỌI KẾT THÚC (MỞ KHÓA Ở TRONG ĐÓ)
                        if (this.matchRound > this.maxRounds || this.playerHealth <= 0 || this.enemyHealth <= 0) { 
                            this.finishMatch(); 
                        } else { 
                            this.input.enabled = true; // MỞ KHÓA INPUT CHO VÒNG MỚI
                            this.startStage(); 
                        }
                    });
                });
            });
            return;
        }

        this.time.delayedCall(2000, () => {
            waitScreen.destroy(); clashText.destroy(); 
            this.matchRound++;
            if (this.matchRound > this.maxRounds || this.playerHealth <= 0 || this.enemyHealth <= 0) { 
                this.finishMatch(); 
            } else { 
                this.input.enabled = true; 
                this.startStage(); 
            }
        });
    }

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
        const m = this.reserveWarSpeedMult || 1;
        const dur = Math.round(220 / m);
        const alive = this.sortLeftToRight(row);
        if (alive.length === 0) return;
        
        const spacing = isPlayerRow ? 95 : 90;
        const startX = this.scale.width / 2 - ((alive.length - 1) * spacing) / 2;
        
        const tweens = alive.map((c, i) => {
            const tx = startX + i * spacing;
            c.originalPos = { x: tx, y };
            return this.tweenPromise({ targets: c, x: tx, y, scale: isPlayerRow ? 0.85 : 0.65, duration: dur, ease: 'Sine.easeOut' });
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
                    newCard.setScale(isPlayerCard ? 0.85 : 0.65);
                    row.push(newCard); playSfx(this, 'sfx_merge', { volume: 0.4 });
                    await this.layoutReserveWarRow(row, y, isPlayerCard); await this.wait(Math.round(160 / m)); return true;
                }
            }
        }
        return false;
    }

    async resolveReserveWar() {
        const playerRowY = this.playerReserveY; 
        const enemyRowY = this.scale.height * 0.10;
        const center = this.fightCenter;

        let pRow = [...this.getPlayerReserveList()];
        let eRow = [...this.enemyReserveCards];

        await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY, true), this.layoutReserveWarRow(eRow, enemyRowY, false) ]);
        let pCanMerge = true; let eCanMerge = true;
        while (pCanMerge || eCanMerge) { pCanMerge = await this.mergeOneLeftPair(pRow, playerRowY, true); eCanMerge = await this.mergeOneLeftPair(eRow, enemyRowY, false); }
        await this.wait(500);

        while (true) {
            pRow = this.sortLeftToRight(pRow); eRow = this.sortLeftToRight(eRow);

            if (pRow.length === 0 && eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'HÒA'; }
            if (pRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'THUA'; }
            if (eRow.length === 0) { this.syncPlayerSlotsAfterWar(pRow); return 'THẮNG'; }

            const pCard = pRow[0]; const eCard = eRow[0];
            const spd = this.reserveWarSpeedMult || 2;

            playSfx(this, 'sfx_fight', { volume: 0.55 });
            pCard.setDepth(20); eCard.setDepth(20);

            await Promise.all([
                this.tweenPromise({ targets: pCard, x: center.x - 60, y: center.y, scale: 0.8, duration: 350 / spd, ease: 'Power2.easeIn' }),
                this.tweenPromise({ targets: eCard, x: center.x + 60, y: center.y, scale: 0.8, duration: 350 / spd, ease: 'Power2.easeIn' })
            ]);

            const result = compareCards(pCard.cardData, eCard.cardData);

            if (result === 'THẮNG' || result === 'THUA') {
                const winnerCard = result === 'THẮNG' ? pCard : eCard;
                const loserCard = result === 'THẮNG' ? eCard : pCard;

                winnerCard.setDepth(22); loserCard.setDepth(21);
                await Promise.all([
                    this.tweenPromise({ targets: winnerCard, x: center.x - 40, y: center.y, duration: 220 / spd, ease: 'Power2.easeIn' }),
                    this.tweenPromise({ targets: loserCard, x: center.x + 40, y: center.y, duration: 220 / spd, ease: 'Power2.easeIn' })
                ]);
                await this.tweenPromise({ targets: winnerCard, x: center.x, y: center.y - 30, duration: 180 / spd, ease: 'Power2.easeOut' });
                await this.tweenPromise({ targets: winnerCard, y: center.y + 12, duration: 120 / spd, ease: 'Quad.easeIn' });

                this.cameras.main.shake(150, 0.015);
                playSfx(this, 'sfx_impact', { volume: 0.8 });

                const shards = this.createShatterPieces(loserCard);
                loserCard.setVisible(false);
                await Promise.all(shards.map(piece => {
                    const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(80, 140);
                    return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 650 / spd, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
                }));
                loserCard.destroy();
                
                if (result === 'THẮNG') { eRow.shift(); this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: playerRowY, scale: 0.85, duration: 300 / spd }); } 
                else { pRow.shift(); this.tweens.add({ targets: winnerCard, x: winnerCard.originalPos.x, y: enemyRowY, scale: 0.65, duration: 300 / spd }); }

                await this.wait(300 / spd);
                this.syncPlayerSlotsAfterWar(pRow);
                return result;

            } else { 
                this.cameras.main.shake(150, 0.012); playSfx(this, 'sfx_crack', { volume: 0.6 });
                await this.wait(200 / spd);

                const pShards = this.createShatterPieces(pCard); const eShards = this.createShatterPieces(eCard);
                pCard.setVisible(false); eCard.setVisible(false);

                await Promise.all([...pShards, ...eShards].map(piece => {
                    const a = Phaser.Math.FloatBetween(0, Math.PI * 2); const d = Phaser.Math.Between(60, 120);
                    return this.tweenPromise({ targets: piece, x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, alpha: 0, rotation: Phaser.Math.FloatBetween(-Math.PI, Math.PI), duration: 600 / spd, ease: 'Cubic.easeOut', onComplete: () => piece.destroy() });
                }));

                pCard.destroy(); pRow.shift(); eCard.destroy(); eRow.shift();
                await Promise.all([ this.layoutReserveWarRow(pRow, playerRowY, true), this.layoutReserveWarRow(eRow, enemyRowY, false) ]);
                await this.wait(200 / spd);
            }
        }
    }

    // FIX 4: Set Depth 9999 cho UI Chiến thắng
    showMatchResult(finalWinner) {
        this.matchOver = true;
        const { width, height } = this.scale;
        
        // Background mờ đè lên toàn bộ sân khấu
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setDepth(9998);
        
        const message = finalWinner === 'THẮNG' ? 'CHIẾN THẮNG!' : finalWinner === 'THUA' ? 'THẤT BẠI!' : 'HÒA MẠNG!';
        const messageText = this.add.text(width / 2, height * 0.35, message, { fontSize: '48px', color: '#fff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(9999);
        
        const buttonBg = this.add.rectangle(width / 2, height * 0.55, 220, 60, 0xffa500).setDepth(9999).setInteractive({ useHandCursor: true });
        const buttonText = this.add.text(width / 2, height * 0.55, 'CHƠI LẠI', { fontSize: '24px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10000);
        
        // Nút restart
        buttonBg.on('pointerdown', () => { 
            buttonBg.destroy(); buttonText.destroy(); messageText.destroy(); overlay.destroy(); 
            this.resetMatch(); 
        });
        
        this.matchResultContainer = [overlay, messageText, buttonBg, buttonText];
    }

    resetMatch() {
        this.matchOver = false; this.matchRound = 1; this.currentStage = 1;
        this.playerHealth = START_HEALTH; this.enemyHealth = START_HEALTH;
        this.updateHealthUI(); this.startStage();
    }

    // FIX 5: MỞ KHÓA INPUT TẠI ĐÂY
    finishMatch() {
        this.input.enabled = true; // MỞ KHÓA GLOBAL INPUT ĐỂ BẤM ĐƯỢC NÚT CHƠI LẠI
        const finalWinner = this.playerHealth > this.enemyHealth ? 'THẮNG' : this.playerHealth < this.enemyHealth ? 'THUA' : 'HÒA';
        if (finalWinner === 'THẮNG') playSfx(this, 'sfx_win');
        if (finalWinner === 'THUA') playSfx(this, 'sfx_lose');
        this.showMatchResult(finalWinner);
        this.fightBtn.disableInteractive(); this.setSwapButtonState(false);
    }
}