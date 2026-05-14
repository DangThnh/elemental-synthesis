import Phaser from 'phaser';
import {
    displayElementName,
    DUAL_NAME_LIST,
    canonicalDualRelationshipLine,
    discoveryKeyForDuals,
    CONTROLLING_CYCLE_ORDER,
    GENERATION_CYCLE_ORDER
} from '../utils/GameLogic';

const LS_KEY = 'elemental-synthesis-dual-discoveries';

export function loadDiscoveredDualKeys() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

export function saveDiscoveredDualKeys(set) {
    localStorage.setItem(LS_KEY, JSON.stringify([...set]));
}

/** Ghi nhận khi người chơi đã "thấy" trận kép vs kép. */
export function discoverDualPairFromFight(nameA, nameB) {
    if (!nameA || !nameB || nameA === nameB) return;
    const key = discoveryKeyForDuals(nameA, nameB);
    const s = loadDiscoveredDualKeys();
    if (s.has(key)) return;
    s.add(key);
    saveDiscoveredDualKeys(s);
}

function elementColorHex(internal) {
    const map = {
        Fire: 0xff4444,
        Water: 0x4444ff,
        Wood: 0x44ff44,
        Metal: 0x9aa0a6,
        Earth: 0xc17f59
    };
    return map[internal] ?? 0xffffff;
}

function drawArrowLine(g, x1, y1, x2, y2, color, width) {
    g.lineStyle(width, color, 1);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = 10;
    const aw = 7;
    const bx = x2 - Math.cos(ang) * 14;
    const by = y2 - Math.sin(ang) * 14;
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(bx + Math.cos(ang + 2.6) * aw, by + Math.sin(ang + 2.6) * aw);
    g.lineTo(bx + Math.cos(ang - 2.6) * aw, by + Math.sin(ang - 2.6) * aw);
    g.closePath();
    g.fillPath();
}

/** Cung tròn nhẹ từ góc a1 đến a2 (rad), bán kính R, tâm cx,cy — mũi tên ở cuối cung. */
function drawArcArrow(g, cx, cy, R, a1, a2, color, width) {
    g.lineStyle(width, color, 1);
    g.beginPath();
    g.arc(cx, cy, R, a1, a2, false);
    g.strokePath();
    const ang = a2;
    const x2 = cx + Math.cos(ang) * R;
    const y2 = cy + Math.sin(ang) * R;
    const tang = ang + Math.PI / 2;
    const bx = x2 - Math.cos(ang) * 12;
    const by = y2 - Math.sin(ang) * 12;
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(bx + Math.cos(tang + 2.5) * 6, by + Math.sin(tang + 2.5) * 6);
    g.lineTo(bx + Math.cos(tang - 2.5) * 6, by + Math.sin(tang - 2.5) * 6);
    g.closePath();
    g.fillPath();
}

