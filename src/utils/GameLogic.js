export const Elements = {
    FIRE: { name: 'Fire', color: 0xff4444 },
    WATER: { name: 'Water', color: 0x4444ff },
    WOOD: { name: 'Wood', color: 0x44ff44 },
    METAL: { name: 'Metal', color: 0x7f8c8d },
    EARTH: { name: 'Earth', color: 0x8b4513 }
};

/** Hiển thị Hán Việt (logic vẫn dùng key tiếng Anh nội bộ) */
export const ELEMENT_DISPLAY_VI = {
    Fire: 'Hỏa',
    Earth: 'Thổ',
    Metal: 'Kim',
    Water: 'Thủy',
    Wood: 'Mộc'
};

export function displayElementName(internalName) {
    return ELEMENT_DISPLAY_VI[internalName] ?? internalName;
}

export const DUAL_CARD_BG_COLOR = 0x1f2937;
export const NEUTRAL_DUAL_BG_COLOR = 0x111827;

// Thuật toán bốc 5 lá bài theo yêu cầu GDD
export function drawFiveCards() {
    let pool = { Fire: 1, Water: 1, Wood: 1, Metal: 1, Earth: 1 };
    let counts = { Fire: 0, Water: 0, Wood: 0, Metal: 0, Earth: 0 };
    let hand = [];

    for (let i = 0; i < 5; i++) {
        let totalWeight = Object.values(pool).reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalWeight;
        let sum = 0;
        let picked = null;

        for (let key in pool) {
            sum += pool[key];
            if (rand <= sum) {
                picked = key;
                break;
            }
        }

        hand.push({
            name: picked,
            type: 'Single',
            level: 1,
            elements: [picked],
            color: Elements[picked.toUpperCase()].color
        });
        counts[picked]++;

        if (counts[picked] === 1) pool[picked] /= 2;
        else if (counts[picked] === 2) pool[picked] /= 2;
        else if (counts[picked] >= 3) pool[picked] = 0;
    }
    return hand;
}

// Bảng kết hợp (Merge) theo GDD
export const DualElements = {
    'Fire-Earth': 'Ma Thạch',
    'Earth-Fire': 'Ma Thạch',
    'Earth-Metal': 'Cổ Vật',
    'Metal-Earth': 'Cổ Vật',
    'Metal-Water': 'Hàn Băng',
    'Water-Metal': 'Hàn Băng',
    'Water-Wood': 'Thiên Linh',
    'Wood-Water': 'Thiên Linh',
    'Wood-Fire': 'Lôi Đình',
    'Fire-Wood': 'Lôi Đình',
    'Fire-Metal': 'Thần Binh',
    'Metal-Fire': 'Thần Binh',
    'Metal-Wood': 'Thanh Lam',
    'Wood-Metal': 'Thanh Lam',
    'Wood-Earth': 'Vạn Tượng',
    'Earth-Wood': 'Vạn Tượng',
    'Earth-Water': 'U Minh',
    'Water-Earth': 'U Minh',
    'Water-Fire': 'Yên Diệt',
    'Fire-Water': 'Yên Diệt'
};

function normalizeElements(card) {
    if (Array.isArray(card.elements) && card.elements.length > 0) return card.elements.slice();
    return [card.name];
}

function createSingleCardData(name, level) {
    return {
        name,
        type: 'Single',
        level,
        elements: [name],
        color: Elements[name.toUpperCase()].color
    };
}

function createDualCardData(name, elements, level) {
    return {
        name,
        type: 'Dual',
        level,
        elements: elements.slice(0, 2),
        color: DUAL_CARD_BG_COLOR
    };
}

export function createNeutralDualCardData(level = 1) {
    return {
        name: 'Neutral',
        type: 'Dual',
        level,
        elements: [],
        color: NEUTRAL_DUAL_BG_COLOR
    };
}

