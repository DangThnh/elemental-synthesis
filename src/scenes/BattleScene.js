import Phaser from 'phaser';
import Card from '../objects/Card';
import PoolSystem from '../systems/PoolSystem';
import AISystem from '../systems/AISystem';
import BossSkillEngine from '../systems/BossSkillEngine';
import DataManager from '../managers/DataManager';
import ConditionSystem from '../systems/ConditionSystem';
import TutorialSystem from '../systems/TutorialSystem';

import { checkMerge, compareCards, getWeakSideForPreview } from '../utils/GameLogic'; // Bỏ drawFiveCards
import { createHelpReferencePanel, discoverDualPairFromFight } from '../ui/HelpReferencePanel';
import { preloadBattleAudio, playSfx } from '../audio/GameAudio';

// --- IMPORT CÁC SYSTEM MỚI ---
//import PoolSystem from '../systems/PoolSystem';
//import AISystem from '../systems/AISystem';

const RESERVE_SLOT_COUNT = 5;
const ON_CARD_RADIUS = 62;
const SLOT_SNAP_RADIUS = 58;
const MAX_MATCH_ROUNDS = 5;
const START_HEALTH = 100;
const MAX_HEALTH = 100;

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
        
        this.logic = { checkMerge };
        this.currentStage = 1;
        this.matchRound = 1;
        this.maxRounds = MAX_MATCH_ROUNDS;
        this.playerHealth = 100;
        //this.enemyHealth = START_HEALTH;
         this.enemyHealth = 100;
        this.enemyMaxHealth = 100;

        this.bossHeatValue = 0;

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

    init() {
        // Reset toàn bộ biến giao diện về null/rỗng để tránh lỗi "sys" của đối tượng cũ
        this.swapBtn = null;
        this.playerHealthBarBg = null;
        this.playerHealthBarFill = null;
        this.enemyHealthBarBg = null;
        this.enemyHealthBarFill = null;
        this.playerHeartIcons = [];
        this.enemyHeartIcons = [];
        this.slotFrameG = null;
        this.matchResultContainer = null;
        this.woodShieldGraphic = null;

        this.isTutorialMode = false; 

        // Reset lại điểm số mặc định
        this.playerHealth = START_HEALTH;
        this.enemyHealth = START_HEALTH;
        this.matchOver = false;
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

         if (data?.runTutorial === 1) {
            this.isTutorialMode = true;
            this.audioUnlocked = true;
        }

        const currentStageData = DataManager.getStageData(this.currentStage);
        const enemyData = currentStageData ? currentStageData.enemy : { name: "UNKNOWN", hp: 100, color: 0xe74c3c };
        this.currentStageData = currentStageData;
        this.currentEnemyData = currentStageData ? currentStageData.enemy : null;
        this.enemyMaxHealth = enemyData.hp;
        this.enemyHealth = enemyData.hp;

        if (data?.audioUnlocked) this.audioUnlocked = true;
        if (this.audioUnlocked) { this.initializeGame(width, height, enemyData); return; }
        this.createStartScreen();
    }

   createStartScreen() {
        const { width, height } = this.scale;

        // Background tối màu
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e, 0.9);

        // Title chính
        this.add.text(width / 2, height * 0.18, 'ELEMENTAL SYNTHESIS', { fontSize: '44px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(width / 2, height * 0.25, 'Ngũ Hành Tương Sinh Tương Khắc', { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);

        // Lời khuyên/Hướng dẫn
        const instructions = ['🔊 Nhấn để kích hoạt âm thanh', '⚔️ Chiến đấu với các nguyên tố ngũ hành', '💡 Nhấn "?" để xem bảng tra cứu'];
        instructions.forEach((text, index) => {
            this.add.text(width / 2, height * 0.33 + index * 36, text, { fontSize: '20px', color: '#cccccc' }).setOrigin(0.5);
        });

        // NÚT 1: HƯỚNG DẪN (Đẩy lên Y: 0.52)
      const tutorialBtn = this.add.rectangle(width / 2, height * 0.52, 320, 60, 0x2a6e2a).setStrokeStyle(3, 0x66ff66).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { 
                this.unlockAudio(); 
                // Thay vì chuyển sang TutorialScene, ta restart chính BattleScene và truyền cờ khởi động hướng dẫn
                this.scene.restart({ audioUnlocked: true, runTutorial: 1 }); 
            });

        this.add.text(width / 2, height * 0.52, 'HƯỚNG DẪN', { fontSize: '26px', color: '#aaffaa', fontStyle: 'bold' }).setOrigin(0.5);

        // NÚT 2 (MỚI): CHỌN MÀN CHƠI (Y: 0.65)
        const stageSelectBtn = this.add.rectangle(width / 2, height * 0.65, 320, 60, 0x2e86de).setStrokeStyle(3, 0x54a0ff).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.showStageSelectPanel(); });
        this.add.text(width / 2, height * 0.65, 'CHỌN MÀN CHƠI', { fontSize: '26px', color: '#81ecec', fontStyle: 'bold' }).setOrigin(0.5);

        // NÚT 3: BẮT ĐẦU CHƠI NGAY (Y: 0.78)
        const startBtn = this.add.rectangle(width / 2, height * 0.78, 320, 60, 0xffa500).setStrokeStyle(3, 0xffdd44).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.unlockAudio(); this.scene.restart({ audioUnlocked: true }); });
        this.add.text(width / 2, height * 0.78, 'BẮT ĐẦU', { fontSize: '26px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    }

    showStageSelectPanel() {
        const { width, height } = this.scale;
        
        // Tạo container bọc toàn bộ Panel chọn màn
        const panelCont = this.add.container(width / 2, height / 2).setDepth(100);
        
        // 1. Khung nền tối bọc ngoài
        const bg = this.add.rectangle(0, 0, width * 0.88, height * 0.75, 0x1e272e, 0.98).setStrokeStyle(3, 0xffd700);
        panelCont.add(bg);

        // Title của bảng
        const title = this.add.text(0, -height * 0.32, 'CHỌN MÀN CHƠI', { fontSize: '32px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
        panelCont.add(title);

        // Nút Đóng bảng ở góc dưới
        const closeBtn = this.add.rectangle(0, height * 0.31, 160, 44, 0xe74c3c).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
        const closeText = this.add.text(0, height * 0.31, 'ĐÓNG', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        closeBtn.on('pointerdown', () => panelCont.destroy());
        panelCont.add([closeBtn, closeText]);

        // --- CẤU TRÚC TABS CHO CHAPTER ---
        const tabY = -height * 0.24;
        const tabW = (width * 0.8) / 2;
        
        // Tab Chapter 1
        const tab1 = this.add.rectangle(-tabW/2 - 5, tabY, tabW, 46, 0x2c3e50).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
        const tab1Text = this.add.text(-tabW/2 - 5, tabY, 'CHAPTER 1', { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        // Tab Chapter 2
        const tab2 = this.add.rectangle(tabW/2 + 5, tabY, tabW, 46, 0x2c3e50).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
        const tab2Text = this.add.text(tabW/2 + 5, tabY, 'CHAPTER 2', { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        panelCont.add([tab1, tab1Text, tab2, tab2Text]);

        // Mảng quản lý các nút Stage để vẽ lại mỗi khi chuyển Tab
        let stageButtons = [];

        // Hàm vẽ danh sách các Màn chơi theo Chapter
        const renderStages = (chapterNum) => {
            // Xóa các nút cũ trước khi vẽ mới
            stageButtons.forEach(btn => btn.destroy());
            stageButtons = [];

            // Làm sáng Tab được chọn, làm tối Tab kia
            tab1.setFillStyle(chapterNum === 1 ? 0x2e86de : 0x2c3e50);
            tab2.setFillStyle(chapterNum === 2 ? 0x2e86de : 0x2c3e50);

            // Lấy data các màn từ DataManager
            const stages = DataManager.getStagesByChapter(chapterNum);
            
            // Vẽ danh sách màn dạng cột dọc
            stages.forEach((stage, index) => {
                const btnY = -height * 0.12 + index * 75; // Cách nhau 75px theo chiều dọc
                
                const sBtn = this.add.rectangle(0, btnY, width * 0.76, 56, 0x34495e).setStrokeStyle(1, 0x81ecec).setInteractive({ useHandCursor: true });
                
                // Hiển thị: Màn X - [Tên Quái]
                const sText = this.add.text(0, btnY, `Màn ${stage.stageId}: ${stage.enemyName}`, { 
                    fontSize: '20px', color: '#fff', fontStyle: 'bold' 
                }).setOrigin(0.5);

                // Khi click vào stage -> Bắt đầu chơi màn đó ngay lập tức!
                sBtn.on('pointerdown', () => {
                    this.currentStage = stage.stageId; // Gán màn chơi được chọn
                    this.unlockAudio(); // Mở khóa âm thanh
                    panelCont.destroy(); // Hủy bảng
                    this.scene.restart({ audioUnlocked: true }); // Chạy game luôn!
                });

                panelCont.add([sBtn, sText]);
                stageButtons.push(sBtn, sText); // Lưu lại để xóa khi đổi tab
            });
        };

        // Gán sự kiện click đổi Tab
        tab1.on('pointerdown', () => renderStages(1));
        tab2.on('pointerdown', () => renderStages(2));

        // Mặc định tự động vẽ Chapter 1 trước
        renderStages(1);
    }

    showPauseMenu() {
        const { width, height } = this.scale;
        playSfx(this, 'sfx_swap'); // Tiếng click nhẹ

        // Tạo container đè lên toàn màn hình (Depth 9999)
        const pauseCont = this.add.container(width / 2, height / 2).setDepth(9999);

        // 1. Phông đen phủ kín màn hình
        // FIX CLICK-THROUGH: setInteractive() để chặn người chơi click đè xuống các lá bài phía dưới!
        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8)
            .setInteractive(); 
        pauseCont.add(overlay);

        // 2. Khung bảng gỗ tối
        const panel = this.add.rectangle(0, 0, width * 0.75, 300, 0x2c3e50, 0.98).setStrokeStyle(3, 0xffffff);
        pauseCont.add(panel);

        // Chữ TẠM DỪNG
        const title = this.add.text(0, -90, 'TẠM DỪNG', { fontSize: '32px', color: '#ffcc00', fontStyle: 'bold' }).setOrigin(0.5);
        pauseCont.add(title);

        // NÚT 1: TIẾP TỤC (Resume)
        const resumeBtn = this.add.rectangle(0, -10, 200, 50, 0x2e86de).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
        const resumeText = this.add.text(0, -10, 'TIẾP TỤC', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        resumeBtn.on('pointerdown', () => {
            playSfx(this, 'sfx_swap');
            pauseCont.destroy(); // Hủy bảng, chơi tiếp bình thường
        });
        pauseCont.add([resumeBtn, resumeText]);

        // NÚT 2: MENU CHÍNH (Quay về màn hình khởi tạo)
        const menuBtn = this.add.rectangle(0, 60, 200, 50, 0xe74c3c).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
        const menuText = this.add.text(0, 60, 'MENU CHÍNH', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        menuBtn.on('pointerdown', () => {
            playSfx(this, 'sfx_swap');
            pauseCont.destroy();
            
            // Khởi tạo lại toàn bộ chỉ số để quay về Start Screen sạch sẽ
            this.audioUnlocked = false; 
            this.matchRound = 1;
            this.currentStage = 1;
            this.playerHealth = 100;
            this.enemyHealth = 100;
            
            // Restart lại scene và đưa người chơi về màn hình Bắt đầu
            this.scene.restart({ audioUnlocked: false });
        });
        pauseCont.add([menuBtn, menuText]);
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

    initializeGame(width, height, enemyData) {
        this.enemyZoneH = height * 0.25;
        this.arenaZoneH = height * 0.45;
        this.arenaTopY = this.enemyZoneH;
        this.arenaBottomY = this.enemyZoneH + this.arenaZoneH;

        this.add.rectangle(width/2, this.arenaTopY + this.arenaZoneH/4, width, this.arenaZoneH/2, 0x1a2a6c); 
        this.add.rectangle(width/2, this.arenaBottomY - this.arenaZoneH/4, width, this.arenaZoneH/2, 0x2e4053); 
        this.add.line(0, 0, 0, this.arenaTopY, width, this.arenaTopY, 0xffd700).setOrigin(0).setLineWidth(4);
        this.add.line(0, 0, 0, this.arenaBottomY, width, this.arenaBottomY, 0xffd700).setOrigin(0).setLineWidth(4);

        enemyData = enemyData || { name: 'UNKNOWN', hp: 100, color: 0xe74c3c };
        this.enemySprite = this.add.rectangle(width - 120, this.arenaTopY + 150, 100, 130, enemyData.color).setStrokeStyle(4, 0x000);
        this.enemyNameText = this.add.text(width - 120, this.arenaTopY + 150, enemyData.name, { fontSize: '22px', color: '#fff',  fontStyle: 'bold', align: 'center', wordWrap: { width: 140 } }).setOrigin(0.5);
        this.enemyNameText.setStroke('#000000', 5);
       // this.add.text(width - 120, this.arenaTopY + 70, 'BOSS', { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

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

        this.roundText = this.add.text(width / 2, 30, `CHAPTER ${this.currentStageData?.chapter || 1} - VÒNG ${this.matchRound}/${this.maxRounds}`, { fontSize: '26px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
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

        // ==========================================
        // 5. NÚT TẠM DỪNG (PAUSE) - GÓC TRÁI TRÊN CÙNG MÀN HÌNH
        // ==========================================
        const pauseBtn = this.add.rectangle(40, 40, 44, 44, 0x2a2a3d, 0.95)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true })
            .setDepth(25);
        this.add.text(40, 40, '‖', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' })
            .setOrigin(0.5)
            .setDepth(26);

        // Kích hoạt bảng Pause khi click
        pauseBtn.on('pointerdown', () => this.showPauseMenu());

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

        // if (this.currentEnemyData && this.currentEnemyData.id === 'ch2_boss_efreet') {
        //     this.bossHeatValue = 0; // Reset nhiệt lượng về 0

        //       // Vẽ thanh nhiệt lượng màu cam dưới thanh máu của Boss (enemyBarY + 20)
        //     this.enemyHeatBarBg = this.add.rectangle(enemyBarX, enemyBarY + 18, barWidth, 8, 0x000000)
        //         .setStrokeStyle(1, 0xffffff).setOrigin(0.5).setDepth(5);
        //     this.enemyHeatBarFill = this.add.rectangle(enemyBarX - barWidth / 2, enemyBarY + 18, barWidth, 8, 0xff5500)
        //         .setOrigin(0, 0.5).setDepth(6);
        // }

        this.updateHealthUI();
    }

    // updateHealthUI() {
    //     const clampedPlayer = Phaser.Math.Clamp(this.playerHealth, 0, START_HEALTH);
    //     const clampedEnemy = Phaser.Math.Clamp(this.enemyHealth, 0, START_HEALTH);
    //     const maxBarWidth = this.playerHealthBarBg.width;

    //     if (this.playerHealthBarFill) this.playerHealthBarFill.width = Math.max(0, maxBarWidth * (clampedPlayer / START_HEALTH));
    //     if (this.enemyHealthBarFill) this.enemyHealthBarFill.width = Math.max(0, maxBarWidth * (clampedEnemy / START_HEALTH));

    //     this.setSwapButtonState(this.playerHealth > 0 && !this.matchOver);
    // }

    updateHealthUI() {
        const pctP = Math.max(0, this.playerHealth / 100);
        
        // FIX: Địch chia cho enemyMaxHealth lấy từ JSON
        const pctE = Math.max(0, this.enemyHealth / this.enemyMaxHealth); 
        
        this.tweens.add({ targets: this.playerHealthBarFill, displayWidth: this.playerHealthBarBg.width * pctP, duration: 300 });
        this.tweens.add({ targets: this.enemyHealthBarFill, displayWidth: this.enemyHealthBarBg.width * pctE, duration: 300 });
        this.setSwapButtonState(this.playerHealth > 0 && !this.matchOver);
    }

   updateHeatBarUI() {
        if (this.enemyHeatBarFill && this.enemyHeatBarBg) {
            const pct = Math.max(0, this.bossHeatValue / 100);
            
            // FIX: Đổi từ enemyHealthBarBg.width sang enemyHeatBarBg.width để co giãn chuẩn xác
            this.tweens.add({ 
                targets: this.enemyHeatBarFill, 
                displayWidth: this.enemyHeatBarBg.width * pct, 
                duration: 200 
            });
        }
    }

   refreshHeatBar() {
        // 1. Hủy thanh cũ nếu có để tránh vẽ đè khi chuyển màn chơi
        if (this.enemyHeatBarBg) { this.enemyHeatBarBg.destroy(); this.enemyHeatBarBg = null; }
        if (this.enemyHeatBarFill) { this.enemyHeatBarFill.destroy(); this.enemyHeatBarFill = null; }

        // 2. Chỉ vẽ nếu là Boss Hỏa Thần ch2_boss_efreet
        if (this.currentEnemyData && this.currentEnemyData.id === 'ch2_boss_efreet') {
            //this.bossHeatValue = 0; // Reset điểm nhiệt về 0
            
            const barWidth = 200; // Ngắn hơn thanh máu (260)
            const barHeight = 8;
            const x = this.scale.width - 120; // Cùng trục X với thanh máu địch
            
            // FIX: Dùng đúng tên biến enemyHealthBarBg của bạn ở đây
            const y = this.enemyHealthBarBg.y + 16; 

            this.enemyHeatBarBg = this.add.rectangle(x, y, barWidth, barHeight, 0x000000)
                .setStrokeStyle(1, 0xffffff).setOrigin(0.5).setDepth(5);
            this.enemyHeatBarFill = this.add.rectangle(x - barWidth/2, y, barWidth, barHeight, 0xff5500)
                .setOrigin(0, 0.5).setDepth(6);
            
            this.updateHeatBarUI();
        }
    }

    updateFightButtonState() {
        // Chỉ cho phép bấm FIGHT nếu: Có bài ở Core Player VÀ có bài ở Core Enemy VÀ trận đấu chưa kết thúc
        const canFight = this.playerCoreCard && this.enemyCoreCard && !this.matchOver;

        if (canFight) {
            this.fightBtn.setInteractive({ useHandCursor: true });
            this.fightBtn.fillColor = 0xffa500; // Sáng màu cam
            this.fightIcon.setAlpha(1); // Sáng icon kiếm
        } else {
            this.fightBtn.disableInteractive();
            this.fightBtn.fillColor = 0x555555; // Mờ màu xám
            this.fightIcon.setAlpha(0.5); // Mờ icon kiếm
        }
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
        //const newReserve = this.poolSystem.drawCards(RESERVE_SLOT_COUNT, this.matchRound);

        const condId = this.currentStageData?.condition_id || null;
        const newReserve = this.poolSystem.drawCards(RESERVE_SLOT_COUNT, this.matchRound, condId);
        
        const sourceY = this.playerReserveY - 220;
        for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
            const { x, y } = this.getPlayerReserveSlotWorldXY(i);
            const card = new Card(this, x, sourceY, newReserve[i], true);
            card.setDepth(10 + i); card.setScale(0.85);
            this.playerReserveSlots[i] = card;
            this.tweens.add({ targets: card, x, y, duration: 320, ease: 'Sine.easeOut' });
        }
        this.refreshCombatPreview();
        this.startRumbleTimer();
    }

    // ==========================================
    // LOGIC SPAWN BÀI & TRẬN ĐẤU
    // ==========================================

    getCoreZone() { return { x: this.coreX, y: this.coreY, r: this.coreDropRadius }; }
    getEnemyCoreZone() { return { x: this.enemyCoreX, y: this.enemyCoreY, r: this.enemyCoreDropRadius }; }
    getPlayerReserveSlotWorldXY(slotIndex) { return { x: this.playerReserveStartX + slotIndex * this.playerReserveSpacing, y: this.playerReserveY }; }
    getPlayerReserveList() { return this.playerReserveSlots.filter((c) => c != null && c.active); }

    startStage() {
        this.updateFightButtonState(); 
        // this.fightBtn.disableInteractive();
        // this.fightIcon.setAlpha(0.5);

        this.matchOver = false;

        if (this.isTutorialMode && this.matchRound === 1) {
            // Hủy bài cũ
            [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
            this.playerReserveSlots = Array(5).fill(null);
            
            this.roundText?.setText('HƯỚNG DẪN: PHẦN 1');
            
            // Gọi hệ thống hướng dẫn thiết lập bàn cờ
            TutorialSystem.startTutorial1(this);
            return; // Thoát hàm, nhường toàn bộ sân khấu cho Đạo diễn Tutorial!
        }

        const stageData = DataManager.getStageData(this.currentStage);
        if (stageData) {
            this.currentStageData = stageData;
            this.roundText?.setText(`CHAPTER ${stageData.chapter} - VÒNG ${this.matchRound}/${this.maxRounds}`);
            this.currentEnemyData = stageData.enemy;
        } else {
            this.roundText?.setText(`VÒNG ${this.matchRound}/${this.maxRounds}`);
        }
        this.updateHealthUI();

        [...this.getPlayerReserveList(), ...this.enemyReserveCards, this.playerCoreCard, this.enemyCoreCard].forEach((c) => c && c.destroy());
        this.playerReserveSlots = Array(RESERVE_SLOT_COUNT).fill(null);
        this.playerCoreCard = null; this.enemyCoreCard = null;

        // TÁCH LOGIC: Dùng PoolSystem để bốc bài
       // const playerDeck = this.poolSystem.drawCards(this.matchRound); 
        //const enemyDeck = this.poolSystem.drawCards(this.matchRound);


        const condId = this.currentStageData?.condition_id || null;
        const playerDeck = this.poolSystem.drawCards(RESERVE_SLOT_COUNT, this.matchRound, condId);
        const enemyDeck = this.poolSystem.drawCards(RESERVE_SLOT_COUNT, this.matchRound, condId);

        // const playerDeck = this.poolSystem.drawCards(RESERVE_SLOT_COUNT, this.matchRound);
        // const enemyDeck = this.poolSystem.drawCards(RESERVE_SLOT_COUNT, this.matchRound);
        
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

        this.updateHealthUI();

        this.refreshHeatBar(); 

         this.time.delayedCall(100, () => {
            ConditionSystem.executeStageSetup(this, this.currentStageData);
        }); 

        this.time.delayedCall(100, () => {
            BossSkillEngine.executeTrigger(this, this.currentEnemyData, 'onBattleStart', { matchRound: this.matchRound });
        });

        this.time.delayedCall(400, () => this.refreshCombatPreview());
        this.time.delayedCall(600, () => {
            BossSkillEngine.executeTrigger(this, this.currentEnemyData, 'onRoundStart', this.matchRound);
        });
        this.time.delayedCall(1500, () => this.playAITurn());   

        this.startRumbleTimer();

    }

    // TÁCH LOGIC: GỌI AISYSTEM TRONG PLAY AI TURN
   playAITurn() {
        const { width } = this.scale;

        BossSkillEngine.executeTrigger(this, this.currentEnemyData, 'onRoundStart', { matchRound: this.matchRound });

        // 1. GỌI AI SYSTEM ĐỂ NHẬN LỆNH (Tách biệt hoàn toàn logic suy nghĩ)
        const decision = AISystem.decideMove(this.enemyReserveCards, this.matchRound);

        if (!decision) return; // Nếu địch không còn bài, bỏ qua

        // 2. BATTLE SCENE CHỈ THỰC THI HOẠT ẢNH DỰA TRÊN LỆNH CỦA AI
        if (decision.action === 'MERGE') {
            const { cardA, cardB, resultData } = decision;

            // Hoạt ảnh 2 lá bài bay vào nhau
            this.tweens.add({
                targets: cardA, x: cardB.x, y: cardB.y, duration: 500,
                onComplete: () => {
                    // Xóa 2 lá bài cũ khỏi mảng và hủy đối tượng
                    cardA.destroy(); cardB.destroy();
                    this.enemyReserveCards = this.enemyReserveCards.filter((c) => c !== cardA && c !== cardB);

                    // Tạo lá bài Kép mới
                    const newDual = new Card(this, cardB.x, cardB.y, resultData, false);
                    newDual.setScale(0.65);

                    // Đợi 0.5s rồi bay vào Core Slot
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
        } 
        else if (decision.action === 'PLAY') {
            const chosenCard = decision.card;
            
            // Tìm và xóa lá bài được chọn khỏi mảng Reserve của Địch
            const idx = this.enemyReserveCards.indexOf(chosenCard);
            if (idx > -1) this.enemyReserveCards.splice(idx, 1);

            // Hoạt ảnh bay thẳng vào Core Slot
            this.tweens.add({
                targets: chosenCard, x: width / 2, y: this.enemyCoreY, duration: 800,
                onComplete: () => {
                    this.enemyCoreCard = chosenCard;
                    this.enemyReady();
                    this.refreshCombatPreview();
                }
            });
        }
    }

    enemyReady() {
        // Cập nhật nút FIGHT (Nếu Player đã có bài trên Core thì nút sẽ sáng lên)
        this.updateFightButtonState();

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

    // ensurePlayerCoreFilled(duration = 400) {
    //     if (this.playerCoreCard != null) return;
    //     for (let i = 0; i < RESERVE_SLOT_COUNT; i++) {
    //         const card = this.playerReserveSlots[i];
    //         if (card?.active) {
    //             this.playerReserveSlots[i] = null;
    //             this.playerCoreCard = card;
    //             this.tweens.add({
    //                 targets: card, x: this.coreX, y: this.coreY, duration, ease: 'Sine.easeOut',
    //                 onComplete: () => {
    //                     card.originalPos = { x: this.coreX, y: this.coreY };
    //                     this.refreshCombatPreview();
    //                 }
    //             });
    //             this.layoutPlayerReserveSlots(duration);
    //             return;
    //         }
    //     }
    // }

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

             if (bestTarget.isLocked) {
                // Nếu lá bị đè lên đang bị khóa -> Hủy bỏ thao tác, nhả bài về chỗ cũ
                draggedCard.snapBack();
                playSfx(this, 'sfx_swap'); // Có thể dùng âm thanh báo lỗi ở đây nếu có
                return; // Thoát hàm luôn, không cho ghép hay swap gì cả
            }
            
            // TÁCH LOGIC: Hàm checkMerge từ GameLogic
            //const mergeResult = this.logic.checkMerge(draggedCard.cardData, bestTarget.cardData);
            const targetIsCore = bestTarget === this.playerCoreCard;
            const targetSlot = this.getReserveSlotIndexOfCard(bestTarget);
            const targetInReserve = targetSlot >= 0;

            const mergeResult = this.isTutorialMode ? { valid: false } : this.logic.checkMerge(draggedCard.cardData, bestTarget.cardData);

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
        this.time.delayedCall(280, () => { this.updateFightButtonState(); this.refreshCombatPreview(); 
        this.startRumbleTimer();

         if (this.isTutorialMode) {
                if (this.playerCoreCard && this.playerCoreCard.cardData.name === 'Water') {
                    // Dọn sạch khung thoại cũ của Bước 5
                    if (this.tutorialArrow) { this.tutorialArrow.destroy(); this.tutorialArrow = null; }
                    if (this.tutorialDialog) { this.tutorialDialog.destroy(); this.tutorialDialog = null; }
                    
                    this.fightBtn.setInteractive({ useHandCursor: true });
                    this.fightBtn.fillColor = 0xffa500;
                    this.fightIcon.setAlpha(1);
                } else {
                    this.fightBtn.disableInteractive();
                    this.fightBtn.fillColor = 0x555555;
                    this.fightIcon.setAlpha(0.5);
                }
            }

        });
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
        let dmgRef = { value: 0 };
        
        // 1. Tính sát thương ban đầu
        if (result === 'THẮNG') {

            const damage = this.isTutorialMode ? 100 : this.getDamageForVictory(winnerCardData ?? this.playerCoreCard?.cardData);
this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - damage, 0, this.enemyMaxHealth);
            this.tweens.add({ targets: this.enemySprite, x: this.enemySprite.x + 10, duration: 50, yoyo: true, repeat: 3 });

            dmgRef.value = this.getDamageForVictory(winnerCardData ?? this.playerCoreCard?.cardData);
        } else if (result === 'THUA') {
            dmgRef.value = this.getDamageForVictory(winnerCardData ?? this.enemyCoreCard?.cardData);
        } else if (result === 'HÒA') {
            dmgRef.value = 10;
        }

        // 2. GỌI BOSS SKILL ENGINE ĐỂ KIỂM TRA GIÁP / KHÁNG TÍNH
        // Nếu Player tung bài (dù Thắng, Thua hay Hòa), đều phải check xem có đốt được Giáp Mộc của Boss không.
        const playerCardUsed = this.playerCoreCard?.cardData;
        if (playerCardUsed && this.currentEnemyData) {
            BossSkillEngine.checkSpecialDefenses(this, playerCardUsed, dmgRef);
        }

        // Nếu Damage đã bị chặn (Kháng) hoặc hao hụt khi phá giáp -> dmgRef.value sẽ = 0.
        
        // 3. Thực thi sát thương cuối cùng
        if (result === 'THẮNG') {
            // Skill phụ (vd: Giảm 50% dmg của Ma Thạch)
            BossSkillEngine.executeTrigger(this, this.currentEnemyData, 'onDamageTake', { 
                attackElement: winnerCardData?.name, damageRef: dmgRef 
            });

            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - dmgRef.value, 0, this.enemyMaxHealth || START_HEALTH);
            this.tweens.add({ targets: this.enemySprite, x: this.enemySprite.x + 10, duration: 50, yoyo: true, repeat: 3 });
            
        } else if (result === 'THUA') {
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - dmgRef.value, 0, START_HEALTH);
            this.tweens.add({ targets: this.playerSprite, x: this.playerSprite.x - 10, duration: 50, yoyo: true, repeat: 3 });
            
        } else if (result === 'HÒA') {
            // Khi hòa, Boss chịu sát thương dmgRef (có thể = 0 do kháng), Player chịu 10
            this.enemyHealth = Phaser.Math.Clamp(this.enemyHealth - dmgRef.value, 0, this.enemyMaxHealth || START_HEALTH);
            this.playerHealth = Phaser.Math.Clamp(this.playerHealth - 10, 0, START_HEALTH);
            this.tweens.add({ targets: this.enemySprite, x: this.enemySprite.x + 10, duration: 50, yoyo: true, repeat: 3 });
            this.tweens.add({ targets: this.playerSprite, x: this.playerSprite.x - 10, duration: 50, yoyo: true, repeat: 3 });
        }
        this.updateHealthUI();
    }
    clearAllLocks() {
        this.getPlayerReserveList().forEach(card => card.setLock(false));
    }

    async executeFight() {
        
        this.fightBtn.disableInteractive(); this.swapBtn?.disableInteractive(); this.fightIcon.setAlpha(0.5); this.input.enabled = false;
        playSfx(this, 'sfx_fight', { volume: 0.55 });

        if (this.rumbleTimer) {
            this.rumbleTimer.remove();
            this.rumbleTimer = null;
        }

        //if (!this.playerCoreCard) this.ensurePlayerCoreFilled(0);

        if (this.playerCoreCard) this.playerCoreCard.setFlipped(false);
        if (this.enemyCoreCard) this.enemyCoreCard.setFlipped(false);

        //const waitScreen = this.add.rectangle(this.scale.width / 2, this.fightCenter.y, this.scale.width, 160, 0x000000, 0.75).setDepth(210);
        const clashText = this.add.text(this.scale.width / 2, this.fightCenter.y, 'CHIẾN ĐẤU...', { fontSize: '28px', color: '#ffcc00', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(211);
        this.tweens.add({ targets: clashText, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });

        const playerCard = this.playerCoreCard; const enemyCard = this.enemyCoreCard;
        if (!playerCard?.active || !enemyCard?.active) { waitScreen.destroy(); clashText.destroy(); this.input.enabled = true; this.swapBtn?.setInteractive({ useHandCursor: true }); return; }

        const finalResult = compareCards(playerCard.cardData, enemyCard.cardData);

       BossSkillEngine.executeTrigger(this, this.currentEnemyData, 'onCardPlayed', { 
          playerCard: this.playerCoreCard?.cardData 
         });

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
            //waitScreen.destroy(); clashText.setDepth(211);
            this.time.delayedCall(400, () => {
                clashText.setText('HÒA!\nTÀN CUỘC...'); this.reserveWarSpeedMult = 2.85;
                this.resolveReserveWar().then((resultObj) => {
                    this.reserveWarSpeedMult = 1; this.applyRoundOutcome(resultObj.result, resultObj.winnerCardData); clashText.setText(`FINAL: ${resultObj.result}!`);
                    if (resultObj.result === 'THẮNG') playSfx(this, 'sfx_win'); if (resultObj.result === 'THUA') playSfx(this, 'sfx_lose');
                    this.time.delayedCall(1600, () => {
                        clashText.destroy(); this.input.enabled = true;
                        if (this.playerHealth <= 0 || this.enemyHealth <= 0) { this.finishMatch(); return; }
                        this.clearAllLocks();
                        this.matchRound++; if (this.matchRound > this.maxRounds) { this.finishMatch(); } else { this.startStage(); }
                    });
                });
            });
            return;
        }

        this.time.delayedCall(2000, () => {
           // waitScreen.destroy(); clashText.destroy(); this.input.enabled = true;

            clashText.destroy(); 
            this.input.enabled = true;

             if (this.isTutorialMode) {
                    TutorialSystem.showVictoryDialogue(this);
                    return; // Thoát ra không chuyển vòng đấu nữa
                }

             if (this.isTutorialMode && finalResult === 'WIN') {
                TutorialSystem.showVictoryDialogue(this);
                return; // Thắng luôn, dừng toàn bộ trận đấu
            }

            if (this.playerHealth <= 0 || this.enemyHealth <= 0) { this.finishMatch(); return; }
            this.clearAllLocks();
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
        const nextStageData = finalWinner === 'THẮNG' ? DataManager.getStageData(this.currentStage + 1) : null;
        const buttonLabel = nextStageData ? `CHƠI MÀN ${nextStageData.stageId}` : 'CHƠI LẠI';
        const advanceStage = !!nextStageData;
        const buttonText = this.add.text(width / 2, height * 0.55, buttonLabel, { fontSize: '24px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10000);
        buttonBg.on('pointerdown', () => { buttonBg.destroy(); buttonText.destroy(); messageText.destroy(); overlay.destroy(); this.resetMatch(advanceStage); });
        this.matchResultContainer = [overlay, messageText, buttonBg, buttonText];
    }

    // resetMatch() {
    //     this.poolSystem.initializePool();
    //     this.matchOver = false; this.matchRound = 1; this.currentStage = 1;
    //     this.playerHealth = START_HEALTH; this.enemyHealth = START_HEALTH;
    //     this.updateHealthUI(); this.startStage();
    // }

   resetMatch(advanceStage = false) {
        if (advanceStage) {
            const nextStageData = DataManager.getStageData(this.currentStage + 1);
            if (nextStageData) this.currentStage += 1;
        }

        // Chỉ cần gọi restart và truyền trạng thái đã unlock audio
        this.scene.restart({ audioUnlocked: true });
    }

    // --- KHỞI CHẠY BỘ ĐẾM GIỜ RUNG CHẤN ---
    startRumbleTimer() {
        // 1. Xóa bộ đếm cũ nếu đang chạy
        if (this.rumbleTimer) {
            this.rumbleTimer.remove();
            this.rumbleTimer = null;
        }

        // 2. Kiểm tra xem màn này có Rung Chấn không
        const condId = this.currentStageData?.condition_id;
        const hasRumble = (condId === 'rumble' || condId === 'rumble_and_heat');
        
        if (!hasRumble || this.matchOver) return;

        // 3. Kích hoạt bộ đếm 30 giây (30000ms)
        // MẸO: Bạn hãy chỉnh số 30000 thành 5000 (5 giây) để test cho nhanh, xong thì sửa lại sau!
        this.rumbleTimer = this.time.delayedCall(10000, () => {
            this.executeRumbleEffect();
        });
    }

    // --- THỰC THI HIỆU ỨNG RUNG CHẤN ---
    async executeRumbleEffect() {
        if (this.matchOver) return;

        // 1. Rung lắc màn hình & Phát âm thanh nứt vỡ
        this.cameras.main.shake(800, 0.015);
        playSfx(this, 'sfx_crack', { volume: 0.6 });

        // 2. Hiện chữ thông báo
        const txt = this.add.text(this.scale.width / 2, this.arenaTopY + 150, '⚠️ RUNG CHẤN!\nĐất đá sụt lở, bài tự dung hợp!', {
            fontSize: '22px', color: '#e67e22', fontStyle: 'bold', align: 'center', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(200);
        this.tweens.add({ targets: txt, y: txt.y - 40, alpha: 0, duration: 2500, onComplete: () => txt.destroy() });

        // 3. Tự động ghép cặp bài đơn trái cùng
        let pRow = [...this.getPlayerReserveList()];
        
        // Tái sử dụng hàm merge của Tàn Cuộc
        const merged = await this.mergeOneLeftPair(pRow, this.playerReserveY, true);
        
        if (merged) {
            this.syncPlayerSlotsAfterWar(pRow); // Đồng bộ lại vị trí hàng bài
            this.refreshCombatPreview();       // Cập nhật lại vết nứt dự báo
        }

        // 4. Reset lại bộ đếm cho lần Rung Chấn tiếp theo
        this.startRumbleTimer();
    }

    finishMatch() {
        this.input.enabled = true; 
        const finalWinner = this.playerHealth > this.enemyHealth ? 'THẮNG' : this.playerHealth < this.enemyHealth ? 'THUA' : 'HÒA';
        if (finalWinner === 'THẮNG') playSfx(this, 'sfx_win'); if (finalWinner === 'THUA') playSfx(this, 'sfx_lose');
        this.showMatchResult(finalWinner); this.fightBtn.disableInteractive(); this.setSwapButtonState(false);
    }
}