function buildAllDualPairRows() {
    const rows = [];
    for (let i = 0; i < DUAL_NAME_LIST.length; i++) {
        for (let j = i + 1; j < DUAL_NAME_LIST.length; j++) {
            const a = DUAL_NAME_LIST[i];
            const b = DUAL_NAME_LIST[j];
            rows.push({ key: discoveryKeyForDuals(a, b), line: canonicalDualRelationshipLine(a, b) });
        }
    }
    return rows;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {{ container: Phaser.GameObjects.Container, setVisible: (v:boolean)=>void, refreshDiscoveryList: ()=>void }}
 */
export function createHelpReferencePanel(scene) {
    const { width, height } = scene.scale;
    const container = scene.add.container(0, 0);
    container.setDepth(9999);
    container.setVisible(false);

    const backdrop = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setInteractive();
    backdrop.on('pointerdown', () => {});
    container.add(backdrop);

    const panelW = Math.min(680, width - 24);
    const panelH = Math.min(1180, height - 24);
    const panel = scene.add.rectangle(width / 2, height / 2, panelW, panelH, 0x1e1e2e, 0.97).setStrokeStyle(3, 0xffd700);
    container.add(panel);

    const closeBtn = scene.add
        .text(width / 2 + panelW / 2 - 28, height / 2 - panelH / 2 + 22, '✕', {
            fontSize: '28px',
            color: '#ff6666',
            fontStyle: 'bold'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => container.setVisible(false));
    container.add(closeBtn);

    let yTop = height / 2 - panelH / 2 + 36;
    const cxPanel = width / 2;

    const title = scene.add
        .text(cxPanel, yTop, 'TRA CỨU NGŨ HÀNH', { fontSize: '32px', color: '#ffd700', fontStyle: 'bold' })
        .setOrigin(0.5);
    container.add(title);
    yTop += 42;

    // --- Bảng 1: Tương khắc (ngôi sao 5 cánh — các cạnh có hướng) ---
    const khacHeader = scene.add
        .text(cxPanel, yTop, 'Tương khắc (ngũ hành)', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
    container.add(khacHeader);
    yTop += 34;

    const khacCx = cxPanel;
    const khacCy = yTop + 95;
    const R = 78;
    const posKhac = {};
    for (let i = 0; i < 5; i++) {
        const el = CONTROLLING_CYCLE_ORDER[i];
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        posKhac[el] = { x: khacCx + Math.cos(ang) * R, y: khacCy + Math.sin(ang) * R };
    }

    const gKhac = scene.add.graphics();
    gKhac.lineStyle(2, 0x555555, 0.6);
    gKhac.beginPath();
    for (let i = 0; i < 5; i++) {
        const el = CONTROLLING_CYCLE_ORDER[i];
        const el2 = CONTROLLING_CYCLE_ORDER[(i + 1) % 5];
        gKhac.moveTo(posKhac[el].x, posKhac[el].y);
        gKhac.lineTo(posKhac[el2].x, posKhac[el2].y);
    }
    gKhac.closePath();
    gKhac.strokePath();

    for (let i = 0; i < 5; i++) {
        const a = CONTROLLING_CYCLE_ORDER[i];
        const b = CONTROLLING_CYCLE_ORDER[(i + 1) % 5];
        const c = elementColorHex(a);
        drawArrowLine(gKhac, posKhac[a].x, posKhac[a].y, posKhac[b].x, posKhac[b].y, c, 4);
    }
    container.add(gKhac);

    for (const el of CONTROLLING_CYCLE_ORDER) {
        const { x, y } = posKhac[el];
        const t = scene.add
            .text(x, y, displayElementName(el), {
                fontSize: '20px',
                color: '#fff',
                fontStyle: 'bold',
                backgroundColor: '#000000cc',
                padding: { x: 8, y: 6 }
            })
            .setOrigin(0.5);
        t.setStroke('#000', 5);
        container.add(t);
    }

    yTop = khacCy + R + 38;
    const sampleKhacG = scene.add.graphics();
    drawArrowLine(sampleKhacG, cxPanel - 120, yTop, cxPanel - 70, yTop, 0xff6666, 3);
    container.add(sampleKhacG);
    const legKhac = scene.add
        .text(cxPanel - 55, yTop, 'Tương khắc: +1 điểm', { fontSize: '19px', color: '#ffaaaa', fontStyle: 'bold' })
        .setOrigin(0, 0.5);
    container.add(legKhac);
    yTop += 42;

    // --- Bảng 2: Tương sinh (vòng cung) ---
    const sinhHeader = scene.add
        .text(cxPanel, yTop, 'Tương sinh (vòng tròn)', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
    container.add(sinhHeader);
    yTop += 34;

    const sinhCx = cxPanel;
    const sinhCy = yTop + 105;
    const Rs = 86;
    const posSinh = {};
    for (let i = 0; i < 5; i++) {
        const el = GENERATION_CYCLE_ORDER[i];
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        posSinh[el] = { x: sinhCx + Math.cos(ang) * Rs, y: sinhCy + Math.sin(ang) * Rs };
    }

    const gSinh = scene.add.graphics();
    gSinh.lineStyle(2, 0x446688, 0.65);
    gSinh.strokeCircle(sinhCx, sinhCy, Rs);

    for (let i = 0; i < 5; i++) {
        const parent = GENERATION_CYCLE_ORDER[i];
        const child = GENERATION_CYCLE_ORDER[(i + 1) % 5];
        const a1 = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + 0.3;
        const a2 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / 5 - 0.3;
        const col = elementColorHex(child);
        drawArcArrow(gSinh, sinhCx, sinhCy, Rs + 10, a1, a2, col, 3);
    }
    container.add(gSinh);

    for (const el of GENERATION_CYCLE_ORDER) {
        const { x, y } = posSinh[el];
        const t = scene.add
            .text(x, y, displayElementName(el), {
                fontSize: '20px',
                color: '#fff',
                fontStyle: 'bold',
                backgroundColor: '#000000cc',
                padding: { x: 8, y: 6 }
            })
            .setOrigin(0.5);
        t.setStroke('#000', 5);
        container.add(t);
    }

    yTop = sinhCy + Rs + 38;
    const sampleSinhG = scene.add.graphics();
    drawArcArrow(sampleSinhG, cxPanel - 95, yTop + 4, 32, Math.PI * 0.15, Math.PI * 1.05, 0x66ccff, 2);
    container.add(sampleSinhG);
    const legSinh = scene.add
        .text(cxPanel - 55, yTop, 'Phản tương sinh: +0,5 điểm (con thắng cha)', {
            fontSize: '18px',
            color: '#aaddff',
            fontStyle: 'bold',
            wordWrap: { width: panelW - 80 }
        })
        .setOrigin(0, 0.5);
    container.add(legSinh);
    yTop += 48;

    const dualTitle = scene.add
        .text(cxPanel, yTop, 'Cặp đấu nguyên tố kép (khám phá qua đấu)', {
            fontSize: '20px',
            color: '#ffee88',
            fontStyle: 'bold'
        })
        .setOrigin(0.5);
    container.add(dualTitle);
    yTop += 34;

    const pairRows = buildAllDualPairRows();
    const listText = scene.add
        .text(cxPanel - panelW / 2 + 20, yTop, '', {
            fontSize: '16px',
            color: '#dddddd',
            wordWrap: { width: panelW - 40 },
            lineSpacing: 6
        })
        .setOrigin(0, 0);
    container.add(listText);

    function refreshDiscoveryList() {
        const discovered = loadDiscoveredDualKeys();
        const lines = pairRows.map((row) => {
            if (discovered.has(row.key)) return `• ${row.line}`;
            return '• ??? vs ???';
        });
        listText.setText(lines.join('\n'));
    }

    refreshDiscoveryList();

    return {
        container,
        setVisible: (v) => {
            container.setVisible(v);
            if (v) {
                scene.children.bringToTop(container);
                refreshDiscoveryList();
            }
        },
        refreshDiscoveryList
    };
}
