import { useCallback, useEffect, useRef, useState } from 'react';
import type { Creature } from 'shared';
import { expandCommands, MAX_CREATURES, type BasicCommand } from 'shared/release';
import {
  addCreature,
  restoreCreatures,
  type AddCreatureResult,
} from '../../lib/display/creatureQueue.ts';
import {
  CREATURE_HEIGHT,
  CREATURE_WIDTH,
  createMotion,
  stepMotion,
  toVisual,
  type CreatureMotion,
} from '../../lib/display/creatureMotion.ts';
import {
  findVisibleArtworkBounds,
  getTrailAnchor,
  type VisibleArtworkBounds,
} from '../../lib/display/visibleArtworkBounds.ts';
import { createBubblePool } from '../../lib/display/dashBubbles.ts';
import { useCreatureStream } from './useCreatureStream.ts';
import styles from './DisplayPage.module.css';

const MAX_DELTA_MS = 100;
/** この強さを超えたら泡を出す（はやく およぐ の出だしと終わりは出さない） */
const BUBBLE_MIN_INTENSITY = 0.25;
/** 泡を出す間隔。いちばん速いときほど短くして、たくさん出す */
const BUBBLE_SLOWEST_INTERVAL_MS = 110;
const BUBBLE_FASTEST_INTERVAL_MS = 50;

type CreatureNode = {
  root: HTMLDivElement;
  image: HTMLImageElement;
  bubble: HTMLParagraphElement;
  visibleBounds: VisibleArtworkBounds | null;
};

const toImageUrl = (imageUrl: string): string =>
  imageUrl.startsWith('http') ? imageUrl : `/api/images/${imageUrl}`;

