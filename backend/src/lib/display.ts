import type { Command, CreatureAddedMessage } from 'shared';
import type { SavedImage } from './storage';

export const createCreatureAddedMessage = (
  saved: SavedImage,
  commands: unknown,
): CreatureAddedMessage => {
  const normalizedCommands: Command[] = Array.isArray(commands) ? commands : [];

  return {
    type: 'creature_added',
    creature: {
      id: saved.id,
      imageUrl: saved.key,
      commands: normalizedCommands,
      createdAt: saved.createdAt,
    },
  };
};

export const normalizeCloseCode = (code: number): number =>
  code === 1000 || (Number.isInteger(code) && code >= 3000 && code <= 4999) ? code : 1000;
