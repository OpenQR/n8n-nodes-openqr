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
import { NodeApiError, sleep } from 'n8n-workflow';

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
};

/** Hard stop for pagination, in case the API keeps returning a next page. */
const MAX_PAGES = 1000;

export interface RequestOptions {
	itemIndex?: number;
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
	const body = (
		response.body && typeof response.body === 'object' ? response.body : {}
	) as ApiErrorBody;
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

/** Sends one request to the OpenQR.io API, retrying 409 and 429 as the API docs ask. */
export async function openQrApiRequest(
	this: OpenQrContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	options: RequestOptions = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = String(credentials.baseUrl ?? '').replace(/\/+$/, '');

	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body !== undefined && Object.keys(body).length > 0) requestOptions.body = body;
	if (qs !== undefined && Object.keys(qs).length > 0) requestOptions.qs = qs;

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

		if (response.statusCode >= 200 && response.statusCode < 300) {
			return (response.body ?? {}) as IDataObject;
		}

		const delay = getRetryDelayMs(response.statusCode, attempt, response.headers);
		if (delay === undefined) {
			throw buildApiError(this.getNode(), response, endpoint, options.itemIndex);
		}
		await sleep(delay);
	}
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
