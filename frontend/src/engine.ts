import * as Tone from "tone";
import { detectRootMidi } from "./pitch";
import { encodeWav } from "./wav";
import { SLOTS, type Session, type Slot } from "./types";

type Disposable = { dispose: () => unknown };
const DRUM_NOTE = "C4"; // drum samples are mapped to MIDI 60 and always triggered at C4 (no pitch shift)
const KIT_GAIN: Record<Slot, number> = { kick: 0, snare: -2, hat: -9, perc: -8 };

/**
 * The audio engine. The browser owns playback: every change rebuilds the arrangement from the
 * Session JSON and restarts the loop from the top (like a loop pedal dropping in a new layer).
 */
class Engine {
  readonly master: Tone.Volume;
  readonly analyser: Tone.Analyser;
  onPulse: ((key: string) => void) | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private roots = new Map<string, number | null>();
  private live: Disposable[] = [];

  constructor() {
    this.master = new Tone.Volume(-3).toDestination();
    this.analyser = new Tone.Analyser("fft", 64);
    this.master.connect(this.analyser);
  }

  /** Root note detected for an instrument sample, or null (= synth fallback). */
  rootOf(url: string | null | undefined): number | null {
    return url ? (this.roots.get(url) ?? null) : null;
  }

  async load(url: string | null | undefined): Promise<AudioBuffer | null> {
    if (!url) return null;
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't load ${url}`);
    const ctx = Tone.getContext().rawContext as unknown as BaseAudioContext;
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    this.buffers.set(url, buf);
    return buf;
  }

  async loadSession(s: Session): Promise<void> {
    const v = s.vibe;
    const urls = [
      ...Object.values(v.kit),
      v.instruments.lead,
      v.instruments.bass,
      ...s.parts.flatMap((p) => [p.sample_url, p.loop_url]),
    ];
    await Promise.all(urls.map((u) => this.load(u).catch((e) => console.warn(e))));
    for (const u of [v.instruments.lead, v.instruments.bass]) {
      if (u && !this.roots.has(u)) {
        const b = this.buffers.get(u);
        this.roots.set(u, b ? detectRootMidi(b) : null);
      }
    }
  }