export function DisplayPage() {
  const [creatures, setCreatures] = useState<Creature[]>([]);
  // setState の更新関数は StrictMode で2回呼ばれるため、副作用を伴う追加処理は ref の値をもとに行う
  const creaturesRef = useRef<Creature[]>([]);
  const motions = useRef(new Map<string, CreatureMotion>());
  // くりかえしは展開して、再生する順に並べたコマンドを持っておく
  const commands = useRef(new Map<string, BasicCommand[]>());
  const nodes = useRef(new Map<string, CreatureNode>());
  const visibleBoundsCache = useRef(new Map<string, VisibleArtworkBounds | null>());
  const bubbleLayerRef = useRef<HTMLDivElement>(null);

  const updateCreatures = useCallback((result: AddCreatureResult<Creature>) => {
    if (result.creatures === creaturesRef.current) {
      return;
    }

    for (const { id } of result.removed) {
      motions.current.delete(id);
      commands.current.delete(id);
    }

    const bounds = { width: window.innerWidth, height: window.innerHeight };

    for (const creature of result.creatures) {
      if (!motions.current.has(creature.id)) {
        motions.current.set(creature.id, createMotion(bounds));
        commands.current.set(creature.id, expandCommands(creature.commands));
      }
    }

    creaturesRef.current = result.creatures;
    setCreatures(result.creatures);
  }, []);

  const handleCreature = useCallback(
    (creature: Creature) =>
      updateCreatures(addCreature(creaturesRef.current, creature, MAX_CREATURES)),
    [updateCreatures],
  );

  const handleRestore = useCallback(
    (restored: Creature[]) =>
      updateCreatures(restoreCreatures(creaturesRef.current, restored, MAX_CREATURES)),
    [updateCreatures],
  );

  const status = useCreatureStream(handleCreature, handleRestore);

  const updateVisibleBounds = (id: string, image: HTMLImageElement) => {
    const node = nodes.current.get(id);

    if (node === undefined || image.naturalWidth === 0 || image.naturalHeight === 0) {
      return;
    }

    const cacheKey = image.currentSrc || image.src;
    let visibleBounds = visibleBoundsCache.current.get(cacheKey);

    if (!visibleBoundsCache.current.has(cacheKey)) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (context === null) {
          visibleBounds = null;
        } else {
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          visibleBounds = findVisibleArtworkBounds(imageData.data, canvas.width, canvas.height);
        }
      } catch {
        // 外部画像など、画素を読み取れない場合は泡を出さない。
        visibleBounds = null;
      }

      visibleBoundsCache.current.set(cacheKey, visibleBounds);
    }

    node.visibleBounds = visibleBounds ?? null;
  };

  // ref は再描画や StrictMode でも null で呼ばれるため、ここでは DOM の参照だけを管理する。
  // 動きとコマンドは作品が画面から取り除かれるときに消す。
  const registerNode = (id: string) => (root: HTMLDivElement | null) => {
    if (root === null) {
      nodes.current.delete(id);
      return;
    }

    const image = root.querySelector('img');
    const bubble = root.querySelector('p');

    if (image !== null && bubble !== null) {
      nodes.current.set(id, { root, image, bubble, visibleBounds: null });

      if (image.complete && image.naturalWidth > 0) {
        updateVisibleBounds(id, image);
      }
    }
  };

  useEffect(() => {
    let previous: number | null = null;
    const bubblePool = bubbleLayerRef.current && createBubblePool(bubbleLayerRef.current);
    const lastBubbleAt = new Map<string, number>();

    const tick = (now: number) => {
      const delta = previous === null ? 0 : Math.min(now - previous, MAX_DELTA_MS);
      previous = now;

      const bounds = { width: window.innerWidth, height: window.innerHeight };

      for (const [id, node] of nodes.current) {
        const motion = motions.current.get(id);

        if (motion === undefined) {
          continue;
        }

        const creatureCommands = commands.current.get(id) ?? [];
        const nextMotion = stepMotion(motion, creatureCommands, delta, bounds);
        const visual = toVisual(nextMotion, creatureCommands);

        motions.current.set(id, nextMotion);
        node.root.style.transform = `translate3d(${visual.x}px, ${visual.y}px, 0)`;
        if (
          bubblePool !== null &&
          node.visibleBounds !== null &&
          visual.dashIntensity > BUBBLE_MIN_INTENSITY
        ) {
          const interval =
            BUBBLE_SLOWEST_INTERVAL_MS -
            (BUBBLE_SLOWEST_INTERVAL_MS - BUBBLE_FASTEST_INTERVAL_MS) * visual.dashIntensity;

          if (now - (lastBubbleAt.get(id) ?? 0) >= interval) {
            const trailAnchor = getTrailAnchor(
              node.visibleBounds,
              node.image.naturalWidth,
              node.image.naturalHeight,
              CREATURE_WIDTH,
              CREATURE_HEIGHT,
              visual.facing,
              visual.rotation,
              visual.scale,
            );

            bubblePool.spawn(
              visual.x + trailAnchor.x,
              visual.y + trailAnchor.y,
              visual.facing === 'right' ? -1 : 1,
            );
            lastBubbleAt.set(id, now);
          }
        }
        node.image.style.transform = `rotate(${visual.rotation}deg) scale(${visual.scale})`;
        node.bubble.hidden = visual.sayText === null;
        node.bubble.textContent = visual.sayText;
      }

      frame = requestAnimationFrame(tick);
    };

    let frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      bubblePool?.dispose();
    };
  }, []);

  return (
    <main className={styles.page} aria-label="大画面モニター">
      {creatures.length === 0 && (
        <p className={styles.waiting}>いきものが やってくるのを まっています</p>
      )}

      <div
        ref={bubbleLayerRef}
        className={styles.bubbleLayer}
        data-bubble-class={styles.dashBubble}
        aria-hidden="true"
      />

      {creatures.map((creature) => (
        <div
          key={creature.id}
          ref={registerNode(creature.id)}
          className={styles.creature}
          style={{ width: CREATURE_WIDTH, height: CREATURE_HEIGHT }}
        >
          <p className={styles.bubble} hidden />
          <img
            className={styles.image}
            src={toImageUrl(creature.imageUrl)}
            alt="放流された作品"
            onLoad={(event) => updateVisibleBounds(creature.id, event.currentTarget)}
          />
        </div>
      ))}

      {status !== 'open' && (
        <p className={styles.status}>
          {status === 'connecting'
            ? 'サーバーに接続しています…'
            : 'サーバーとの接続が切れました。再接続しています…'}
        </p>
      )}
    </main>
  );
}
