import type { Primitive } from '@gltf-transform/core';
import type { Features, MeshPrimitiveStructuralMetadata } from '@gltf-transform/extensions';

export function hasPrimitiveMetadata(prim: Primitive): boolean {
	return !!prim.getExtension('EXT_mesh_features') || !!prim.getExtension('EXT_structural_metadata');
}

export function listPropertyAttributeSemantics(prim: Primitive): Set<string> {
	const semantics = new Set<string>();
	const metadata = prim.getExtension<MeshPrimitiveStructuralMetadata>('EXT_structural_metadata');
	if (!metadata) return semantics;

	for (const propertyAttribute of metadata.listPropertyAttributes()) {
		for (const property of propertyAttribute.listPropertyValues()) {
			semantics.add(property.getAttribute());
		}
	}
	return semantics;
}

export function listMetadataTexCoords(prim: Primitive): Set<number> {
	const texCoords = new Set<number>();
	const features = prim.getExtension<Features>('EXT_mesh_features');
	for (const featureID of features?.listFeatureIDs() || []) {
		const info = featureID.getTexture()?.getTextureInfo();
		if (info) texCoords.add(info.getTexCoord());
	}

	const metadata = prim.getExtension<MeshPrimitiveStructuralMetadata>('EXT_structural_metadata');
	for (const propertyTexture of metadata?.listPropertyTextures() || []) {
		for (const property of propertyTexture.listPropertyValues()) {
			const info = property.getTextureInfo();
			if (info) texCoords.add(info.getTexCoord());
		}
	}
	return texCoords;
}
