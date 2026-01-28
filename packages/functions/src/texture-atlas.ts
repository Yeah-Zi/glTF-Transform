import {
	Document,
	ImageUtils,
	Material,
	Texture,
	TextureInfo,
	type Transform,
	type vec2,
} from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import {
	assignDefaults,
	createTransform,
	ceilPowerOfTwo,
	fitWithin,
	floorPowerOfTwo,
	isUsed,
} from './utils.js';
import { getTextureColorSpace } from './get-texture-color-space.js';
import { listTextureSlots } from './list-texture-slots.js';

const NAME = 'texture-atlas';

type AtlasType = 'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive';
type RemapMode = 'texture_transform' | 'geometry';

export interface TextureAtlasOptions {
	types?: AtlasType[];
	maxSize?: number;
	padding?: number;
	rotate?: boolean;
	pow2?: boolean;
	shrink?: boolean;
	remap?: RemapMode;
	filter?: { include?: RegExp | null; exclude?: RegExp | null };
	format?: { mimeType?: 'image/png' | 'image/webp' | 'image/avif' };
	gutterStrategy?: 'duplicate-edge';
	encoder?: unknown;
	limitInputPixels?: boolean;
}

const DEFAULTS: Required<Omit<TextureAtlasOptions, 'filter' | 'format' | 'encoder'>> & {
	filter: { include: RegExp | null; exclude: RegExp | null };
	format: { mimeType: 'image/png' };
} = {
	types: ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'],
	maxSize: 4096,
	padding: 2,
	rotate: false,
	pow2: true,
	shrink: true,
	remap: 'texture_transform',
	filter: { include: null, exclude: null },
	format: { mimeType: 'image/png' },
	gutterStrategy: 'duplicate-edge',
	limitInputPixels: true,
};

