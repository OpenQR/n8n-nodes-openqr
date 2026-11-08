import type { INodeProperties } from 'n8n-workflow';
import { folderLocator } from './QrCodeDescription';

const forFolder = (operation: string[]) => ({ show: { resource: ['folder'], operation } });

export const folderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['folder'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a folder to organise QR codes',
				action: 'Create a folder',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a folder. Its QR codes are kept and moved out of the folder.',
				action: 'Delete a folder',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List folders',
				action: 'Get many folders',
			},
			{
				name: 'Rename',
				value: 'rename',
				description: 'Change a folder’s name',
				action: 'Rename a folder',
			},
		],
		default: 'create',
	},
];

export const folderFields: INodeProperties[] = [
	{
		...folderLocator('folderId', 'The folder to use'),
		required: true,
		displayOptions: forFolder(['delete', 'rename']),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Marketing',
		description: 'Folder name, 5 to 255 characters',
		displayOptions: forFolder(['create']),
	},
	{
		displayName: 'New Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Marketing',
		description: 'Folder name, 5 to 255 characters',
		displayOptions: forFolder(['rename']),
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: forFolder(['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['folder'], operation: ['getAll'], returnAll: [false] } },
	},
];
