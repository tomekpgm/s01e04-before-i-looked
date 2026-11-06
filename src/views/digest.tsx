import type { DigestRow, Night } from '../digest/types.js';

const DASH = '—';

// A row is marked when the job retried 3+ times or ever failed (hadFail comes from the reader).
export function isWarn(row: DigestRow): boolean {
  return row.retries >= 3 || row.hadFail;
}

export function DigestRowView({ row }: { row: DigestRow }) {
  return (
    <tr class={isWarn(row) ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{row.owner ?? DASH}</td>
      <td>{row.runs}</td>
      <td>{row.retries}</td>
      <td>{row.lastStatus}</td>
      <td>{row.lastError ?? DASH}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table class="digest">
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <DigestRowView row={row} />
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? (
        <p class="mute bad-lines">
          {night.badLines} {night.badLines === 1 ? 'line' : 'lines'} could not be read
        </p>
      ) : null}
    </>
  );
}
