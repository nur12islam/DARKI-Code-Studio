export type DiffLine = {
  type: 'context' | 'add' | 'del';
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

export type DiffResult = {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  truncated: boolean;
};

function fallback(before: string[], after: string[]): DiffLine[] {
  return [
    ...before.map((text, index) => ({ type: 'del' as const, text, oldLine: index + 1, newLine: null })),
    ...after.map((text, index) => ({ type: 'add' as const, text, oldLine: null, newLine: index + 1 }))
  ];
}

export function diffLines(beforeText: string, afterText: string): DiffResult {
  const before = beforeText.replace(/\r\n/g, '\n').split('\n');
  const after = afterText.replace(/\r\n/g, '\n').split('\n');
  const n = before.length;
  const m = after.length;
  const truncated = n > 1800 || m > 1800 || n * m > 2_500_000;
  let lines: DiffLine[];

  if (truncated) {
    lines = fallback(before.slice(0, 1800), after.slice(0, 1800));
  } else {
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * width + j] =
          before[i] === after[j]
            ? dp[(i + 1) * width + j + 1] + 1
            : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    lines = [];
    let i = 0;
    let j = 0;
    let oldLine = 1;
    let newLine = 1;
    while (i < n && j < m) {
      if (before[i] === after[j]) {
        lines.push({ type: 'context', text: before[i], oldLine, newLine });
        i++;
        j++;
        oldLine++;
        newLine++;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        lines.push({ type: 'del', text: before[i], oldLine, newLine: null });
        i++;
        oldLine++;
      } else {
        lines.push({ type: 'add', text: after[j], oldLine: null, newLine });
        j++;
        newLine++;
      }
    }
    while (i < n) {
      lines.push({ type: 'del', text: before[i], oldLine, newLine: null });
      i++;
      oldLine++;
    }
    while (j < m) {
      lines.push({ type: 'add', text: after[j], oldLine: null, newLine });
      j++;
      newLine++;
    }
  }

  return {
    lines: lines.slice(0, 2200),
    additions: lines.filter(line => line.type === 'add').length,
    deletions: lines.filter(line => line.type === 'del').length,
    truncated
  };
}