export function checkMerge(cardA, cardB) {
    if (cardA.type === 'Single' && cardB.type === 'Single' && cardA.level === cardB.level) {
        if (cardA.name === cardB.name) {
            const nextLevel = cardA.level + 1;
            return { valid: true, cardData: createSingleCardData(cardA.name, nextLevel) };
        }

        const combo = `${cardA.name}-${cardB.name}`;
        if (DualElements[combo]) {
            const dualName = DualElements[combo];
            const elements = [cardA.name, cardB.name];
            return { valid: true, cardData: createDualCardData(dualName, elements, 1) };
        }
    }

    if (cardA.type === 'Dual' && cardB.type === 'Dual' && cardA.name === cardB.name && cardA.level === cardB.level) {
        const nextLevel = cardA.level + 1;
        const elements = normalizeElements(cardA);
        return { valid: true, cardData: createDualCardData(cardA.name, elements, nextLevel) };
    }
    return { valid: false };
}

// =========================
// Combat: khắc (+1) & tương sinh (+0.5)
// =========================

// Khắc: Kim > Mộc > Thổ > Thủy > Hỏa > Kim (attacker khắc defender → +1)
const CONTROLLING_CYCLE = ['Metal', 'Wood', 'Earth', 'Water', 'Fire'];
export const CONTROLLING_CYCLE_ORDER = [...CONTROLLING_CYCLE];

// Tương sinh: Hỏa → Thổ → Kim → Thủy → Mộc → Hỏa (parent generates child; child “thắng” parent với +0.5)
const GENERATION_CYCLE = ['Fire', 'Earth', 'Metal', 'Water', 'Wood'];
export const GENERATION_CYCLE_ORDER = [...GENERATION_CYCLE];

/** 10 tên nguyên tố kép (Lv1 stub cho tra cứu / khám phá). */
export const DUAL_NAME_LIST = [...new Set(Object.values(DualElements))].sort((a, b) => a.localeCompare(b, 'vi'));

export function getStubDualByName(dualName) {
    for (const [combo, v] of Object.entries(DualElements)) {
        if (v !== dualName) continue;
        const [e1, e2] = combo.split('-');
        return {
            name: dualName,
            type: 'Dual',
            level: 1,
            elements: [e1, e2],
            color: DUAL_CARD_BG_COLOR
        };
    }
    return null;
}

/** Chuỗi quan hệ chuẩn (theo thứ tự tên) để hiển thị khi đã khám phá. */
export function canonicalDualRelationshipLine(nameA, nameB) {
    const [first, second] = [nameA, nameB].sort((a, b) => a.localeCompare(b, 'vi'));
    const ca = getStubDualByName(first);
    const cb = getStubDualByName(second);
    if (!ca || !cb) return `${first} ? ${second}`;
    const r = compareCards(ca, cb);
    if (r === 'DRAW') return `${first} = ${second}`;
    if (r === 'WIN') return `${first} > ${second}`;
    return `${second} > ${first}`;
}

export function discoveryKeyForDuals(nameA, nameB) {
    return [nameA, nameB].sort((a, b) => a.localeCompare(b, 'vi')).join('|');
}

function idxGen(el) {
    return GENERATION_CYCLE.indexOf(el);
}

function generates(parent, child) {
    const i = idxGen(parent);
    if (i < 0) return false;
    return GENERATION_CYCLE[(i + 1) % GENERATION_CYCLE.length] === child;
}

function isKhac(attacker, defender) {
    if (attacker === defender) return false;
    const a = CONTROLLING_CYCLE.indexOf(attacker);
    if (a < 0) return false;
    const beats = CONTROLLING_CYCLE[(a + 1) % CONTROLLING_CYCLE.length];
    return beats === defender;
}

/**
 * Điểm từ góc nhìn attackerElement vs defenderElement.
 * Khắc: +1 / -1. Tương sinh (con thắng cha): +0.5 / -0.5.
 */
