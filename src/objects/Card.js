import Phaser from 'phaser';
import { Elements } from '../utils/GameLogic';

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

        // Element icon for Single cards
        this.elementIcon = scene.add.image(0, -30, null).setVisible(false);
        if (cardData.type === 'Single') {
            this.elementIcon.setTexture(`icon_${cardData.name.toLowerCase()}`);
            this.elementIcon.setVisible(true);
            this.elementIcon.setDisplaySize(60, 40); // Fixed frame size to contain icon
        }

        // Title text for Dual cards
        this.titleText = scene.add.text(0, -30, cardData.type === 'Dual' ? cardData.name : '', {
            fontSize: '22px',
            color: '#ffd700',
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5);
        this.titleText.setStroke('#000000', 5);

        const line2 = `Lv${cardData.level}`;
        
        this.text = scene.add.text(0, 10, line2, {
            fontSize: '22px',
            color: '#ffffff',
            fontStyle: 'bold',
            wordWrap: { width: 94 },
            align: 'center',
            lineSpacing: 4
        }).setOrigin(0.5);

        this.text.setStroke('#000000', 4);

        // Icons tương tác
        this.iconPlus = scene.add.text(35, -55, '+', { fontSize: '60px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false);
        this.iconPlus.setStroke('#000000', 6);
        this.iconCross = scene.add.text(35, -55, 'X', { fontSize: '60px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false);
        this.iconCross.setStroke('#000000', 6);

        // Tooltip thông tin cấu thành
        this.tipBg = scene.add.rectangle(0, -118, 132, 52, 0x1a1a1a, 0.95).setStrokeStyle(2, 0xffd700).setVisible(false);
        this.elementIcon1 = scene.add.image(-20, -118, null).setVisible(false);
        this.elementIcon2 = scene.add.image(20, -118, null).setVisible(false);
        this.plusText = scene.add.text(0, -118, '+', {
            fontSize: '18px',
            color: '#ffeeaa',
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5).setVisible(false);
        this.plusText.setStroke('#000000', 3);

        // Crack overlay image
        this.crackImage = scene.add.image(0, 0, 'crack_overlay').setVisible(false);
        this.crackImage.setDepth(5);
        this.crackImage.setDisplaySize(100, 140); // Fixed to card size to contain within card

        this.add([this.bg, this.elementIcon, this.titleText, this.text, this.iconPlus, this.iconCross, this.tipBg, this.elementIcon1, this.elementIcon2, this.plusText, this.crackImage]);
        scene.add.existing(this);

        this.crackActive = false;
        this.crackTween = null;
        this.strokeTween = null;
        this.hoverTargets = [];

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
        if (elements.length < 2) {
            this.hideCompositionTooltip();
            return;
        }
        this.elementIcon1.setTexture(`icon_${elements[0].toLowerCase()}`);
        this.elementIcon1.setDisplaySize(25, 25); // Fixed frame size for tooltip icons
        this.elementIcon2.setTexture(`icon_${elements[1].toLowerCase()}`);
        this.elementIcon2.setDisplaySize(25, 25); // Fixed frame size for tooltip icons
        this.tipBg.setVisible(true);
        this.elementIcon1.setVisible(true);
        this.elementIcon2.setVisible(true);
        this.plusText.setVisible(true);
        this.tipBg.setSize(132, 52); // Fixed size or adjust if needed
    }

    hideCompositionTooltip() {
        this.tipBg.setVisible(false);
        this.elementIcon1.setVisible(false);
        this.elementIcon2.setVisible(false);
        this.plusText.setVisible(false);
    }

    clearCrackPreview() {
        this.crackActive = false;
        if (this.crackTween) {
            this.crackTween.remove();
            this.crackTween = null;
        }
        this.crackImage.setVisible(false);
        this.setAlpha(1);
    }

    setCrackPreview(active) {
        if (active) {
            if (this.crackActive) return; // Nếu đang nứt rồi thì không vẽ lại
            this.crackImage.setVisible(true);
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



    refreshVisuals() {
        this.drawBackground();
        if (this.cardData.type === 'Dual') {
            this.titleText.setText(this.cardData.name);
            this.titleText.setVisible(true);
            this.elementIcon.setVisible(false);
        } else {
            this.titleText.setVisible(false);
            this.elementIcon.setTexture(`icon_${this.cardData.name.toLowerCase()}`);
            this.elementIcon.setVisible(true);
            this.elementIcon.setDisplaySize(60, 40); // Ensure fixed size
        }
        const line2 = `Lv${this.cardData.level}`;
        this.text.setText(line2);
        this.text.setColor('#ffffff');
        this.text.setStroke('#000000', 4);
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
            // Start stroke flashing
            this.strokeTween = this.scene.tweens.add({
                targets: this,
                strokeColor: { from: this.getBaseStrokeColor(), to: 0xffff00 },
                yoyo: true,
                repeat: -1,
                duration: 300
            });
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
            // Stop stroke flashing
            if (this.strokeTween) {
                this.strokeTween.remove();
                this.strokeTween = null;
            }
            // Stop flashing for hover targets
            this.hoverTargets.forEach(target => {
                if (target.strokeTween) {
                    target.strokeTween.remove();
                    target.strokeTween = null;
                }
            });
            this.hoverTargets = [];
            this.scene.handleCardDrop(this);
        });
    }

    snapBack() {
        this.scene.tweens.add({ targets: this, x: this.originalPos.x, y: this.originalPos.y, duration: 200, ease: 'Back.easeOut' });
    }

    checkHoverTargets() {
        this.iconPlus.setVisible(false);
        this.iconCross.setVisible(false);

        // Stop previous hover tweens
        this.hoverTargets.forEach(target => {
            if (target.strokeTween) {
                target.strokeTween.remove();
                target.strokeTween = null;
            }
        });
        this.hoverTargets = [];

        // Check đè lên Core Slot
        if (this.scene.playerCoreCard && this.scene.getReserveSlotIndexOfCard?.(this) >= 0) {
            const z = this.scene.getCoreZone?.();
            if (z && Phaser.Math.Distance.Between(this.x, this.y, z.x, z.y) < z.r + 28) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, this.scene.playerCoreCard.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                    // Start flashing for mergeable core card
                    this.scene.playerCoreCard.strokeTween = this.scene.tweens.add({
                        targets: this.scene.playerCoreCard,
                        strokeColor: { from: this.scene.playerCoreCard.getBaseStrokeColor(), to: 0xffff00 },
                        yoyo: true,
                        repeat: -1,
                        duration: 300
                    });
                    this.hoverTargets.push(this.scene.playerCoreCard);
                } else {
                    this.iconCross.setVisible(true);
                }
                return;
            }
        }

        // Check đè lên lá bài khác trong Reserve (chỉ merge)
        const reserveList = this.scene.getPlayerReserveList?.() ?? this.scene.playerReserveCards ?? [];

        for (let target of reserveList) {
            if (target !== this && Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) < 60) {
                const mergeData = this.scene.logic.checkMerge(this.cardData, target.cardData);
                if (mergeData.valid) {
                    this.iconPlus.setVisible(true);
                    // Start flashing for mergeable target
                    target.strokeTween = this.scene.tweens.add({
                        targets: target,
                        strokeColor: { from: target.getBaseStrokeColor(), to: 0xffff00 },
                        yoyo: true,
                        repeat: -1,
                        duration: 300
                    });
                    this.hoverTargets.push(target);
                } else {
                    this.iconCross.setVisible(true);
                }
                break;
            }
        }
    }
}