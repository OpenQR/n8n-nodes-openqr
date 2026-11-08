import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { openQrApiRequest, openQrApiRequestAllItems, openQrApiUpload } from '../GenericFunctions';
import { checkName, folderIdFrom, suffix } from './common';

function unsupported(this: IExecuteFunctions, resource: string, operation: string, i: number) {
	return new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" isn't supported for ${resource}${suffix(i)}`,
		{ itemIndex: i },
	);
}

function limitFrom(this: IExecuteFunctions, i: number): number | undefined {
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	return returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
}

function requiredFolderId(this: IExecuteFunctions, i: number): number {
	const id = folderIdFrom.call(this, this.getNodeParameter('folderId', i), i);
	if (id === undefined) {
		throw new NodeOperationError(this.getNode(), `No folder was chosen${suffix(i)}`, {
			itemIndex: i,
			description: 'Pick a folder from the list or enter its ID.',
		});
	}
	return id;
}

export async function executeFolder(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const item = { item: i };
	const options = { itemIndex: i };

	switch (operation) {
		case 'create':
		case 'rename': {
			const name = String(this.getNodeParameter('name', i, '') ?? '').trim();
			checkName.call(this, name, i);
			const endpoint =
				operation === 'create' ? '/folders' : `/folders/${requiredFolderId.call(this, i)}`;
			const response = await openQrApiRequest.call(
				this,
				'POST',
				endpoint,
				{ name },
				undefined,
				options,
			);
			return [{ json: (response.data ?? response) as IDataObject, pairedItem: item }];
		}

		case 'delete': {
			const id = requiredFolderId.call(this, i);
			await openQrApiRequest.call(
				this,
				'POST',
				`/folders/${id}/delete`,
				undefined,
				undefined,
				options,
			);
			return [{ json: { deleted: true }, pairedItem: item }];
		}

		case 'getAll': {
			const folders = await openQrApiRequestAllItems.call(
				this,
				'/folders',
				{},
				limitFrom.call(this, i),
				options,
			);
			return folders.map((folder) => ({ json: folder, pairedItem: item }));
		}

		default:
			throw unsupported.call(this, 'folders', operation, i);
	}
}

export async function executeAccount(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	if (operation !== 'getUsage') throw unsupported.call(this, 'the account', operation, i);

	const response = await openQrApiRequest.call(this, 'GET', '/users', undefined, undefined, {
		itemIndex: i,
	});
	// The spec returns the user object at the top level; accept a `data` wrapper too.
	const user = (
		response.data && typeof response.data === 'object' ? response.data : response
	) as IDataObject;

	if (this.getNodeParameter('simplify', i, true) === false) {
		return [{ json: user, pairedItem: { item: i } }];
	}
	const plan = (user.plan ?? {}) as IDataObject;
	return [
		{
			json: {
				plan: plan.name ?? null,
				created_qr_codes_count: user.created_qr_codes_count ?? null,
				qr_codes_limit: user.qr_codes_limit ?? null,
				qr_codes_remaining: user.qr_codes_remaining ?? null,
				account_on_trial: user.account_on_trial ?? null,
				account_trial_ends_at: user.account_trial_ends_at ?? null,
			},
			pairedItem: { item: i },
		},
	];
}

export async function executeLogo(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const item = { item: i };
	const options = { itemIndex: i };

	switch (operation) {
		case 'upload': {
			const binaryPropertyName = String(this.getNodeParameter('binaryPropertyName', i, 'data'));
			const binary = this.helpers.assertBinaryData(i, binaryPropertyName);
			const data = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
			const response = await openQrApiUpload.call(
				this,
				'/files/qr-logos',
				'file',
				{
					data,
					fileName: binary.fileName || `logo.${binary.fileExtension || 'png'}`,
					mimeType: binary.mimeType || 'application/octet-stream',
				},
				options,
			);
			return [{ json: (response.data ?? response) as IDataObject, pairedItem: item }];
		}

		case 'getAll': {
			const includePublic = this.getNodeParameter('includePublic', i, true) as boolean;
			const limit = limitFrom.call(this, i);
			// Filtering happens here, so without public logos every page is needed before the limit.
			let logos = await openQrApiRequestAllItems.call(
				this,
				'/files/qr-logos',
				{},
				includePublic ? limit : undefined,
				options,
			);
			if (!includePublic) logos = logos.filter((logo) => logo.public !== true);
			if (limit !== undefined) logos = logos.slice(0, limit);
			return logos.map((logo) => ({ json: logo, pairedItem: item }));
		}

		default:
			throw unsupported.call(this, 'logos', operation, i);
	}
}
