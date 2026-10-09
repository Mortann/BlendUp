import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip, NumberKeyframeTrack, Object3D } from "three";
import { AnimationPlayback } from "../src/views/assets/animationPlayback.ts";

function player() {
  const root = new Object3D();
  root.position.x = 3;
  const clips = [
    new AnimationClip("walk", 2, [new NumberKeyframeTrack(".position[x]", [0, 2], [0, 10])]),
    new AnimationClip("jab", 1, [new NumberKeyframeTrack(".position[x]", [0, 1], [20, 30])])
  ];
  return new AnimationPlayback(root, clips);
}

test("seeking a paused clip changes the pose without starting playback", () => {
  const playback = player();
  playback.select(0);
  playback.seek(1);
  playback.update(0.5);
  assert.equal(playback.time, 1);
  assert.equal(playback.object.position.x, 5);
  assert.equal(playback.playing, false);
  playback.select(-1);
  assert.equal(playback.object.position.x, 3);
  playback.dispose();
});

test("speed, pause and clip switching update only the selected clip", () => {
  const playback = player();
  playback.select(0);
  playback.speed = 0.5;
  playback.setPlaying(true);
  playback.update(1);
  assert.equal(playback.time, 0.5);
  playback.setPlaying(false);
  playback.update(1);
  assert.equal(playback.time, 0.5);
  playback.select(1);
  assert.equal(playback.time, 0);
  assert.equal(playback.object.position.x, 20);
  assert.equal(playback.playing, false);
  playback.dispose();
});

test("one-shot completion clamps the pose and supports seeking and replay", () => {
  const playback = player();
  playback.select(1);
  playback.setLoop(false);
  playback.setPlaying(true);
  playback.update(1.5);
  assert.equal(playback.time, 1);
  assert.equal(playback.playing, false);
  assert.equal(playback.object.position.x, 30);
  playback.seek(0.5);
  assert.equal(playback.object.position.x, 25);
  playback.setPlaying(true);
  playback.update(0.5);
  assert.equal(playback.playing, false);
  playback.setPlaying(true);
  assert.equal(playback.time, 0);
  assert.equal(playback.playing, true);
  playback.dispose();
});

test("looping wraps time and an unselected clip cannot play", () => {
  const playback = player();
  playback.select(1);
  playback.setPlaying(true);
  playback.update(1.25);
  assert.equal(playback.time, 0.25);
  assert.equal(playback.playing, true);
  playback.select(-1);
  playback.setPlaying(true);
  assert.equal(playback.playing, false);
  playback.dispose();
});
