export type ClearOuterBackgroundOptions = {
  /** 白とみなす RGB の色距離の許容差。アンチエイリアスの薄い縁まで消しすぎないよう小さめにする。 */
  tolerance?: number;
};

const DEFAULT_TOLERANCE = 16;

/**
 * Canvas の四辺からつながっている白い背景を透明にする。
 * キャラクターの線に囲まれた内側の白は四辺とつながっていないため残る。
 * `data` は直接書き換え、透明にした画素数を返す。
 */
export function clearOuterBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ClearOuterBackgroundOptions = {},
): number {
  const pixelCount = width * height;

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length !== pixelCount * 4
  ) {
    return 0;
  }

  const toleranceSquared = (options.tolerance ?? DEFAULT_TOLERANCE) ** 2;

  const isBackground = (index: number): boolean => {
    const offset = index * 4;

    return (
      data[offset + 3] === 255 &&
      (255 - data[offset]) ** 2 + (255 - data[offset + 1]) ** 2 + (255 - data[offset + 2]) ** 2 <=
        toleranceSquared
    );
  };

  // 四辺の白い画素をすべて起点にして、4近傍で広げる（再帰を使わない幅優先探索）
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (visited[index] === 0 && isBackground(index)) {
      visited[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;

    data.fill(0, index * 4, index * 4 + 4);

    const x = index % width;

    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < pixelCount - width) enqueue(index + width);
  }

  return tail;
}
