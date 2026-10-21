import type { Command, Creature } from 'shared';
import { MAX_CREATURES } from 'shared/release';

const CREATURE_KEY_PREFIX = 'creatures/';
const CREATURE_KEY_PATTERN = /^creatures\/(\d+)-([0-9a-f-]+)\.png$/;

const parseCommands = (value: string | undefined): Command[] => {
  if (value === undefined) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toCreature = (object: R2Object): Creature => {
  const [, createdAt, keyId] = CREATURE_KEY_PATTERN.exec(object.key) ?? [];

  return {
    id: object.customMetadata?.id ?? keyId,
    imageUrl: object.key,
    commands: parseCommands(object.customMetadata?.commands),
    createdAt: Number(createdAt),
  };
};

export const listRecentCreatures = async (bucket: R2Bucket): Promise<Creature[]> => {
  const recent: R2Object[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({
      prefix: CREATURE_KEY_PREFIX,
      cursor,
      include: ['customMetadata'],
    });

    for (const object of page.objects) {
      if (!CREATURE_KEY_PATTERN.test(object.key)) {
        continue;
      }

      recent.push(object);

      if (recent.length > MAX_CREATURES) {
        recent.shift();
      }
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);

  return recent.map(toCreature);
};
