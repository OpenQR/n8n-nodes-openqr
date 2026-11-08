// Tests for the Folder, Account and Logo resources.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OpenQrIo } = require('../dist/nodes/OpenQrIo/OpenQrIo.node.js');
const { buildMultipartBody } = require('../dist/nodes/OpenQrIo/GenericFunctions.js');

const node = new OpenQrIo();

/** A fake n8n execute context. `binaries` holds each item's input files by field name. */
function makeContext(items, responses, { binaries = [] } = {}) {
	const calls = [];
	const queue = [...responses];
	return {
		calls,
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (name, i, fallback) =>
			items[i][name] === undefined ? fallback : items[i][name],
		continueOnFail: () => false,
		getNode: () => ({ name: 'OpenQR.io', type: 'openQrIo', typeVersion: 1, parameters: {} }),
		getCredentials: async () => ({ apiKey: 'k', baseUrl: 'http://api.test/api/v1' }),
		helpers: {
			httpRequestWithAuthentication: async (_name, options) => {
				calls.push(options);
				const next = queue.shift();
				if (next === undefined) throw new Error('test: no more responses queued');
				return next;
			},
			assertBinaryData: (i, field) => {
				const file = binaries[i]?.[field];
				if (!file) throw new Error(`No binary data in field "${field}"`);
				return file;
			},
			getBinaryDataBuffer: async (i, field) => binaries[i][field].buffer,
		},
	};
}

const ok = (body) => ({ statusCode: 200, headers: {}, body });

async function run(params, responses, options) {
	const items = Array.isArray(params) ? params : [params];
	const ctx = makeContext(items, responses, options);
	const [output] = await node.execute.call(ctx);
	return { ctx, output };
}

// Folder

test('Folder Create posts the name and returns the folder', async () => {
	const { ctx, output } = await run(
		{ resource: 'folder', operation: 'create', name: ' Client A team ' },
		[ok({ data: { id: 9, name: 'Client A team' } })],
	);
	assert.equal(ctx.calls[0].method, 'POST');
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/folders');
	assert.deepEqual(ctx.calls[0].body, { name: 'Client A team' });
	assert.deepEqual(output, [{ json: { id: 9, name: 'Client A team' }, pairedItem: { item: 0 } }]);
});

test('Folder names shorter than 5 characters stop before calling the API', async () => {
	await assert.rejects(
		run({ resource: 'folder', operation: 'create', name: 'Ads' }, []),
		/5 to 255/,
	);
});

test('Folder Rename posts the new name to the folder', async () => {
	const { ctx } = await run(
		{
			resource: 'folder',
			operation: 'rename',
			folderId: { mode: 'list', value: '6' },
			name: 'Marketing EU',
		},
		[ok({ data: { id: 6, name: 'Marketing EU' } })],
	);
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/folders/6');
	assert.deepEqual(ctx.calls[0].body, { name: 'Marketing EU' });
});

test('Folder Delete posts to /delete and returns deleted: true', async () => {
	const { ctx, output } = await run(
		{ resource: 'folder', operation: 'delete', folderId: { mode: 'id', value: '6' } },
		[ok({ status: 'success', message: 'Your folder was removed' })],
	);
	assert.equal(ctx.calls[0].method, 'POST');
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/folders/6/delete');
	assert.deepEqual(output, [{ json: { deleted: true }, pairedItem: { item: 0 } }]);
});

test('Folder Delete without a folder stops before calling the API', async () => {
	await assert.rejects(
		run({ resource: 'folder', operation: 'delete', folderId: { mode: 'list', value: '' } }, []),
		/No folder was chosen \[item 0\]/,
	);
});

test('Folder Get Many follows the cursor when returning all', async () => {
	const { ctx, output } = await run({ resource: 'folder', operation: 'getAll', returnAll: true }, [
		ok({ data: [{ id: 1 }], meta: { next_cursor: 'c2' } }),
		ok({ data: [{ id: 2 }], meta: { next_cursor: null } }),
	]);
	assert.equal(ctx.calls[1].qs.cursor, 'c2');
	assert.deepEqual(
		output.map((o) => o.json.id),
		[1, 2],
	);
});

// Account