  /** Build every sound of the song into `out`, on the current context's transport. */
  private build(s: Session, out: Tone.ToneAudioNode, live: boolean): Disposable[] {
    const made: Disposable[] = [];
    const v = s.vibe;
    const transport = Tone.getTransport(); // inside Tone.Offline this is the offline transport
    const tick = transport.PPQ / 4; // ticks per 16th step
    const at = (step: number) => `${Math.round(step * tick)}i`;
    const pulse = (key: string, time: number) => {
      const cb = this.onPulse;
      if (live && cb) Tone.getDraw().schedule(() => cb(key), time);
    };
    const active = s.parts.filter((p) => !p.muted);
    const backing = active.find((p) => p.kind === "backing");

    // 1. Drums: the vibe's pattern, played on the kit sound or on the user's own sound for that slot.
    for (const slot of SLOTS) {
      const steps = v.pattern[slot] ?? [];
      if (!steps.length) continue;
      const userPart = [...s.parts].reverse().find((p) => p.kind === "drum" && p.slot === slot);
      if (userPart?.muted) continue; // muting your sound silences that drum
      const url = userPart?.sample_url ?? v.kit[slot];
      const buf = url ? this.buffers.get(url) : undefined;
      if (!buf) continue;
      const sampler = new Tone.Sampler({ urls: { 60: buf }, release: 0.05 }).connect(out);
      sampler.volume.value = userPart ? userPart.volume + KIT_GAIN[slot] / 2 : KIT_GAIN[slot];
      const key = userPart ? userPart.id : `kit-${slot}`;
      const events = steps.map((st) => ({ time: at(st), vel: st % 4 === 0 ? 1 : 0.8 }));
      const part = new Tone.Part<{ time: string; vel: number }>((time, ev) => {
        sampler.triggerAttack(DRUM_NOTE, time, ev.vel);
        pulse(key, time);
      }, events);
      part.loop = true;
      part.loopEnd = "1m";
      part.start(0);
      made.push(part, sampler);
    }

    // 2. Harmony: a soft chord pad + root bass from the vibe's progression (replaced by a backing track).
    if (!backing) {
      const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.35, decay: 0.3, sustain: 0.55, release: 1.2 },
      }).connect(out);
      pad.volume.value = -22;
      const chordEvents = v.chords.map((notes, bar) => ({ time: `${bar}m`, notes }));
      const padPart = new Tone.Part<{ time: string; notes: number[] }>((time, ev) => {
        pad.triggerAttackRelease(
          ev.notes.map((m) => Tone.Frequency(m, "midi").toNote()),
          "1m",
          time,
          0.55,
        );
      }, chordEvents);
      padPart.loop = true;
      padPart.loopEnd = `${v.bars}m`;
      padPart.start(0);
      made.push(padPart, pad);

      if (!active.some((p) => p.kind === "bass")) {
        const bass = new Tone.MonoSynth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.25 },
          filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, baseFrequency: 150, octaves: 2 },
        }).connect(out);
        bass.volume.value = -14;
        const bassEvents = v.bass_roots.flatMap((m, bar) => [
          { time: `${bar}:0:0`, m, d: "4n." },
          { time: `${bar}:2:2`, m, d: "8n" },
        ]);
        const bassPart = new Tone.Part<{ time: string; m: number; d: string }>((time, ev) => {
          bass.triggerAttackRelease(Tone.Frequency(ev.m, "midi").toNote(), ev.d, time, 0.9);
        }, bassEvents);
        bassPart.loop = true;
        bassPart.loopEnd = `${v.bars}m`;
        bassPart.start(0);
        made.push(bassPart, bass);
      }
    }

    // 3. Hummed melodies / basslines on the vibe's ElevenLabs instrument (or a synth if it isn't pitched).
    for (const p of active.filter((x) => x.kind === "melody" || x.kind === "bass")) {
      const instUrl = p.kind === "bass" ? v.instruments.bass : v.instruments.lead;
      const buf = instUrl ? this.buffers.get(instUrl) : undefined;
      const root = this.rootOf(instUrl);
      let play: (midi: number, dur: string, time: number, vel: number) => void;
      if (buf && root !== null) {
        const sampler = new Tone.Sampler({ urls: { [root]: buf }, release: 0.4 }).connect(out);
        sampler.volume.value = p.volume - 4;
        play = (m, d, time, vel) => sampler.triggerAttackRelease(Tone.Frequency(m, "midi").toNote(), d, time, vel);
        made.push(sampler);
      } else {
        const synth =
          p.kind === "bass"
            ? new Tone.MonoSynth({ oscillator: { type: "square" }, envelope: { attack: 0.01, release: 0.2 } })
            : new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.02, release: 0.4 } });
        synth.connect(out);
        synth.volume.value = p.volume - 8;
        play = (m, d, time, vel) => synth.triggerAttackRelease(Tone.Frequency(m, "midi").toNote(), d, time, vel);
        made.push(synth);
      }
      const events = (p.notes ?? []).map((n) => ({
        time: at(n.start_step),
        dur: `${Math.round(Math.max(1, n.dur_steps) * tick)}i`,
        midi: n.midi,
        vel: n.velocity,
      }));
      const part = new Tone.Part<{ time: string; dur: string; midi: number; vel: number }>((time, ev) => {
        play(ev.midi, ev.dur, time, ev.vel);
        pulse(p.id, time);
      }, events);
      part.loop = true;
      part.loopEnd = `${Math.round((p.loop_steps ?? 32) * tick)}i`;
      part.start(0);
      made.push(part);
    }

    // 4. Textures and the backing track: audio loops synced to the transport.
    for (const p of active.filter((x) => x.kind === "texture" || x.kind === "backing")) {
      const buf = p.loop_url ? this.buffers.get(p.loop_url) : undefined;
      if (!buf) continue;
      const player = new Tone.Player(buf).connect(out);
      player.loop = true;
      if (p.kind === "texture") {
        const loopSec = (p.loop_steps ?? 32) * (60 / v.bpm / 4);
        player.playbackRate = buf.duration / loopSec; // follows tempo changes when the vibe changes
      }
      player.volume.value = p.volume;
      player.sync().start(0);
      made.push(player);
    }
    return made;
  }

  private reset(s: Session) {
    const t = Tone.getTransport();
    t.stop();
    t.cancel(0);
    for (const d of this.live) {
      try {
        d.dispose();
      } catch {
        /* already gone */
      }
    }
    this.live = [];
    t.position = 0;
    t.bpm.value = s.vibe.bpm;
    t.swing = s.vibe.swing;
    t.swingSubdivision = "16n";
  }

  /** (Re)start the whole song from the top. */
  play(s: Session) {
    this.reset(s);
    this.live = this.build(s, this.master, true);
    Tone.getTransport().start("+0.05");
  }

  stop() {
    Tone.getTransport().stop();
  }

  get running() {
    return Tone.getTransport().state === "started";
  }

  /** 4 count-in clicks, then the song starts on "1". Returns the AudioContext time of that downbeat. */
  playWithCountIn(s: Session, onCount: (n: number) => void): number {
    this.reset(s);
    this.live = this.build(s, this.master, true);
    const click = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
    }).connect(this.master);
    click.volume.value = -10;
    this.live.push(click);
    const beat = 60 / s.vibe.bpm;
    const first = Tone.now() + 0.15;
    for (let i = 0; i < 4; i++) {
      const time = first + i * beat;
      click.triggerAttackRelease(i === 0 ? "A5" : "E5", 0.04, time);
      Tone.getDraw().schedule(() => onCount(4 - i), time);
    }
    const downbeat = first + 4 * beat;
    Tone.getDraw().schedule(() => onCount(0), downbeat);
    Tone.getTransport().start(downbeat);
    return downbeat;
  }

  /** Render the song offline to a WAV of at least `minSeconds` (whole loops), with a short fade-out. */
  async exportMix(s: Session, minSeconds = 15): Promise<{ blob: Blob; seconds: number }> {
    const loopSec = (s.vibe.bars * 240) / s.vibe.bpm;
    const songSec = Math.max(1, Math.ceil(minSeconds / loopSec)) * loopSec;
    const rendered = await Tone.Offline(
      ({ transport }) => {
        transport.bpm.value = s.vibe.bpm;
        transport.swing = s.vibe.swing;
        transport.swingSubdivision = "16n";
        const out = new Tone.Volume(-3).toDestination();
        out.volume.setValueAtTime(-3, Math.max(0, songSec - 1.2));
        out.volume.linearRampToValueAtTime(-60, songSec + 0.3);
        this.build(s, out, false);
        transport.start(0);
      },
      songSec + 0.5,
      2,
      44100,
    );
    const buf = rendered.get();
    if (!buf) throw new Error("Rendering failed");
    const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0);
    return { blob: encodeWav([buf.getChannelData(0), right], buf.sampleRate), seconds: songSec };
  }
}

export const engine = new Engine();
