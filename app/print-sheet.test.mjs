import assert from 'node:assert/strict';
import test from 'node:test';
import { printSheet } from './print-sheet.ts';

function printEnvironment(t) {
  const nodes = new Map();
  const frames = new Map();
  const timers = new Map();
  let nextId = 0;
  let calls = 0;
  const media = new EventTarget();
  const browser = new EventTarget();
  const appendChild = (node) => nodes.set(node.id, node);
  const document = {
    title: '국제처 업무·인수인계',
    head: { appendChild },
    body: { appendChild },
    getElementById: (id) => nodes.get(id),
    createElement: () => ({
      setAttribute() {},
      remove() { nodes.delete(this.id); },
    }),
  };
  Object.assign(browser, {
    document,
    matchMedia: () => media,
    requestAnimationFrame: (callback) => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout: (id) => timers.delete(id),
    print: () => { calls++; },
  });
  const previousWindow = globalThis.window;
  globalThis.window = browser;
  t.after(() => {
    browser.dispatchEvent(new Event('pagehide'));
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  return {
    browser, document, nodes,
    get calls() { return calls; },
    paint() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
    advance(milliseconds) {
      for (const [id, timer] of timers) {
        if (timer.delay <= milliseconds) { timers.delete(id); timer.callback(); }
      }
    },
    closeDialog: () => browser.dispatchEvent(new Event('afterprint')),
    mediaChange(matches) {
      const event = new Event('change');
      Object.assign(event, { matches });
      media.dispatchEvent(event);
    },
  };
}

const sheet = (title) => ({ title, styles: '__ROOT__ { color: #172536; }', body: `<h1>${title}</h1>` });

test('closing the PDF dialog restores the workspace title and removes the print sheet', (t) => {
  const env = printEnvironment(t);
  printSheet(sheet('업무 인수인계서'));
  assert.equal(env.document.title, '업무 인수인계서');
  env.paint();
  assert.equal(env.calls, 1);
  env.closeDialog();
  env.mediaChange(false);
  assert.equal(env.document.title, '국제처 업무·인수인계');
  assert.equal(env.nodes.size, 0);
});

test('a second PDF request cancels the pending print and restores the original filename afterward', (t) => {
  const env = printEnvironment(t);
  printSheet(sheet('첫 번째 문서'));
  printSheet(sheet('두 번째 문서'));
  assert.equal(env.nodes.size, 2);
  assert.match(env.nodes.get('ho-print-sheet').innerHTML, /두 번째 문서/);
  env.paint();
  assert.equal(env.calls, 1);
  env.closeDialog();
  assert.equal(env.document.title, '국제처 업무·인수인계');
  assert.equal(env.nodes.size, 0);
});

test('the print sheet survives a PDF dialog left open for more than a minute', (t) => {
  const env = printEnvironment(t);
  printSheet(sheet('저장할 문서'));
  env.paint();
  env.mediaChange(true);
  env.advance(120_000);
  assert.equal(env.nodes.size, 2);
  assert.equal(env.document.title, '저장할 문서');
  env.mediaChange(false);
  assert.equal(env.nodes.size, 0);
  assert.equal(env.document.title, '국제처 업무·인수인계');
});

test('printing again cleans up a mobile browser that omitted its dialog-close event', (t) => {
  const env = printEnvironment(t);
  printSheet(sheet('인수인계서'));
  env.paint();
  printSheet(sheet('연간 업무표'));
  env.paint();
  assert.equal(env.calls, 2);
  assert.equal(env.nodes.size, 2);
  env.mediaChange(false);
  assert.equal(env.document.title, '국제처 업무·인수인계');
  assert.equal(env.nodes.size, 0);
});

test('leaving the page before printing cancels the pending dialog', (t) => {
  const env = printEnvironment(t);
  printSheet(sheet('인수인계서'));
  env.browser.dispatchEvent(new Event('pagehide'));
  env.paint();
  assert.equal(env.calls, 0);
  assert.equal(env.nodes.size, 0);
  assert.equal(env.document.title, '국제처 업무·인수인계');
});

test('a browser print failure cleans up the sheet and filename', (t) => {
  const env = printEnvironment(t);
  env.browser.print = () => { throw new Error('Print unavailable'); };
  printSheet(sheet('인수인계서'));
  assert.throws(() => env.paint(), /Print unavailable/);
  assert.equal(env.nodes.size, 0);
  assert.equal(env.document.title, '국제처 업무·인수인계');
});
