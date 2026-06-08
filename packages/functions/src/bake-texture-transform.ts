import {
	type Accessor,
	type Document,
	MathUtils,
	type Material,
	type Mesh,
	Node,
	type Primitive,
	type TextureInfo,
	type Transform as TransformFn,
	type vec2,
} from '@gltf-transform/core';
import { KHRTextureTransform, type Transform as TextureTransform } from '@gltf-transform/extensions';
import { listTextureInfoByMaterial } from './list-texture-info.js';
import { assignDefaults, createTransform } from './utils.js';

const NAME = 'bakeTextureTransform';

/** Options for the {@link bakeTextureTransform} transform. */
export interface BakeTextureTransformOptions {
	/**
	 * When a {@link Mesh} is referenced by multiple {@link Node}s, clone the mesh
	 * (including primitives and vertex attributes) for each additional node before
	 * baking. This allows independent materials and UV transforms per instance.
	 * Default: true.
	 */
	detachSharedMeshes?: boolean;
}

const DEFAULTS: Required<BakeTextureTransformOptions> = {
	detachSharedMeshes: true,
};

interface SlotBake {
	info: TextureInfo;
	transform: TextureTransform;
	srcTexCoordIndex: number;
	signature: string;
}

interface BakeGroup {
	sigSlots: SlotBake[];
	srcSemantic: string;
	srcAttr: Accessor;
	dstSemantic: string;
	dstIndex: number;
	signature: string;
	needsDedicatedTexCoord: boolean;
}

/**
 * Bakes existing {@link KHRTextureTransform} offsets into geometry UVs and
 * removes the extension from affected texture slots.
 *
 * When the same {@link Mesh} is used by multiple nodes, or when multiple meshes
 * share UV accessors but use materials with different transforms, geometry is
 * detached (mesh/primitive/accessor clones) so each usage can be baked
 * independently without affecting other instances.
 *
 * Intended as a preprocessing step before {@link textureAtlas} with
 * `remap: 'geometry'`.
 *
 * @category Transforms
 */
export function bakeTextureTransform(_options: BakeTextureTransformOptions = {}): TransformFn {
	const options = assignDefaults(DEFAULTS, _options);
	return createTransform(NAME, async (document: Document): Promise<void> => {
		if (!hasTextureTransforms(document)) return;

		if (options.detachSharedMeshes) {
			detachSharedMeshes(document);
		}
		detachSharedPrimitives(document);
		bakeAllTextureTransforms(document);
	});
}

/** @hidden */
export function bakeTextureTransforms(document: Document, options: Required<BakeTextureTransformOptions> = DEFAULTS): void {
	if (!hasTextureTransforms(document)) return;
	if (options.detachSharedMeshes) {
		detachSharedMeshes(document);
	}
	detachSharedPrimitives(document);
	bakeAllTextureTransforms(document);
}

function hasTextureTransforms(document: Document): boolean {
	for (const material of document.getRoot().listMaterials()) {
		for (const info of listTextureInfoByMaterial(material)) {
			const transform = info.getExtension<TextureTransform>(KHRTextureTransform.EXTENSION_NAME);
			if (transform && !isIdentityTransform(transform)) return true;
		}
	}
	return false;
}

function detachSharedMeshes(document: Document): void {
	for (const mesh of document.getRoot().listMeshes()) {
		const nodes = mesh.listParents().filter((parent): parent is Node => parent instanceof Node);
		if (nodes.length <= 1) continue;
		for (let i = 1; i < nodes.length; i++) {
			nodes[i].setMesh(cloneMeshDeep(mesh));
		}
	}
}

function detachSharedPrimitives(document: Document): void {
	for (const mesh of document.getRoot().listMeshes()) {
		for (const prim of [...mesh.listPrimitives()]) {
			if (prim.listParents().length > 1) {
				mesh.removePrimitive(prim).addPrimitive(clonePrimitiveDeep(prim));
			}
		}
	}
}

