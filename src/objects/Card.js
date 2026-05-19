import Phaser from 'phaser';
import { Elements } from '../utils/GameLogic';

export default class Card extends Phaser.GameObjects.Container {
    constructor(scene, x, y, cardData, isPlayer) {
        super(scene, x, y);
        this.scene = scene;
        this.cardData = cardData;
        this.isPlayer = isPlayer;
        this.originalPos = { x, y };
        
        // FIX: Lưu lại trạng thái ban đầu để tránh bị phình to hoặc sai Layer
        this.originalScale = 1;
        this.originalDepth = isPlayer ? 2 : 1;

        this.bg = scene.add.graphics();
        this.drawBackground();

        // Icon hệ nguyên tố
        this.elementIcon = scene.add.image(0, -30, '__DEFAULT').setVisible(false);
        if (cardData.type === 'Single') {
            this.elementIcon.setTexture(`icon_${cardData.name.toLowerCase()}`);
            this.elementIcon.setVisible(true);
            this.elementIcon.setDisplaySize(60, 40); 
        }

        // Title text cho Dual
        this.titleText = scene.add.text(0, -30, cardData.type === 'Dual' ? cardData.name : '', {
            fontSize: '22px', color: '#ffd700', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5);
        this.titleText.setStroke('#000000', 5);

        this.text = scene.add.text(0, 10, `Lv${cardData.level}`, {
            fontSize: '22px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 94 }, align: 'center', lineSpacing: 4
        }).setOrigin(0.5);
        this.text.setStroke('#000000', 4);

        // Icons tương tác (+ và X) đẩy lên Depth 50
        this.iconPlus = scene.add.text(35, -55, '+', { fontSize: '60px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(50);
        this.iconPlus.setStroke('#000000', 6);
        this.iconCross = scene.add.text(35, -55, 'X', { fontSize: '60px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(50);
        this.iconCross.setStroke('#000000', 6);

        // FIX LỖI CHE TOOLTIP: Đẩy các thành phần Tooltip lên Depth 100+
        this.tipBg = scene.add.rectangle(0, -118, 132, 52, 0x1a1a1a, 0.95).setStrokeStyle(2, 0xffd700).setVisible(false).setDepth(100);
        this.elementIcon1 = scene.add.image(-20, -118, '__DEFAULT').setVisible(false).setDepth(101);
        this.elementIcon2 = scene.add.image(20, -118, '__DEFAULT').setVisible(false).setDepth(101);
        this.plusText = scene.add.text(0, -118, '+', { fontSize: '18px', color: '#ffeeaa', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setVisible(false).setDepth(101);
        this.plusText.setStroke('#000000', 3);

        // Dùng nguyên ảnh Crack của bạn
        this.crackImage = scene.add.image(0, 0, 'crack_overlay').setVisible(false).setDepth(5);
        this.crackImage.setDisplaySize(100, 140);

        this.add([this.bg, this.elementIcon, this.titleText, this.text, this.iconPlus, this.iconCross, this.tipBg, this.elementIcon1, this.elementIcon2, this.plusText, this.crackImage]);
        scene.add.existing(this);

        this.crackActive = false;
        this.crackTween = null;
        this.strokeTween = null;
        this.hoverTargets = [];

        this.setDepth(this.originalDepth);
        this.setSize(100, 140);

        if (isPlayer) {
            this.setInteractive({ draggable: true, useHandCursor: true });
            this.setupPlayerInteractions();
        } else {
            this.setInteractive({ useHandCursor: true });
            this.on('pointerover', () => this.showCompositionTooltipIfAny());
            this.on('pointerout', () => this.hideCompositionTooltip());
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
        
        this.elementIcon1.setTexture(`icon_${elements[0].toLowerCase()}`);
        this.elementIcon1.setDisplaySize(25, 25);
        this.elementIcon2.setTexture(`icon_${elements[1].toLowerCase()}`);
        this.elementIcon2.setDisplaySize(25, 25);
        
        this.tipBg.setVisible(true); this.elementIcon1.setVisible(true); this.elementIcon2.setVisible(true); this.plusText.setVisible(true);
        this.tipBg.setSize(132, 52); 
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
            this.crackImage.setVisible(true);
            this.crackActive = true;
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
            this.titleText.setVisible(false);
            this.elementIcon.setTexture(`icon_${this.cardData.name.toLowerCase()}`); this.elementIcon.setVisible(true); this.elementIcon.setDisplaySize(60, 40); 
        }
        this.text.setText(`Lv${this.cardData.level}`); this.text.setColor('#ffffff'); this.text.setStroke('#000000', 4);
    }

    setupPlayerInteractions() {
        this.on('pointerover', () => { this.drawBackground(true); this.showCompositionTooltipIfAny(); });
        this.on('pointerout', () => { this.drawBackground(false); this.hideCompositionTooltip(); });

        this.on('dragstart', () => {
            this.clearCrackPreview(); 
            this.hideCompositionTooltip();
            
            // FIX LỖI ĐÈ DRAWER: Set Depth cố định (80) thay vì bringToTop (Drawer là 100)
            this.originalDepth = this.depth;
            this.setDepth(80);
            
            // FIX LỖI PHÌNH TO MÃI MÃI: Nhân với scale hiện tại, không gán chết
            this.originalScale = this.scale;
            this.scene.tweens.add({ targets: this, scale: this.originalScale * 1.1, duration: 100 });
            this.originalPos = { x: this.x, y: this.y };

            this.strokeTween = this.scene.tweens.add({ targets: this, strokeColor: { from: this.getBaseStrokeColor(), to: 0xffff00 }, yoyo: true, repeat: -1, duration: 300 });
        });

        this.on('drag', (pointer, dragX, dragY) => { this.x = dragX; this.y = dragY; this.checkHoverTargets(); });

        this.on('dragend', () => {
            this.setDepth(this.originalDepth); // Trả lại Depth gốc
            this.scene.tweens.add({ targets: this, scale: this.originalScale, duration: 100 }); // Trả lại Scale gốc
            this.iconPlus.setVisible(false); this.iconCross.setVisible(false);
            
            if (this.strokeTween) { this.strokeTween.remove(); this.strokeTween = null; }
            this.hoverTargets.forEach(target => { if (target.strokeTween) { target.strokeTween.remove(); target.strokeTween = null; }});
            this.hoverTargets = [];
            this.scene.handleCardDrop(this);
        });
    }

    snapBack() {
        this.scene.tweens.add({ targets: this, x: this.originalPos.x, y: this.originalPos.y, duration: 200, ease: 'Back.easeOut' });
    }

    checkHoverTargets() {
        this.iconPlus.setVisible(false); this.iconCross.setVisible(false);
        this.hoverTargets.forEach(target => { if (target.strokeTween) { target.strokeTween.remove(); target.strokeTween = null; }});
        this.hoverTargets = [];

        if (this.scene.playerCoreCard && this.scene.getReserveSlotIndexOfCard?.(this) >= 0) {
            const z = this.scene.getCoreZone?.();
            if (z && Phaser.Math.Distance.Between(this.x, this.y, z.x, z.y) < z.r + 28) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, this.scene.playerCoreCard.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                    this.scene.playerCoreCard.strokeTween = this.scene.tweens.add({ targets: this.scene.playerCoreCard, strokeColor: { from: this.scene.playerCoreCard.getBaseStrokeColor(), to: 0xffff00 }, yoyo: true, repeat: -1, duration: 300 });
                    this.hoverTargets.push(this.scene.playerCoreCard);
                } else { this.iconCross.setVisible(true); }
                return;
            }
        }

        const reserveList = this.scene.getPlayerReserveList?.() ?? this.scene.playerReserveCards ?? [];
        for (let target of reserveList) {
            if (target !== this && Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) < 60) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, target.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                    target.strokeTween = this.scene.tweens.add({ targets: target, strokeColor: { from: target.getBaseStrokeColor(), to: 0xffff00 }, yoyo: true, repeat: -1, duration: 300 });
                    this.hoverTargets.push(target);
                } else { this.iconCross.setVisible(true); }
                break;
            }
        }
    }
}