/** Растеризация SVG-строк в изображения для Phaser (и data-URI для CSS). */

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`
}

/**
 * Только растеризации в полёте: одинаковые запросы ждут одну картинку. Готовую держит менеджер текстур Phaser
 * и освобождает вместе с игрой; постоянный кэш держал бы все картинки сессии (каждый бой и заход в деревню),
 * и на iOS страницу выгружало по памяти.
 */
const cache = new Map<string, Promise<HTMLImageElement>>()

/** Загрузить SVG как картинку заданного пиксельного размера. Одновременные запросы с тем же ключом — одна загрузка. */
export function svgToImage(key: string, svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const cacheKey = `${key}@${width}x${height}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(width, height)
    img.decoding = "async"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`svg raster failed: ${key}`))
    // Явные width/height в корне SVG нужны, чтобы браузер отрисовал картинку нужного размера; заданные в самом SVG
    // убираем, иначе атрибуты задвоятся и картинка не загрузится.
    const sized = svg.replace(/<svg\b[^>]*>/, tag =>
      tag.replace(/\s(width|height)="[^"]*"/g, "").replace(/^<svg/, `<svg width="${width}" height="${height}"`))
    img.src = svgDataUri(sized)
  })
  cache.set(cacheKey, p)
  const drop = (): void => {
    if (cache.get(cacheKey) === p) cache.delete(cacheKey)
  }
  p.then(drop, drop)
  return p
}

export function clearRasterCache(): void {
  cache.clear()
}
