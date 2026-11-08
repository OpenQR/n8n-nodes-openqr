import type {
	IExecuteFunctions,
	JsonObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { executeAccount, executeFolder, executeLogo } from './actions/other';
import { executeQrCode } from './actions/qrCode';
import {
	accountFields,
	accountOperations,
	logoFields,
	logoOperations,
} from './descriptions/AccountLogoDescription';
import { folderFields, folderOperations } from './descriptions/FolderDescription';
import { qrCodeFields, qrCodeOperations } from './descriptions/QrCodeDescription';
import { listSearch, loadOptions } from './methods';

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
		credentials: [
			{
				name: 'openQrIoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Folder', value: 'folder' },
					{ name: 'Logo', value: 'logo' },
					{ name: 'QR Code', value: 'qrCode' },
				],
				default: 'qrCode',
			},
			...qrCodeOperations,
			...qrCodeFields,
			...folderOperations,
			...folderFields,
			...accountOperations,
			...accountFields,
			...logoOperations,
			...logoFields,
		],
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				const handlers = {
					account: executeAccount,
					folder: executeFolder,
					logo: executeLogo,
					qrCode: executeQrCode,
				};
				const handler = handlers[resource as keyof typeof handlers];
				if (handler === undefined) {
					throw new NodeOperationError(
						this.getNode(),
						`The resource "${resource}" isn't supported [item ${i}]`,
						{ itemIndex: i },
					);
				}
				returnData.push(...(await handler.call(this, operation, i)));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both classes hand back an error that is already of their own kind, unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
