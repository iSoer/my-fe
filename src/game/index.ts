import Phaser from 'phaser';
import { setPresenter } from '@state/battleUi';
import { MapScene } from './MapScene';
import { CinematicScene } from './CinematicScene';
import { GamePresenter } from './presenter';

export interface BattleGameHandle {
  destroy(): void;
}

/** Монтирует Phaser-игру боя в контейнер и регистрирует Presenter для контроллера боя. */
export function mountBattleGame(parent: HTMLElement): BattleGameHandle {
  // Phaser 3 рендерит в CSS-пикселях; DPR не форсируем ради производительности WebView.
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: false,
    backgroundColor: '#0b0b10',
    scale: {
      mode: Phaser.Scale.RESIZE,
      parent,
      width: '100%',
      height: '100%',
      autoRound: true,
    },
    render: { pixelArt: false, antialias: true, roundPixels: false },
    input: { activePointers: 1 },
    scene: [MapScene, CinematicScene],
    audio: { noAudio: true },
    banner: false,
  } as Phaser.Types.Core.GameConfig);
  const presenter = new GamePresenter(game);
  setPresenter(presenter);
  return {
    destroy() {
      setPresenter(null);
      game.destroy(true);
    },
  };
}

export { MAP_SCENE_KEY } from './MapScene';
export { CINEMATIC_SCENE_KEY } from './CinematicScene';
