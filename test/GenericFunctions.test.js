// Unit tests for the shared API layer. Runs against the compiled output: `npm test`.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError } = require('n8n-workflow');
const {
	openQrApiRequest,
	openQrApiRequestAllItems,
	getRetryDelayMs,
	retryPolicy,
} = require('../dist/nodes/OpenQrIo/GenericFunctions.js');

const defaults = { ...retryPolicy };

beforeEach(() => {
	Object.assign(retryPolicy, defaults, { conflictDelaysMs: [0, 0, 0], rateLimitDelaysMs: [0, 0] });
});

/** A fake n8n context. `responses` are returned in order; an Error instance is thrown instead. */
function makeContext(responses, credentials = { apiKey: 'k', baseUrl: 'http://api.test/api/v1/' }) {
	const calls = [];
	const queue = [...responses];
	return {
		calls,
		getCredentials: async () => credentials,
		getNode: () => ({ name: 'OpenQR.io', type: 'openQrIo', typeVersion: 1, parameters: {} }),
		helpers: {
			httpRequestWithAuthentication: async (credentialName, options) => {
				calls.push({ credentialName, ...options, qs: options.qs ? { ...options.qs } : undefined });
				const next = queue.shift();
				if (next === undefined) throw new Error('test: no more responses queued');
				if (next instanceof Error) throw next;
				return next;
			},
		},
	};
}

const ok = (body) => ({ statusCode: 200, headers: {}, body });
const fail = (statusCode, body = {}, headers = {}) => ({ statusCode, headers, body });

test('builds the URL from the credential base URL without a double slash', async () => {
	const ctx = makeContext([ok({ data: { id: 'a' } })]);
	const result = await openQrApiRequest.call(ctx, 'GET', '/qr-codes/a');
	assert.deepEqual(result, { data: { id: 'a' } });
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/qr-codes/a');
	assert.equal(ctx.calls[0].credentialName, 'openQrIoApi');
	assert.equal(ctx.calls[0].returnFullResponse, true);
	assert.equal(ctx.calls[0].ignoreHttpStatusErrors, true);
});

test('leaves out empty body and query', async () => {
	const ctx = makeContext([ok({})]);
	await openQrApiRequest.call(ctx, 'POST', '/qr-codes/a/archive', {}, {});
	assert.equal('body' in ctx.calls[0], false);
	assert.equal(ctx.calls[0].qs, undefined);
});

test('sends body and query when given', async () => {
	const ctx = makeContext([ok({})]);
	await openQrApiRequest.call(ctx, 'POST', '/folders', { name: 'Marketing' }, { a: 1 });
	assert.deepEqual(ctx.calls[0].body, { name: 'Marketing' });
	assert.deepEqual(ctx.calls[0].qs, { a: 1 });
});

for (const [status, expected] of [
	[400, /The name field is required\. \[item 2\]/],
	[401, /did not accept the API key \[item 2\]/],
	[403, /Plan limit reached \[item 2\]/],
	[404, /could not find QR code x \[item 2\]/],
	[500, /could not complete the request \[item 2\]/],
]) {
	test(`maps HTTP ${status} to a NodeApiError without retrying`, async () => {
		const apiMessage = status === 400 ? 'The name field is required.' : 'Plan limit reached';
		const ctx = makeContext([fail(status, { message: apiMessage })]);
		await assert.rejects(
			openQrApiRequest.call(ctx, 'GET', '/qr-codes/x', undefined, undefined, { itemIndex: 2 }),
			(error) => {
				assert.ok(error instanceof NodeApiError);
				assert.match(error.message, expected);
				assert.equal(error.httpCode, String(status));
				assert.ok(error.description && !/error|failure|problem|mistake/i.test(error.description));
				return true;
			},
		);
		assert.equal(ctx.calls.length, 1);
	});
}

test('retries 409 and then succeeds', async () => {
	const ctx = makeContext([fail(409), fail(409), ok({ data: { id: 'new' } })]);
	const result = await openQrApiRequest.call(ctx, 'POST', '/qr-codes', { name: 'Hello' });
	assert.deepEqual(result, { data: { id: 'new' } });
	assert.equal(ctx.calls.length, 3);
});

test('gives up on 409 after the configured retries', async () => {
	const ctx = makeContext([fail(409), fail(409), fail(409), fail(409)]);
	await assert.rejects(
		openQrApiRequest.call(ctx, 'POST', '/qr-codes', { name: 'Hello' }),
		/still being created/,
	);
	assert.equal(ctx.calls.length, 4);
});

test('retries 429 and gives up with the rate limit message', async () => {
	const ctx = makeContext([fail(429), fail(429), fail(429)]);
	await assert.rejects(openQrApiRequest.call(ctx, 'GET', '/users'), /rate limit reached/);
	assert.equal(ctx.calls.length, 3);
});

