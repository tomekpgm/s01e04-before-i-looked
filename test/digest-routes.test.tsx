import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Route tests for #3 (page) and #4 (JSON), through app.request(). Each test gets its own temp
// runs dir; runs/ is read-only and is only ever copied from.

const FIXTURE = fileURLToPath(new URL('../runs/2026-10-28.jsonl', import.meta.url));

const dirs: string[] = [];
function tempRuns(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function appFor(runsDir: string) {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

const line = (o: Record<string, unknown>) => JSON.stringify(o);

// Job names of the digest table on the page, in order (first cell of each body row).
function pageJobs(html: string): string[] {
  const table = html.match(/<table class="digest">([\s\S]*?)<\/table>/);
  expect(table).not.toBeNull();
  const body = table![1]!.split('<tbody>')[1] ?? '';
  return [...body.matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]!);
}

const NIGHT_KEYS = ['badLines', 'night', 'rows', 'statusCounts'];

describe('digest routes: normal night', () => {
  it('200 on both routes; the JSON has exactly the Night keys', async () => {
    const dir = tempRuns();
    copyFileSync(FIXTURE, join(dir, '2026-10-28.jsonl'));
    const app = appFor(dir);

    const page = await app.request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('<table class="digest">');

    const api = await app.request('/api/digest/2026-10-28');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(Object.keys(body).sort()).toEqual(NIGHT_KEYS);
    expect(body.night).toBe('2026-10-28');
  });

  it('the copy of 2026-10-28 gives statusCounts { ok: 10, retry: 4, fail: 1 } and badLines 1 in JSON, and the bad-line note on the page', async () => {
    const dir = tempRuns();
    copyFileSync(FIXTURE, join(dir, '2026-10-28.jsonl'));
    const app = appFor(dir);

    const api = await app.request('/api/digest/2026-10-28');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.statusCounts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(body.rows).toHaveLength(5);

    const page = await app.request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<p class="mute bad-lines">1 line could not be read</p>');
    expect(html.indexOf('bad-lines')).toBeGreaterThan(html.indexOf('</table>'));
  });

  it('the page and the JSON list the same jobs in the same order', async () => {
    const dir = tempRuns();
    copyFileSync(FIXTURE, join(dir, '2026-10-28.jsonl'));
    const app = appFor(dir);

    const page = await app.request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    const jobs = pageJobs(await page.text());

    const api = await app.request('/api/digest/2026-10-28');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;

    expect(jobs).toEqual(body.rows.map((r) => r.job));
    expect(jobs).toEqual([...jobs].sort());
    expect(jobs).toHaveLength(5);
  });
});

describe('digest routes: 404', () => {
  it('a night with no file is 404 on both routes', async () => {
    const app = appFor(tempRuns());
    expect((await app.request('/digest/2026-01-01')).status).toBe(404);
    expect((await app.request('/api/digest/2026-01-01')).status).toBe(404);
  });

  it('a night that is not YYYY-MM-DD is 404 on both routes', async () => {
    const dir = tempRuns();
    copyFileSync(FIXTURE, join(dir, '2026-10-28.jsonl'));
    const app = appFor(dir);
    expect((await app.request('/digest/latest')).status).toBe(404);
    expect((await app.request('/api/digest/latest')).status).toBe(404);
  });
});

describe('digest routes: empty night', () => {
  it('an empty file shows "nothing ran" on the page (no table) and an empty Night in JSON', async () => {
    const dir = tempRuns();
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    const app = appFor(dir);

    const page = await app.request('/digest/2026-01-01');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table class="digest">');

    const api = await app.request('/api/digest/2026-01-01');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(body).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      statusCounts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});

describe('digest routes: bad lines', () => {
  it('1 ok, 1 fail and 2 bad lines: badLines 2, statusCounts { ok: 1, retry: 0, fail: 1 }, note under the table', async () => {
    const dir = tempRuns();
    writeFileSync(
      join(dir, '2026-02-02.jsonl'),
      [
        line({ at: '2026-02-02T01:00:00+01:00', job: 'a/one', status: 'ok', owner: 'rook' }),
        line({ at: '2026-02-02T02:00:00+01:00', job: 'b/two', status: 'fail', owner: 'rook', error: 'boom' }),
        '{"at":"2026-02-02T03:00:00+01:00","job":"c/three"',
        'not json at all',
      ].join('\n'),
    );
    const app = appFor(dir);

    const api = await app.request('/api/digest/2026-02-02');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(body.badLines).toBe(2);
    expect(body.statusCounts).toEqual({ ok: 1, retry: 0, fail: 1 });

    const page = await app.request('/digest/2026-02-02');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<table class="digest">');
    expect(html).toContain('<p class="mute bad-lines">2 lines could not be read</p>');
    expect(html.indexOf('bad-lines')).toBeGreaterThan(html.indexOf('</table>'));
  });
});
