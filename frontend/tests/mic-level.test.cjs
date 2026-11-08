const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  let amplitude = 0, requests = 0, speakerConnections = 0;
  const track = { readyState: 'live', label: 'test', getSettings: () => ({}), addEventListener() {} };
  const stream = { active: true, getAudioTracks: () => [track] };
  class Context {
    state = 'running'; sampleRate = 48000;
    createAnalyser() { return { context: this, disconnect() {}, getFloatTimeDomainData: data => data.fill(amplitude) }; }
    createMediaStreamSource() { return { disconnect() {}, connect: node => { if (node === this.destination) speakerConnections++; } }; }
    destination = {};
    async resume() { this.state = 'running'; }
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/recorder.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = { exports: {}, require: name => name === './debug' ? { debug: { info() {}, warn() {}, error() {} } } : {},
    window: { AudioContext: Context }, navigator: { mediaDevices: { getUserMedia: async () => { requests++; return stream; } } }, Float32Array };
  vm.runInNewContext(code, scope);
  return { mic: scope.exports.mic, stream, track, setAmplitude: n => { amplitude=n; }, requests: () => requests, speakers: () => speakerConnections };
}

test('meter does not request permission until explicit mic initialization', () => {
  const s=setup(); assert.equal(s.mic.getLevel(),0); assert.equal(s.requests(),0);
});
test('meter follows input amplitude immediately and clamps loud peaks', async () => {
  const s=setup(); await s.mic.init();
  s.setAmplitude(.01); assert.ok(Math.abs(s.mic.getLevel()-.1)<.0001);
  s.setAmplitude(.3); assert.equal(s.mic.getLevel(),1);
  s.setAmplitude(0); assert.equal(s.mic.getLevel(),0);
});
test('meter reuses live stream and never connects microphone to speakers', async () => {
  const s=setup(); await s.mic.init(); await s.mic.init(); assert.equal(s.requests(),1); assert.equal(s.speakers(),0);
});
test('meter reports zero when the input stream is inactive', async () => {
  const s=setup(); await s.mic.init(); s.setAmplitude(.1); s.stream.active=false; assert.equal(s.mic.getLevel(),0);
});
