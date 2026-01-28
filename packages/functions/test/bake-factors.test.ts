import { ColorUtils, Document } from '@gltf-transform/core';
import { bakeFactors } from '@gltf-transform/functions';
import { logger } from '@gltf-transform/test-utils';
import test from 'ava';
import ndarray from 'ndarray';
import { getPixels, savePixels } from 'ndarray-pixels';

test('factor-only baseColor/emissive', async (t) => {
	const document = new Document().setLogger(logger);
	const material = document
		.createMaterial()
		.setBaseColorFactor([0.5, 0.25, 1.0, 0.75])
		.setEmissiveFactor([0.25, 0.5, 0.75]);
	await document.transform(bakeFactors({ targets: ['baseColor', 'emissive'], resolution: { width: 1, height: 1 } }));
	const baseTex = material.getBaseColorTexture()!;
	const emiTex = material.getEmissiveTexture()!;
	t.truthy(baseTex, 'base color texture exists');
	t.truthy(emiTex, 'emissive texture exists');
	t.deepEqual(material.getBaseColorFactor(), [1, 1, 1, 1], 'baseColorFactor reset');
	t.deepEqual(material.getEmissiveFactor(), [1, 1, 1], 'emissiveFactor reset');
	const basePx = await getPixels(baseTex.getImage(), baseTex.getMimeType());
	const emiPx = await getPixels(emiTex.getImage(), emiTex.getMimeType());
	const baseLinear = [0.5, 0.25, 1.0, 0.75] as unknown as number[];
	const baseSRGB = [...baseLinear] as unknown as number[];
	ColorUtils.convertLinearToSRGB(baseLinear as any, baseSRGB as any);
	t.deepEqual(
		Array.from(basePx.data as Uint8Array),
		[
			Math.round((baseSRGB[0] as number) * 255),
			Math.round((baseSRGB[1] as number) * 255),
			Math.round((baseSRGB[2] as number) * 255),
			Math.round((baseSRGB[3] as number) * 255),
		],
		'baseColor factor-only pixel',
	);
	const emiLinear = [0.25, 0.5, 0.75, 1.0] as unknown as number[];
	const emiSRGB = [...emiLinear] as unknown as number[];
	ColorUtils.convertLinearToSRGB(emiLinear as any, emiSRGB as any);
	t.deepEqual(
		Array.from(emiPx.data as Uint8Array),
		[
			Math.round((emiSRGB[0] as number) * 255),
			Math.round((emiSRGB[1] as number) * 255),
			Math.round((emiSRGB[2] as number) * 255),
			255,
		],
		'emissive factor-only pixel',
	);
});

test('metallicRoughness mixing', async (t) => {
	const document = new Document().setLogger(logger);
	const px = ndarray(new Uint8Array(1 * 1 * 4), [1, 1, 4]);
	px.set(0, 0, 0, 0);
	px.set(0, 0, 1, 128);
	px.set(0, 0, 2, 64);
	px.set(0, 0, 3, 255);
	const image = await savePixels(px, 'image/png');
	const texture = document.createTexture('MR').setImage(image).setMimeType('image/png');
	const material = document.createMaterial().setMetallicRoughnessTexture(texture).setMetallicFactor(0.25).setRoughnessFactor(0.5);
	await document.transform(bakeFactors({ targets: ['metallicRoughness'] }));
	const dst = material.getMetallicRoughnessTexture()!;
	const out = await getPixels(dst.getImage(), dst.getMimeType());
	t.is(out.get(0, 0, 1), Math.round(128 * 0.5), 'roughness channel');
	t.is(out.get(0, 0, 2), Math.round(64 * 0.25), 'metallic channel');
	t.deepEqual([material.getMetallicFactor(), material.getRoughnessFactor()], [1, 1], 'factors reset');
});

test('baseColor mixing', async (t) => {
	const document = new Document().setLogger(logger);
	const px = ndarray(new Uint8Array(1 * 1 * 4), [1, 1, 4]);
	px.set(0, 0, 0, 128);
	px.set(0, 0, 1, 64);
	px.set(0, 0, 2, 32);
	px.set(0, 0, 3, 255);
	const image = await savePixels(px, 'image/png');
	const texture = document.createTexture('BC').setImage(image).setMimeType('image/png');
	const factor = [0.5, 2.0, 1.0, 0.5] as const;
	const material = document.createMaterial().setBaseColorTexture(texture).setBaseColorFactor(factor as any);
	await document.transform(bakeFactors({ targets: ['baseColor'] }));
	const dst = material.getBaseColorTexture()!;
	const out = await getPixels(dst.getImage(), dst.getMimeType());
	const srgb = [128 / 255, 64 / 255, 32 / 255, 255 / 255] as unknown as number[];
	const lin = [...srgb] as unknown as number[];
	ColorUtils.convertSRGBToLinear(srgb as any, lin as any);
	lin[0] = lin[0] * factor[0];
	lin[1] = lin[1] * factor[1];
	lin[2] = lin[2] * factor[2];
	const s = [...lin] as unknown as number[];
	ColorUtils.convertLinearToSRGB(lin as any, s as any);
	t.is(out.get(0, 0, 0), Math.round((s[0] as number) * 255), 'R');
	t.is(out.get(0, 0, 1), Math.round((s[1] as number) * 255), 'G');
	t.is(out.get(0, 0, 2), Math.round((s[2] as number) * 255), 'B');
	t.is(out.get(0, 0, 3), Math.round((1.0 * factor[3]) * 255), 'A');
	t.deepEqual(material.getBaseColorFactor(), [1, 1, 1, 1], 'factor reset');
});