function cloneMeshDeep(mesh: Mesh): Mesh {
	const dstMesh = mesh.clone();
	for (const prim of [...dstMesh.listPrimitives()]) {
		dstMesh.removePrimitive(prim).addPrimitive(clonePrimitiveDeep(prim));
	}
	return dstMesh;
}

function clonePrimitiveDeep(prim: Primitive): Primitive {
	const dst = prim.clone();
	for (const semantic of dst.listSemantics()) {
		const attr = dst.getAttribute(semantic);
		if (attr) dst.setAttribute(semantic, attr.clone());
	}
	const indices = dst.getIndices();
	if (indices) dst.setIndices(indices.clone());
	return dst;
}

function bakeAllTextureTransforms(document: Document): void {
	const accessorSignatures = new Map<Accessor, string>();
	const bakedAccessors = new Set<Accessor>();
	const primGroups: { prim: Primitive; groups: BakeGroup[] }[] = [];

	for (const mesh of document.getRoot().listMeshes()) {
		for (const prim of mesh.listPrimitives()) {
			const groups = collectBakeGroups(prim);
			if (groups.length > 0) primGroups.push({ prim, groups });
		}
	}

	for (const { prim, groups } of primGroups) {
		detachPrimitiveAccessors(prim, groups, accessorSignatures);
	}

	for (const { prim, groups } of primGroups) {
		bakePrimitiveTextureTransforms(prim, groups, bakedAccessors);
	}
}

function detachPrimitiveAccessors(
	prim: Primitive,
	groups: BakeGroup[],
	accessorSignatures: Map<Accessor, string>,
): void {
	for (const group of groups) {
		if (group.needsDedicatedTexCoord) {
			const dstAttr = group.srcAttr.clone();
			prim.setAttribute(group.dstSemantic, dstAttr);
			accessorSignatures.set(dstAttr, group.signature);
			continue;
		}
		resolveAccessor(prim, group.dstSemantic, group.srcAttr, group.signature, accessorSignatures);
	}
}

function bakePrimitiveTextureTransforms(prim: Primitive, groups: BakeGroup[], bakedAccessors: Set<Accessor>): void {
	for (const group of groups) {
		const dstAttr = prim.getAttribute(group.dstSemantic);
		if (!dstAttr) continue;

		if (!bakedAccessors.has(dstAttr)) {
			bakeTransformIntoAccessor(dstAttr, group.sigSlots[0].transform);
			bakedAccessors.add(dstAttr);
		}

		for (const slot of group.sigSlots) {
			slot.info.setTexCoord(group.dstIndex);
			slot.info.setExtension(KHRTextureTransform.EXTENSION_NAME, null);
		}

		fillMissingTexCoords(prim, group.dstIndex);
	}
}

function collectBakeGroups(prim: Primitive): BakeGroup[] {
	const material = prim.getMaterial();
	if (!material) return [];

	const slotBakes = collectSlotBakes(material);
	if (slotBakes.length === 0) return [];

	const bySrcIndex = new Map<number, SlotBake[]>();
	for (const slot of slotBakes) {
		const list = bySrcIndex.get(slot.srcTexCoordIndex) || [];
		list.push(slot);
		bySrcIndex.set(slot.srcTexCoordIndex, list);
	}

	const groups: BakeGroup[] = [];
	let nextTexCoordIndex = getMaxTexCoordIndex(prim) + 1;

	for (const [srcIndex, slots] of bySrcIndex) {
		const bySignature = groupBy(slots, (slot) => slot.signature);
		const signatures = [...bySignature.keys()];
		let groupIndex = 0;

		const srcSemantic = `TEXCOORD_${srcIndex}`;
		const srcAttr = prim.getAttribute(srcSemantic) || prim.getAttribute('TEXCOORD_0');
		if (!srcAttr) continue;

		for (const signature of signatures) {
			const sigSlots = bySignature.get(signature)!;
			const needsDedicatedTexCoord = signatures.length > 1;
			const dstIndex = needsDedicatedTexCoord && groupIndex > 0 ? nextTexCoordIndex++ : srcIndex;
			groups.push({
				sigSlots,
				srcSemantic,
				srcAttr,
				dstSemantic: `TEXCOORD_${dstIndex}`,
				dstIndex,
				signature,
				needsDedicatedTexCoord,
			});
			groupIndex++;
		}
	}

	return groups;
}

