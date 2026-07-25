import { Document, MathUtils, type mat4, type Node, type vec3, type vec4 } from '@gltf-transform/core';
import type { InstancedMesh } from '@gltf-transform/extensions';
import { multiply as multiplyMat4 } from 'gl-matrix/mat4';
import { transformMesh } from './transform-mesh.js';

// biome-ignore format: Readability.
const IDENTITY: mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

/**
 * Clears local transform of the {@link Node}, applying the transform to children and meshes.
 *
 * - Applies transform to children
 * - Applies transform to {@link Mesh mesh}
 * - Resets {@link Light lights}, {@link Camera cameras}, and other attachments to the origin
 *
 * Example:
 *
 * ```typescript
 * import { clearNodeTransform } from '@gltf-transform/functions';
 *
 * node.getTranslation(); // → [ 5, 0, 0 ]
 * node.getMesh(); // → vertex data centered at origin
 *
 * clearNodeTransform(node);
 *
 * node.getTranslation(); // → [ 0, 0, 0 ]
 * node.getMesh(); // → vertex data centered at [ 5, 0, 0 ]
 * ```
 *
 * To clear _all_ transforms of a Node, first clear its inherited transforms with
 * {@link clearNodeParent}, then clear the local transform with {@link clearNodeTransform}.
 */
export function clearNodeTransform(node: Node): Node {
	const mesh = node.getMesh();
	const localMatrix = node.getMatrix();

	if (mesh && !MathUtils.eq(localMatrix, IDENTITY)) {
		const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
		if (batch) {
			node.setExtension('EXT_mesh_gpu_instancing', transformBatch(node, batch, localMatrix));
		} else {
			transformMesh(mesh, localMatrix);
		}
	}

	for (const child of node.listChildren()) {
		const matrix = child.getMatrix();
		multiplyMat4(matrix, matrix, localMatrix);
		child.setMatrix(matrix);
	}

	return node.setMatrix(IDENTITY);
}

function transformBatch(node: Node, batch: InstancedMesh, nodeMatrix: mat4): InstancedMesh {
	const document = Document.fromGraph(node.getGraph())!;
	const template = batch.listAttributes()[0]!;
	const instanceCount = template.getCount();
	const translation = document
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array(instanceCount * 3))
		.setBuffer(template.getBuffer());
	const rotation = document
		.createAccessor()
		.setType('VEC4')
		.setArray(new Float32Array(instanceCount * 4))
		.setBuffer(template.getBuffer());
	const scale = document
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array(instanceCount * 3))
		.setBuffer(template.getBuffer());
	const srcTranslation = batch.getAttribute('TRANSLATION');
	const srcRotation = batch.getAttribute('ROTATION');
	const srcScale = batch.getAttribute('SCALE');
	const t = [0, 0, 0] as vec3;
	const r = [0, 0, 0, 1] as vec4;
	const s = [1, 1, 1] as vec3;
	const instanceMatrix = [...IDENTITY] as mat4;

	for (let i = 0; i < instanceCount; i++) {
		MathUtils.compose(
			srcTranslation ? (srcTranslation.getElement(i, t) as vec3) : [0, 0, 0],
			srcRotation ? (srcRotation.getElement(i, r) as vec4) : [0, 0, 0, 1],
			srcScale ? (srcScale.getElement(i, s) as vec3) : [1, 1, 1],
			instanceMatrix,
		);
		multiplyMat4(instanceMatrix, nodeMatrix, instanceMatrix);
		MathUtils.decompose(instanceMatrix, t, r, s);
		translation.setElement(i, t);
		rotation.setElement(i, r);
		scale.setElement(i, s);
	}

	return batch
		.clone()
		.setAttribute('TRANSLATION', translation)
		.setAttribute('ROTATION', rotation)
		.setAttribute('SCALE', scale);
}
