import type { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Plan Usage',
				value: 'getUsage',
				description:
					'Get the plan, how many QR codes it allows and how many can still be created. Check it before creating many codes.',
				action: 'Get plan usage',
			},
		],
		default: 'getUsage',
	},
];

export const accountFields: INodeProperties[] = [
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return only the plan name and QR code counts instead of the full account details',
		displayOptions: { show: { resource: ['account'], operation: ['getUsage'] } },
	},
];

export const logoOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['logo'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'List the logos that can go on QR codes: yours and the ones OpenQR.io provides',
				action: 'Get many logos',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a logo image. Use the returned ID as the Logo in a QR code’s design.',
				action: 'Upload a logo',
			},
		],
		default: 'upload',
	},
];

export const logoFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input binary field that holds the logo',
		description: 'A PNG or JPEG image, ideally square',
		displayOptions: { show: { resource: ['logo'], operation: ['upload'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['logo'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['logo'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Include OpenQR.io Logos',
		name: 'includePublic',
		type: 'boolean',
		default: true,
		description: 'Whether to include the logos OpenQR.io provides, or only the ones you uploaded',
		displayOptions: { show: { resource: ['logo'], operation: ['getAll'] } },
	},
];