function collectSlotBakes(material: Material): SlotBake[] {
	const results: SlotBake[] = [];
	for (const info of listTextureInfoByMaterial(material)) {
		const transform = info.getExtension<TextureTransform>(KHRTextureTransform.EXTENSION_NAME);
		if (!transform || isIdentityTransform(transform)) continue;
		results.push({
			info,
			transform,
			srcTexCoordIndex: transform.getTexCoord() ?? info.getTexCoord(),
			signature: transformSignature(transform),
		});
	}
	return results;
}

function resolveAccessor(
	prim: Primitive,
	semantic: string,
	accessor: Accessor,
	signature: string,
	accessorSignatures: Map<Accessor, string>,
): Accessor {
	const existing = accessorSignatures.get(accessor);
	if (existing === undefined) {
		accessorSignatures.set(accessor, signature);
		return accessor;
	}
	if (existing === signature) return accessor;

	const cloned = accessor.clone();
	prim.setAttribute(semantic, cloned);
	accessorSignatures.set(cloned, signature);
	return cloned;
}

function bakeTransformIntoAccessor(accessor: Accessor, transform: TextureTransform): void {
	const count = accessor.getCount();
	const offset = transform.getOffset();
	const scale = transform.getScale();
	const rotation = transform.getRotation();
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const el: number[] = [];

	for (let i = 0; i < count; i++) {
		const uv = accessor.getElement(i, el) as vec2;
		const scaledU = uv[0] * scale[0];
		const scaledV = uv[1] * scale[1];
		const u = cos * scaledU + sin * scaledV + offset[0];
		const v = -sin * scaledU + cos * scaledV + offset[1];
		accessor.setElement(i, [u, v]);
	}
}

function applyTextureTransformUV(uv: vec2, transform: TextureTransform): vec2 {
	const offset = transform.getOffset();
	const scale = transform.getScale();
	const rotation = transform.getRotation();
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const scaledU = uv[0] * scale[0];
	const scaledV = uv[1] * scale[1];
	return [cos * scaledU + sin * scaledV + offset[0], -sin * scaledU + cos * scaledV + offset[1]];
}

function isIdentityTransform(transform: TextureTransform): boolean {
	return (
		MathUtils.eq(transform.getOffset(), [0, 0]) &&
		MathUtils.eq(transform.getScale(), [1, 1]) &&
		transform.getRotation() === 0 &&
		transform.getTexCoord() == null
	);
}

function transformSignature(transform: TextureTransform): string {
	return JSON.stringify({
		offset: transform.getOffset(),
		scale: transform.getScale(),
		rotation: transform.getRotation(),
		texCoord: transform.getTexCoord(),
	});
}

function getMaxTexCoordIndex(prim: Primitive): number {
	let maxIndex = -1;
	for (const semantic of prim.listSemantics()) {
		if (!semantic.startsWith('TEXCOORD_')) continue;
		maxIndex = Math.max(maxIndex, Number(semantic.replace('TEXCOORD_', '')));
	}
	return maxIndex;
}

function fillMissingTexCoords(prim: Primitive, maxIndex: number): void {
	const fallback = prim.getAttribute(`TEXCOORD_${maxIndex}`) || prim.getAttribute('TEXCOORD_0');
	if (!fallback) return;
	for (let i = maxIndex - 1; i >= 0; i--) {
		const semantic = `TEXCOORD_${i}`;
		if (!prim.getAttribute(semantic)) {
			prim.setAttribute(semantic, fallback);
		}
	}
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const key = keyFn(item);
		const list = map.get(key) || [];
		list.push(item);
		map.set(key, list);
	}
	return map;
}

export { applyTextureTransformUV };
