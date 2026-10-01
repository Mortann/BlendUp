import assert from "node:assert/strict";
import test from "node:test";
import { explorerShortcut, visibleNavigationFolders } from "../src/views/assets/shortcuts.ts";

const key = (value: string, modifiers = {}) => explorerShortcut({ key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...modifiers });

test("explorer shortcuts distinguish naming, copying and creating folders", () => {
  assert.equal(key("F2"), "rename");
  assert.equal(key("D", { ctrlKey: true }), "duplicate");
  assert.equal(key("d", { metaKey: true }), "duplicate");
  assert.equal(key("c", { ctrlKey: true }), "copy");
  assert.equal(key("x", { ctrlKey: true }), "cut");
  assert.equal(key("v", { ctrlKey: true }), "paste");
  assert.equal(key("n", { ctrlKey: true }), "createAsset");
  assert.equal(key("n", { ctrlKey: true, shiftKey: true }), "createFolder");
  assert.equal(key("Enter", { ctrlKey: true }), "reveal");
  assert.equal(key("Enter"), "open");
  assert.equal(key("Delete"), "delete");
  assert.equal(key("ArrowUp", { altKey: true }), "parent");
});

test("repeated keys and unrelated modifier combinations do not trigger mutations", () => {
  assert.equal(key("d", { ctrlKey: true, repeat: true }), null);
  assert.equal(key("Delete", { repeat: true }), null);
  assert.equal(key("Delete", { shiftKey: true }), null);
  assert.equal(key("d", { ctrlKey: true, altKey: true }), null);
  assert.equal(key("d", { ctrlKey: true, shiftKey: true }), null);
  assert.equal(key("a", { ctrlKey: true }), null);
});

test("collapsing a folder hides descendants but preserves siblings and the collapsed row", () => {
  const folders = ["Art", "Art/Props", "Art/Props/Chairs", "Art/Props/Chairs/Wood", "Art/PropsExtra", "Art/Scenes"];
  assert.deepEqual(visibleNavigationFolders(folders, ["Art/Props"]), ["Art", "Art/Props", "Art/PropsExtra", "Art/Scenes"]);
  assert.deepEqual(visibleNavigationFolders(folders, ["Art"]), ["Art"]);
  assert.deepEqual(visibleNavigationFolders(folders, []), folders);
  // Expanding a parent retains independently collapsed children.
  assert.deepEqual(visibleNavigationFolders(folders, ["Art/Props/Chairs"]), folders.filter((path) => path !== "Art/Props/Chairs/Wood"));
});
