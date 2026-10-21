/** 同時に出せる泡の数。使い回すので、これ以上は古い泡から消えて出し直す */
const POOL_SIZE = 64;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

type BubbleMove = {
  /** 消えるまでに動く量（px） */
  driftX: number;
  driftY: number;
  /** 出す位置を、上下にどれだけばらつかせるか（px） */
  spreadY: number;
  duration: number;
};

/**
 * 海に出す泡。泡は作品の中ではなく海に置くので、作品が先に進むと後ろに残る。
 * 要素は最初に作っておいて使い回し、動きは Web Animations で transform と opacity だけを変える。
 */
export const createBubblePool = (layer: HTMLElement) => {
  const bubbles = Array.from({ length: POOL_SIZE }, () => {
    const bubble = document.createElement('span');
    bubble.className = layer.dataset.bubbleClass ?? '';
    bubble.style.opacity = '0';
    layer.append(bubble);

    return bubble;
  });
  let next = 0;

  /** (x, y) は海の中の位置 */
  const spawn = (x: number, y: number, { driftX, driftY, spreadY, duration }: BubbleMove) => {
    const bubble = bubbles[next];
    next = (next + 1) % POOL_SIZE;

    const size = randomBetween(14, 30);

    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${x - size / 2}px`;
    bubble.style.top = `${y + randomBetween(-spreadY, spreadY) - size / 2}px`;
    bubble.getAnimations().forEach((animation) => animation.cancel());
    bubble.animate(
      [
        { transform: 'translate(0, 0) scale(0.6)', opacity: 0.9 },
        { transform: `translate(${driftX}px, ${driftY}px) scale(1)`, opacity: 0 },
      ],
      { duration, easing: 'ease-out', fill: 'forwards' },
    );
  };

  /** はやく およぐ：後ろに出して、後ろへ流す。direction は流れていく向き（進む向きの逆） */
  const trail = (x: number, y: number, direction: 1 | -1) =>
    spawn(x, y, {
      driftX: direction * randomBetween(40, 90),
      driftY: -randomBetween(10, 40),
      spreadY: 18,
      duration: randomBetween(600, 900),
    });

  /** 登場・退場：出した場所から、ゆらゆらと上へ上がっていく */
  const rise = (x: number, y: number) =>
    spawn(x, y, {
      driftX: randomBetween(-20, 20),
      driftY: -randomBetween(60, 140),
      spreadY: 10,
      duration: randomBetween(800, 1200),
    });

  const dispose = () => bubbles.forEach((bubble) => bubble.remove());

  return { trail, rise, dispose };
};
