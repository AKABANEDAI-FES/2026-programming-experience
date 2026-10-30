export type VisibleArtworkBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type TrailAnchor = {
  x: number;
  y: number;
};

/** 透明でない画素から、描画内容の外接範囲を返す。ごく薄い縁のノイズは除く。 */
export const findVisibleArtworkBounds = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 16,
): VisibleArtworkBounds | null => {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    rgba.length !== width * height * 4
  ) {
    return null;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    if (rgba[pixelIndex * 4 + 3] < alphaThreshold) {
      continue;
    }

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
};

/**
 * 描画範囲の後端を、object-fit・拡大率・傾きを反映した表示座標へ変換する。
 * 絵は右向きに描いてもらうので、後端はいつも絵の左端。左へ進むときは絵を左右反転して表示するため、その位置も反転する
 */
export const getTrailAnchor = (
  bounds: VisibleArtworkBounds,
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
  facing: 'left' | 'right',
  rotationDeg: number,
  visualScale: number,
): TrailAnchor => {
  const fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const offsetX = (containerWidth - sourceWidth * fitScale) / 2;
  const offsetY = (containerHeight - sourceHeight * fitScale) / 2;
  const sourceY = (bounds.minY + bounds.maxY + 1) / 2;
  const unflippedX = offsetX + bounds.minX * fitScale;
  const imageX = facing === 'right' ? unflippedX : containerWidth - unflippedX;
  const imageY = offsetY + sourceY * fitScale;
  const dx = (imageX - containerWidth / 2) * visualScale;
  const dy = (imageY - containerHeight / 2) * visualScale;
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: containerWidth / 2 + dx * cos - dy * sin,
    y: containerHeight / 2 + dx * sin + dy * cos,
  };
};
