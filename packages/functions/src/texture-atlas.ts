import {
	Document,
	type Transform,
	type vec2,
	type Material,
	type Texture,
	ImageUtils,
} from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import type sharp from 'sharp';
import { assignDefaults, createTransform, fitPowerOfTwo, fitWithin, isUsed } from './utils.js';
const NAME = 'textureAtlas';
type AtlasType = 'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive';
export interface TextureAtlasOptions {
	encoder?: unknown;
	types?: AtlasType[];
	maxSize?: number;
	padding?: number;
	rotate?: boolean;
	pow2?: boolean;
	shrink?: boolean;
	remap?: 'texture_transform' | 'geometry';
	format?: { mimeType: string };
}
const DEFAULTS: Required<Pick<TextureAtlasOptions, 'types' | 'maxSize' | 'padding' | 'rotate' | 'pow2' | 'shrink' | 'remap'>> &
	Pick<TextureAtlasOptions, 'format' | 'encoder'> = {
	types: ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'],
	maxSize: 4096,
	padding: 2,
	rotate: false,
	pow2: true,
	shrink: true,
	remap: 'texture_transform',
	format: { mimeType: 'image/png' },
	encoder: undefined,
};
interface Sprite {
	material: Material;
	texture: Texture;
	size: vec2;
	image: Uint8Array;
}
interface Placement {
	page: number;
	x: number;
	y: number;
	w: number;
	h: number;
}
function pack(sprites: Sprite[], maxSize: number, padding: number): { placements: Placement[]; pages: { width: number; height: number }[] } {
	const placements: Placement[] = [];
	const pages: { width: number; height: number }[] = [];
	let page = 0;
	let x = padding;
	let y = padding;
	let rowH = 0;
	let usedW = 0;
	let usedH = 0;
	for (const s of sprites) {
		const w = s.size[0];
		const h = s.size[1];
		if (w > maxSize || h > maxSize) {
			throw new Error(`${NAME}: sprite exceeds maxSize (${w}x${h} > ${maxSize}).`);
		}
		if (x + w + padding > maxSize) {
			x = padding;
			y += rowH + padding;
			rowH = 0;
		}
		if (y + h + padding > maxSize) {
			pages.push({ width: Math.max(usedW + padding, 1), height: Math.max(usedH + padding, 1) });
			page++;
			x = padding;
			y = padding;
			rowH = 0;
			usedW = 0;
			usedH = 0;
		}
		placements.push({ page, x, y, w, h });
		x += w + padding;
		rowH = Math.max(rowH, h);
		usedW = Math.max(usedW, x);
		usedH = Math.max(usedH, y + h);
	}
	pages.push({ width: Math.max(usedW + padding, 1), height: Math.max(usedH + padding, 1) });
	return { placements, pages };
}
function getSlot(material: Material, type: AtlasType): { texture: Texture | null; set: (t: Texture | null) => Material; info: ReturnType<Material['getBaseColorTextureInfo']> | null } {
	switch (type) {
		case 'baseColor':
			return { texture: material.getBaseColorTexture(), set: (t) => material.setBaseColorTexture(t), info: material.getBaseColorTextureInfo() };
		case 'normal':
			return { texture: material.getNormalTexture(), set: (t) => material.setNormalTexture(t), info: material.getNormalTextureInfo() };
		case 'metallicRoughness':
			return { texture: material.getMetallicRoughnessTexture(), set: (t) => material.setMetallicRoughnessTexture(t), info: material.getMetallicRoughnessTextureInfo() };
		case 'occlusion':
			return { texture: material.getOcclusionTexture(), set: (t) => material.setOcclusionTexture(t), info: material.getOcclusionTextureInfo() };
		case 'emissive':
			return { texture: material.getEmissiveTexture(), set: (t) => material.setEmissiveTexture(t), info: material.getEmissiveTextureInfo() };
	}
}
async function encodeToFormat(encoder: typeof sharp | null, image: Uint8Array, srcMime: string, dstMime: string): Promise<Uint8Array> {
	if (!encoder || srcMime === dstMime) return image;
	const fmt = dstMime.split('/').pop();
	const instance = encoder(image);
	switch (fmt) {
		case 'png':
			return (await instance.png().toBuffer()) as unknown as Uint8Array;
		case 'webp':
			return (await instance.webp().toBuffer()) as unknown as Uint8Array;
		case 'avif':
			return (await instance.avif().toBuffer()) as unknown as Uint8Array;
		default:
			return image;
	}
}
export function textureAtlas(_options: TextureAtlasOptions): Transform {
	const options = assignDefaults(DEFAULTS, _options);
	return createTransform(NAME, async (document: Document): Promise<void> => {
		const logger = document.getLogger();
		const encoder = options.encoder as typeof sharp | null;
		const useTextureTransform = options.remap === 'texture_transform';
		const transformExt = useTextureTransform ? document.createExtension(KHRTextureTransform).setRequired(true) : null;
		for (const type of options.types) {
			const sprites: Sprite[] = [];
			for (const material of document.getRoot().listMaterials()) {
				const { texture } = getSlot(material, type);
				if (!texture) continue;
				const image = texture.getImage();
				const mimeType = texture.getMimeType();
				if (!image || !mimeType) continue;
				const size = ImageUtils.getSize(image, mimeType);
				if (!size) continue;
				let dstSize: vec2 = [...size] as vec2;
				if (dstSize[0] > options.maxSize || dstSize[1] > options.maxSize) {
					dstSize = fitWithin(dstSize, [options.maxSize - options.padding * 2, options.maxSize - options.padding * 2]);
				}
				let dstImage = image;
				if (dstSize[0] !== size[0] || dstSize[1] !== size[1]) {
					if (!encoder) {
						logger.warn(`${NAME}: resizing requires encoder.`);
					} else {
						dstImage = (await encoder(image).resize(dstSize[0], dstSize[1], { fit: 'fill' }).toBuffer()) as unknown as Uint8Array;
					}
				}
				dstImage = await encodeToFormat(encoder, dstImage, mimeType, options.format.mimeType);
				sprites.push({ material, texture, size: dstSize, image: dstImage });
			}
			if (sprites.length === 0) continue;
			const { placements, pages } = pack(sprites, options.maxSize, options.padding);
			const atlasTextures: Texture[] = [];
			for (let p = 0; p < pages.length; p++) {
				let width = pages[p].width;
				let height = pages[p].height;
				if (options.pow2) {
					[width, height] = fitPowerOfTwo([width, height], 'ceil-pot');
				}
				if (!options.shrink) {
					width = options.maxSize;
					height = options.maxSize;
				}
				if (!encoder) {
					throw new Error(`${NAME}: encoder required for atlas generation.`);
				}
				const base = await encoder({
					create: {
						width,
						height,
						channels: 4,
						background: { r: 0, g: 0, b: 0, alpha: 0 },
					},
				});
				const composites: sharp.OverlayOptions[] = [];
				for (let i = 0; i < placements.length; i++) {
					const pl = placements[i];
					if (pl.page !== p) continue;
					composites.push({
						input: sprites[i].image as unknown as Buffer,
						left: pl.x,
						top: pl.y,
					});
				}
				const buffer = (await base.composite(composites).toFormat(options.format.mimeType.split('/').pop() as sharp.AvailableFormatInfo).toBuffer()) as unknown as Uint8Array;
				const atlasTex = document.createTexture(`${type}-atlas-${p + 1}`).setImage(buffer).setMimeType(options.format.mimeType);
				atlasTextures.push(atlasTex);
			}
			for (let i = 0; i < placements.length; i++) {
				const pl = placements[i];
				const atlas = atlasTextures[pl.page];
				const { set, info } = getSlot(sprites[i].material, type);
				set(atlas);
				const atlasSize = atlas.getSize()!;
				const offset: vec2 = [pl.x / atlasSize[0], pl.y / atlasSize[1]];
				const scale: vec2 = [pl.w / atlasSize[0], pl.h / atlasSize[1]];
				if (useTextureTransform && transformExt) {
					const tr = transformExt.createTransform();
					tr.setOffset(offset);
					tr.setScale(scale);
					info?.setExtension(KHRTextureTransform.EXTENSION_NAME, tr);
				} else {
					const wrapS = info ? info.getWrapS() : undefined;
					const wrapT = info ? info.getWrapT() : undefined;
					info?.setExtension(KHRTextureTransform.EXTENSION_NAME, null);
					let newTexCoordIndex = 0;
					for (const mesh of document.getRoot().listMeshes()) {
						for (const prim of mesh.listPrimitives()) {
							if (prim.getMaterial() !== sprites[i].material) continue;
							for (const semanticName of prim.listSemantics()) {
								if (semanticName.startsWith('TEXCOORD_')) {
									const idx = Number(semanticName.replace('TEXCOORD_', ''));
									newTexCoordIndex = Math.max(newTexCoordIndex, idx + 1);
								}
							}
						}
					}
					if (info) info.setTexCoord(newTexCoordIndex);
					const newSemantic = `TEXCOORD_${newTexCoordIndex}`;
					for (const mesh of document.getRoot().listMeshes()) {
						for (const prim of mesh.listPrimitives()) {
							if (prim.getMaterial() !== sprites[i].material) continue;
							const srcIndex = info ? Math.max(0, info.getTexCoord()) : 0;
							const srcSemantic = `TEXCOORD_${srcIndex}`;
							const srcAttr =
								prim.getAttribute(srcSemantic) ||
								prim.getAttribute('TEXCOORD_0');
							if (!srcAttr) continue;
							const count = srcAttr.getCount();
							const dst = document.createAccessor().setType('VEC2').setArray(new Float32Array(count * 2));
							const el: number[] = [];
							for (let j = 0; j < count; j++) {
								const uv = srcAttr.getElement(j, el) as [number, number];
								let u = uv[0];
								let v = uv[1];
								if (wrapS === 10497) {
									u = u - Math.floor(u);
								} else if (wrapS === 33071) {
									u = Math.max(0, Math.min(1, u));
								} else if (wrapS === 33648) {
									const fu = Math.abs(u);
									const ru = fu - Math.floor(fu);
									const mu = Math.floor(fu) % 2 === 0 ? ru : 1 - ru;
									u = mu;
								}
								if (wrapT === 10497) {
									v = v - Math.floor(v);
								} else if (wrapT === 33071) {
									v = Math.max(0, Math.min(1, v));
								} else if (wrapT === 33648) {
									const fv = Math.abs(v);
									const rv = fv - Math.floor(fv);
									const mv = Math.floor(fv) % 2 === 0 ? rv : 1 - rv;
									v = mv;
								}
								const tu = u * scale[0] + offset[0];
								const tv = v * scale[1] + offset[1];
								dst.setElement(j, [tu, tv]);
							}
							prim.setAttribute(newSemantic, dst);
							for (let j = newTexCoordIndex - 1; j >= 0; j--) {
								const s = `TEXCOORD_${j}`;
								if (!prim.getAttribute(s)) {
									prim.setAttribute(s, dst);
								}
							}
						}
					}
				}
			}
			logger.debug(`${NAME}(${type}): pages=${pages.length}, sprites=${sprites.length}`);
			for (const s of sprites) {
				if (!isUsed(s.texture)) s.texture.dispose();
			}
		}
		logger.debug(`${NAME}: Complete.`);
	});
}
