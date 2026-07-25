import { Document } from '@gltf-transform/core';
import { textureAtlas } from '@gltf-transform/functions';
import test from 'ava';
import ndarray from 'ndarray';
import { savePixels } from 'ndarray-pixels';
import sharp from 'sharp';

test('geometry remap uses the texture slot texCoord', async (t) => {
	const document = new Document();
	const position = document.createAccessor().setType('VEC3').setArray(new Float32Array(6));
	const texcoord0 = document
		.createAccessor()
		.setType('VEC2')
		.setArray(new Float32Array([0, 0, 0, 0]));
	const texcoord1 = document
		.createAccessor()
		.setType('VEC2')
		.setArray(new Uint16Array([16384, 49151, 16384, 49151]))
		.setNormalized(true);
	const image = await savePixels(ndarray(new Uint8Array(4 * 4 * 4).fill(255), [4, 4, 4]), 'image/png');
	const texture = document.createTexture().setImage(image).setMimeType('image/png');
	const material = document.createMaterial().setBaseColorTexture(texture);
	material.getBaseColorTextureInfo()!.setTexCoord(1);
	const primitive = document
		.createPrimitive()
		.setMaterial(material)
		.setAttribute('POSITION', position)
		.setAttribute('TEXCOORD_0', texcoord0)
		.setAttribute('TEXCOORD_1', texcoord1);
	document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));

	await document.transform(
		textureAtlas({
			encoder: sharp,
			types: ['baseColor'],
			maxSize: 16,
			padding: 2,
			remap: 'geometry',
			format: { mimeType: 'image/png' },
		}),
	);

	const dstTexCoord = material.getBaseColorTextureInfo()!.getTexCoord();
	t.is(dstTexCoord, 1);
	const uv = primitive.getAttribute(`TEXCOORD_${dstTexCoord}`)!.getElement(0, []);
	t.true(Math.abs(uv[0] - 0.1875) < 0.00001);
	t.true(Math.abs(uv[1] - 0.3125) < 0.00001);
});

test('geometry remap preserves UVs shared with an unprocessed slot', async (t) => {
	const document = new Document();
	const position = document.createAccessor().setType('VEC3').setArray(new Float32Array(6));
	const texcoord0 = document
		.createAccessor()
		.setType('VEC2')
		.setArray(new Float32Array([0.25, 0.75, 0.25, 0.75]));
	const image = await savePixels(ndarray(new Uint8Array(4 * 4 * 4).fill(255), [4, 4, 4]), 'image/png');
	const baseColorTexture = document.createTexture().setImage(image).setMimeType('image/png');
	const emissiveTexture = document.createTexture().setImage(image).setMimeType('image/png');
	const material = document
		.createMaterial()
		.setBaseColorTexture(baseColorTexture)
		.setEmissiveTexture(emissiveTexture);
	const primitive = document
		.createPrimitive()
		.setMaterial(material)
		.setAttribute('POSITION', position)
		.setAttribute('TEXCOORD_0', texcoord0);
	document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));

	await document.transform(
		textureAtlas({
			encoder: sharp,
			types: ['baseColor'],
			maxSize: 16,
			padding: 2,
			remap: 'geometry',
			format: { mimeType: 'image/png' },
		}),
	);

	t.is(material.getEmissiveTextureInfo()!.getTexCoord(), 0);
	t.deepEqual(primitive.getAttribute('TEXCOORD_0')!.getElement(0, []), [0.25, 0.75]);
	const baseColorTexCoord = material.getBaseColorTextureInfo()!.getTexCoord();
	t.is(baseColorTexCoord, 1);
	const uv = primitive.getAttribute(`TEXCOORD_${baseColorTexCoord}`)!.getElement(0, []);
	t.deepEqual(uv, [0.1875, 0.3125]);
});

test('unused materials are not included in atlases', async (t) => {
	const document = new Document();
	const image = await savePixels(ndarray(new Uint8Array(4 * 4 * 4).fill(255), [4, 4, 4]), 'image/png');
	const usedTexture = document.createTexture().setImage(image).setMimeType('image/png');
	const unusedTexture = document.createTexture().setImage(image).setMimeType('image/png');
	const usedMaterial = document.createMaterial().setBaseColorTexture(usedTexture);
	const unusedMaterial = document.createMaterial().setBaseColorTexture(unusedTexture);
	const position = document.createAccessor().setType('VEC3').setArray(new Float32Array(6));
	const texcoord = document.createAccessor().setType('VEC2').setArray(new Float32Array(4));
	const primitive = document
		.createPrimitive()
		.setMaterial(usedMaterial)
		.setAttribute('POSITION', position)
		.setAttribute('TEXCOORD_0', texcoord);
	document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));

	await document.transform(
		textureAtlas({
			encoder: sharp,
			types: ['baseColor'],
			maxSize: 16,
			padding: 2,
			format: { mimeType: 'image/png' },
		}),
	);

	t.not(usedMaterial.getBaseColorTexture(), usedTexture);
	t.is(unusedMaterial.getBaseColorTexture(), unusedTexture);
});

test('does not require texture transform when no textures are merged', async (t) => {
	const document = new Document();
	document.createScene().addChild(document.createNode().setMesh(document.createMesh()));

	await document.transform(
		textureAtlas({
			encoder: sharp,
			types: ['baseColor'],
			format: { mimeType: 'image/png' },
		}),
	);

	t.is(document.getRoot().listExtensionsRequired().length, 0);
});
