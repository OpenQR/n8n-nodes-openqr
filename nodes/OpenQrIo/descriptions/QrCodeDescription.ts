import type { INodeProperties } from 'n8n-workflow';
import { designCollection } from './DesignDescription';
import { qrCodeTypeOptions } from './QrCodeTypes';

/** Operations that take the full QR code body: name, type, data, options and design. */
export const BODY_OPERATIONS = ['create', 'preview', 'savePreview'];

/** Operations that show the per-type content fields and Design. */
export const CONTENT_OPERATIONS = [...BODY_OPERATIONS, 'update'];

const forContent = (types?: string[]) => ({
	show: {
		resource: ['qrCode'],
		operation: CONTENT_OPERATIONS,
		...(types ? { type: types } : {}),
	},
});

const forBody = (types?: string[]) => ({
	show: {
		resource: ['qrCode'],
		operation: BODY_OPERATIONS,
		...(types ? { type: types } : {}),
	},
});

export const qrCodeOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['qrCode'] } },
		options: [
			{
				name: 'Archive',
				value: 'archive',
				description:
					'Archive a QR code. A dynamic code stops redirecting, so printed copies stop working.',
				action: 'Archive a QR code so a dynamic code stops working',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create and save a QR code. Counts towards the plan limit.',
				action: 'Create and save a QR code',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a QR code by ID',
				action: 'Get a QR code',
			},
			{
				name: 'Get Image',
				value: 'getImage',
				description:
					'Download the image of a QR code as an SVG file, ready to attach to an email or upload',
				action: 'Download the SVG image of a QR code',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List QR codes, newest first',
				action: 'Get many QR codes',
			},
			{
				name: 'Preview',
				value: 'preview',
				description: 'Get the SVG image of a QR code without saving it',
				action: 'Preview a QR code image without saving it',
			},
			{
				name: 'Save Preview',
				value: 'savePreview',
				description:
					'Save a previewed QR code, keeping the short link shown in the preview. Counts towards the plan limit.',
				action: 'Save a previewed QR code',
			},
			{
				name: 'Update',
				value: 'update',
				description:
					'Change a QR code’s content, name, folder, domain or design. A dynamic code’s printed copies open the new content.',
				action: 'Change the content or design of a QR code',
			},
		],
		default: 'create',
	},
];

/** Picks an existing QR code from the list or by ID. Also used by Update and Get Image. */
export function qrCodeLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'QR Code',
		name: 'qrCodeId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The QR code to use',
		displayOptions: { show: { resource: ['qrCode'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchQrCodes', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. km0yYX0',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[A-Za-z0-9_-]+$',
							errorMessage: 'A QR code ID has only letters, numbers, _ and -, such as km0yYX0',
						},
					},
				],
			},
		],
	};
}

/** Picks a folder from the list or by ID. */
export function folderLocator(name: string, description: string): INodeProperties {
	return {
		displayName: 'Folder',
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchFolders', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 6',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^[0-9]+$', errorMessage: 'A folder ID is a number, such as 6' },
					},
				],
			},
		],
	};
}

