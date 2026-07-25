import { Document } from '@gltf-transform/core';
import { EXTInstanceFeatures, EXTMeshGPUInstancing, type InstancedMesh } from '@gltf-transform/extensions';
import { clearNodeTransform } from '@gltf-transform/functions';
import { logger } from '@gltf-transform/test-utils';
import test from 'ava';

test('basic', async (t) => {
	const document = new Document().setLogger(logger);

	const camera = document.createCamera();

	const position = document
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array([1, 0, 1]));
	const prim = document.createPrimitive().setAttribute('POSITION', position);
	const mesh = document.createMesh().addPrimitive(prim);

	const childNode = document.createNode('B');

	const parentNode = document
		.createNode('A')
		.setTranslation([2, 0, 0])
		.setScale([4, 4, 4])
		.addChild(childNode)
		.setMesh(mesh)
		.setCamera(camera);

	clearNodeTransform(parentNode);

	t.deepEqual(parentNode.getTranslation(), [0, 0, 0], 'parent.translation');
	t.deepEqual(parentNode.getRotation(), [0, 0, 0, 1], 'parent.rotation');
	t.deepEqual(parentNode.getScale(), [1, 1, 1], 'parent.scale');

	t.deepEqual(childNode.getTranslation(), [2, 0, 0], 'child.children[0].translation');
	t.deepEqual(childNode.getRotation(), [0, 0, 0, 1], 'child.children[0].rotation');
	t.deepEqual(childNode.getScale(), [4, 4, 4], 'child.children[0].scale');

	t.truthy(parentNode.getCamera(), 'parent.camera');
	t.deepEqual(prim.getAttribute('POSITION')!.getElement(0, []), [6, 0, 4], 'parent.mesh');
});

test('instance features', (t) => {
	const document = new Document().setLogger(logger);
	const position = document
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array([1, 0, 1]));
	const mesh = document.createMesh().addPrimitive(document.createPrimitive().setAttribute('POSITION', position));
	const featureIDs = document
		.createAccessor()
		.setType('SCALAR')
		.setArray(new Uint8Array([0]));
	const batch = document
		.createExtension(EXTMeshGPUInstancing)
		.createInstancedMesh()
		.setAttribute('_FEATURE_ID_0', featureIDs);
	const featureExtension = document.createExtension(EXTInstanceFeatures);
	const features = featureExtension
		.createInstanceFeatures()
		.addFeatureID(featureExtension.createFeatureID().setFeatureCount(1).setAttribute(0));
	const node = document
		.createNode()
		.setTranslation([2, 0, 0])
		.setScale([4, 4, 4])
		.setMesh(mesh)
		.setExtension('EXT_mesh_gpu_instancing', batch)
		.setExtension('EXT_instance_features', features);

	clearNodeTransform(node);

	const transformedBatch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing')!;
	t.deepEqual(position.getElement(0, []), [1, 0, 1], 'mesh remains in local space');
	t.deepEqual(transformedBatch.getAttribute('TRANSLATION')!.getElement(0, []), [2, 0, 0]);
	t.deepEqual(transformedBatch.getAttribute('SCALE')!.getElement(0, []), [4, 4, 4]);
	t.is(transformedBatch.getAttribute('_FEATURE_ID_0'), featureIDs);
	t.is(node.getExtension('EXT_instance_features'), features);
});
