// Plan morning-digest § 1 (issue #1). The contract every part of § 2 builds against.
// Types only: the reader lives in src/digest/read.ts (issue #2).
//
// A log line is valid when it parses as JSON and has `at` (string), `job` (non-empty string),
// `status` (ok | retry | fail) and the key `owner` (string or null). Every other non-empty line
// is a bad line. Empty lines are neither.

/** Status of one attempt, as written in the run log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job of one night, built from that job's valid lines. */
export type DigestRow = {
  /** The job name, as written in the log. */
  job: string;
  /** `owner` of the job's last valid line; null when the log says null (shown as `—`). */
  owner: string | null;
  /** All valid lines of the job, retries included. */
  runs: number;
  /** Valid lines of the job with status `retry`. */
  retries: number;
  /** `status` of the job's last valid line. */
  lastStatus: RunStatus;
  /** The job's last non-empty `error`, even when a later attempt succeeded; null if it never had one. */
  lastError: string | null;
  /** True when any valid line of the job has status `fail`, even when a later attempt succeeded. */
  hadFail: boolean;
  /** `at` of the job's first valid line, as written (offset kept, never converted to UTC). */
  firstAt: string;
  /** `at` of the job's last valid line, as written (offset kept, never converted to UTC). */
  lastAt: string;
};

/** The night's valid lines counted by status, over all jobs. Bad lines are not counted. */
export type StatusCounts = {
  /** Valid lines with status `ok`. */
  ok: number;
  /** Valid lines with status `retry`. */
  retry: number;
  /** Valid lines with status `fail`. */
  fail: number;
};

/** One night's run log, read into rows. */
export type Night = {
  /** The night, YYYY-MM-DD (the file name without `.jsonl`). */
  night: string;
  /** One row per job, sorted by job. */
  rows: DigestRow[];
  /** Non-empty lines that do not parse, or that lack a valid required field. Counted, never thrown. */
  badLines: number;
  /** The night's valid lines counted by status. */
  statusCounts: StatusCounts;
};

/** Reads `<runsDir>/<night>.jsonl`. Returns null when there is no file for that night. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
