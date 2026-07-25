import { Extension, type ReaderContext, type WriterContext } from '@gltf-transform/core';
import { EXT_INSTANCE_FEATURES, EXT_STRUCTURAL_METADATA } from '../constants.js';
import type { StructuralMetadata } from '../ext-structural-metadata/index.js';
import { InstanceFeatureID } from './instance-feature-id.js';
import { InstanceFeatures } from './instance-features.js';

interface InstanceFeaturesDef {
	featureIds: InstanceFeatureIDDef[];
}

interface InstanceFeatureIDDef {
	featureCount: number;
	nullFeatureId?: number;
	label?: string;
	attribute?: number;
	propertyTable?: number;
}

/**
 * Assigns feature IDs and structural metadata to `EXT_mesh_gpu_instancing` instances.
 * @experimental
 */
export class EXTInstanceFeatures extends Extension {
	public static override EXTENSION_NAME = EXT_INSTANCE_FEATURES;
	public override readonly extensionName = EXT_INSTANCE_FEATURES;

	createInstanceFeatures(): InstanceFeatures {
		return new InstanceFeatures(this.document.getGraph());
	}
	createFeatureID(): InstanceFeatureID {
		return new InstanceFeatureID(this.document.getGraph());
	}

	public override read(context: ReaderContext): this {
		for (const [nodeIndex, nodeDef] of (context.jsonDoc.json.nodes || []).entries()) {
			const extensionDef = nodeDef.extensions?.[EXT_INSTANCE_FEATURES] as InstanceFeaturesDef | undefined;
			if (!extensionDef) continue;
			const features = this.createInstanceFeatures();
			for (const featureIDDef of extensionDef.featureIds) {
				const featureID = this.createFeatureID().setFeatureCount(featureIDDef.featureCount);
				if (featureIDDef.nullFeatureId !== undefined) featureID.setNullFeatureID(featureIDDef.nullFeatureId);
				if (featureIDDef.label !== undefined) featureID.setLabel(featureIDDef.label);
				if (featureIDDef.attribute !== undefined) featureID.setAttribute(featureIDDef.attribute);
				if (featureIDDef.propertyTable !== undefined) {
					const metadata = this.document.getRoot().getExtension<StructuralMetadata>(EXT_STRUCTURAL_METADATA)!;
					featureID.setPropertyTable(metadata.listPropertyTables()[featureIDDef.propertyTable]);
				}
				features.addFeatureID(featureID);
			}
			context.nodes[nodeIndex].setExtension(EXT_INSTANCE_FEATURES, features);
		}
		return this;
	}

	public override write(context: WriterContext): this {
		const rootMetadata = this.document.getRoot().getExtension<StructuralMetadata>(EXT_STRUCTURAL_METADATA);
		const propertyTables = rootMetadata?.listPropertyTables() || [];
		for (const node of this.document.getRoot().listNodes()) {
			const features = node.getExtension<InstanceFeatures>(EXT_INSTANCE_FEATURES);
			if (!features) continue;
			const featureIds = features.listFeatureIDs().map((featureID): InstanceFeatureIDDef => {
				const def: InstanceFeatureIDDef = { featureCount: featureID.getFeatureCount() };
				if (featureID.getNullFeatureID() !== null) def.nullFeatureId = featureID.getNullFeatureID()!;
				if (featureID.getLabel()) def.label = featureID.getLabel();
				if (featureID.getAttribute() !== null) def.attribute = featureID.getAttribute()!;
				const propertyTable = featureID.getPropertyTable();
				if (propertyTable) {
					const propertyTableIndex = propertyTables.indexOf(propertyTable);
					if (propertyTableIndex < 0) {
						throw new Error(
							'EXT_instance_features: PropertyTable must be attached to the root EXT_structural_metadata extension.',
						);
					}
					def.propertyTable = propertyTableIndex;
				}
				return def;
			});
			const nodeDef = context.jsonDoc.json.nodes![context.nodeIndexMap.get(node)!];
			nodeDef.extensions ||= {};
			nodeDef.extensions[EXT_INSTANCE_FEATURES] = { featureIds };
		}
		return this;
	}
}