test('uses Retry-After for 429, capped', () => {
	Object.assign(retryPolicy, defaults);
	assert.equal(getRetryDelayMs(429, 0, { 'retry-after': '7' }), 7000);
	assert.equal(getRetryDelayMs(429, 0, { 'retry-after': '600' }), 60000);
	assert.equal(getRetryDelayMs(429, 0, {}), 15000);
	assert.equal(getRetryDelayMs(429, 1, { 'retry-after': 'soon' }), 30000);
	assert.equal(getRetryDelayMs(429, 2, { 'retry-after': '1' }), undefined);
	assert.equal(getRetryDelayMs(409, 0), 1000);
	assert.equal(getRetryDelayMs(500, 0), undefined);
	assert.equal(getRetryDelayMs(400, 0), undefined);
});

test('reports a network failure with the base URL and a fix', async () => {
	const ctx = makeContext([
		Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
	]);
	await assert.rejects(
		openQrApiRequest.call(ctx, 'GET', '/users', undefined, undefined, { itemIndex: 0 }),
		(error) => {
			assert.ok(error instanceof NodeApiError);
			assert.match(
				error.message,
				/Could not reach OpenQR\.io at http:\/\/api\.test\/api\/v1 \[item 0\]/,
			);
			assert.match(error.description, /Base URL/);
			return true;
		},
	);
	assert.equal(ctx.calls.length, 1);
});

test('cursor paging follows meta.next_cursor and stops at null', async () => {
	const ctx = makeContext([
		ok({ data: [{ id: 1 }, { id: 2 }], meta: { next_cursor: 'c2' }, links: { next: 'x' } }),
		ok({ data: [{ id: 3 }], meta: { next_cursor: 'c3' } }),
		ok({ data: [{ id: 4 }], meta: { next_cursor: null }, links: { next: null } }),
	]);
	const items = await openQrApiRequestAllItems.call(ctx, '/qr-codes', { status: 'public' });
	assert.deepEqual(
		items.map((i) => i.id),
		[1, 2, 3, 4],
	);
	assert.deepEqual(
		ctx.calls.map((c) => c.qs),
		[{ status: 'public' }, { status: 'public', cursor: 'c2' }, { status: 'public', cursor: 'c3' }],
	);
});

test('cursor paging stops early when the limit is reached', async () => {
	const ctx = makeContext([
		ok({ data: [{ id: 1 }, { id: 2 }], meta: { next_cursor: 'c2' } }),
		ok({ data: [{ id: 3 }, { id: 4 }], meta: { next_cursor: 'c3' } }),
	]);
	const items = await openQrApiRequestAllItems.call(ctx, '/qr-codes', {}, 3);
	assert.deepEqual(
		items.map((i) => i.id),
		[1, 2, 3],
	);
	assert.equal(ctx.calls.length, 2);
});

test('cursor paging stops if the API repeats a cursor', async () => {
	const ctx = makeContext([
		ok({ data: [{ id: 1 }], meta: { next_cursor: 'same' } }),
		ok({ data: [{ id: 2 }], meta: { next_cursor: 'same' } }),
	]);
	const items = await openQrApiRequestAllItems.call(ctx, '/folders');
	assert.deepEqual(
		items.map((i) => i.id),
		[1, 2],
	);
	assert.equal(ctx.calls.length, 2);
});

test('page paging (logos) follows links.next and stops when it is null', async () => {
	const ctx = makeContext([
		ok({ data: [{ id: 'a' }], links: { next: '?page=2' }, meta: { current_page: 1 } }),
		ok({ data: [{ id: 'b' }], links: { next: '?page=3' }, meta: { current_page: 2 } }),
		ok({ data: [{ id: 'c' }], links: { next: null }, meta: { current_page: 3 } }),
	]);
	const items = await openQrApiRequestAllItems.call(ctx, '/files/qr-logos');
	assert.deepEqual(
		items.map((i) => i.id),
		['a', 'b', 'c'],
	);
	assert.deepEqual(
		ctx.calls.map((c) => c.qs),
		[undefined, { page: 2 }, { page: 3 }],
	);
});

test('a single page without paging info returns its items', async () => {
	const ctx = makeContext([ok({ data: [{ id: 1 }] })]);
	const items = await openQrApiRequestAllItems.call(ctx, '/folders');
	assert.deepEqual(
		items.map((i) => i.id),
		[1],
	);
});

test('an error on a later page is raised, not swallowed', async () => {
	const ctx = makeContext([ok({ data: [{ id: 1 }], meta: { next_cursor: 'c2' } }), fail(401)]);
	await assert.rejects(
		openQrApiRequestAllItems.call(ctx, '/qr-codes'),
		/did not accept the API key/,
	);
});

test('404 messages name the QR code or folder, not the path', () => {
	const { describeEndpoint } = require('../dist/nodes/OpenQrIo/GenericFunctions.js');
	assert.equal(describeEndpoint('/qr-codes/km0yYX0'), 'QR code km0yYX0');
	assert.equal(describeEndpoint('/qr-codes/_4EeX8iV/archive'), 'QR code _4EeX8iV');
	assert.equal(describeEndpoint('/folders/6/delete'), 'folder 6');
	assert.equal(describeEndpoint('/qr-codes/preview/save'), '/qr-codes/preview/save');
	assert.equal(describeEndpoint('/users'), '/users');
});
