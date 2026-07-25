import { ExtensionProperty, type IProperty, type Nullable, PropertyType, RefSet } from '@gltf-transform/core';
import { EXT_INSTANCE_FEATURES } from '../constants.js';
import type { InstanceFeatureID } from './instance-feature-id.js';

interface IInstanceFeatures extends IProperty {
	featureIds: RefSet<InstanceFeatureID>;
}

/** Defines feature ID sets associated with an instanced {@link Node}. */
export class InstanceFeatures extends ExtensionProperty<IInstanceFeatures> {
	static override EXTENSION_NAME = EXT_INSTANCE_FEATURES;
	public declare extensionName: typeof EXT_INSTANCE_FEATURES;
	public declare propertyType: 'InstanceFeatures';
	public declare parentTypes: [PropertyType.NODE];

	protected override init(): void {
		this.extensionName = EXT_INSTANCE_FEATURES;
		this.propertyType = 'InstanceFeatures';
		this.parentTypes = [PropertyType.NODE];
	}

	protected override getDefaults(): Nullable<IInstanceFeatures> {
		return Object.assign(super.getDefaults(), { featureIds: new RefSet<InstanceFeatureID>() });
	}

	listFeatureIDs(): InstanceFeatureID[] {
		return this.listRefs('featureIds');
	}
	addFeatureID(featureID: InstanceFeatureID) {
		return this.addRef('featureIds', featureID);
	}
	removeFeatureID(featureID: InstanceFeatureID) {
		return this.removeRef('featureIds', featureID);
	}
}