export function duelScoreAttackerVsDefender(attackerElement, defenderElement) {
    if (attackerElement === defenderElement) return 0;
    if (isKhac(attackerElement, defenderElement)) return 1;
    if (isKhac(defenderElement, attackerElement)) return -1;
    if (generates(defenderElement, attackerElement)) return 0.5;
    if (generates(attackerElement, defenderElement)) return -0.5;
    return 0;
}

function getElementsForFight(card) {
    const els = normalizeElements(card);
    if (card.type === 'Dual') return els.slice(0, 2);
    return els.slice(0, 1);
}

/** Tổng điểm của một lá khi so với lá đối thủ (mỗi nguyên tố lấy max theo 2 nguyên tố đối phương). */
export function dualTotalMatchupScore(card, opponentCard) {
    const aEls = getElementsForFight(card);
    const bEls = getElementsForFight(opponentCard);
    let total = 0;
    for (const a of aEls) {
        let best = -Infinity;
        for (const b of bEls) {
            const s = duelScoreAttackerVsDefender(a, b);
            if (s > best) best = s;
        }
        total += best === -Infinity ? 0 : best;
    }
    return total;
}

export function elementalScore(cardA, cardB) {
    if (cardA.type === 'Single' && cardB.type === 'Single') {
        return duelScoreAttackerVsDefender(getElementsForFight(cardA)[0], getElementsForFight(cardB)[0]);
    }
    if (cardA.type === 'Dual' && cardB.type === 'Dual') {
        return dualTotalMatchupScore(cardA, cardB) - dualTotalMatchupScore(cardB, cardA);
    }
    return 0;
}

function singleVsSingleCompare(cardA, cardB) {
    const ea = getElementsForFight(cardA)[0];
    const eb = getElementsForFight(cardB)[0];

    if (ea === eb) {
        if (cardA.level > cardB.level) return 'WIN';
        if (cardA.level < cardB.level) return 'LOSE';
        return 'DRAW';
    }

    const s = duelScoreAttackerVsDefender(ea, eb);
    if (s > 0) return 'WIN';
    if (s < 0) return 'LOSE';
    // Khác nguyên tố mà điểm = 0 (lý thuyết hiếm): tie-break ổn định
    return ea < eb ? 'WIN' : 'LOSE';
}

export function compareCards(cardA, cardB) {
    if (cardA.type === 'Dual' && cardB.type === 'Single') return 'WIN';
    if (cardA.type === 'Single' && cardB.type === 'Dual') return 'LOSE';

    if (cardA.type === 'Single' && cardB.type === 'Single') {
        return singleVsSingleCompare(cardA, cardB);
    }

    if (cardA.type === 'Dual' && cardB.type === 'Dual') {
        const diff = elementalScore(cardA, cardB);
        if (diff > 0) return 'WIN';
        if (diff < 0) return 'LOSE';
        if (cardA.level > cardB.level) return 'WIN';
        if (cardA.level < cardB.level) return 'LOSE';
        return 'DRAW';
    }

    return 'DRAW';
}

/**
 * Góc nhìn người chơi (cardA = lá mình, cardB = địch).
 * Trả về bên nào "yếu hơn" cần hiệu ứng nứt: 'player' | 'enemy' | 'both' | 'none'
 */
export function getWeakSideForPreview(playerCard, enemyCard) {
    if (!playerCard || !enemyCard) return 'none';
    const r = compareCards(playerCard, enemyCard);
    if (r === 'WIN') return 'enemy';
    if (r === 'LOSE') return 'player';
    return 'both';
}

/**
 * Text thành phần cho tooltip: Dual = "Hỏa + Thủy"; Single Lv>=2 = "Hỏa + Hỏa"; Lv1 = null (không hiện).
 */
export function getCompositionTooltipText(cardData) {
    if (!cardData) return null;
    if (cardData.type === 'Dual' && Array.isArray(cardData.elements) && cardData.elements.length >= 2) {
        return [cardData.elements[0], cardData.elements[1]];
    }
    if (cardData.type === 'Single' && (cardData.level ?? 1) >= 2) {
        return [cardData.name, cardData.name];
    }
    return null;
}
