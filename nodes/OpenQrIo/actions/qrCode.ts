import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { toApiDesign } from '../descriptions/DesignDescription';
import { baseType, QR_CODE_TYPES } from '../descriptions/QrCodeTypes';
import {
	openQrApiRequest,
	openQrApiRequestAllItems,
	openQrApiRequestBinary,
} from '../GenericFunctions';

const suffix = (i: number) => ` [item ${i}]`;

/** Reads a resource locator value, whether it arrives as `{ mode, value }` or a plain value. */
export function locatorValue(raw: unknown): string {
	if (raw && typeof raw === 'object' && 'value' in raw) {
		return String((raw as { value: unknown }).value ?? '').trim();
	}
	return raw === undefined || raw === null ? '' : String(raw).trim();
}

function toDateString(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object' && typeof (value as { toISO?: unknown }).toISO === 'function') {
		return String((value as { toISO: () => string }).toISO());
	}
	return String(value);
}

function folderIdFrom(this: IExecuteFunctions, raw: unknown, i: number): number | undefined {
	const value = locatorValue(raw);
	if (value === '') return undefined;
	const id = Number(value);
	if (!Number.isInteger(id) || id <= 0) {
		throw new NodeOperationError(
			this.getNode(),
			`The folder ID "${value}" isn't valid${suffix(i)}`,
			{
				itemIndex: i,
				description: 'A folder ID is a whole number, such as 6. Pick the folder from the list.',
			},
		);
	}
	return id;
}

export function qrCodeIdFrom(this: IExecuteFunctions, i: number): string {
	const id = locatorValue(this.getNodeParameter('qrCodeId', i));
	if (id === '') {
		throw new NodeOperationError(this.getNode(), `No QR code was chosen${suffix(i)}`, {
			itemIndex: i,
			description: 'Pick a QR code from the list or enter its ID.',
		});
	}
	return encodeURIComponent(id);
}

/** Builds the `data` object for a type from the content fields. */
export function buildQrCodeData(
	this: IExecuteFunctions,
	type: string,
	i: number,
): { data: IDataObject } {
	const param = (name: string, fallback: unknown = '') => this.getNodeParameter(name, i, fallback);
	const str = (name: string) => String(param(name) ?? '');

	switch (baseType(type)) {
		case 'url':
			return { data: { url: str('url') } };
		case 'text':
			return { data: { text: str('text') } };
		case 'call':
			return { data: { phone: str('phone') } };
		case 'sms':
			return { data: { phone: str('phone'), message: str('message') } };
		case 'email':
			return { data: { email: str('email'), subject: str('subject'), message: str('message') } };
		case 'wifi': {
			const security = str('wifiSecurity') || 'WPA';
			const data: IDataObject = {
				ssid: str('ssid'),
				type: security,
				hidden: param('wifiHidden', false) === true,
			};
			if (security !== 'nopass') data.password = str('wifiPassword');
			return { data };
		}
		case 'geo':
			return {
				data: { lat: Number(param('latitude', 0)), long: Number(param('longitude', 0)) },
			};
		default:
			break;
	}

	if (type === 'event_static') {
		const data: IDataObject = {
			title: str('eventTitle'),
			url: str('eventUrl'),
			location: str('eventLocation'),
			start_at: toDateString(param('eventStartAt')),
		};
		const end = toDateString(param('eventEndAt'));
		if (end) data.end_at = end;
		const description = str('eventDescription');
		if (description) data.description = description;
		return { data };
	}

	if (type === 'vcard_static') {
		const data: IDataObject = { first_name: str('firstName'), last_name: str('lastName') };
		const details = param('contactDetails', {}) as IDataObject;
		for (const [key, value] of Object.entries(details)) {
			if (value !== undefined && value !== null && value !== '') data[key] = value;
		}
		return { data };
	}

	// Dynamic event and vcard codes open a landing page instead: `data` stays empty.
	return { data: {} };
}

