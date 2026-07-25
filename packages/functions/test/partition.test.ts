import { Document, NodeIO } from '@gltf-transform/core';
import { EXTInstanceFeatures, EXTMeshGPUInstancing } from '@gltf-transform/extensions';
import { partition } from '@gltf-transform/functions';
import { createTorusKnotPrimitive, logger } from '@gltf-transform/test-utils';
import test from 'ava';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

test('basic', async (t) => {
	const io = new NodeIO().setLogger(logger);
	const document = await io.read(path.join(__dirname, 'in/TwoCubes.glb'));
	document.setLogger(logger);
	t.is(document.getRoot().listBuffers().length, 1, 'initialized with one buffer');

	await document.transform(partition({ meshes: [] }));
	await document.transform(partition({ meshes: false }));

	t.is(document.getRoot().listBuffers().length, 1, 'has no effect when disabled');

	await document.transform(partition({ meshes: ['CubeA', 'CubeB'] }));

	const jsonDoc = await io.writeJSON(document, { basename: 'partition-test' });
	t.deepEqual(
		jsonDoc.json.buffers,
		[
			{ uri: 'CubeA.bin', byteLength: 324, name: 'CubeA' },
			{ uri: 'CubeB.bin', byteLength: 324, name: 'CubeB' },
		],
		'partitions into two buffers',
	);

	const bufferReferences = jsonDoc.json.bufferViews.map((b) => b.buffer);
	t.deepEqual(bufferReferences, [0, 0, 1, 1], 'creates four buffer views');
});

test('valid and unique URIs', async (t) => {
	const io = new NodeIO().setLogger(logger);
	const document = new Document().setLogger(logger);
	document.createMesh('../%$mesh-001!').addPrimitive(createTorusKnotPrimitive(document, { tubularSegments: 12 }));
	document.createMesh('../%$mesh-002!').addPrimitive(createTorusKnotPrimitive(document, { tubularSegments: 12 }));
	document.createMesh('../%$mesh-002!').addPrimitive(createTorusKnotPrimitive(document, { tubularSegments: 12 }));

	await document.transform(partition({ meshes: true }));

	const jsonDocument = await io.writeJSON(document, { basename: 'partition-test' });
	t.deepEqual(
		jsonDocument.json.buffers,
		[
			{ uri: 'mesh-001.bin', byteLength: 6048, name: '../%$mesh-001!' },
			{ uri: 'mesh-002.bin', byteLength: 6048, name: '../%$mesh-002!' },
			{ uri: 'mesh-002_1.bin', byteLength: 6048, name: '../%$mesh-002!' },
		],
		'partitions into three buffers',
	);
});

test('instance feature attributes follow mesh partitions', async (t) => {
	const document = new Document();
	const sourceBuffer = document.createBuffer('source');
	const position = document.createAccessor().setType('VEC3').setArray(new Float32Array(3)).setBuffer(sourceBuffer);
	const featureIDs = document
		.createAccessor()
		.setType('SCALAR')
		.setArray(new Uint8Array([0]))
		.setBuffer(sourceBuffer);
	const mesh = document
		.createMesh('Trees')
		.addPrimitive(document.createPrimitive().setAttribute('POSITION', position));
	const batch = document
		.createExtension(EXTMeshGPUInstancing)
		.createInstancedMesh()
		.setAttribute('_FEATURE_ID_0', featureIDs);
	const featureExtension = document.createExtension(EXTInstanceFeatures);
	const features = featureExtension
		.createInstanceFeatures()
		.addFeatureID(featureExtension.createFeatureID().setFeatureCount(1).setAttribute(0));
	document
		.createScene()
		.addChild(
			document
				.createNode()
				.setMesh(mesh)
				.setExtension('EXT_mesh_gpu_instancing', batch)
				.setExtension('EXT_instance_features', features),
		);

	await document.transform(partition());

	t.is(featureIDs.getBuffer(), position.getBuffer());
	t.not(featureIDs.getBuffer(), sourceBuffer);
});
