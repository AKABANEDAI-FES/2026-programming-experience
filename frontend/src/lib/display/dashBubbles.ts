/** 同時に出せる泡の数。使い回すので、これ以上は古い泡から消えて出し直す */
const POOL_SIZE = 48;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * はやく およぐ ときの泡。泡は作品の中ではなく海に置くので、作品が先に進むと後ろに残る。
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

  /** (x, y) は海の中の位置。direction は泡が流れていく向き（進む向きの逆） */
  const spawn = (x: number, y: number, direction: 1 | -1) => {
    const bubble = bubbles[next];
    next = (next + 1) % POOL_SIZE;

    const size = randomBetween(14, 30);
    const driftX = direction * randomBetween(40, 90);
    const riseY = -randomBetween(10, 40);

    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${x - size / 2}px`;
    bubble.style.top = `${y + randomBetween(-18, 18) - size / 2}px`;
    bubble.getAnimations().forEach((animation) => animation.cancel());
    bubble.animate(
      [
        { transform: 'translate(0, 0) scale(0.6)', opacity: 0.9 },
        { transform: `translate(${driftX}px, ${riseY}px) scale(1)`, opacity: 0 },
      ],
      { duration: randomBetween(600, 900), easing: 'ease-out', fill: 'forwards' },
    );
  };

  const dispose = () => bubbles.forEach((bubble) => bubble.remove());

  return { spawn, dispose };
};
