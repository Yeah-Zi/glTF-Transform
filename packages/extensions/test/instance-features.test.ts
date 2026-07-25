import { Accessor, Document, NodeIO } from '@gltf-transform/core';
import {
	EXTInstanceFeatures,
	EXTMeshGPUInstancing,
	EXTStructuralMetadata,
	type InstancedMesh,
	type InstanceFeatures,
	KHRMeshQuantization,
} from '@gltf-transform/extensions';
import { cloneDocument, createInstanceNodes, quantize, uninstance } from '@gltf-transform/functions';
import test from 'ava';

const EXTENSIONS = [EXTInstanceFeatures, EXTMeshGPUInstancing, EXTStructuralMetadata, KHRMeshQuantization];

function createDocument() {
	const document = new Document();
	const buffer = document.createBuffer();
	const position = document
		.createAccessor()
		.setType(Accessor.Type.VEC3)
		.setArray(new Float32Array([0, 0, 0]))
		.setBuffer(buffer);
	const mesh = document.createMesh().addPrimitive(document.createPrimitive().setAttribute('POSITION', position));
	const translations = document
		.createAccessor()
		.setType(Accessor.Type.VEC3)
		.setArray(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]))
		.setBuffer(buffer);
	const featureIDs = document
		.createAccessor()
		.setType(Accessor.Type.SCALAR)
		.setArray(new Uint8Array([0, 1, 1]))
		.setBuffer(buffer);
	const instancingExtension = document.createExtension(EXTMeshGPUInstancing);
	const batch = instancingExtension
		.createInstancedMesh()
		.setAttribute('TRANSLATION', translations)
		.setAttribute('_FEATURE_ID_0', featureIDs);

	const metadataExtension = document.createExtension(EXTStructuralMetadata);
	const metadata = metadataExtension.createStructuralMetadata();
	document.getRoot().setExtension(EXTStructuralMetadata.EXTENSION_NAME, metadata);
	const propertyTable = metadataExtension.createPropertyTable().setClass('tree').setCount(2);
	metadata.addPropertyTable(propertyTable);

	const featureExtension = document.createExtension(EXTInstanceFeatures);
	const explicit = featureExtension
		.createFeatureID()
		.setFeatureCount(2)
		.setAttribute(0)
		.setLabel('groups')
		.setPropertyTable(propertyTable);
	const implicit = featureExtension.createFeatureID().setFeatureCount(3).setLabel('instances');
	const features = featureExtension.createInstanceFeatures().addFeatureID(explicit).addFeatureID(implicit);
	const node = document
		.createNode()
		.setMesh(mesh)
		.setExtension(EXTMeshGPUInstancing.EXTENSION_NAME, batch)
		.setExtension(EXTInstanceFeatures.EXTENSION_NAME, features);
	document.createScene().addChild(node);
	return { document, node, propertyTable };
}

test('round trip and clone', async (t) => {
	const { document, propertyTable } = createDocument();
	const io = new NodeIO().registerExtensions(EXTENSIONS);
	const jsonDocument = await io.writeJSON(document, { basename: 'instance-features' });
	const nodeDef = jsonDocument.json.nodes![0];

	t.deepEqual(nodeDef.extensions?.EXT_instance_features, {
		featureIds: [
			{ featureCount: 2, label: 'groups', attribute: 0, propertyTable: 0 },
			{ featureCount: 3, label: 'instances' },
		],
	});

	const roundTrip = await io.readJSON(jsonDocument);
	const features = roundTrip.getRoot().listNodes()[0].getExtension<InstanceFeatures>('EXT_instance_features')!;
	t.is(features.listFeatureIDs().length, 2);
	t.is(features.listFeatureIDs()[0].getPropertyTable()?.getClass(), 'tree');

	const cloned = cloneDocument(document);
	const clonedFeatures = cloned.getRoot().listNodes()[0].getExtension<InstanceFeatures>('EXT_instance_features')!;
	t.is(clonedFeatures.listFeatureIDs()[0].getPropertyTable()?.getClass(), propertyTable.getClass());
});

test('uninstance preserves feature batches', async (t) => {
	const { document, node } = createDocument();
	const error = t.throws(() => createInstanceNodes(node));
	t.regex(error.message, /EXT_instance_features/);

	await document.transform(uninstance());
	t.truthy(node.getExtension('EXT_mesh_gpu_instancing'));
	t.truthy(node.getExtension('EXT_instance_features'));
});

test('rejects property tables not attached to root metadata', async (t) => {
	const { document, node } = createDocument();
	const metadataExtension = document.createExtension(EXTStructuralMetadata);
	const propertyTable = metadataExtension.createPropertyTable().setClass('orphan').setCount(1);
	const features = node.getExtension<InstanceFeatures>(EXTInstanceFeatures.EXTENSION_NAME)!;
	features.listFeatureIDs()[0].setPropertyTable(propertyTable);

	const io = new NodeIO().registerExtensions(EXTENSIONS);
	const error = await t.throwsAsync(io.writeJSON(document, { basename: 'instance-features' }));
	t.regex(error.message, /PropertyTable must be attached/);
});

test('quantize preserves instance feature ID attributes', async (t) => {
	const { document, node } = createDocument();
	const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing')!;
	batch.setAttribute('TRANSLATION', null);
	node.getMesh()!
		.listPrimitives()[0]
		.getAttribute('POSITION')!
		.setArray(new Float32Array([10, 0, 0, 20, 0, 0]));

	await document.transform(quantize());

	const quantizedBatch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing')!;
	const featureIDs = quantizedBatch.getAttribute('_FEATURE_ID_0')!;
	t.true(featureIDs.getArray() instanceof Uint8Array);
	t.deepEqual(Array.from(featureIDs.getArray()!), [0, 1, 1]);
	t.deepEqual(Array.from(quantizedBatch.getAttribute('TRANSLATION')!.getArray()!), [15, 0, 0, 15, 0, 0, 15, 0, 0]);
	t.deepEqual(Array.from(quantizedBatch.getAttribute('SCALE')!.getArray()!), [5, 5, 5, 5, 5, 5, 5, 5, 5]);
	await new NodeIO().registerExtensions(EXTENSIONS).writeJSON(document, { basename: 'instance-features' });
});
