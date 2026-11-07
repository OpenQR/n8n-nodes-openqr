import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { openQrApiRequest, openQrApiRequestAllItems } from '../GenericFunctions';

/**
 * One page of a cursor-paged list, filtered by name on our side because the API has no search.
 * n8n passes the returned token back to load the next page as the user scrolls.
 */
async function searchCursorList(
	ctx: ILoadOptionsFunctions,
	endpoint: string,
	toItem: (entry: IDataObject) => INodeListSearchItems,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const qs: IDataObject = {};
	if (paginationToken) qs.cursor = paginationToken;
	const response = await openQrApiRequest.call(ctx, 'GET', endpoint, undefined, qs);
	const entries = Array.isArray(response.data) ? (response.data as IDataObject[]) : [];
	const needle = filter?.trim().toLowerCase();
	const results = entries
		.filter(
			(entry) =>
				!needle ||
				String(entry.name ?? '')
					.toLowerCase()
					.includes(needle),
		)
		.map(toItem);
	const meta = (response.meta ?? {}) as IDataObject;
	const next =
		typeof meta.next_cursor === 'string' && meta.next_cursor !== '' ? meta.next_cursor : undefined;
	return { results, paginationToken: next };
}

export const listSearch = {
	async searchQrCodes(
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		return await searchCursorList(
			this,
			'/qr-codes',
			(code) => ({
				name: `${String(code.name)} (${String(code.type)}, ${String(code.id)})`,
				value: String(code.id),
			}),
			filter,
			paginationToken,
		);
	},

	async searchFolders(
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		return await searchCursorList(
			this,
			'/folders',
			(folder) => ({ name: String(folder.name), value: String(folder.id) }),
			filter,
			paginationToken,
		);
	},
};

export const loadOptions = {
	async getLogos(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const logos = await openQrApiRequestAllItems.call(this, '/files/qr-logos');
		const options = logos.map((logo) => ({
			name: logo.public === true ? `${String(logo.name)} (OpenQR.io)` : String(logo.name),
			value: String(logo.id),
		}));
		return [{ name: 'No Logo', value: '' }, ...options];
	},
};
