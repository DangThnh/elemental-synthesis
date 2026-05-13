import Phaser from 'phaser';
import { displayElementName, getCompositionTooltipText, Elements } from '../utils/GameLogic';

export default class Card extends Phaser.GameObjects.Container {
    constructor(scene, x, y, cardData, isPlayer) {
        super(scene, x, y);
        this.scene = scene;
        this.cardData = cardData;
        this.isPlayer = isPlayer;
        this.originalPos = { x, y };

        // 1. Sử dụng Graphics để vẽ nền (hỗ trợ Gradient)
        this.bg = scene.add.graphics();
        this.drawBackground();

        const isDual = cardData.type === 'Dual';
        const line1 = this.getTitleLine();
        const line2 = `Lv${cardData.level}`;
        
        this.text = scene.add.text(0, -6, `${line1}\n${line2}`, {
            fontSize: '22px',
            color: isDual ? '#ffd700' : '#ffffff',
            fontStyle: 'bold',
            wordWrap: { width: 94 },
            align: 'center',
            lineSpacing: 4
        }).setOrigin(0.5);

        this.text.setStroke('#000000', isDual ? 5 : 4);

        // Icons tương tác
        this.iconPlus = scene.add.text(35, -55, '+', { fontSize: '30px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false);
        this.iconCross = scene.add.text(35, -55, 'X', { fontSize: '30px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false);

        // Tooltip thông tin cấu thành
        this.tipBg = scene.add.rectangle(0, -118, 132, 52, 0x1a1a1a, 0.95).setStrokeStyle(2, 0xffd700).setVisible(false);
        this.tipText = scene.add.text(0, -118, '', {
            fontSize: '18px',
            color: '#ffeeaa',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 124 }
        }).setOrigin(0.5).setVisible(false);
        this.tipText.setStroke('#000000', 3);

        // Lớp vẽ vết nứt
        this.crackG = scene.add.graphics();
        this.crackG.setDepth(5);

        this.add([this.bg, this.text, this.iconPlus, this.iconCross, this.tipBg, this.tipText, this.crackG]);
        scene.add.existing(this);

        this.crackActive = false;
        this.crackTween = null;

        this.setDepth(isPlayer ? 2 : 1);
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

    // Vẽ nền thẻ bài: Màu đơn cho thẻ Single, Gradient cho thẻ Dual
    drawBackground(isHover = false) {
        this.bg.clear();
        const w = 100;
        const h = 140;
        const strokeColor = isHover ? 0xffff00 : this.getBaseStrokeColor();
        const thickness = isHover ? 4 : 2;

        if (this.cardData.type === 'Dual' && this.cardData.elements && this.cardData.elements.length >= 2) {
            const color1 = Elements[this.cardData.elements[0].toUpperCase()].color;
            const color2 = Elements[this.cardData.elements[1].toUpperCase()].color;
            // Vẽ dải màu từ nguyên tố 1 sang nguyên tố 2
            this.bg.fillGradientStyle(color1, color1, color2, color2, 1);
        } else {
            this.bg.fillStyle(this.cardData.color, 1);
        }

        this.bg.fillRect(-w / 2, -h / 2, w, h);
        this.bg.lineStyle(thickness, strokeColor, 1);
        this.bg.strokeRect(-w / 2, -h / 2, w, h);
    }

    getTitleLine() {
        if (this.cardData.type === 'Dual') return this.cardData.name;
        return displayElementName(this.cardData.name);
    }

    getBaseStrokeColor() {
        if ((this.cardData?.level ?? 1) >= 2) return 0xffd700;
        return 0xffffff;
    }

    showCompositionTooltipIfAny() {
        const tip = getCompositionTooltipText(this.cardData);
        if (!tip) {
            this.hideCompositionTooltip();
            return;
        }
        this.tipText.setText(tip);
        this.tipBg.setVisible(true);
        this.tipText.setVisible(true);
        this.tipBg.setSize(Math.min(200, Math.max(132, this.tipText.width + 16)), Math.max(48, this.tipText.height + 14));
    }

    hideCompositionTooltip() {
        this.tipBg.setVisible(false);
        this.tipText.setVisible(false);
    }

    clearCrackPreview() {
        this.crackActive = false;
        if (this.crackTween) {
            this.crackTween.remove();
            this.crackTween = null;
        }
        this.crackG.clear();
        this.setAlpha(1);
    }

    setCrackPreview(active) {
        if (active) {
            if (this.crackActive) return; // Nếu đang nứt rồi thì không vẽ lại
            this.drawCrackPattern();
            this.crackActive = true;
            if (!this.crackTween && this.scene) {
                this.crackTween = this.scene.tweens.add({
                    targets: this,
                    alpha: { from: 0.82, to: 1 },
                    duration: 520,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        } else {
            this.clearCrackPreview();
        }
    }

    drawCrackPattern() {
        this.crackG.clear();
        const w = 102;
        const h = 134;
        this.crackG.lineStyle(2, 0xffffff, 0.55);
        const lines = [
            [-w * 0.4, -h * 0.35, w * 0.15, h * 0.1],
            [w * 0.1, -h * 0.45, -w * 0.2, h * 0.25],
            [-w * 0.15, h * 0.05, w * 0.42, h * 0.38],
            [0, -h * 0.2, -w * 0.35, h * 0.42],
            [w * 0.25, 0, w * 0.4, -h * 0.25]
        ];
        for (const [x1, y1, x2, y2] of lines) {
            this.crackG.beginPath();
            this.crackG.moveTo(x1, y1);
            this.crackG.lineTo(x2, y2);
            this.crackG.strokePath();
        }
    }

    refreshVisuals() {
        this.drawBackground();
        const isDual = this.cardData.type === 'Dual';
        const line1 = this.getTitleLine();
        const line2 = `Lv${this.cardData.level}`;
        this.text.setText(`${line1}\n${line2}`);
        this.text.setColor(isDual ? '#ffd700' : '#ffffff');
        this.text.setStroke('#000000', isDual ? 5 : 4);
    }

    setupPlayerInteractions() {
        this.on('pointerover', () => {
            this.drawBackground(true); // Hiện viền highlight
            this.showCompositionTooltipIfAny();
        });
        this.on('pointerout', () => {
            this.drawBackground(false); // Trả lại viền cũ
            this.hideCompositionTooltip();
        });

        this.on('dragstart', () => {
            this.clearCrackPreview(); // QUAN TRỌNG: Xóa nứt ngay khi nhấc lá bài lên
            this.hideCompositionTooltip();
            this.scene.children.bringToTop(this);
            this.scene.tweens.add({ targets: this, scale: 0.8, duration: 100 });
            this.originalPos = { x: this.x, y: this.y };
        });

        this.on('drag', (pointer, dragX, dragY) => {
            this.x = dragX;
            this.y = dragY;
            this.checkHoverTargets();
        });

        this.on('dragend', () => {
            this.scene.tweens.add({ targets: this, scale: 1, duration: 100 });
            this.iconPlus.setVisible(false);
            this.iconCross.setVisible(false);
            this.scene.handleCardDrop(this);
        });
    }

    snapBack() {
        this.scene.tweens.add({ targets: this, x: this.originalPos.x, y: this.originalPos.y, duration: 200, ease: 'Back.easeOut' });
    }

    checkHoverTargets() {
        this.iconPlus.setVisible(false);
        this.iconCross.setVisible(false);

        // Check đè lên Core Slot trống
        if (!this.scene.playerCoreCard && this.scene.getReserveSlotIndexOfCard?.(this) >= 0) {
            const z = this.scene.getCoreZone?.();
            if (z && Phaser.Math.Distance.Between(this.x, this.y, z.x, z.y) < z.r + 28) {
                this.iconPlus.setVisible(true);
                return;
            }
        }

        // Check đè lên Slot trống trong Reserve
        const emptyIdx = this.scene.getNearestEmptyReserveSlotIndex?.(this.x, this.y);
        if (emptyIdx != null && emptyIdx >= 0) {
            this.iconPlus.setVisible(true);
            return;
        }

        // Check đè lên lá bài khác (Merge/Swap)
        const reserveList = this.scene.getPlayerReserveList?.() ?? this.scene.playerReserveCards ?? [];
        const allTargetCards = reserveList.concat(this.scene.playerCoreCard ? [this.scene.playerCoreCard] : []);

        for (let target of allTargetCards) {
            if (target !== this && Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) < 60) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, target.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                } else if (target === this.scene.playerCoreCard) {
                    this.iconPlus.setVisible(true);
                } else {
                    this.iconCross.setVisible(true);
                }
                break;
            }
        }
    }
}