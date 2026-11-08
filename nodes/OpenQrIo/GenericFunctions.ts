import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export type OpenQrContext = IExecuteFunctions | ILoadOptionsFunctions;

export const CREDENTIAL_NAME = 'openQrIoApi';

/**
 * How the node retries the two statuses that the API asks callers to retry.
 * Other statuses are never retried: a repeated create after a 5xx could make a duplicate code.
 * Exported so tests can shorten the waits.
 */
export const retryPolicy = {
	/** 409: another QR code is still being created on the account. */
	conflictDelaysMs: [1000, 2000, 4000],
	/** 429: the limits are per minute, so later waits reach into the next minute. */
	rateLimitDelaysMs: [15000, 30000],
	/** Upper bound for a Retry-After header, so one item can't stall the workflow for long. */
	maxRetryAfterMs: 60000,
	/** Image download: the file may not be on the CDN yet right after Create. */
	imageDelaysMs: [1000, 2000, 4000],
};

/** Hard stop for pagination, in case the API keeps returning a next page. */
const MAX_PAGES = 1000;

export interface RequestOptions {
	itemIndex?: number;
}

/** Error bodies come back as a Buffer when the response was requested as binary. */
function parseErrorBody(body: unknown): ApiErrorBody {
	if (Buffer.isBuffer(body)) {
		try {
			const parsed: unknown = JSON.parse(body.toString('utf8'));
			return parsed && typeof parsed === 'object' ? (parsed as ApiErrorBody) : {};
		} catch {
			return {};
		}
	}
	return body && typeof body === 'object' ? (body as ApiErrorBody) : {};
}

interface ApiErrorBody {
	message?: string;
}

function getRetryAfterMs(headers: IDataObject | undefined): number | undefined {
	const raw = headers?.['retry-after'];
	const seconds = Number(raw);
	if (raw === undefined || raw === null || raw === '' || !Number.isFinite(seconds) || seconds < 0) {
		return undefined;
	}
	return Math.min(seconds * 1000, retryPolicy.maxRetryAfterMs);
}

/** Returns how long to wait before the next attempt, or undefined when the request shouldn't be retried. */
export function getRetryDelayMs(
	statusCode: number,
	attempt: number,
	headers?: IDataObject,
): number | undefined {
	const delays =
		statusCode === 409
			? retryPolicy.conflictDelaysMs
			: statusCode === 429
				? retryPolicy.rateLimitDelaysMs
				: undefined;
	if (delays === undefined || attempt >= delays.length) return undefined;
	if (statusCode === 429) return getRetryAfterMs(headers) ?? delays[attempt];
	return delays[attempt];
}

function itemSuffix(itemIndex: number | undefined): string {
	return itemIndex === undefined ? '' : ` [item ${itemIndex}]`;
}

/** Builds the error shown in n8n: what happened in the message, how to fix it in the description. */
export function buildApiError(
	node: INode,
	response: IN8nHttpFullResponse,
	endpoint: string,
	itemIndex?: number,
): NodeApiError {
	const statusCode = response.statusCode;
	const body = parseErrorBody(response.body);
	const apiMessage = typeof body.message === 'string' ? body.message : undefined;

	let message: string;
	let description: string;

	switch (statusCode) {
		case 400:
			message = apiMessage ?? 'OpenQR.io rejected the values sent';
			description = 'Check the field named in the message and try again.';
			break;
		case 401:
			message = 'OpenQR.io did not accept the API key';
			description =
				'The key is missing, wrong or revoked. Create a key at dashboard.openqr.io (user menu, API Keys) and update the OpenQR.io API credential.';
			break;
		case 403:
			message = apiMessage ?? 'OpenQR.io refused this request';
			description =
				'This happens when the plan limit is reached, when the key has no API access, or when the item belongs to another account. Archive unused QR codes or upgrade the plan if the limit is reached.';
			break;
		case 404:
			message = `OpenQR.io could not find ${endpoint}`;
			description = 'Check that the ID is correct and belongs to this account.';
			break;
		case 409:
			message = 'Another QR code is still being created on this account';
			description =
				'The node retried several times. Try again in a moment, or send fewer items at once.';
			break;
		case 429:
			message = 'OpenQR.io rate limit reached';
			description =
				'An account can make 100 requests a minute, and 60 of them can create, preview or update QR codes. The node waited and retried. For large batches, use Loop Over Items with a Wait node between batches.';
			break;
		default:
			if (statusCode >= 500) {
				message = 'OpenQR.io could not complete the request';
				description = 'This is on the OpenQR.io side. Try again later.';
			} else {
				message = apiMessage ?? `OpenQR.io returned status ${statusCode}`;
				description = 'Check the node settings and try again.';
			}
	}

	return new NodeApiError(node, body as JsonObject, {
		message: message + itemSuffix(itemIndex),
		description,
		httpCode: String(statusCode),
		itemIndex,
	});
}

