import type { BasicCommand, Command, Condition } from 'shared';

/**
 * 組んだブロック（コマンドの木）の、いま再生しているところ。
 * 外側の段から順に「その段の何番目か」「その段をくりかえしている何回目か」
 * 「「もし」のどちらの分かれ道か」を持つ。
 * くりかえしを先に全部ほどかず、たどりながら再生するので、「もし」の条件は、そこに来たときに調べられる。
 */
export type ProgramCursor = readonly CursorFrame[];

type CursorFrame = {
  /** その段の何番目のコマンドか */
  index: number;
  /** その段をくりかえしている何回目か（0 から。くりかえしの中の段だけで使う） */
  iteration: number;
  /** 「もし」の中の段なら、どちらの分かれ道か */
  branch?: 'then' | 'else';
};

/** 「もし」に来たときに、条件に合っているかを答える */
export type ConditionCheck = (condition: Condition) => boolean;

/** たどる手数の上限。コマンドは多くても 10 個なので、ふつうはここまで来ない（念のための歯止め） */
const STEP_LIMIT = 1000;

/** cursor の depth 段目のコマンドの並び。途中の位置がくりかえし・「もし」でなければ null */
const listAt = (
  program: readonly Command[],
  frames: readonly CursorFrame[],
  depth: number,
): readonly Command[] | null => {
  let list: readonly Command[] = program;

  for (let d = 0; d < depth; d += 1) {
    const item = list[frames[d].index];

    if (item?.type === 'repeat') {
      list = item.commands;
    } else if (item?.type === 'if') {
      list = frames[d + 1].branch === 'then' ? item.thenCommands : item.elseCommands;
    } else {
      return null;
    }
  }

  return list;
};

/**
 * frames を、次に再生する動き・セリフを指すところまで進める。
 * くりかえしに入る・くりかえしの最初に戻る・「もし」の分かれ道に入る・抜ける・全体の最初に戻る、をここで行う。
 * 全体を 1 周しても再生するものが見つからなければ null（「もし」の条件にどれも合わなかった、など）。
 */
const settle = (
  program: readonly Command[],
  start: CursorFrame[],
  check: ConditionCheck,
): ProgramCursor | null => {
  if (program.length === 0) {
    return null;
  }

  const frames: CursorFrame[] =
    start.length === 0 ? [{ index: 0, iteration: 0 }] : start.map((f) => ({ ...f }));
  // 全体の最後から最初へ戻った回数。2 回目に戻るときは、1 周しても見つからなかったということ。
  // 最初から始めるときは、すでに最初にいるので 1 回戻ったものとして数える（確率の条件を引き直さない）
  let wraps = start.length === 0 ? 1 : 0;

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
        wraps += 1;

        if (wraps > 1) {
          return null;
        }

        frame.index = 0;
        continue;
      }

      const owner = listAt(program, frames, depth - 1)?.[frames[depth - 1].index];

      if (owner?.type === 'repeat' && frame.iteration + 1 < owner.times) {
        frame.index = 0;
        frame.iteration += 1;
      } else {
        // くりかえしの最後の回が終わった、または「もし」の分かれ道を最後まで再生した
        frames.pop();
        frames[depth - 1].index += 1;
      }

      continue;
    }

    const item = list[frame.index];

    if (item.type === 'repeat') {
      frames.push({ index: 0, iteration: 0 });
      continue;
    }

    if (item.type === 'if') {
      // 「もし」に来たときに、条件を調べて分かれ道を決める
      frames.push({ index: 0, iteration: 0, branch: check(item.condition) ? 'then' : 'else' });
      continue;
    }

    return frames;
  }

  return null;
};

/** 最初に再生する動き・セリフの位置。1 周しても再生するものがなければ null */
export const startCursor = (
  program: readonly Command[],
  check: ConditionCheck = () => false,
): ProgramCursor | null => settle(program, [], check);

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

  return item !== undefined && item.type !== 'repeat' && item.type !== 'if' ? item : null;
};

/** 次に再生する動き・セリフの位置（最後まで来たら最初に戻る）。1 周しても見つからなければ null */
export const nextCursor = (
  program: readonly Command[],
  cursor: ProgramCursor,
  check: ConditionCheck = () => false,
): ProgramCursor | null => {
  if (cursor.length === 0) {
    return startCursor(program, check);
  }

  const frames = cursor.map((f) => ({ ...f }));
  frames[frames.length - 1].index += 1;

  return settle(program, frames, check);
};
