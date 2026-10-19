import assert from "node:assert/strict";
import test from "node:test";
import { isTextureBackup, textureUsage } from "../src/views/assets/textures.ts";

test("classifies generated bakes and common PBR naming without substring guesses", () => {
  assert.equal(textureUsage("Plastron_Normal.png"), "normal");
  assert.equal(textureUsage("Plastron_Bake_Color.png"), "color");
  assert.equal(textureUsage("Armour_NormalDX_2K.png"), "normal");
  assert.equal(textureUsage("wall_roughness.jpg"), "roughness");
  assert.equal(textureUsage("wall_ORM.png"), "packed");
  assert.equal(textureUsage("normality.png"), "other");
  assert.equal(isTextureBackup("Art/Étagère/textures/backups/2026/file.png"), true);
  assert.equal(isTextureBackup("Art\\Étagère\\textures\\backups\\2026\\file.png"), true);
});
