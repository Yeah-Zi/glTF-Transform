import { Document } from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import { applyTextureTransformUV, bakeTextureTransform } from '@gltf-transform/functions';
import { logger } from '@gltf-transform/test-utils';
import test from 'ava';

test('bakes KHR_texture_transform into geometry UVs', async (t) => {
	const document = new Document().setLogger(logger);
	const transformExtension = document.createExtension(KHRTextureTransform).setRequired(true);
	const transform = transformExtension.createTransform().setScale([0.5, 0.5]);

	const uv = document.createAccessor().setType('VEC2').setArray(new Float32Array([0, 0, 1, 0, 0, 1]));
	const prim = document.createPrimitive().setAttribute('TEXCOORD_0', uv);
	const material = document.createMaterial().setBaseColorTexture(document.createTexture());
	material.getBaseColorTextureInfo()!.setExtension('KHR_texture_transform', transform);
	prim.setMaterial(material);
	document.createMesh().addPrimitive(prim);

	await document.transform(bakeTextureTransform());

	t.falsy(material.getBaseColorTextureInfo()!.getExtension('KHR_texture_transform'), 'extension removed');
	t.deepEqual(uv.getElement(0, []), [0, 0], 'uv0');
	t.deepEqual(uv.getElement(1, []), [0.5, 0], 'uv1');
	t.deepEqual(uv.getElement(2, []), [0, 0.5], 'uv2');
});

test('detaches shared mesh across nodes', async (t) => {
	const document = new Document().setLogger(logger);
	const transformExtension = document.createExtension(KHRTextureTransform).setRequired(true);
	const transform = transformExtension.createTransform().setScale([0.5, 0.5]);

	const uv = document.createAccessor().setType('VEC2').setArray(new Float32Array([1, 1]));
	const prim = document.createPrimitive().setAttribute('TEXCOORD_0', uv);
	const material = document.createMaterial().setBaseColorTexture(document.createTexture());
	material.getBaseColorTextureInfo()!.setExtension('KHR_texture_transform', transform);
	prim.setMaterial(material);
	const mesh = document.createMesh().addPrimitive(prim);
	const nodeA = document.createNode('A').setMesh(mesh);
	const nodeB = document.createNode('B').setMesh(mesh);

	await document.transform(bakeTextureTransform());

	t.not(nodeA.getMesh(), nodeB.getMesh(), 'mesh detached per node');
	t.not(
		nodeA.getMesh()!.listPrimitives()[0].getAttribute('TEXCOORD_0'),
		nodeB.getMesh()!.listPrimitives()[0].getAttribute('TEXCOORD_0'),
		'uv accessors detached per node',
	);
	t.deepEqual(nodeA.getMesh()!.listPrimitives()[0].getAttribute('TEXCOORD_0')!.getElement(0, []), [0.5, 0.5], 'baked uv');
});

test('clones shared accessors for different material transforms', async (t) => {
	const document = new Document().setLogger(logger);
	const transformExtension = document.createExtension(KHRTextureTransform).setRequired(true);
	const transformA = transformExtension.createTransform().setScale([0.5, 0.5]);
	const transformB = transformExtension.createTransform().setOffset([0.5, 0.5]).setScale([0.5, 0.5]);

	const uv = document.createAccessor().setType('VEC2').setArray(new Float32Array([1, 1]));
	const materialA = document.createMaterial('A').setBaseColorTexture(document.createTexture('A'));
	const materialB = document.createMaterial('B').setBaseColorTexture(document.createTexture('B'));
	materialA.getBaseColorTextureInfo()!.setExtension('KHR_texture_transform', transformA);
	materialB.getBaseColorTextureInfo()!.setExtension('KHR_texture_transform', transformB);

	const primA = document.createPrimitive().setAttribute('TEXCOORD_0', uv).setMaterial(materialA);
	const primB = document.createPrimitive().setAttribute('TEXCOORD_0', uv).setMaterial(materialB);
	document.createMesh('meshA').addPrimitive(primA);
	document.createMesh('meshB').addPrimitive(primB);

	await document.transform(bakeTextureTransform());

	const uvA = primA.getAttribute('TEXCOORD_0')!;
	const uvB = primB.getAttribute('TEXCOORD_0')!;
	t.not(uvA, uvB, 'accessors detached');
	t.deepEqual(uvA.getElement(0, []), [0.5, 0.5], 'material A uv');
	t.deepEqual(uvB.getElement(0, []), [1, 1], 'material B uv');
});

test('creates dedicated TEXCOORD sets for conflicting slot transforms', async (t) => {
	const document = new Document().setLogger(logger);
	const transformExtension = document.createExtension(KHRTextureTransform).setRequired(true);
	const baseTransform = transformExtension.createTransform().setScale([0.5, 0.5]);
	const normalTransform = transformExtension.createTransform().setScale([0.25, 0.25]);

	const uv = document.createAccessor().setType('VEC2').setArray(new Float32Array([1, 1]));
	const material = document
		.createMaterial()
		.setBaseColorTexture(document.createTexture('base'))
		.setNormalTexture(document.createTexture('normal'));
	material.getBaseColorTextureInfo()!.setExtension('KHR_texture_transform', baseTransform);
	material.getNormalTextureInfo()!.setExtension('KHR_texture_transform', normalTransform);

	const prim = document.createPrimitive().setAttribute('TEXCOORD_0', uv).setMaterial(material);
	document.createMesh().addPrimitive(prim);

	await document.transform(bakeTextureTransform());

	t.truthy(prim.getAttribute('TEXCOORD_1'), 'dedicated normal texcoord');
	t.deepEqual(prim.getAttribute('TEXCOORD_0')!.getElement(0, []), [0.5, 0.5], 'baseColor uv');
	t.deepEqual(prim.getAttribute('TEXCOORD_1')!.getElement(0, []), [0.25, 0.25], 'normal uv');
	t.is(material.getNormalTextureInfo()!.getTexCoord(), 1, 'normal texCoord updated');
});

test('applyTextureTransformUV matches KHR formula', (t) => {
	const transform = {
		getOffset: () => [0.5, 0.5] as [number, number],
		getScale: () => [0.5, 0.5] as [number, number],
		getRotation: () => 0,
	} as import('@gltf-transform/extensions').Transform;

	t.deepEqual(applyTextureTransformUV([1, 1], transform), [1, 1]);
});
