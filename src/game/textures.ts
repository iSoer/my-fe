import type Phaser from 'phaser';

export const TEX = {
  tile: 'tex_tile',
  disc: 'tex_disc',
  ring: 'tex_ring',
  dot: 'tex_dot',
  pool: 'tex_pool',
  splat: 'tex_splat',
  square: 'tex_square',
  corner: 'tex_corner',
  star: 'tex_star',
} as const;

/** Плейсхолдерные текстуры, рисуются один раз на Graphics. */
export function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.disc)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 32, 32);
  g.generateTexture(TEX.square, 32, 32);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, 64, 64, 8);
  g.generateTexture(TEX.tile, 64, 64);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(32, 32, 30);
  g.generateTexture(TEX.disc, 64, 64);

  g.clear();
  g.lineStyle(6, 0xffffff, 1);
  g.strokeCircle(32, 32, 29);
  g.generateTexture(TEX.ring, 64, 64);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture(TEX.dot, 8, 8);

  // Лужа: несколько перекрывающихся кругов
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(32, 26, 54, 30);
  g.fillCircle(14, 30, 10);
  g.fillCircle(50, 32, 9);
  g.fillCircle(30, 40, 7);
  g.fillCircle(44, 14, 6);
  g.generateTexture(TEX.pool, 64, 48);

  // Уголок прицела (L-образная скобка), 32×32, толщина 6
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, 32, 7, 3);
  g.fillRoundedRect(0, 0, 7, 32, 3);
  g.generateTexture(TEX.corner, 32, 32);

  // Звёздочка-искра (четырёхлучевая)
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(8, 0, 10, 6, 6, 6);
  g.fillTriangle(8, 16, 10, 10, 6, 10);
  g.fillTriangle(0, 8, 6, 6, 6, 10);
  g.fillTriangle(16, 8, 10, 6, 10, 10);
  g.fillCircle(8, 8, 2.5);
  g.generateTexture(TEX.star, 16, 16);

  // Брызг
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 9);
  g.fillCircle(6, 10, 4);
  g.fillCircle(27, 8, 3);
  g.fillCircle(25, 25, 4);
  g.fillCircle(8, 25, 3);
  g.generateTexture(TEX.splat, 32, 32);

  g.destroy();
}