/** Sends a request and returns the full 2xx response, retrying 409 and 429 as the API docs ask. */
async function sendRequest(
	this: OpenQrContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | undefined,
	qs: IDataObject | undefined,
	options: RequestOptions,
	extra: Partial<IHttpRequestOptions> = {},
): Promise<IN8nHttpFullResponse> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = String(credentials.baseUrl ?? '').replace(/\/+$/, '');

	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		...extra,
	};
	if (body !== undefined && Object.keys(body).length > 0) requestOptions.body = body;
	if (qs !== undefined && Object.keys(qs).length > 0) requestOptions.qs = { ...qs };

	for (let attempt = 0; ; attempt++) {
		let response: IN8nHttpFullResponse;
		try {
			response = (await this.helpers.httpRequestWithAuthentication.call(
				this,
				CREDENTIAL_NAME,
				requestOptions,
			)) as IN8nHttpFullResponse;
		} catch (error) {
			// Network failures (refused connection, DNS, timeout) never reach a status code.
			// Only the reason text is passed: given the raw error, NodeApiError swaps the message
			// for a generic one based on its code (e.g. ECONNREFUSED) and drops the Base URL hint.
			const reason = error instanceof Error ? error.message : String(error);
			throw new NodeApiError(this.getNode(), { message: reason } as JsonObject, {
				message: `Could not reach OpenQR.io at ${baseUrl}${itemSuffix(options.itemIndex)}`,
				description: `${reason}. Check the Base URL in the OpenQR.io API credential and your network.`,
				itemIndex: options.itemIndex,
			});
		}

		if (response.statusCode >= 200 && response.statusCode < 300) return response;

		const delay = getRetryDelayMs(response.statusCode, attempt, response.headers);
		if (delay === undefined) {
			throw buildApiError(this.getNode(), response, endpoint, options.itemIndex);
		}
		await sleep(delay);
	}
}

/** Sends one JSON request to the OpenQR.io API and returns the parsed body. */
export async function openQrApiRequest(
	this: OpenQrContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	options: RequestOptions = {},
): Promise<IDataObject> {
	const response = await sendRequest.call(this, method, endpoint, body, qs, options);
	return (response.body ?? {}) as IDataObject;
}

/** Sends one request whose success response is a file, such as the SVG from Preview. */
export async function openQrApiRequestBinary(
	this: OpenQrContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	options: RequestOptions = {},
): Promise<{ data: Buffer; contentType?: string }> {
	const response = await sendRequest.call(this, method, endpoint, body, qs, options, {
		encoding: 'arraybuffer',
	});
	const raw: unknown = response.body;
	const data = Buffer.isBuffer(raw)
		? raw
		: raw instanceof ArrayBuffer
			? Buffer.from(raw)
			: Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw ?? ''), 'utf8');
	const contentType = response.headers?.['content-type'];
	return { data, contentType: typeof contentType === 'string' ? contentType : undefined };
}

