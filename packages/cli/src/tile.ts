import { mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join as joinPath, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { type NodeIO, type Transform, uuid } from '@gltf-transform/core';
import {
	dedup,
	flatten,
	INSTANCE_DEFAULTS,
	instance,
	JOIN_DEFAULTS,
	join,
	PALETTE_DEFAULTS,
	palette,
	prune,
	quantize,
	sparse,
	textureAtlas,
	weld,
} from '@gltf-transform/functions';
import micromatch from 'micromatch';
import type sharp from 'sharp';
import { Mode, toktx } from './transforms/toktx.js';
import type { Logger } from './program.js';
import { Session } from './session.js';
import { MICROMATCH_OPTIONS } from './utils/match.js';

type AtlasType = 'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive';

/** Options for the tile optimization pipeline. */
export interface TileOptions {
	palette?: boolean;
	paletteMin?: number;
	paletteBlockSize?: number;
	atlas?: boolean;
	atlasTypes?: AtlasType[];
	atlasMaxSize?: number;
	atlasPadding?: number;
	atlasRotate?: boolean;
	atlasPow2?: boolean;
	atlasShrink?: boolean;
	atlasRemap?: 'texture_transform' | 'geometry';
	atlasFormat?: 'png' | 'webp' | 'avif';
	dedup?: boolean;
	instance?: boolean;
	instanceMin?: number;
	flatten?: boolean;
	join?: boolean;
	joinMeshes?: boolean;
	joinNamed?: boolean;
	weld?: boolean;
	prune?: boolean;
	pruneAttributes?: boolean;
	pruneSolidTextures?: boolean;
	sparse?: boolean;
	quantize?: boolean;
	ktx2?: boolean;
	textureSize?: number;
	limitInputPixels?: boolean;
}

const ATLAS_MIME: Record<NonNullable<TileOptions['atlasFormat']>, string> = {
	png: 'image/png',
	webp: 'image/webp',
	avif: 'image/avif',
};

/** Resolves the output path for a tile run. */
export function resolveTileOutput(
	input: string,
	output?: string,
	outputDir?: string,
): { writePath: string; inPlace: boolean } {
	if (outputDir && output) {
		throw new Error('Cannot use both [output] and --output-dir.');
	}
	if (outputDir) {
		return { writePath: joinPath(outputDir, basename(input)), inPlace: false };
	}
	if (output) {
		return { writePath: output, inPlace: resolve(input) === resolve(output) };
	}
	return { writePath: input, inPlace: true };
}

/** Builds the transform pipeline for tile optimization. */
export function buildTileTransforms(options: Required<TileOptions>, encoder: typeof sharp): Transform[] {
	const transforms: Transform[] = [];

	if (options.palette) {
		transforms.push(
			palette({
				min: options.paletteMin,
				blockSize: options.paletteBlockSize,
				cleanup: false,
				keepAttributes: !options.prune || !options.pruneAttributes,
			}),
		);
	}

	if (options.atlas && options.atlasTypes.length > 0) {
		transforms.push(
			textureAtlas({
				encoder,
				types: options.atlasTypes,
				maxSize: options.atlasMaxSize,
				padding: options.atlasPadding,
				rotate: options.atlasRotate,
				pow2: options.atlasPow2,
				shrink: options.atlasShrink,
				remap: options.atlasRemap,
				format: { mimeType: ATLAS_MIME[options.atlasFormat] },
			}),
		);
	}

	if (options.dedup) transforms.push(dedup());

	if (options.instance) {
		transforms.push(instance({ min: options.instanceMin }));
	}

	if (options.flatten) transforms.push(flatten());

	if (options.join) {
		transforms.push(
			join({
				keepNamed: !options.joinNamed,
				keepMeshes: !options.joinMeshes,
			}),
		);
	}

	if (options.weld) transforms.push(weld());

	if (options.prune) {
		transforms.push(
			prune({
				keepAttributes: !options.pruneAttributes,
				keepIndices: false,
				keepLeaves: false,
				keepSolidTextures: !options.pruneSolidTextures,
			}),
		);
	}

	if (options.sparse) transforms.push(sparse());

	if (options.quantize) transforms.push(quantize());

	if (options.ktx2) {
		const slotsUASTC = micromatch.makeRe(
			'{normalTexture,occlusionTexture,metallicRoughnessTexture}',
			MICROMATCH_OPTIONS,
		);
		transforms.push(
			toktx({
				encoder,
				resize: [options.textureSize, options.textureSize],
				mode: Mode.UASTC,
				slots: slotsUASTC,
				level: 4,
				rdo: true,
				rdoLambda: 4,
				limitInputPixels: options.limitInputPixels,
			}),
			toktx({
				encoder,
				resize: [options.textureSize, options.textureSize],
				mode: Mode.ETC1S,
				quality: 255,
				limitInputPixels: options.limitInputPixels,
			}),
		);
	}

	return transforms;
}

/** Runs the tile optimization pipeline with a single read and write. */
export async function runTile(
	io: NodeIO,
	logger: Logger,
	input: string,
	output?: string,
	outputDir?: string,
	_options: TileOptions = {},
): Promise<void> {
	const options: Required<TileOptions> = {
		palette: true,
		paletteMin: PALETTE_DEFAULTS.min,
		paletteBlockSize: PALETTE_DEFAULTS.blockSize,
		atlas: true,
		atlasTypes: ['baseColor', 'normal'],
		atlasMaxSize: 4096,
		atlasPadding: 2,
		atlasRotate: false,
		atlasPow2: true,
		atlasShrink: true,
		atlasRemap: 'texture_transform',
		atlasFormat: 'png',
		dedup: true,
		instance: true,
		instanceMin: INSTANCE_DEFAULTS.min,
		flatten: true,
		join: true,
		joinMeshes: !JOIN_DEFAULTS.keepMeshes,
		joinNamed: !JOIN_DEFAULTS.keepNamed,
		weld: true,
		prune: true,
		pruneAttributes: true,
		pruneSolidTextures: true,
		sparse: true,
		quantize: true,
		ktx2: true,
		textureSize: 2048,
		limitInputPixels: true,
		..._options,
	};

	const { writePath, inPlace } = resolveTileOutput(input, output, outputDir);
	const { default: encoder } = await import('sharp');
	const transforms = buildTileTransforms(options, encoder);

	await mkdir(dirname(writePath), { recursive: true });

	const tempPath = joinPath(tmpdir(), `gltf-transform-tile-${uuid()}-${basename(writePath)}`);
	const sessionOutput = inPlace ? tempPath : writePath;

	await Session.create(io, logger, input, sessionOutput)
		.setDisplay(true)
		.setContinueOnError(true)
		.transform(...transforms);

	if (inPlace) {
		await rename(sessionOutput, writePath);
	}
}
