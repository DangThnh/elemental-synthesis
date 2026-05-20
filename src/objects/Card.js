import Phaser from 'phaser';
import { Elements } from '../utils/GameLogic';

export default class Card extends Phaser.GameObjects.Container {
    constructor(scene, x, y, cardData, isPlayer) {
        super(scene, x, y);
        this.scene = scene;
        this.cardData = cardData;
        this.isPlayer = isPlayer;
        this.originalPos = { x, y };
        
        // Lưu lại tỷ lệ và layer gốc để không bị lỗi phình to/đè UI
        this.originalScale = 1;
        this.originalDepth = isPlayer ? 10 : 1;

        // 1. Vẽ nền
        this.bg = scene.add.graphics();
        this.drawBackground();

        // 2. Icon hệ nguyên tố
        this.elementIcon = scene.add.image(0, -30, null).setVisible(false);
        if (cardData.type === 'Single') {
            this.elementIcon.setTexture(`icon_${cardData.name.toLowerCase()}`);
            this.elementIcon.setVisible(true);
            this.elementIcon.setDisplaySize(60, 40); 
        }

        // 3. Tên bài kép
        this.titleText = scene.add.text(0, -30, cardData.type === 'Dual' ? cardData.name : '', {
            fontSize: '22px', color: '#ffd700', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5);
        this.titleText.setStroke('#000000', 5);

        // 4. Text Level
        this.text = scene.add.text(0, 10, `Lv${cardData.level}`, {
            fontSize: '22px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 94 }, align: 'center', lineSpacing: 4
        }).setOrigin(0.5);
        this.text.setStroke('#000000', 4);

        // 5. Icons (+ và X) -> Đặt Depth cao để nổi lên trên
        this.iconPlus = scene.add.text(35, -55, '+', { fontSize: '60px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(500);
        this.iconPlus.setStroke('#000000', 6);
        this.iconCross = scene.add.text(35, -55, 'X', { fontSize: '60px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(500);
        this.iconCross.setStroke('#000000', 6);

        // 6. Tooltip thành phần nguyên tố -> Đặt depth rất cao để luôn đè lên mọi thứ
        this.tipBg = scene.add.rectangle(0, -118, 132, 52, 0x1a1a1a, 0.95).setStrokeStyle(2, 0xffd700).setVisible(false).setDepth(2000);
        this.elementIcon1 = scene.add.image(-20, -118, null).setVisible(false).setDepth(2001);
        this.elementIcon2 = scene.add.image(20, -118, null).setVisible(false).setDepth(2001);
        this.plusText = scene.add.text(0, -118, '+', { fontSize: '18px', color: '#ffeeaa', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setVisible(false).setDepth(2002);
        this.plusText.setStroke('#000000', 3);

        // 7. Crack overlay
        this.crackImage = scene.add.image(0, 0, 'crack_overlay').setVisible(false).setDepth(5);
        this.crackImage.setDisplaySize(100, 140); 

        this.add([this.bg, this.elementIcon, this.titleText, this.text, this.iconPlus, this.iconCross, this.tipBg, this.elementIcon1, this.elementIcon2, this.plusText, this.crackImage]);
        scene.add.existing(this);

        this.crackActive = false;
        this.crackTween = null;
        this.hoverTargets = [];

        this.setDepth(this.originalDepth);
        this.setSize(100, 140);

        if (isPlayer) {
            this.setInteractive({ draggable: true, useHandCursor: true });
            this.setupPlayerInteractions();
        } else {
            this.setInteractive({ useHandCursor: true });
            this.on('pointerover', () => {
                this.originalDepth = this.depth;
                this.setDepth(2000);
                this.showCompositionTooltipIfAny();
            });
            this.on('pointerout', () => {
                this.setDepth(this.originalDepth);
                this.hideCompositionTooltip();
            });
        }
    }

    drawBackground(isHover = false) {
        this.bg.clear();
        const w = 100; const h = 140;
        const strokeColor = isHover ? 0xffff00 : this.getBaseStrokeColor();
        const thickness = isHover ? 4 : 2;

        if (this.cardData.type === 'Dual' && this.cardData.elements && this.cardData.elements.length >= 2) {
            const color1 = Elements[this.cardData.elements[0].toUpperCase()].color;
            const color2 = Elements[this.cardData.elements[1].toUpperCase()].color;
            this.bg.fillGradientStyle(color1, color1, color2, color2, 1);
        } else {
            this.bg.fillStyle(this.cardData.color, 1);
        }

        this.bg.fillRect(-w / 2, -h / 2, w, h);
        this.bg.lineStyle(thickness, strokeColor, 1);
        this.bg.strokeRect(-w / 2, -h / 2, w, h);
    }

    getBaseStrokeColor() {
        if ((this.cardData?.level ?? 1) >= 2) return 0xffd700;
        return 0xffffff;
    }

    showCompositionTooltipIfAny() {
        let elements = [];
        if (this.cardData.type === 'Dual' && Array.isArray(this.cardData.elements) && this.cardData.elements.length >= 2) {
            elements = this.cardData.elements.slice(0, 2);
        } else if (this.cardData.type === 'Single' && (this.cardData.level ?? 1) >= 2) {
            elements = [this.cardData.name, this.cardData.name];
        }
        if (elements.length < 2) { this.hideCompositionTooltip(); return; }
        
        const tooltipWidth = this.isPlayer ? 132 : 170;
        const tooltipHeight = this.isPlayer ? 52 : 72;
        const tooltipY = this.isPlayer ? -118 : -148;
        const iconSize = this.isPlayer ? 25 : 32;
        const plusSize = this.isPlayer ? '18px' : '22px';

        this.elementIcon1.setTexture(`icon_${elements[0].toLowerCase()}`); this.elementIcon1.setDisplaySize(iconSize, iconSize).setPosition(-24, tooltipY);
        this.elementIcon2.setTexture(`icon_${elements[1].toLowerCase()}`); this.elementIcon2.setDisplaySize(iconSize, iconSize).setPosition(24, tooltipY);
        this.plusText.setStyle({ fontSize: plusSize }).setPosition(0, tooltipY);
        this.tipBg.setVisible(true); this.elementIcon1.setVisible(true); this.elementIcon2.setVisible(true); this.plusText.setVisible(true);
        this.tipBg.setSize(tooltipWidth, tooltipHeight).setPosition(0, tooltipY);
    }

    hideCompositionTooltip() {
        this.tipBg.setVisible(false); this.elementIcon1.setVisible(false); this.elementIcon2.setVisible(false); this.plusText.setVisible(false);
    }

    clearCrackPreview() {
        this.crackActive = false;
        if (this.crackTween) { this.crackTween.remove(); this.crackTween = null; }
        this.crackImage.setVisible(false);
        this.setAlpha(1);
    }

    setCrackPreview(active) {
        if (active) {
            if (this.crackActive) return; 
            this.crackImage.setVisible(true); this.crackActive = true;
            if (!this.crackTween && this.scene) {
                this.crackTween = this.scene.tweens.add({ targets: this, alpha: { from: 0.82, to: 1 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            }
        } else {
            this.clearCrackPreview();
        }
    }

    refreshVisuals() {
        this.drawBackground();
        if (this.cardData.type === 'Dual') {
            this.titleText.setText(this.cardData.name); this.titleText.setVisible(true); this.elementIcon.setVisible(false);
        } else {
            this.titleText.setVisible(false); this.elementIcon.setTexture(`icon_${this.cardData.name.toLowerCase()}`); this.elementIcon.setVisible(true); this.elementIcon.setDisplaySize(60, 40);
        }
        this.text.setText(`Lv${this.cardData.level}`); this.text.setColor('#ffffff'); this.text.setStroke('#000000', 4);
    }

    setupPlayerInteractions() {
        this.on('pointerover', () => { this.drawBackground(true); this.showCompositionTooltipIfAny(); });
        this.on('pointerout', () => { this.drawBackground(false); this.hideCompositionTooltip(); });

        this.on('dragstart', () => {
            this.clearCrackPreview(); 
            this.hideCompositionTooltip();
            
            // FIX: Gán Layer cố định 80 khi kéo để nổi lên, nhưng vẫn chìm dưới Drawer (Depth 100)
            this.originalDepth = this.depth;
            this.setDepth(80);
            
            // FIX LỖI PHÌNH TO: Lấy đúng tỷ lệ hiện tại x 1.1 thay vì ép cứng
            this.originalScale = this.scale;
            this.scene.tweens.add({ targets: this, scale: this.originalScale * 1.1, duration: 100 });
            this.originalPos = { x: this.x, y: this.y };
        });

        this.on('drag', (pointer, dragX, dragY) => { this.x = dragX; this.y = dragY; this.checkHoverTargets(); });

        this.on('dragend', () => {
            this.setDepth(this.originalDepth); 
            this.scene.tweens.add({ targets: this, scale: this.originalScale, duration: 100 });
            this.iconPlus.setVisible(false); this.iconCross.setVisible(false);
            
            this.hoverTargets.forEach(target => target.drawBackground(false));
            this.hoverTargets = [];
            this.scene.handleCardDrop(this);
        });
    }

    snapBack() {
        this.scene.tweens.add({ targets: this, x: this.originalPos.x, y: this.originalPos.y, duration: 200, ease: 'Back.easeOut' });
    }

    checkHoverTargets() {
        this.iconPlus.setVisible(false); this.iconCross.setVisible(false);
        this.hoverTargets.forEach(target => target.drawBackground(false));
        this.hoverTargets = [];

        if (this.scene.playerCoreCard && this.scene.getReserveSlotIndexOfCard?.(this) >= 0) {
            const z = this.scene.getCoreZone?.();
            if (z && Phaser.Math.Distance.Between(this.x, this.y, z.x, z.y) < z.r + 28) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, this.scene.playerCoreCard.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                    this.scene.playerCoreCard.drawBackground(true);
                    this.hoverTargets.push(this.scene.playerCoreCard);
                } else { this.iconPlus.setVisible(true); /* Đổi chỗ Swap */ }
                return;
            }
        }

        const reserveList = this.scene.getPlayerReserveList?.() ?? this.scene.playerReserveCards ?? [];
        for (let target of reserveList) {
            if (target !== this && Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) < 60) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, target.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                    target.drawBackground(true);
                    this.hoverTargets.push(target);
                } else { this.iconCross.setVisible(true); }
                break;
            }
        }
    }
}