interface AtlasItem {
	texture: Texture;
	width: number;
	height: number;
	buffer: Uint8Array<ArrayBuffer>;
	type: AtlasType;
	page: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

interface AtlasPage {
	type: AtlasType;
	index: number;
	width: number;
	height: number;
	items: AtlasItem[];
	imageBuffer?: Uint8Array<ArrayBuffer>;
}

function detectTypeBySlots(slots: string[], colorSpace: 'srgb' | null): AtlasType | null {
	if (slots.find((s) => s.toLowerCase().includes('basecolor'))) return 'baseColor';
	if (slots.find((s) => s.toLowerCase().includes('emissive'))) return 'emissive';
	if (slots.find((s) => s.toLowerCase().includes('normal'))) return 'normal';
	if (slots.find((s) => s.toLowerCase().includes('metallicroughness'))) return 'metallicRoughness';
	if (slots.find((s) => s.toLowerCase().includes('occlusion'))) return 'occlusion';
	// Fallback by color space: srgb → baseColor-like
	if (colorSpace === 'srgb') return 'baseColor';
	return null;
}

function computeUV(x: number, y: number, drawW: number, drawH: number, atlasW: number, atlasH: number): vec2[] {
	const sx = x / atlasW;
	const sy = y / atlasH;
	const sw = drawW / atlasW;
	const sh = drawH / atlasH;
	// Returns [offset, scale]
	return [
		[sx, sy],
		[sw, sh],
	];
}

function isSupportedMime(mime: string | null): boolean {
	return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/avif';
}

export function textureAtlas(_options: TextureAtlasOptions = {}): Transform {
	const options = assignDefaults(DEFAULTS, _options);

	return createTransform(NAME, async (document: Document): Promise<void> => {
		const logger = document.getLogger();
		const encoder = options.encoder as typeof import('sharp') | undefined;

		if (!encoder) {
			throw new Error(`${NAME}: dependency required — install "sharp" and pass { encoder }.`);
		}

		if (options.remap === 'geometry') {
			logger.warn(`${NAME}: remap="geometry" not implemented, falling back to "texture_transform".`);
		}

		const transformExt = document.createExtension(KHRTextureTransform).setRequired(true);

		// Collect candidate textures by type.
		const textures = document.getRoot().listTextures();
		const candidates: Map<AtlasType, Texture[]> = new Map();
		for (const t of textures) {
			const colorSpace = getTextureColorSpace(t);
			const slots = listTextureSlots(t);
			const type = detectTypeBySlots(slots, colorSpace);
			if (!type || !options.types.includes(type)) continue;

			const label = t.getURI() || t.getName() || '';
			const include = options.filter.include;
			const exclude = options.filter.exclude;
			if (include && !(label.match(include) || slots.find((s) => s.match(include)))) continue;
			if (exclude && (label.match(exclude) || slots.find((s) => s.match(exclude)))) continue;

			if (!isSupportedMime(t.getMimeType())) {
				logger.warn(`${NAME}: Skipping unsupported texture type "${t.getMimeType()}".`);
				continue;
			}
			if (!candidates.has(type)) candidates.set(type, []);
			candidates.get(type)!.push(t);
		}

		// 使用 TextureAtlas/MaxRectsBinPack 打包并用 Sharp 合成。
		const { createRequire } = await import('node:module');
		const require = createRequire(import.meta.url);
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const {
			MaxRectsBinPack,
			BestAreaFit,
			BestShortSideFit,
			BestLongSideFit,
			BottomLeftRule,
			ContactPointRule,
		} = require('../../../TextureAtlas/MaxRectsBinPack/build/MaxRectsBinPack.js');

		const STRATEGY = 'BestAreaFit';
		const METHOD =
			STRATEGY === 'BestShortSideFit'
				? BestShortSideFit
				: STRATEGY === 'BestLongSideFit'
					? BestLongSideFit
					: STRATEGY === 'BottomLeftRule'
						? BottomLeftRule
						: STRATEGY === 'ContactPointRule'
							? ContactPointRule
							: BestAreaFit;

		const allPages: { pageTex: Texture; type: AtlasType; index: number; width: number; height: number; items: { name: string; texture: Texture; uv: { x: number; y: number; w: number; h: number }; rotated: boolean }[] }[] = [];

		for (const type of options.types) {
			const list = candidates.get(type) || [];
			if (list.length === 0) continue;

			const images = list
				.map((tex, i) => {
					const image = tex.getImage();
					const size = tex.getSize() || ImageUtils.getSize(image!, tex.getMimeType());
					if (!image || !size) {
						logger.warn(`${NAME}: Skipping unreadable texture.`);
						return null;
					}
					if (size[0] + options.padding * 2 > options.maxSize || size[1] + options.padding * 2 > options.maxSize) {
						logger.warn(`${NAME}: Texture exceeds maxSize, skipping (${size[0]}x${size[1]}).`);
						return null;
					}
					const label = tex.getName() || tex.getURI() || `texture_${i}`;
					return { name: String(label), buffer: Buffer.from(image), width: size[0], height: size[1], tex };
				})
				.filter(Boolean) as { name: string; buffer: Buffer; width: number; height: number; tex: Texture }[];

			let atlasIndex = 0;
			let remaining = images
				.map((i) => ({ ...i, paddedW: i.width + options.padding * 2, paddedH: i.height + options.padding * 2 }))
				.sort((a, b) => Math.max(b.paddedW, b.paddedH) - Math.max(a.paddedW, a.paddedH));

			while (remaining.length > 0) {
				const packer = new MaxRectsBinPack(options.maxSize, options.maxSize, !!options.rotate);
				const placed: {
					name: string;
					texture: Texture;
					drawX: number;
					drawY: number;
					drawW: number;
					drawH: number;
					rotated: boolean;
				}[] = [];
				const notPlaced: typeof remaining = [];

				for (const rect of remaining) {
					const node = packer.insert(rect.paddedW, rect.paddedH, METHOD);
					if (!node || node.height === 0) {
						notPlaced.push(rect);
					} else {
						const rotated = node.width !== rect.paddedW || node.height !== rect.paddedH;
						const drawW = rotated ? rect.paddedH - options.padding * 2 : rect.paddedW - options.padding * 2;
						const drawH = rotated ? rect.paddedW - options.padding * 2 : rect.paddedH - options.padding * 2;
						const drawX = node.x + options.padding;
						const drawY = node.y + options.padding;
						placed.push({
							name: rect.name,
							texture: rect.tex,
							drawX,
							drawY,
							drawW,
							drawH,
							rotated,
						});
					}
				}

				if (placed.length === 0) break;

				// 计算最终图集尺寸（最小覆盖范围 + 安全边距）。
				let usedW = 0;
				let usedH = 0;
				for (const it of placed) {
					usedW = Math.max(usedW, it.drawX + it.drawW);
					usedH = Math.max(usedH, it.drawY + it.drawH);
				}
				let finalW = Math.max(4, usedW + options.padding);
				let finalH = Math.max(4, usedH + options.padding);
				if (!options.shrink) {
					finalW = options.maxSize;
					finalH = options.maxSize;
				} else if (options.pow2) {
					finalW = ceilPowerOfTwo(finalW);
					finalH = ceilPowerOfTwo(finalH);
				}

				// 合成页图像。
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const sharpEnc = encoder as unknown as (arg: unknown) => any;
				const base = sharpEnc({
					create: {
						width: finalW,
						height: finalH,
						channels: 4,
						background: { r: 0, g: 0, b: 0, alpha: 0 },
					},
				});
				const overlays = await Promise.all(
					placed.map(async (it) => {
						// 处理旋转
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const img = sharpEnc(Buffer.from(it.texture.getImage()!));
						const input = it.rotated ? await img.rotate(90).toBuffer() : await img.toBuffer();
						return { input, left: it.drawX, top: it.drawY };
					}),
				);
				let outBuffer: Buffer;
				if (options.format.mimeType === 'image/png') {
					outBuffer = await base.composite(overlays).png().toBuffer();
				} else if (options.format.mimeType === 'image/webp') {
					outBuffer = await base.composite(overlays).webp().toBuffer();
				} else {
					outBuffer = await base.composite(overlays).avif().toBuffer();
				}

				const pageTex = document
					.createTexture(`${type}-atlas_${atlasIndex}`)
					.setImage(outBuffer as unknown as Uint8Array<ArrayBuffer>)
					.setMimeType(options.format.mimeType)
					.setURI(`${type}-atlas_${atlasIndex}.${options.format.mimeType === 'image/png' ? 'png' : options.format.mimeType === 'image/webp' ? 'webp' : 'avif'}`);

				const items = placed.map((p) => {
					const [offset, scale] = computeUV(p.drawX, p.drawY, p.drawW, p.drawH, finalW, finalH);
					return {
						name: p.name,
						texture: p.texture,
						uv: { x: offset[0], y: offset[1], w: scale[0], h: scale[1] },
						rotated: p.rotated,
					};
				});

				allPages.push({
					pageTex,
					type,
					index: atlasIndex,
					width: finalW,
					height: finalH,
					items,
				});

				atlasIndex += 1;
				remaining = notPlaced;
			}
		}

		// 重映射材质槽位，并写入 KHR_texture_transform。
		for (const page of allPages) {
			for (const it of page.items) {
				const graph = it.texture.getGraph();
				for (const edge of graph.listParentEdges(it.texture)) {
					const parent = edge.getParent();
					const slotName = edge.getName();
					if (!(parent instanceof Material)) continue;
					const info: TextureInfo | null = (parent as Material)[`get${slotName[0].toUpperCase()}${slotName.slice(1)}Info`]
						? (parent as Material)[`get${slotName[0].toUpperCase()}${slotName.slice(1)}Info`]()
						: null;
					(parent as Material)[`set${slotName[0].toUpperCase()}${slotName.slice(1)}`](page.pageTex);
					if (info) {
						const offset: vec2 = [it.uv.x, it.uv.y];
						const scale: vec2 = [it.uv.w, it.uv.h];
						const rotation = options.rotate && it.rotated ? Math.PI / 2 : 0;
						const transform = transformExt.createTransform().setOffset(offset).setScale(scale).setRotation(rotation).setTexCoord(info.getTexCoord() ?? null);
						info.setExtension('KHR_texture_transform', transform);
					}
				}
			}
		}

		const replaced = new Set<Texture>();
		for (const page of allPages) {
			for (const it of page.items) replaced.add(it.texture);
		}
		for (const tex of replaced) {
			if (!isUsed(tex)) tex.dispose();
		}

		// 统计输出。
		const pagesByType = new Map<AtlasType, number>();
		for (const p of allPages) pagesByType.set(p.type, (pagesByType.get(p.type) || 0) + 1);
		for (const [type, count] of pagesByType.entries()) logger.debug(`${NAME}: ${type} → ${count} page(s).`);
	});
}

