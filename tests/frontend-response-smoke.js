import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const elements = new Map();
const document = { querySelector(selector) {
  if (!elements.has(selector)) elements.set(selector, { addEventListener() {}, classList: { add() {}, remove() {} } });
  return elements.get(selector);
} };
const context = { document, FormData, fetch: async () => new Response('<!DOCTYPE html><title>Error</title>', { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'text/html' } }) };
vm.runInNewContext(script, context);
await new Promise(resolve => setTimeout(resolve, 0));
assert.match(elements.get('#sourceStatus').textContent, /HTTP 404 Not Found/);
assert.match(elements.get('#sourceStatus').textContent, /text\/html instead of JSON/);
console.log('Passed: frontend reports HTML API response with HTTP status and content type');

const liveElements = new Map();
const makeElement = () => ({ children: [], classList: { add() {}, remove() {} }, addEventListener() {}, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; } });
const liveDocument = {
  querySelector(selector) { if (!liveElements.has(selector)) liveElements.set(selector, makeElement()); return liveElements.get(selector); },
  createElement: makeElement
};
const live = vm.createContext({ document: liveDocument, FormData, File, fetch: (url, options) => fetch(`http://127.0.0.1:3000${url}`, options) });
vm.runInContext(script, live);
await vm.runInContext("uploadFiles([new File(['Frontend preview sample'], 'frontend-sample.txt')])", live);
const row = liveElements.get('#sourceList').children.find(item => item.children[0].textContent === 'frontend-sample.txt');
assert.ok(row, 'Uploaded source appears after list refresh');
await row.children[1].onclick();
assert.match(liveElements.get('#preview').textContent, /Frontend preview sample/);
liveDocument.querySelector('#notes').value = 'Frontend pasted notes';
await liveElements.get('#addNotes').onclick();
assert.equal(liveElements.get('#notes').value, '');
const beforeDelete = liveElements.get('#sourceList').children.length;
await row.children[2].onclick();
assert.equal(liveElements.get('#sourceList').children.length, beforeDelete - 1);
console.log('Passed: frontend upload, list refresh, preview, notes, and delete against running server');
