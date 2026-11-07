import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class OpenQrIo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenQR.io',
		name: 'openQrIo',
		icon: { light: 'file:openQrIo.svg', dark: 'file:openQrIo.dark.svg' },
		group: ['output'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Official n8n node for OpenQR.io: create and manage QR codes',
		defaults: {
			name: 'OpenQR.io',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return [this.getInputData()];
	}
}
