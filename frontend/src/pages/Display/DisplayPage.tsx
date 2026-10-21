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
  hasLeftScreen,
  startLeaving,
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
/** 登場して沈んでくる間に、泡を出す間隔 */
const ENTER_BUBBLE_INTERVAL_MS = 70;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

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
  // 上限を超えて取り除く作品。画面の外へ泳いで出ていくまで、少しの間だけ残しておく
  const [leaving, setLeaving] = useState<Creature[]>([]);
  // setState の更新関数は StrictMode で2回呼ばれるため、副作用を伴う追加処理は ref の値をもとに行う
  const creaturesRef = useRef<Creature[]>([]);
  const motions = useRef(new Map<string, CreatureMotion>());
  // くりかえしは展開して、再生する順に並べたコマンドを持っておく
  const commands = useRef(new Map<string, BasicCommand[]>());
  const nodes = useRef(new Map<string, CreatureNode>());
  const visibleBoundsCache = useRef(new Map<string, VisibleArtworkBounds | null>());
  const bubbleLayerRef = useRef<HTMLDivElement>(null);

  /** entering が true なら、新しく届いた作品として水面から登場させる */
  const updateCreatures = useCallback((result: AddCreatureResult<Creature>, entering: boolean) => {
    if (result.creatures === creaturesRef.current) {
      return;
    }

    const bounds = { width: window.innerWidth, height: window.innerHeight };

    // 取り除く作品は、すぐには消さずに画面の外へ泳いでいかせる（出きったら毎フレームの処理で消す）
    const removed = result.removed.filter(({ id }) => motions.current.has(id));

    for (const { id } of removed) {
      const motion = motions.current.get(id);

      if (motion !== undefined) {
        motions.current.set(id, startLeaving(motion, bounds));
      }
    }

    if (removed.length > 0) {
      const removedIds = new Set(removed.map(({ id }) => id));
      // 出ていく途中に戻ってきて、また取り除かれた作品が二重に入らないよう、同じ作品は入れ替える
      setLeaving((current) => [...current.filter(({ id }) => !removedIds.has(id)), ...removed]);
    }

    for (const creature of result.creatures) {
      // 出ていく途中に再接続で戻ってきた作品は、泳ぎ直させる
      if (!motions.current.has(creature.id) || motions.current.get(creature.id)?.leaveDirection) {
        motions.current.set(creature.id, createMotion(bounds, Math.random, { entering }));
        commands.current.set(creature.id, expandCommands(creature.commands));
      }
    }

    creaturesRef.current = result.creatures;
    setCreatures(result.creatures);
  }, []);

  const handleCreature = useCallback(
    (creature: Creature) =>
      updateCreatures(addCreature(creaturesRef.current, creature, MAX_CREATURES), true),
    [updateCreatures],
  );

  const handleRestore = useCallback(
    (restored: Creature[]) =>
      // 開き直しや再接続で戻ってきた作品は、全員が一斉に沈んでこないよう登場させない
      updateCreatures(restoreCreatures(creaturesRef.current, restored, MAX_CREATURES), false),
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
      const leftIds = new Set<string>();

      for (const [id, node] of nodes.current) {
        const motion = motions.current.get(id);

        if (motion === undefined) {
          continue;
        }

        const creatureCommands = commands.current.get(id) ?? [];
        const nextMotion = stepMotion(motion, creatureCommands, delta, bounds);
        const visual = toVisual(nextMotion, creatureCommands);

        // 退場して画面の外へ出きったら、動きとコマンドを捨てて、描くのもやめる
        if (hasLeftScreen(nextMotion, bounds)) {
          motions.current.delete(id);
          commands.current.delete(id);
          lastBubbleAt.delete(id);
          leftIds.add(id);
          continue;
        }

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

            bubblePool.trail(
              visual.x + trailAnchor.x,
              visual.y + trailAnchor.y,
              visual.facing === 'right' ? -1 : 1,
            );
            lastBubbleAt.set(id, now);
          }
        }
        // 登場：沈んでくる間、作品のまわりから泡を上げる（水に入ったときの泡）
        if (
          bubblePool !== null &&
          visual.entering &&
          now - (lastBubbleAt.get(id) ?? 0) >= ENTER_BUBBLE_INTERVAL_MS
        ) {
          bubblePool.rise(
            visual.x + CREATURE_WIDTH / 2 + randomBetween(-90, 90),
            visual.y + CREATURE_HEIGHT * randomBetween(0.2, 0.7),
          );
          lastBubbleAt.set(id, now);
        }

        node.image.style.transform = `rotate(${visual.rotation}deg) scale(${visual.scale})`;
        node.bubble.hidden = visual.sayText === null;
        node.bubble.textContent = visual.sayText;
      }

      if (leftIds.size > 0) {
        setLeaving((current) => current.filter(({ id }) => !leftIds.has(id)));
      }

      frame = requestAnimationFrame(tick);
    };

    let frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      bubblePool?.dispose();
    };
  }, []);

  // 出ていく途中に再接続で同じ作品が戻ってきたら、戻ってきたほうだけを描く
  const creatureIds = new Set(creatures.map(({ id }) => id));
  const leavingOnly = leaving.filter(({ id }) => !creatureIds.has(id));

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

      {/* 出ていく作品も同じ並びで描き、届いている作品と同じ要素のまま退場させる */}
      {[...leavingOnly, ...creatures].map((creature) => (
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
