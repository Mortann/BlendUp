import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from "three";

/** Shared playback state keeps seeking and switching clips independent of React renders. */
export class AnimationPlayback {
  readonly mixer: AnimationMixer;
  action?: AnimationAction;
  index = -1;
  playing = false;
  speed = 1;
  loop = true;
  readonly object: Object3D;
  readonly clips: AnimationClip[];

  constructor(object: Object3D, clips: AnimationClip[]) {
    this.object = object;
    this.clips = clips;
    this.mixer = new AnimationMixer(object);
    this.mixer.addEventListener("finished", () => { this.playing = false; });
  }

  select(index: number) {
    this.mixer.stopAllAction();
    this.index = index;
    const clip = this.clips[index];
    this.action = clip ? this.mixer.clipAction(clip) : undefined;
    this.playing = false;
    if (this.action) {
      this.action.reset().setLoop(this.loop ? LoopRepeat : LoopOnce, this.loop ? Infinity : 1);
      this.action.clampWhenFinished = true;
      this.action.play();
      this.action.paused = true;
    }
    this.mixer.update(0);
  }

  setPlaying(value: boolean) {
    if (!this.action || !this.duration) return;
    if (value && this.time >= this.duration) this.seek(0);
    this.playing = value;
    this.action.paused = !value;
  }

  setLoop(value: boolean) {
    this.loop = value;
    this.action?.setLoop(value ? LoopRepeat : LoopOnce, value ? Infinity : 1);
  }

  seek(time: number) {
    if (!this.action) return;
    const playing = this.playing;
    // Reset LoopOnce's completed state so seeking backwards can resume playback.
    this.action.reset().play();
    this.action.time = Math.min(Math.max(time, 0), this.duration);
    this.action.paused = !playing;
    this.mixer.update(0);
  }

  update(delta: number) {
    this.mixer.update(this.playing ? delta * this.speed : 0);
  }

  get time() { return this.action?.time ?? 0; }
  get duration() { return this.clips[this.index]?.duration ?? 0; }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.object);
  }
}
