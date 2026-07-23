import { DiffOp } from './api';

/**
 * Compute a word-level diff between two strings using the Myers diff algorithm.
 * Returns an array of DiffOp operations (equal/delete/insert) with consecutive
 * same-type ops merged for clean rendering.
 */
export function computeWordDiff(original: string, edited: string): DiffOp[] {
  const oldWords = tokenize(original.trim());
  const newWords = tokenize(edited.trim());

  const ops = myersDiff(oldWords, newWords);

  // Merge consecutive ops of the same type
  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.op === op.op) {
      last.text += op.text;
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

/** Split text into tokens preserving whitespace as part of the following word */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const regex = /(\s*)(\S+)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // If there's leading whitespace before the first token, capture it
    if (tokens.length === 0 && match.index > 0) {
      tokens.push(text.slice(0, match.index));
    }
    tokens.push(match[0]); // whitespace + word together
    lastIndex = regex.lastIndex;
  }

  // Trailing whitespace
  if (lastIndex < text.length) {
    if (tokens.length > 0) {
      tokens[tokens.length - 1] += text.slice(lastIndex);
    } else {
      tokens.push(text.slice(lastIndex));
    }
  }

  return tokens;
}

/** Myers diff algorithm — returns a sequence of DiffOp for two token arrays */
function myersDiff(oldTokens: string[], newTokens: string[]): DiffOp[] {
  const N = oldTokens.length;
  const M = newTokens.length;
  const MAX = N + M;

  if (MAX === 0) return [];

  // Fast paths
  if (N === 0) {
    return newTokens.map(t => ({ op: 'insert' as const, text: t }));
  }
  if (M === 0) {
    return oldTokens.map(t => ({ op: 'delete' as const, text: t }));
  }

  const v: Record<number, number> = { 1: 0 };
  const trace: Record<number, number>[] = [];

  for (let d = 0; d <= MAX; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1] ?? 0) < (v[k + 1] ?? 0))) {
        x = v[k + 1] ?? 0;
      } else {
        x = (v[k - 1] ?? 0) + 1;
      }
      let y = x - k;

      while (x < N && y < M && oldTokens[x] === newTokens[y]) {
        x++;
        y++;
      }

      v[k] = x;

      if (x >= N && y >= M) {
        return backtrack(trace, d, oldTokens, newTokens);
      }
    }
  }

  // Fallback (shouldn't reach here)
  return [
    ...oldTokens.map(t => ({ op: 'delete' as const, text: t })),
    ...newTokens.map(t => ({ op: 'insert' as const, text: t })),
  ];
}

function backtrack(
  trace: Record<number, number>[],
  d: number,
  oldTokens: string[],
  newTokens: string[]
): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = oldTokens.length;
  let y = newTokens.length;

  for (let step = d; step > 0; step--) {
    const v = trace[step - 1];
    const k = x - y;
    let prevK: number;

    if (k === -step || (k !== step && (v[k - 1] ?? 0) < (v[k + 1] ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK] ?? 0;
    const prevY = prevX - prevK;

    // Diagonal (equal)
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.unshift({ op: 'equal', text: oldTokens[x] });
    }

    if (k === prevK + 1) {
      // Horizontal = delete
      x--;
      ops.unshift({ op: 'delete', text: oldTokens[x] });
    } else {
      // Vertical = insert
      y--;
      ops.unshift({ op: 'insert', text: newTokens[y] });
    }
  }

  // Remaining diagonal at the start
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.unshift({ op: 'equal', text: oldTokens[x] });
  }

  return ops;
}
