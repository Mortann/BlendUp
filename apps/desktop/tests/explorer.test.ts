import assert from "node:assert/strict";
import test from "node:test";
import { explorerShortcut, visibleNavigationFolders } from "../src/views/assets/shortcuts.ts";
import { groupProblems, readableError } from "../src/blendup/problems.ts";
import type { BlendUpAsset, BlendUpProblem } from "../src/blendup/types.ts";

test("problems group by asset, sort errors first and filter the cause or path", () => {
  const assets = [{ id: "rock", name: "Rock", sourcePath: "Art/Props/Rock.blend" }, { id: "table", name: "Table", sourcePath: "Art/Furniture/Table.blend" }] as BlendUpAsset[];
  const problems = [
    { id: "1", assetId: "rock", title: "UV à vérifier", detail: "Pas de rapport", severity: "warning", category: "uv" },
    { id: "2", assetId: "table", title: "Export absent", detail: "À exporter", severity: "warning", category: "export" },
    { id: "3", assetId: "rock", title: "Export bloqué", detail: "FinalBaseMesh : UV manquantes", severity: "error", category: "uv" }
  ] as BlendUpProblem[];
  const groups = groupProblems(problems, assets);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].asset?.id, "rock");
  assert.equal(groups[0].problems.length, 2);
  assert.equal(groups[0].problems[0].id, "3");
  assert.equal(groupProblems(problems, assets, { query: "Furniture", category: "all", severity: "all" })[0].asset?.id, "table");
  assert.equal(groupProblems(problems, assets, { query: "FinalBaseMesh", category: "uv", severity: "error" })[0].problems.length, 1);
  assert.equal(groupProblems(problems, assets, { query: "", category: "export", severity: "error" }).length, 0);
});

test("error messages show the cause while omitting the Blender shutdown wrapper", () => {
  assert.equal(readableError("Blender startup\nTraceback (most recent call last):\n  File export.py\nRuntimeError: UV manquantes\nError: script failed, exiting."), "UV manquantes");
  assert.equal(readableError("Dossier déjà présent."), "Dossier déjà présent.");
});

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
