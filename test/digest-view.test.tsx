import { describe, expect, it } from 'vitest';
import { DigestRowView } from '../src/views/digest.js';
import type { DigestRow } from '../src/digest/types.js';

const base: DigestRow = {
  job: 'j',
  owner: 'o',
  runs: 1,
  retries: 0,
  lastStatus: 'ok',
  lastError: null,
  hadFail: false,
  firstAt: '2026-10-28T02:00:00+01:00',
  lastAt: '2026-10-28T02:00:00+01:00',
};

const render = (row: DigestRow) => String(<table><tbody><DigestRowView row={row} /></tbody></table>);

describe('digest row', () => {
  it('is marked when hadFail is true even if the last status is ok', () => {
    expect(render({ ...base, hadFail: true, lastStatus: 'ok' })).toContain('<tr class="warn">');
  });

  it('is not marked with 2 retries and no fail', () => {
    expect(render({ ...base, retries: 2 })).not.toContain('warn');
  });

  it('shows missing owner and error as a dash', () => {
    expect(render({ ...base, owner: null })).toContain('<td>—</td><td>1</td>');
  });
});
