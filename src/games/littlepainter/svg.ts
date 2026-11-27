/** Builds a picture as an SVG string (for the PNG download and anything drawn outside React). */
import { BOARD_SIZE, DETAIL_STROKE_WIDTH, INK_COLOR, REGION_STROKE_WIDTH, type Picture, type Shape } from './pictures';

const attribute = (name: string, value: string | number | undefined) => (value === undefined ? '' : ` ${name}="${value}"`);

export function shapeMarkup(shape: Shape, extra = ''): string {
  const transform = attribute('transform', shape.transform);
  switch (shape.kind) {
    case 'path': return `<path d="${shape.d}"${transform}${extra}/>`;
    case 'circle': return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"${transform}${extra}/>`;
    case 'ellipse': return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}"${transform}${extra}/>`;
    case 'rect': return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${attribute('rx', shape.radius || undefined)}${transform}${extra}/>`;
  }
}

/** The whole picture with each region filled with `regionFills[region]` (CSS colours). */
export function pictureMarkup(picture: Picture, regionFills: readonly string[], size = BOARD_SIZE): string {
  const regions = picture.regions.map((region, index) =>
    `<g fill="${regionFills[index] ?? '#ffffff'}">${region.shapes.map(shape => shapeMarkup(shape)).join('')}</g>`).join('');
  const details = picture.details.map(detail =>
    shapeMarkup(detail.shape, ` fill="${detail.fill === 'ink' ? INK_COLOR : detail.fill === 'white' ? '#ffffff' : 'none'}"${detail.fill === 'none' ? '' : ' stroke="none"'}`)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD_SIZE} ${BOARD_SIZE}" width="${size}" height="${size}">`
    + `<g stroke="${INK_COLOR}" stroke-width="${REGION_STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round">${regions}</g>`
    + `<g stroke="${INK_COLOR}" stroke-width="${DETAIL_STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round">${details}</g></svg>`;
}
