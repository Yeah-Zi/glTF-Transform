import { ExtensionProperty, type IProperty, type Nullable } from '@gltf-transform/core';
import { EXT_INSTANCE_FEATURES } from '../constants.js';
import type { PropertyTable } from '../ext-structural-metadata/index.js';

interface IInstanceFeatureID extends IProperty {
	featureCount: number;
	nullFeatureId: number | null;
	label: string;
	attribute: number | null;
	propertyTable: PropertyTable;
}

/** Defines a feature ID set for GPU instances. See {@link EXTInstanceFeatures}. */
export class InstanceFeatureID extends ExtensionProperty<IInstanceFeatureID> {
	static override EXTENSION_NAME = EXT_INSTANCE_FEATURES;
	public declare extensionName: typeof EXT_INSTANCE_FEATURES;
	public declare propertyType: 'InstanceFeatureID';
	public declare parentTypes: ['InstanceFeatures'];

	protected override init(): void {
		this.extensionName = EXT_INSTANCE_FEATURES;
		this.propertyType = 'InstanceFeatureID';
		this.parentTypes = ['InstanceFeatures'];
	}

	protected override getDefaults(): Nullable<IInstanceFeatureID> {
		return Object.assign(super.getDefaults(), {
			nullFeatureId: null,
			label: '',
			attribute: null,
			propertyTable: null,
		});
	}

	getFeatureCount(): number {
		return this.get('featureCount');
	}
	setFeatureCount(featureCount: number) {
		return this.set('featureCount', featureCount);
	}
	getNullFeatureID(): number | null {
		return this.get('nullFeatureId');
	}
	setNullFeatureID(nullFeatureId: number | null) {
		return this.set('nullFeatureId', nullFeatureId);
	}
	getLabel(): string {
		return this.get('label');
	}
	setLabel(label: string) {
		return this.set('label', label);
	}
	getAttribute(): number | null {
		return this.get('attribute');
	}
	setAttribute(attribute: number | null) {
		return this.set('attribute', attribute);
	}
	getPropertyTable(): PropertyTable | null {
		return this.getRef('propertyTable');
	}
	setPropertyTable(propertyTable: PropertyTable | null) {
		return this.setRef('propertyTable', propertyTable);
	}
}
