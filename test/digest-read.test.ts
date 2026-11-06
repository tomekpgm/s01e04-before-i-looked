import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const dirs: string[] = [];
function runsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const line = (o: Record<string, unknown>) => JSON.stringify(o);

describe('readNight on runs/ (read-only fixtures)', () => {
  it('2026-10-28: 5 jobs, 1 bad line, the expected rows and counts', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.night).toBe('2026-10-28');
    expect(n!.badLines).toBe(1);
    expect(n!.statusCounts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(n!.rows).toEqual([
      { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, hadFail: false, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', hadFail: false, firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held', hadFail: false, firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', hadFail: true, firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, hadFail: false, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
    ]);
    const runs = n!.rows.reduce((s, r) => s + r.runs, 0);
    expect(n!.statusCounts.ok + n!.statusCounts.retry + n!.statusCounts.fail).toBe(runs);
  });

  it('2026-10-27: 4 jobs, no bad lines, no fails', () => {
    const n = readNight('runs', '2026-10-27')!;
    expect(n.rows.map((r) => [r.job, r.runs])).toEqual([
      ['fixtures/refresh', 1],
      ['lane/sync', 4],
      ['notes/backup', 1],
      ['rig/rotate-logs', 1],
    ]);
    expect(n.rows.every((r) => r.retries === 0 && !r.hadFail)).toBe(true);
    expect(n.badLines).toBe(0);
    expect(n.statusCounts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});

describe('readNight on a temp runs dir', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(runsDir({}), '2026-01-01')).toBeNull();
  });

  it('an empty file gives no rows and all-zero counts', () => {
    const n = readNight(runsDir({ '2026-01-01.jsonl': '' }), '2026-01-01');
    expect(n).toEqual({ night: '2026-01-01', rows: [], badLines: 0, statusCounts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts valid JSON with a missing or invalid required field as bad, and keeps it out of statusCounts', () => {
    const body = [
      line({ at: 't1', job: 'a', status: 'ok', owner: 'x' }),
      line({ at: 't2', job: 'a', status: 'ok' }), // no owner key
      line({ at: 't3', job: '', status: 'ok', owner: 'x' }), // empty job
      line({ at: 't4', job: 'a', status: 'done', owner: 'x' }), // unknown status
      line({ job: 'a', status: 'fail', owner: 'x' }), // no at
      line({ at: 't6', job: 'a', status: 'retry', owner: 7 }), // owner not string/null
      '[1,2]',
      '{"at":"t8","job":"a"',
      '',
      '   ',
    ].join('\n');
    const n = readNight(runsDir({ 'n.jsonl': body }), 'n')!;
    expect(n.badLines).toBe(7);
    expect(n.statusCounts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0]!.runs).toBe(1);
  });

  it('an empty error does not replace an earlier non-empty one', () => {
    const body = [
      line({ at: 't1', job: 'a', status: 'retry', owner: 'x', error: 'boom' }),
      line({ at: 't2', job: 'a', status: 'retry', owner: 'x', error: '' }),
      line({ at: 't3', job: 'a', status: 'ok', owner: 'x', error: '  ' }),
    ].join('\n');
    const row = readNight(runsDir({ 'n.jsonl': body }), 'n')!.rows[0]!;
    expect(row.lastError).toBe('boom');
    expect(row.retries).toBe(2);
    expect(row.runs).toBe(3);
  });

  it('a job with fail then ok has hadFail true and lastStatus ok', () => {
    const body = [
      line({ at: 't1', job: 'a', status: 'fail', owner: 'x', error: 'quota' }),
      line({ at: 't2', job: 'a', status: 'ok', owner: 'x' }),
    ].join('\n');
    const n = readNight(runsDir({ 'n.jsonl': body }), 'n')!;
    expect(n.rows[0]).toMatchObject({ hadFail: true, lastStatus: 'ok', lastError: 'quota', firstAt: 't1', lastAt: 't2' });
    expect(n.statusCounts).toEqual({ ok: 1, retry: 0, fail: 1 });
  });

  it('keeps a row whose owner is null', () => {
    const n = readNight(runsDir({ 'n.jsonl': line({ at: 't1', job: 'a', status: 'ok', owner: null }) }), 'n')!;
    expect(n.rows).toEqual([expect.objectContaining({ job: 'a', owner: null })]);
  });
});
