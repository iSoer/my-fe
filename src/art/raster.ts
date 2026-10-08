/** Растеризация SVG-строк в изображения для Phaser (и data-URI для CSS). */

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Загрузить SVG как картинку заданного пиксельного размера. Кэшируется по ключу. */
export function svgToImage(key: string, svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const cacheKey = `${key}@${width}x${height}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(width, height);
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`svg raster failed: ${key}`));
    // Явные width/height в корне SVG нужны, чтобы браузер отрисовал картинку нужного размера.
    const sized = svg.replace(/<svg\b/, `<svg width="${width}" height="${height}"`);
    img.src = svgDataUri(sized);
  });
  cache.set(cacheKey, p);
  return p;
}

export function clearRasterCache(): void {
  cache.clear();
}
