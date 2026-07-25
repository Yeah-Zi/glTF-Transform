import { Document, PropertyType } from '@gltf-transform/core';
import { EXTMeshFeatures } from '@gltf-transform/extensions';
import { dedup, dequantize, joinPrimitives, quantize, simplifyPrimitive } from '@gltf-transform/functions';
import test from 'ava';

function createFeaturePrimitive(document: Document) {
	const buffer = document.getRoot().listBuffers()[0] || document.createBuffer();
	const position = document
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
		.setBuffer(buffer);
	const featureIDAttribute = document
		.createAccessor()
		.setType('SCALAR')
		.setArray(new Uint32Array([0, 1, 1]))
		.setBuffer(buffer);
	const indices = document
		.createAccessor()
		.setArray(new Uint16Array([0, 1, 2]))
		.setBuffer(buffer);
	const primitive = document
		.createPrimitive()
		.setAttribute('POSITION', position)
		.setAttribute('_FEATURE_ID_0', featureIDAttribute)
		.setIndices(indices);
	const extension =
		document
			.getRoot()
			.listExtensionsUsed()
			.find((item) => item.extensionName === EXTMeshFeatures.EXTENSION_NAME) ||
		document.createExtension(EXTMeshFeatures);
	const featureID = extension.createFeatureID().setFeatureCount(2).setAttribute(0);
	primitive.setExtension(EXTMeshFeatures.EXTENSION_NAME, extension.createFeatures().addFeatureID(featureID));
	return primitive;
}

test('quantize and dequantize preserve feature ID attributes', async (t) => {
	const document = new Document();
	const primitive = createFeaturePrimitive(document);
	document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));

	await document.transform(quantize(), dequantize());

	const attribute = primitive.getAttribute('_FEATURE_ID_0')!;
	t.true(attribute.getArray() instanceof Uint32Array);
	t.false(attribute.getNormalized());
	t.deepEqual(Array.from(attribute.getArray()!), [0, 1, 1]);
});

test('unsafe topology changes are rejected or skipped', (t) => {
	const document = new Document();
	const primitive = createFeaturePrimitive(document);
	const result = simplifyPrimitive(primitive, { simplifier: {} as never });

	t.is(result, primitive, 'simplify skips feature primitives');
	const error = t.throws(() => joinPrimitives([primitive, primitive.clone()]));
	t.regex(error.message, /EXT_mesh_features/);
});

test('dedup keeps meshes with distinct feature definitions', async (t) => {
	const document = new Document();
	const primitiveA = createFeaturePrimitive(document);
	const primitiveB = createFeaturePrimitive(document);
	document.createNode().setMesh(document.createMesh().addPrimitive(primitiveA));
	document.createNode().setMesh(document.createMesh().addPrimitive(primitiveB));

	await document.transform(dedup({ propertyTypes: [PropertyType.MESH] }));

	t.is(document.getRoot().listMeshes().length, 2);
});
