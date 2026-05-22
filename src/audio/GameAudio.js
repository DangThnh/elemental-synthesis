import { AUDIO_MANIFEST } from './audioConfig';

/**
 * Phát SFX nếu đã preload vào cache; không báo lỗi nếu thiếu file.
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {object} [opts]
 */
export function playSfx(scene, key, opts = {}) {
    if (!scene?.cache?.audio?.exists(key)) return;
    try {
        scene.sound.play(key, { volume: opts.volume ?? 0.65, ...opts });
    } catch {
        /* ignore */
    }
}

/** Gọi từ BattleScene.preload() */
export function preloadBattleAudio(scene) {
    for (const [key, url] of Object.entries(AUDIO_MANIFEST)) {
        if (!scene.cache.audio.exists(key)) {
            scene.load.audio(key, url);
        }
    }
}
