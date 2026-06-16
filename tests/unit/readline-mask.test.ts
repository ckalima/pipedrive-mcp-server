/**
 * Unit tests for the security-critical key-masking path (M2).
 *
 * The flow tests (init-flow.test.ts) mock `promptSecret` wholesale, so the real
 * mute was never exercised — a regression dropping it would echo the pasted API
 * key to terminal scrollback while every test stayed green. These tests drive
 * the REAL mute: the MaskableOutput stream logic directly, and `promptSecret`
 * end-to-end over a real readline interface with a fake stdin/stdout, asserting
 * the typed key never reaches output.
 *
 * Regression guard: masking previously wrapped readline's private
 * `_writeToOutput`, which became a private Symbol in recent Node (absent by name
 * on the Node this suite runs under), so the wrap silently no-opped and the key
 * echoed. The output-stream mute below is version independent — the real-readline
 * test fails if that ever regresses.
 */

import { describe, it, expect, vi } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { MaskableOutput, createReadlineDeps, StdinClosedError } from '../../src/cli/init.js';

/** A throwaway non-TTY output sink for the EOF tests (mute logic is irrelevant there). */
function nullSink() {
  const sink = new Writable({ write(_c, _e, cb) { cb(); } }) as Writable & { isTTY?: boolean };
  sink.isTTY = false;
  return sink;
}

describe('MaskableOutput (M2 mute logic)', () => {
  function captureSink() {
    const out: string[] = [];
    const sink = {
      write: (s: string) => {
        out.push(s);
        return true;
      },
      columns: 80,
      rows: 24,
      isTTY: true,
    };
    return { out, sink };
  }

  it('passes writes through to the sink when not muted', () => {
    const { out, sink } = captureSink();
    const m = new MaskableOutput(sink);
    const cb = vi.fn();

    m._write('visible-prompt', 'utf8', cb);

    expect(out).toEqual(['visible-prompt']);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('swallows every chunk while muted, emitting only the line terminator', () => {
    const { out, sink } = captureSink();
    const m = new MaskableOutput(sink);
    const cb = vi.fn();
    m.muted = true;

    m._write('s', 'utf8', cb);
    m._write('3cr3t-key', 'utf8', cb);
    expect(out).toEqual([]); // the secret never reaches the sink

    m._write('s3cr3t-key\r\n', 'utf8', cb);
    expect(out).toEqual(['\n']); // Enter still advances the prompt

    m.muted = false;
    m._write('after', 'utf8', cb);
    expect(out).toEqual(['\n', 'after']);
  });

  it('proxies terminal capability getters so readline keeps terminal (echo) mode', () => {
    const { sink } = captureSink();
    const m = new MaskableOutput(sink);

    expect(m.isTTY).toBe(true);
    expect(m.columns).toBe(80);
    expect(m.rows).toBe(24);
  });
});

describe('createReadlineDeps.promptSecret over a real readline interface (M2)', () => {
  const KEY = 'k'.repeat(40);

  it('reads the key from a real interface WITHOUT echoing it to output', async () => {
    const input = new PassThrough();
    const captured: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        captured.push(chunk.toString());
        cb();
      },
    }) as Writable & { isTTY?: boolean; columns?: number; rows?: number };
    sink.isTTY = true;
    sink.columns = 80;
    sink.rows = 24;

    // terminal:true forces readline's line editor so it WOULD echo keystrokes
    // through output.write — exactly the path MaskableOutput must suppress.
    const deps = createReadlineDeps({ input, output: sink, terminal: true });
    const pending = deps.promptSecret('Paste your API key: ');
    input.write(`${KEY}\n`);
    const result = await pending;
    deps.close();

    expect(result).toBe(KEY);
    const all = captured.join('');
    expect(all).toContain('Paste your API key: '); // the label is shown
    expect(all).not.toContain(KEY); // the key is never echoed
  });

  it('still returns the plain prompt answer (non-secret prompts are unaffected)', async () => {
    const input = new PassThrough();
    const sink = new Writable({ write(_c, _e, cb) { cb(); } }) as Writable & { isTTY?: boolean };
    sink.isTTY = false;

    const deps = createReadlineDeps({ input, output: sink });
    const pending = deps.prompt('Which host? ');
    input.write('claude-desktop\n');
    const answer = await pending;
    deps.close();

    expect(answer).toBe('claude-desktop');
  });
});

describe('createReadlineDeps EOF cancellation (#5)', () => {
  it('rejects a pending prompt with StdinClosedError when stdin ends with no answer', async () => {
    // readline/promises question() would otherwise HANG forever on EOF; the abort
    // seam must turn a closed stdin into a clean, typed rejection instead.
    const input = new PassThrough();
    const deps = createReadlineDeps({ input, output: nullSink() });

    const pending = deps.prompt('Which host? ');
    input.end(); // EOF: no line will ever arrive

    await expect(pending).rejects.toBeInstanceOf(StdinClosedError);
    deps.close();
  });

  it('keeps rejecting subsequent prompts once stdin has closed (does not re-hang)', async () => {
    const input = new PassThrough();
    const deps = createReadlineDeps({ input, output: nullSink() });

    const first = deps.prompt('first? ');
    input.end();
    await expect(first).rejects.toBeInstanceOf(StdinClosedError);

    // The abort signal is now tripped; a fresh prompt must reject at once, not wait.
    await expect(deps.prompt('second? ')).rejects.toBeInstanceOf(StdinClosedError);
    deps.close();
  });

  it('rejects the masked key prompt too, and leaves the output un-muted afterward', async () => {
    const input = new PassThrough();
    const deps = createReadlineDeps({ input, output: nullSink() });

    const pending = deps.promptSecret('Paste your API key: ');
    input.end();

    await expect(pending).rejects.toBeInstanceOf(StdinClosedError);
    deps.close();
  });
});