/** Dynamic Event and vCard codes open a landing page built in the dashboard. */
export function usesLandingPage(type: string): boolean {
	return type === 'event' || type === 'vcard';
}

/** Reads a landing page ID. Returns undefined when it's not set and not required. */
function pageIdFrom(
	this: IExecuteFunctions,
	raw: unknown,
	i: number,
	required: boolean,
): number | undefined {
	const pageId = Number(raw ?? 0);
	if (Number.isInteger(pageId) && pageId > 0) return pageId;
	if (!required && (raw === undefined || raw === null || raw === '' || pageId === 0)) {
		return undefined;
	}
	throw new NodeOperationError(this.getNode(), `A landing page ID is needed${suffix(i)}`, {
		itemIndex: i,
		description:
			'Dynamic Event and vCard codes open a landing page. Build it in the OpenQR.io dashboard and enter its ID, or pick a static type instead.',
	});
}

function checkName(this: IExecuteFunctions, name: string, i: number): void {
	if (name.length >= 5 && name.length <= 255) return;
	throw new NodeOperationError(
		this.getNode(),
		`The name must be 5 to 255 characters long${suffix(i)}`,
		{
			itemIndex: i,
			description: `"${name}" has ${name.length} characters. OpenQR.io needs 5 to 255.`,
		},
	);
}

/** Builds the body that Create, Preview and Save Preview send. */
export function buildQrCodeBody(this: IExecuteFunctions, i: number): IDataObject {
	const name = String(this.getNodeParameter('name', i, '') ?? '').trim();
	checkName.call(this, name, i);

	const type = String(this.getNodeParameter('type', i));
	if (!(QR_CODE_TYPES as readonly string[]).includes(type)) {
		throw new NodeOperationError(
			this.getNode(),
			`The type "${type}" can't be created${suffix(i)}`,
			{
				itemIndex: i,
				description: `Use one of: ${QR_CODE_TYPES.join(', ')}.`,
			},
		);
	}

	const { data } = buildQrCodeData.call(this, type, i);
	const body: IDataObject = { name, type, data };
	if (usesLandingPage(type)) {
		body.qr_page_id = pageIdFrom.call(this, this.getNodeParameter('pageId', i, 0), i, true);
	}

	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const folderId = folderIdFrom.call(this, options.folder, i);
	if (folderId !== undefined) body.qr_code_folder_id = folderId;
	const domainId = Number(options.domainId ?? 0);
	if (Number.isInteger(domainId) && domainId > 0) body.domain_id = domainId;

	const design = toApiDesign(this.getNodeParameter('design', i, {}) as IDataObject);
	if (design) body.design = design;

	return body;
}

/**
 * Builds the Update body. The API replaces settings, so name, folder and domain are taken from
 * the live code unless the user changes them. Content and design can't be read back (see BE-3).
 */
export function buildUpdateBody(
	this: IExecuteFunctions,
	current: IDataObject,
	i: number,
): IDataObject {
	const liveType = String(current.type ?? '');
	const type = String(this.getNodeParameter('type', i));
	if (!(QR_CODE_TYPES as readonly string[]).includes(liveType)) {
		throw new NodeOperationError(
			this.getNode(),
			`This ${liveType} code can only be edited in the OpenQR.io dashboard${suffix(i)}`,
			{
				itemIndex: i,
				description: `The API can update these types: ${QR_CODE_TYPES.join(', ')}.`,
			},
		);
	}
	if (type !== liveType) {
		throw new NodeOperationError(
			this.getNode(),
			`This QR code's type is ${liveType}, but Type is set to ${type}${suffix(i)}`,
			{
				itemIndex: i,
				description: `A code's type can't be changed. Set Type to ${liveType} and fill in its content fields.`,
			},
		);
	}

	const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;

	let name = String(current.name ?? '');
	if (typeof fields.name === 'string' && fields.name.trim() !== '') {
		name = fields.name.trim();
		checkName.call(this, name, i);
	}

	const body: IDataObject = { name, data: buildQrCodeData.call(this, type, i).data };

	let folderId = (current.qr_code_folder_id ?? null) as number | null;
	if (fields.removeFromFolder === true) folderId = null;
	else folderId = folderIdFrom.call(this, fields.folder, i) ?? folderId;
	body.qr_code_folder_id = folderId;

	let domainId = (current.domain_id ?? null) as number | null;
	if (fields.domainId !== undefined) {
		const value = Number(fields.domainId);
		domainId = Number.isInteger(value) && value > 0 ? value : null;
	}
	body.domain_id = domainId;

	if (usesLandingPage(type)) {
		const pageId = pageIdFrom.call(this, fields.pageId, i, false);
		if (pageId !== undefined) body.qr_page_id = pageId;
	}

	const design = toApiDesign(this.getNodeParameter('design', i, {}) as IDataObject);
	if (design) body.design = design;

	return body;
}