/** Content fields for each type. Parameter names are mapped to API keys in `buildQrCodeData`. */
const dataFields: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://openqr.io',
		description: 'Website the code opens, up to 350 characters',
		displayOptions: forContent(['url', 'url_static']),
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		description: 'Plain text shown when the code is scanned, up to 350 characters',
		displayOptions: forContent(['text', 'text_static']),
	},
	{
		displayName: 'Phone Number',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +1234567890',
		description: 'Number to call or text, 3 to 32 characters',
		displayOptions: forContent(['call', 'call_static', 'sms', 'sms_static']),
	},
	{
		displayName: 'Email Address',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. name@email.com',
		description: 'Address the email is sent to',
		displayOptions: forContent(['email', 'email_static']),
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		default: '',
		description: 'Email subject, up to 180 characters',
		displayOptions: forContent(['email', 'email_static']),
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		description: 'Message text, up to 500 characters',
		displayOptions: forContent(['sms', 'sms_static', 'email', 'email_static']),
	},
	{
		displayName: 'Network Name',
		name: 'ssid',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. OfficeGuest',
		description: 'Wi-Fi network name (SSID), up to 200 characters',
		displayOptions: forContent(['wifi', 'wifi_static']),
	},
	{
		displayName: 'Security',
		name: 'wifiSecurity',
		type: 'options',
		required: true,
		description: 'How the network is protected. Most networks use WPA/WPA2.',
		options: [
			{ name: 'None (Open Network)', value: 'nopass' },
			{ name: 'WEP', value: 'WEP' },
			{ name: 'WPA/WPA2', value: 'WPA' },
		],
		default: 'WPA',
		displayOptions: forContent(['wifi', 'wifi_static']),
	},
	{
		displayName: 'Password',
		name: 'wifiPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Wi-Fi password',
		displayOptions: {
			show: {
				resource: ['qrCode'],
				operation: CONTENT_OPERATIONS,
				type: ['wifi', 'wifi_static'],
				wifiSecurity: ['WPA', 'WEP'],
			},
		},
	},
	{
		displayName: 'Hidden Network',
		name: 'wifiHidden',
		type: 'boolean',
		default: false,
		description: 'Whether the network is hidden',
		displayOptions: forContent(['wifi', 'wifi_static']),
	},
	{
		displayName: 'Latitude',
		name: 'latitude',
		type: 'number',
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 6 },
		required: true,
		default: 0,
		placeholder: 'e.g. 54.6872',
		description: 'Latitude in decimal degrees, from -90 to 90',
		displayOptions: forContent(['geo', 'geo_static']),
	},
	{
		displayName: 'Longitude',
		name: 'longitude',
		type: 'number',
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 6 },
		required: true,
		default: 0,
		placeholder: 'e.g. 25.2797',
		description: 'Longitude in decimal degrees, from -180 to 180',
		displayOptions: forContent(['geo', 'geo_static']),
	},
	{
		displayName: 'Event Title',
		name: 'eventTitle',
		type: 'string',
		required: true,
		default: '',
		description: 'Up to 100 characters',
		displayOptions: forContent(['event_static']),
	},
	{
		displayName: 'Event URL',
		name: 'eventUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://openqr.io/events/launch',
		description: 'Web page with the event details',
		displayOptions: forContent(['event_static']),
	},
	{
		displayName: 'Location',
		name: 'eventLocation',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. London',
		description: 'Where the event takes place, up to 100 characters',
		displayOptions: forContent(['event_static']),
	},
	{
		displayName: 'Start',
		name: 'eventStartAt',
		type: 'dateTime',
		required: true,
		default: '',
		description: 'Start date and time',
		displayOptions: forContent(['event_static']),
	},
	{
		displayName: 'End',
		name: 'eventEndAt',
		type: 'dateTime',
		default: '',
		description: 'End date and time',
		displayOptions: forContent(['event_static']),
	},
	{
		displayName: 'Event Description',
		name: 'eventDescription',
		type: 'string',
		default: '',
		description: 'Up to 200 characters',
		displayOptions: forContent(['event_static']),
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		required: true,
		default: '',
		description: 'First name on the contact card, up to 200 characters',
		displayOptions: forContent(['vcard_static']),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		required: true,
		default: '',
		description: 'Last name on the contact card, up to 200 characters',
		displayOptions: forContent(['vcard_static']),
	},
	{
		displayName: 'Contact Details',
		name: 'contactDetails',
		type: 'collection',
		placeholder: 'Add Detail',
		default: {},
		displayOptions: forContent(['vcard_static']),
		options: [
			{ displayName: 'City', name: 'city', type: 'string', default: '' },
			{ displayName: 'Company', name: 'company', type: 'string', default: '' },
			{ displayName: 'Country', name: 'country', type: 'string', default: '' },
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'e.g. name@email.com',
			},
			{ displayName: 'Fax', name: 'fax', type: 'string', default: '' },
			{ displayName: 'Job Title', name: 'job', type: 'string', default: '' },
			{
				displayName: 'Mobile',
				name: 'mobile',
				type: 'string',
				default: '',
				placeholder: 'e.g. +1234567890',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				placeholder: 'e.g. +1234567890',
			},
			{ displayName: 'State or Region', name: 'state', type: 'string', default: '' },
			{ displayName: 'Street', name: 'street', type: 'string', default: '' },
			{
				displayName: 'Website',
				name: 'website',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://openqr.io',
			},
			{ displayName: 'ZIP or Postal Code', name: 'zip', type: 'string', default: '' },
		],
	},
	{
		displayName: 'Landing Page ID',
		name: 'pageId',
		type: 'number',
		required: true,
		default: 0,
		placeholder: 'e.g. 12',
		description:
			'ID of a landing page built in the OpenQR.io dashboard. Use an event page for Event and a vCard page for vCard.',
		displayOptions: forBody(['event', 'vcard']),
	},
];

const bodyFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Spring menu',
		description: 'Name shown in the OpenQR.io dashboard, 5 to 255 characters',
		displayOptions: forBody(),
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		required: true,
		options: qrCodeTypeOptions,
		default: 'url',
		description:
			'What the code does when scanned. Dynamic codes hold a short link, so they can be changed later and report scans. Static codes hold the content itself, so they can do neither.',
		displayOptions: forBody(),
	},
	...dataFields,
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: forBody(),
		options: [
			{
				displayName: 'Custom Domain ID',
				name: 'domainId',
				type: 'number',
				default: 0,
				description:
					'ID of one of your custom domains, used for a dynamic code’s short link. Leave it out for the default domain.',
			},
			folderLocator('folder', 'Folder to put the code in'),
		],
	},
	designCollection(forContent().show),
	{
		displayName: 'Download Image',
		name: 'downloadImage',
		type: 'boolean',
		default: false,
		description:
			'Whether to also download the saved code’s SVG image, so the next node gets a file. Uses one more request, to the image server.',
		displayOptions: { show: { resource: ['qrCode'], operation: ['create', 'savePreview'] } },
	},
	outputFileField({ operation: ['preview', 'getImage'] }),
	outputFileField({ operation: ['create', 'savePreview'], downloadImage: [true] }),
];

function outputFileField(show: Record<string, Array<string | boolean>>): INodeProperties {
	return {
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the output binary field to put the SVG in',
		displayOptions: { show: { resource: ['qrCode'], ...show } },
	};
}

const archiveFields: INodeProperties[] = [
	{
		displayName:
			'An archived dynamic code stops redirecting, so every printed copy stops working. It can only be restored from the OpenQR.io dashboard.',
		name: 'archiveNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['qrCode'], operation: ['archive'] } },
	},
];

const getAllFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['qrCode'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['qrCode'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['qrCode'], operation: ['getAll'] } },
		options: [
			folderLocator('folder', 'Only return codes in this folder'),
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Active', value: 'public' },
					{ name: 'Archived', value: 'archived' },
				],
				default: 'public',
				description: 'Which codes to list: active ones or archived ones',
			},
		],
	},
];

const forUpdate = { show: { resource: ['qrCode'], operation: ['update'] } };

const updateFields: INodeProperties[] = [
	{
		displayName:
			'Every update resets the design. Fill in Design with the code’s full look, or it goes back to the default black and white. Content must be filled in too: the API replaces it.',
		name: 'updateNotice',
		type: 'notice',
		default: '',
		displayOptions: forUpdate,
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		required: true,
		options: qrCodeTypeOptions,
		default: 'url',
		description:
			'The code’s current type, which can’t be changed. It decides which content fields are shown. The node checks it against the code before updating.',
		displayOptions: forUpdate,
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description: 'Anything not added here keeps its current value, except Design',
		displayOptions: forUpdate,
		options: [
			{
				displayName: 'Custom Domain ID',
				name: 'domainId',
				type: 'number',
				default: 0,
				description:
					'ID of one of your custom domains for a dynamic code’s short link. Use 0 for the default domain.',
			},
			folderLocator('folder', 'Folder to move the code to'),
			{
				displayName: 'Landing Page ID',
				name: 'pageId',
				type: 'number',
				default: 0,
				description:
					'For dynamic Event and vCard codes: ID of the landing page to open instead. Leave it out to keep the current page.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				placeholder: 'e.g. Spring menu',
				description: 'New name shown in the OpenQR.io dashboard, 5 to 255 characters',
			},
			{
				displayName: 'Remove From Folder',
				name: 'removeFromFolder',
				type: 'boolean',
				default: false,
				description: 'Whether to take the code out of its folder. Overrides Folder.',
			},
		],
	},
];

export const qrCodeFields: INodeProperties[] = [
	qrCodeLocator(['get', 'getImage', 'archive', 'update']),
	...updateFields,
	...archiveFields,
	...bodyFields,
	...getAllFields,
];
