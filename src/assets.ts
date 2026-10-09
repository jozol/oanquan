import { makeGlowRingTexture, makeRuneTexture, makeSigilTexture, makeStoneSet, makeMistTexture } from './textures';

// Created once at module load and shared by every component.
export const stoneSet = makeStoneSet(7);
export const plinthSet = makeStoneSet(23);
export const runeTexture = makeRuneTexture();
export const sigilTexture = makeSigilTexture();
export const glowRingTexture = makeGlowRingTexture();
export const mistTextures = [makeMistTexture(1), makeMistTexture(2), makeMistTexture(3)];
