import type { BasicCommand, Command, RepeatCommand } from 'shared';

/**
 * 組んだブロック（コマンドの木）の、いま再生しているところ。
 * 外側の段から順に「その段の何番目か」と「その段をくりかえしている何回目か」を持つ。
 * くりかえしを先に全部ほどかず、たどりながら再生するので、
 * 再生するときに調べる条件（もし〜なら）も足せる。
 */
export type ProgramCursor = readonly CursorFrame[];

type CursorFrame = {
  /** その段の何番目のコマンドか */
  index: number;
  /** その段をくりかえしている何回目か（0 から。いちばん外の段では使わない） */
  iteration: number;
};

/** たどる手数の上限。コマンドは多くても 10 個なので、ふつうはここまで来ない（念のための歯止め） */
const STEP_LIMIT = 1000;

/** 動きやセリフが 1 つでも入っているか（空のくりかえししかないと、再生するものがない） */
const hasPlayable = (commands: readonly Command[]): boolean =>
  commands.some((command) => command.type !== 'repeat' || hasPlayable(command.commands));

/** cursor の depth 段目のコマンドの並び。途中の位置がくりかえしでなければ null */
const listAt = (
  program: readonly Command[],
  frames: readonly CursorFrame[],
  depth: number,
): readonly Command[] | null => {
  let list: readonly Command[] = program;

  for (let d = 0; d < depth; d += 1) {
    const item = list[frames[d].index];

    if (item?.type !== 'repeat') {
      return null;
    }

    list = item.commands;
  }

  return list;
};

/**
 * frames を、次に再生する動き・セリフを指すところまで進める。
 * くりかえしに入る・くりかえしの最初に戻る・くりかえしを抜ける・全体の最初に戻る、をここでまとめて行う。
 */
const settle = (program: readonly Command[], start: CursorFrame[]): ProgramCursor | null => {
  if (!hasPlayable(program)) {
    return null;
  }

  const frames = start.length === 0 ? [{ index: 0, iteration: 0 }] : start.map((f) => ({ ...f }));

  for (let step = 0; step < STEP_LIMIT; step += 1) {
    const depth = frames.length - 1;
    const list = listAt(program, frames, depth);
    const frame = frames[depth];

    // 位置が今のブロックと合わなくなっていたら、最初からたどり直す
    if (list === null) {
      frames.splice(0, frames.length, { index: 0, iteration: 0 });
      continue;
    }

    if (frame.index >= list.length) {
      // いちばん外の段の最後まで来たら、最初に戻ってくり返す
      if (depth === 0) {
        frame.index = 0;
        continue;
      }

      const owner = listAt(program, frames, depth - 1)?.[frames[depth - 1].index] as RepeatCommand;

      if (frame.iteration + 1 < owner.times) {
        frame.index = 0;
        frame.iteration += 1;
      } else {
        frames.pop();
        frames[depth - 1].index += 1;
      }

      continue;
    }

    if (list[frame.index].type === 'repeat') {
      frames.push({ index: 0, iteration: 0 });
      continue;
    }

    return frames;
  }

  return null;
};

/** 最初に再生する動き・セリフの位置。再生するものがなければ null */
export const startCursor = (program: readonly Command[]): ProgramCursor | null =>
  settle(program, []);

/** その位置の動き・セリフ。位置が合わなければ null */
export const commandAt = (
  program: readonly Command[],
  cursor: ProgramCursor,
): BasicCommand | null => {
  if (cursor.length === 0) {
    return null;
  }

  const last = cursor[cursor.length - 1];
  const item = listAt(program, cursor, cursor.length - 1)?.[last.index];

  return item !== undefined && item.type !== 'repeat' ? item : null;
};

/** 次に再生する動き・セリフの位置（最後まで来たら最初に戻る） */
export const nextCursor = (
  program: readonly Command[],
  cursor: ProgramCursor,
): ProgramCursor | null => {
  if (cursor.length === 0) {
    return startCursor(program);
  }

  const frames = cursor.map((f) => ({ ...f }));
  frames[frames.length - 1].index += 1;

  return settle(program, frames);
};
