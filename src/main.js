import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import './style.css';

// Kích thước chuẩn cho 9:16 (Ví dụ: 720x1280)
const config = {
    type: Phaser.AUTO,
    parent: 'app',
    width: 720,
    height: 1280,
    backgroundColor: '#2d2d2d',
    scale: {
        mode: Phaser.Scale.FIT, // Vừa khít màn hình, giữ đúng tỉ lệ 9:16
        autoCenter: Phaser.Scale.CENTER_BOTH, // Căn giữa màn hình
    },
    scene: [BattleScene] // Tạm thời load thẳng vào BattleScene cho MVP
};

const game = new Phaser.Game(config);