function fileNameFor(name: string): string {
	const base = name
		.replace(/[^\p{L}\p{N}._ -]+/gu, '')
		.trim()
		.replace(/\s+/g, '-');
	return `${base || 'qr-code'}.svg`;
}

export async function executeQrCode(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const item = { item: i };
	const options = { itemIndex: i };

	switch (operation) {
		case 'create':
		case 'savePreview': {
			const endpoint = operation === 'create' ? '/qr-codes' : '/qr-codes/preview/save';
			const body = buildQrCodeBody.call(this, i);
			const response = await openQrApiRequest.call(
				this,
				'POST',
				endpoint,
				body,
				undefined,
				options,
			);
			return [{ json: (response.data ?? response) as IDataObject, pairedItem: item }];
		}

		case 'preview': {
			const body = buildQrCodeBody.call(this, i);
			const binaryPropertyName = String(this.getNodeParameter('binaryPropertyName', i, 'data'));
			const { data } = await openQrApiRequestBinary.call(
				this,
				'POST',
				'/qr-codes/preview',
				body,
				undefined,
				options,
			);
			const fileName = fileNameFor(String(body.name));
			const binary = await this.helpers.prepareBinaryData(data, fileName, 'image/svg+xml');
			return [
				{
					json: { name: body.name, type: body.type, fileName },
					binary: { [binaryPropertyName]: binary },
					pairedItem: item,
				},
			];
		}

		case 'get': {
			const id = qrCodeIdFrom.call(this, i);
			const response = await openQrApiRequest.call(
				this,
				'GET',
				`/qr-codes/${id}`,
				undefined,
				undefined,
				options,
			);
			return [{ json: (response.data ?? response) as IDataObject, pairedItem: item }];
		}

		case 'update': {
			const id = qrCodeIdFrom.call(this, i);
			const current = await openQrApiRequest.call(
				this,
				'GET',
				`/qr-codes/${id}`,
				undefined,
				undefined,
				options,
			);
			const body = buildUpdateBody.call(this, (current.data ?? {}) as IDataObject, i);
			const response = await openQrApiRequest.call(
				this,
				'POST',
				`/qr-codes/${id}`,
				body,
				undefined,
				options,
			);
			return [{ json: (response.data ?? response) as IDataObject, pairedItem: item }];
		}

		case 'archive': {
			const id = qrCodeIdFrom.call(this, i);
			const response = await openQrApiRequest.call(
				this,
				'POST',
				`/qr-codes/${id}/archive`,
				undefined,
				undefined,
				options,
			);
			return [{ json: (response.data ?? response) as IDataObject, pairedItem: item }];
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const qs: IDataObject = {};
			if (filters.status) qs.status = filters.status;
			const folderId = folderIdFrom.call(this, filters.folder, i);
			if (folderId !== undefined) qs.folder_id = folderId;
			const codes = await openQrApiRequestAllItems.call(this, '/qr-codes', qs, limit, options);
			return codes.map((code) => ({ json: code, pairedItem: item }));
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" isn't supported for QR codes${suffix(i)}`,
				{ itemIndex: i },
			);
	}
}