const user = {
	account_trial_ends_at: null,
	account_on_trial: false,
	created_qr_codes_count: 3,
	qr_codes_limit: 60,
	qr_codes_remaining: 57,
	subscription: { id: 1, subscription_active: true },
	plan: { id: 1, name: 'Pro', number_of_qr_codes: 50 },
};

test('Get Plan Usage simplifies to the plan and counts', async () => {
	const { ctx, output } = await run({ resource: 'account', operation: 'getUsage' }, [ok(user)]);
	assert.equal(ctx.calls[0].method, 'GET');
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/users');
	assert.deepEqual(output[0].json, {
		plan: 'Pro',
		created_qr_codes_count: 3,
		qr_codes_limit: 60,
		qr_codes_remaining: 57,
		account_on_trial: false,
		account_trial_ends_at: null,
	});
});

test('Get Plan Usage returns everything with Simplify off, with or without a data wrapper', async () => {
	const { output } = await run(
		[
			{ resource: 'account', operation: 'getUsage', simplify: false },
			{ resource: 'account', operation: 'getUsage', simplify: false },
		],
		[ok(user), ok({ data: user })],
	);
	assert.deepEqual(output[0].json, user);
	assert.deepEqual(output[1].json, user);
});

// Logo

test('Logo Upload sends the input file as multipart field "file"', async () => {
	const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
	const { ctx, output } = await run(
		{ resource: 'logo', operation: 'upload', binaryPropertyName: 'logo' },
		[ok({ data: { id: 'XzC1zPwH', name: 'brand.png', public: false } })],
		{ binaries: [{ logo: { fileName: 'brand.png', mimeType: 'image/png', buffer: png } }] },
	);
	const call = ctx.calls[0];
	assert.equal(call.method, 'POST');
	assert.equal(call.url, 'http://api.test/api/v1/files/qr-logos');
	const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(call.headers['Content-Type'])[1];
	const expected = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="brand.png"\r\nContent-Type: image/png\r\n\r\n`,
		),
		png,
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);
	assert.ok(Buffer.isBuffer(call.body));
	assert.ok(call.body.equals(expected));
	assert.equal(output[0].json.id, 'XzC1zPwH');
});

test('Logo Upload reports a missing input file', async () => {
	await assert.rejects(
		run({ resource: 'logo', operation: 'upload', binaryPropertyName: 'data' }, [], {
			binaries: [{}],
		}),
		/No binary data in field "data"/,
	);
});

test('multipart file names cannot break out of the header', () => {
	const { body } = buildMultipartBody(
		'file',
		{ data: Buffer.from('x'), fileName: 'a"\r\nX-Evil: 1.png', mimeType: 'image/png' },
		'B',
	);
	assert.match(body.toString(), /filename="a___X-Evil: 1\.png"/);
	assert.doesNotMatch(body.toString(), /\r\nX-Evil/);
});

test('Logo Get Many follows page numbers and can leave out OpenQR.io logos', async () => {
	const pages = [
		ok({
			data: [
				{ id: 'p1', public: true },
				{ id: 'm1', public: false },
			],
			links: { next: '?page=2' },
			meta: {},
		}),
		ok({
			data: [
				{ id: 'm2', public: false },
				{ id: 'p2', public: true },
			],
			links: { next: null },
			meta: {},
		}),
	];
	const { ctx, output } = await run(
		{ resource: 'logo', operation: 'getAll', returnAll: false, limit: 5, includePublic: false },
		pages,
	);
	assert.deepEqual(
		ctx.calls.map((c) => c.qs),
		[undefined, { page: 2 }],
	);
	assert.deepEqual(
		output.map((o) => o.json.id),
		['m1', 'm2'],
	);
});

test('Logo Get Many with OpenQR.io logos stops at the limit', async () => {
	const { ctx, output } = await run(
		{ resource: 'logo', operation: 'getAll', returnAll: false, limit: 1, includePublic: true },
		[
			ok({
				data: [{ id: 'p1', public: true }, { id: 'm1' }],
				links: { next: '?page=2' },
				meta: {},
			}),
		],
	);
	assert.equal(ctx.calls.length, 1);
	assert.deepEqual(
		output.map((o) => o.json.id),
		['p1'],
	);
});