/**
 * Fetches every page of a list endpoint, up to `limit` items when given.
 * QR codes and folders use `meta.next_cursor`; logos use page numbers and `links.next`.
 */
export async function openQrApiRequestAllItems(
	this: OpenQrContext,
	endpoint: string,
	qs: IDataObject = {},
	limit?: number,
	options: RequestOptions = {},
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const query: IDataObject = { ...qs };
	let page = 1;

	for (let pageCount = 0; pageCount < MAX_PAGES; pageCount++) {
		const response = await openQrApiRequest.call(this, 'GET', endpoint, undefined, query, options);
		const data = Array.isArray(response.data) ? (response.data as IDataObject[]) : [];
		results.push(...data);

		if (limit !== undefined && results.length >= limit) return results.slice(0, limit);

		const meta = (response.meta ?? {}) as IDataObject;
		const links = (response.links ?? {}) as IDataObject;

		if (typeof meta.next_cursor === 'string' && meta.next_cursor !== '') {
			if (meta.next_cursor === query.cursor) break;
			query.cursor = meta.next_cursor;
		} else if (!('next_cursor' in meta) && typeof links.next === 'string' && links.next !== '') {
			page += 1;
			query.page = page;
		} else {
			break;
		}
	}

	return results;
}

/**
 * Downloads a QR code image from the URL in the code's `image` field.
 * Sent without the credential: the file is public and on another host, so the API key stays off it.
 */
export async function downloadQrImage(
	this: IExecuteFunctions,
	url: string,
	options: RequestOptions = {},
): Promise<{ data: Buffer; contentType?: string }> {
	const where = itemSuffix(options.itemIndex);
	if (!/^https?:\/\//i.test(url)) {
		throw new NodeOperationError(this.getNode(), `This QR code has no image URL${where}`, {
			itemIndex: options.itemIndex,
			description: 'OpenQR.io returned the code without an image. Try again in a moment.',
		});
	}

	for (let attempt = 0; ; attempt++) {
		let response: IN8nHttpFullResponse;
		try {
			response = (await this.helpers.httpRequest({
				method: 'GET',
				url,
				encoding: 'arraybuffer',
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
			})) as IN8nHttpFullResponse;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new NodeApiError(this.getNode(), { message: reason } as JsonObject, {
				message: `Could not download the QR code image${where}`,
				description: `${reason}. The image is at ${url}.`,
				itemIndex: options.itemIndex,
			});
		}

		if (response.statusCode >= 200 && response.statusCode < 300) {
			const raw: unknown = response.body;
			const data = Buffer.isBuffer(raw)
				? raw
				: Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw ?? ''), 'utf8');
			const contentType = response.headers?.['content-type'];
			return { data, contentType: typeof contentType === 'string' ? contentType : undefined };
		}

		// The CDN answers 404 until the image has been rendered. A 403 is a refusal, not a delay:
		// the CDN blocks some clients by user agent, so retrying wouldn't help.
		const notReady = response.statusCode === 404;
		if (notReady && attempt < retryPolicy.imageDelaysMs.length) {
			await sleep(retryPolicy.imageDelaysMs[attempt]);
			continue;
		}

		const waitedSeconds = Math.round(retryPolicy.imageDelaysMs.reduce((a, b) => a + b, 0) / 1000);
		let message = `Could not download the QR code image${where}`;
		let description = `The image server returned status ${response.statusCode}. The image is at ${url}.`;
		if (notReady) {
			message = `The QR code image isn't available yet${where}`;
			description = `The node waited about ${waitedSeconds} seconds. Run Get Image again shortly. The image is at ${url}.`;
		} else if (response.statusCode === 403) {
			message = `The image server refused the download${where}`;
			description = `It may block requests from this n8n instance's network or proxy. Check that ${url} opens from the same network, or contact OpenQR support.`;
		}

		throw new NodeApiError(this.getNode(), {} as JsonObject, {
			message,
			description,
			httpCode: String(response.statusCode),
			itemIndex: options.itemIndex,
		});
	}
}
