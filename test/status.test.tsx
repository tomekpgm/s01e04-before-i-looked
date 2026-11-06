import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links each night to its digest with its counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a> <span class="mute">ok 10 · retry 4 · fail 1</span>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a> <span class="mute">ok 7 · retry 0 · fail 0</span>');
  });

  it('does not count bad lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    try {
      const good = (job: string, status: string) => JSON.stringify({ at: '2026-11-01T02:00:00+01:00', job, status, owner: null });
      writeFileSync(join(dir, '2026-11-01.jsonl'), [good('a', 'ok'), 'not json', good('b', 'fail'), ''].join('\n'));
      const html = await (await createApp({ ...config, runsDir: dir }).request('/')).text();
      expect(html).toContain('ok 1 · retry 0 · fail 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
