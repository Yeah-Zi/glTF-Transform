import { ColorUtils, type Document, type Texture, TextureInfo, type Transform, type vec3, type vec4 } from '@gltf-transform/core';
import ndarray from 'ndarray';
import { savePixels } from 'ndarray-pixels';
import { assignDefaults, createTransform, rewriteTexture } from './utils.js';

const NAME = 'bakeFactors';

type Target = 'baseColor' | 'emissive' | 'metallicRoughness';

export interface BakeFactorsOptions {
	targets?: Target[];
	resolution?: 'source' | 'max' | { width: number; height: number };
	keepFactors?: boolean;
	mimeType?: 'image/png' | 'image/jpeg';
	nameSuffix?: string;
}

export const BAKE_DEFAULTS: Required<BakeFactorsOptions> = {
	targets: ['baseColor', 'emissive', 'metallicRoughness'],
	resolution: 'source',
	keepFactors: false,
	mimeType: 'image/png',
	nameSuffix: '_baked',
};

export function bakeFactors(_options: BakeFactorsOptions = BAKE_DEFAULTS): Transform {
	const options = assignDefaults(BAKE_DEFAULTS, _options);
	return createTransform(NAME, async (doc: Document): Promise<void> => {
		const root = doc.getRoot();
		for (const material of root.listMaterials()) {
			if (options.targets.includes('baseColor')) {
				const tex = material.getBaseColorTexture();
				const info = material.getBaseColorTextureInfo();
				const factor = material.getBaseColorFactor().slice() as vec4;
				const hasFactor = factor.some((v, i) => v !== (i === 3 ? 1 : 1));
				if (tex || hasFactor) {
					if (tex) {
						const dst = doc.createTexture((tex.getName() || 'BaseColor') + options.nameSuffix).setURI('BaseColor_baked.png');
						await rewriteTexture(tex, dst, (pixels, i, j) => {
							const r = pixels.get(i, j, 0) / 255;
							const g = pixels.get(i, j, 1) / 255;
							const b = pixels.get(i, j, 2) / 255;
							const a = pixels.get(i, j, 3) / 255;
							const lin: vec4 = [r, g, b, a] as vec4;
							ColorUtils.convertSRGBToLinear(lin, lin);
							lin[0] = lin[0] * factor[0];
							lin[1] = lin[1] * factor[1];
							lin[2] = lin[2] * factor[2];
							const s: vec4 = [lin[0], lin[1], lin[2], lin[3]] as vec4;
							ColorUtils.convertLinearToSRGB(lin, s);
							pixels.set(i, j, 0, Math.max(0, Math.min(255, Math.round(s[0] * 255))));
							pixels.set(i, j, 1, Math.max(0, Math.min(255, Math.round(s[1] * 255))));
							pixels.set(i, j, 2, Math.max(0, Math.min(255, Math.round(s[2] * 255))));
							const oa = Math.max(0, Math.min(255, Math.round(a * factor[3] * 255)));
							pixels.set(i, j, 3, oa);
						});
						material.setBaseColorTexture(dst);
						if (info) material.getBaseColorTextureInfo()!.copy(info);
						if (!options.keepFactors) material.setBaseColorFactor([1, 1, 1, 1]);
					} else {
						const size = options.resolution === 'source' || options.resolution === 'max' ? { width: 1, height: 1 } : options.resolution;
						const w = (size as { width: number; height: number }).width;
						const h = (size as { width: number; height: number }).height;
						const ext = options.mimeType === 'image/jpeg' ? '.jpg' : '.png';
						const dst = doc.createTexture('BaseColor' + options.nameSuffix).setURI('BaseColor' + options.nameSuffix + ext);
						const px = ndarray(new Uint8Array(w * h * 4), [w, h, 4]);
						const s: vec4 = [factor[0], factor[1], factor[2], factor[3]] as vec4;
						ColorUtils.convertLinearToSRGB(s, s);
						for (let i = 0; i < w; i++) {
							for (let j = 0; j < h; j++) {
								px.set(i, j, 0, Math.max(0, Math.min(255, Math.round(s[0] * 255))));
								px.set(i, j, 1, Math.max(0, Math.min(255, Math.round(s[1] * 255))));
								px.set(i, j, 2, Math.max(0, Math.min(255, Math.round(s[2] * 255))));
								px.set(i, j, 3, Math.max(0, Math.min(255, Math.round(s[3] * 255))));
							}
						}
						const image = await savePixels(px, options.mimeType);
						dst.setImage(image).setMimeType(options.mimeType);
						material.setBaseColorTexture(dst);
						if (!options.keepFactors) material.setBaseColorFactor([1, 1, 1, 1]);
					}
				}
			}
			if (options.targets.includes('emissive')) {
				const tex = material.getEmissiveTexture();
				const info = material.getEmissiveTextureInfo();
				const f3 = material.getEmissiveFactor().slice() as vec3;
				const hasFactor = f3.some((v) => v !== 0);
				if (hasFactor) {
					if (tex) {
						const dst = doc.createTexture((tex.getName() || 'Emissive') + options.nameSuffix).setURI('Emissive_baked.png');
						await rewriteTexture(tex, dst, (pixels, i, j) => {
							const r = pixels.get(i, j, 0) / 255;
							const g = pixels.get(i, j, 1) / 255;
							const b = pixels.get(i, j, 2) / 255;
							const a = pixels.get(i, j, 3) / 255;
							const lin: vec4 = [r, g, b, a] as vec4;
							ColorUtils.convertSRGBToLinear(lin, lin);
							lin[0] = lin[0] * f3[0];
							lin[1] = lin[1] * f3[1];
							lin[2] = lin[2] * f3[2];
							const s: vec4 = [lin[0], lin[1], lin[2], lin[3]] as vec4;
							ColorUtils.convertLinearToSRGB(lin, s);
							pixels.set(i, j, 0, Math.max(0, Math.min(255, Math.round(s[0] * 255))));
							pixels.set(i, j, 1, Math.max(0, Math.min(255, Math.round(s[1] * 255))));
							pixels.set(i, j, 2, Math.max(0, Math.min(255, Math.round(s[2] * 255))));
							pixels.set(i, j, 3, Math.max(0, Math.min(255, Math.round(a * 255))));
						});
						material.setEmissiveTexture(dst);
						if (info) material.getEmissiveTextureInfo()!.copy(info);
						if (!options.keepFactors) material.setEmissiveFactor([1, 1, 1]);
					} else {
						const size = options.resolution === 'source' || options.resolution === 'max' ? { width: 1, height: 1 } : options.resolution;
						const w = (size as { width: number; height: number }).width;
						const h = (size as { width: number; height: number }).height;
						const ext = options.mimeType === 'image/jpeg' ? '.jpg' : '.png';
						const dst = doc.createTexture('Emissive' + options.nameSuffix).setURI('Emissive' + options.nameSuffix + ext);
						const px = ndarray(new Uint8Array(w * h * 4), [w, h, 4]);
						const s: vec4 = [f3[0], f3[1], f3[2], 1] as vec4;
						ColorUtils.convertLinearToSRGB(s, s);
						for (let i = 0; i < w; i++) {
							for (let j = 0; j < h; j++) {
								px.set(i, j, 0, Math.max(0, Math.min(255, Math.round(s[0] * 255))));
								px.set(i, j, 1, Math.max(0, Math.min(255, Math.round(s[1] * 255))));
								px.set(i, j, 2, Math.max(0, Math.min(255, Math.round(s[2] * 255))));
								px.set(i, j, 3, 255);
							}
						}
						const image = await savePixels(px, options.mimeType);
						dst.setImage(image).setMimeType(options.mimeType);
						material.setEmissiveTexture(dst);
						if (!options.keepFactors) material.setEmissiveFactor([1, 1, 1]);
					}
				}
			}
			if (options.targets.includes('metallicRoughness')) {
				const tex = material.getMetallicRoughnessTexture();
				const info = material.getMetallicRoughnessTextureInfo();
				const metallic = material.getMetallicFactor();
				const roughness = material.getRoughnessFactor();
				const hasFactor = metallic !== 1 || roughness !== 1;
				if (tex || hasFactor) {
					if (tex) {
						const dst = doc.createTexture((tex.getName() || 'MetallicRoughness') + options.nameSuffix).setURI('MetallicRoughness_baked.png');
						await rewriteTexture(tex, dst, (pixels, i, j) => {
							const g = pixels.get(i, j, 1);
							const b = pixels.get(i, j, 2);
							const ng = Math.max(0, Math.min(255, Math.round(g * roughness)));
							const nb = Math.max(0, Math.min(255, Math.round(b * metallic)));
							pixels.set(i, j, 1, ng);
							pixels.set(i, j, 2, nb);
						});
						material.setMetallicRoughnessTexture(dst);
						if (info) material.getMetallicRoughnessTextureInfo()!.copy(info);
						if (!options.keepFactors) {
							material.setMetallicFactor(1);
							material.setRoughnessFactor(1);
						}
					} else {
						const size = options.resolution === 'source' || options.resolution === 'max' ? { width: 1, height: 1 } : options.resolution;
						const w = (size as { width: number; height: number }).width;
						const h = (size as { width: number; height: number }).height;
						const ext = options.mimeType === 'image/jpeg' ? '.jpg' : '.png';
						const dst = doc.createTexture('MetallicRoughness' + options.nameSuffix).setURI('MetallicRoughness' + options.nameSuffix + ext);
						const px = ndarray(new Uint8Array(w * h * 4), [w, h, 4]);
						for (let i = 0; i < w; i++) {
							for (let j = 0; j < h; j++) {
								px.set(i, j, 0, 0);
								px.set(i, j, 1, Math.max(0, Math.min(255, Math.round(roughness * 255))));
								px.set(i, j, 2, Math.max(0, Math.min(255, Math.round(metallic * 255))));
								px.set(i, j, 3, 255);
							}
						}
						const image = await savePixels(px, options.mimeType);
						dst.setImage(image).setMimeType(options.mimeType);
						material.setMetallicRoughnessTexture(dst);
						if (!options.keepFactors) {
							material.setMetallicFactor(1);
							material.setRoughnessFactor(1);
						}
					}
				}
			}
		}
	});
}
