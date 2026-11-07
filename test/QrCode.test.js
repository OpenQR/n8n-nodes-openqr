// Tests for the QR Code resource: the exact request each operation sends, and what it returns.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OpenQrIo } = require('../dist/nodes/OpenQrIo/OpenQrIo.node.js');

const node = new OpenQrIo();

/** A fake n8n execute context. `items` holds the parameters of each input item. */
function makeContext(items, responses, { continueOnFail = false } = {}) {
	const calls = [];
	const queue = [...responses];
	return {
		calls,
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (name, i, fallback) => {
			const value = items[i][name];
			return value === undefined ? fallback : value;
		},
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'OpenQR.io', type: 'openQrIo', typeVersion: 1, parameters: {} }),
		getCredentials: async () => ({ apiKey: 'k', baseUrl: 'http://api.test/api/v1' }),
		helpers: {
			httpRequestWithAuthentication: async (_name, options) => {
				calls.push(options);
				const next = queue.shift();
				if (next === undefined) throw new Error('test: no more responses queued');
				return next;
			},
			prepareBinaryData: async (data, fileName, mimeType) => ({
				data: data.toString('base64'),
				fileName,
				mimeType,
			}),
		},
	};
}

const ok = (body) => ({ statusCode: 200, headers: {}, body });
const created = (extra = {}) =>
	ok({ data: { id: 'km0yYX0', name: 'Spring menu', type: 'url', ...extra } });

async function run(params, responses = [created()], options) {
	const items = Array.isArray(params) ? params : [params];
	const ctx = makeContext(items, responses, options);
	const [output] = await node.execute.call(ctx);
	return { ctx, output };
}

const create = (extra) => ({
	resource: 'qrCode',
	operation: 'create',
	name: 'Spring menu',
	...extra,
});

test('Create sends name, type and data, and returns the QR code object', async () => {
	const { ctx, output } = await run(create({ type: 'url', url: 'https://openqr.io' }));
	assert.equal(ctx.calls[0].method, 'POST');
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/qr-codes');
	assert.deepEqual(ctx.calls[0].body, {
		name: 'Spring menu',
		type: 'url',
		data: { url: 'https://openqr.io' },
	});
	assert.deepEqual(output, [
		{ json: { id: 'km0yYX0', name: 'Spring menu', type: 'url' }, pairedItem: { item: 0 } },
	]);
});

for (const [label, params, data] of [
	['text', { type: 'text_static', text: 'Hello' }, { text: 'Hello' }],
	['call', { type: 'call', phone: '+1234567890' }, { phone: '+1234567890' }],
	[
		'sms',
		{ type: 'sms_static', phone: '+1234567890', message: 'Hi' },
		{ phone: '+1234567890', message: 'Hi' },
	],
	[
		'email',
		{ type: 'email', email: 'a@b.co', subject: 'S', message: 'M' },
		{ email: 'a@b.co', subject: 'S', message: 'M' },
	],
	[
		'wifi with a password',
		{
			type: 'wifi_static',
			ssid: 'Office',
			wifiSecurity: 'WPA',
			wifiPassword: 'secret1',
			wifiHidden: true,
		},
		{ ssid: 'Office', type: 'WPA', password: 'secret1', hidden: true },
	],
	[
		'open wifi, leaving the password out',
		{ type: 'wifi', ssid: 'Cafe', wifiSecurity: 'nopass', wifiPassword: 'ignored' },
		{ ssid: 'Cafe', type: 'nopass', hidden: false },
	],
	['geo', { type: 'geo', latitude: 54.6872, longitude: 25.2797 }, { lat: 54.6872, long: 25.2797 }],
	[
		'static event',
		{
			type: 'event_static',
			eventTitle: 'Launch',
			eventUrl: 'https://openqr.io/e',
			eventLocation: 'London',
			eventStartAt: '2026-08-22T18:00:00',
			eventEndAt: '2026-08-22T21:00:00',
			eventDescription: 'Join us',
		},
		{
			title: 'Launch',
			url: 'https://openqr.io/e',
			location: 'London',
			start_at: '2026-08-22T18:00:00',
			end_at: '2026-08-22T21:00:00',
			description: 'Join us',
		},
	],
	[
		'static vCard, skipping empty details',
		{
			type: 'vcard_static',
			firstName: 'Ada',
			lastName: 'Lovelace',
			contactDetails: { company: 'OpenQR', email: '', job: 'Engineer' },
		},
		{ first_name: 'Ada', last_name: 'Lovelace', company: 'OpenQR', job: 'Engineer' },
	],
]) {
	test(`Create builds the data for ${label}`, async () => {
		const { ctx } = await run(create(params));
		assert.equal(ctx.calls[0].body.type, params.type);
		assert.deepEqual(ctx.calls[0].body.data, data);
	});
}

test('dynamic vCard and Event send qr_page_id with empty data', async () => {
	const { ctx } = await run(
		[create({ type: 'vcard', pageId: 12 }), create({ type: 'event', pageId: 7 })],
		[created(), created()],
	);
	assert.deepEqual(ctx.calls[0].body, {
		name: 'Spring menu',
		type: 'vcard',
		data: {},
		qr_page_id: 12,
	});
	assert.deepEqual(ctx.calls[1].body, {
		name: 'Spring menu',
		type: 'event',
		data: {},
		qr_page_id: 7,
	});
});

test('dynamic vCard without a page ID stops before calling the API', async () => {
	await assert.rejects(
		run(create({ type: 'vcard', pageId: 0 }), []),
		/landing page ID is needed \[item 0\]/,
	);
});

test('folder, domain and design are mapped to API fields', async () => {
	const { ctx } = await run(
		create({
			type: 'url',
			url: 'https://openqr.io',
			options: { folder: { mode: 'list', value: '6' }, domainId: 3 },
			design: {
				foregroundColor: '#1f2937',
				module: 'dots',
				finder: 'rounded-corners',
				finderDot: 'circle',
				frame: 'simple-text-bottom',
				frameText: 'SCAN ME',
				frameTextSize: 2,
				logoId: '',
				transparentBackground: true,
				backgroundColor: '#FFFFFF',
			},
		}),
	);
	const body = ctx.calls[0].body;
	assert.equal(body.qr_code_folder_id, 6);
	assert.equal(body.domain_id, 3);
	assert.deepEqual(body.design, {
		background_color: 'transparent',
		foreground_color: '#1f2937',
		module: 'dots',
		finder: 'rounded-corners',
		finder_dot: 'circle',
		frame: 'simple-text-bottom',
		frame_text: 'SCAN ME',
		frame_text_size: 2,
	});
});

test('empty options and design are left out of the body', async () => {
	const { ctx } = await run(
		create({
			type: 'url',
			url: 'https://openqr.io',
			options: { folder: { mode: 'list', value: '' } },
			design: {},
		}),
	);
	assert.deepEqual(Object.keys(ctx.calls[0].body), ['name', 'type', 'data']);
});

test('a name shorter than 5 characters stops before calling the API', async () => {
	// No responses are queued, so any request would fail with a different message.
	await assert.rejects(
		run(create({ name: 'Menu', type: 'url', url: 'x' }), []),
		/5 to 255 characters long \[item 0\]/,
	);
});

test('an invalid folder ID is reported', async () => {
	await assert.rejects(
		run(create({ type: 'url', url: 'x', options: { folder: { mode: 'id', value: 'abc' } } }), []),
		/folder ID "abc" isn't valid/,
	);
});

test('Save Preview posts the same body to /qr-codes/preview/save', async () => {
	const { ctx } = await run({
		...create({ type: 'url', url: 'https://openqr.io' }),
		operation: 'savePreview',
	});
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/qr-codes/preview/save');
	assert.deepEqual(ctx.calls[0].body.data, { url: 'https://openqr.io' });
});

test('Preview returns the SVG as binary without saving', async () => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
	const { ctx, output } = await run(
		{
			...create({ type: 'url', url: 'https://openqr.io', name: 'Spring menu / 2026' }),
			operation: 'preview',
			binaryPropertyName: 'qr',
		},
		[{ statusCode: 200, headers: { 'content-type': 'image/svg+xml' }, body: Buffer.from(svg) }],
	);
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/qr-codes/preview');
	assert.equal(ctx.calls[0].encoding, 'arraybuffer');
	assert.equal(output[0].json.fileName, 'Spring-menu-2026.svg');
	assert.equal(output[0].binary.qr.mimeType, 'image/svg+xml');
	assert.equal(Buffer.from(output[0].binary.qr.data, 'base64').toString(), svg);
});

test('Preview reads the API message from a binary error body', async () => {
	const body = Buffer.from(JSON.stringify({ message: 'The data.url field must be a valid URL.' }));
	await assert.rejects(
		run({ ...create({ type: 'url', url: 'nope' }), operation: 'preview' }, [
			{ statusCode: 400, headers: {}, body },
		]),
		/The data\.url field must be a valid URL\. \[item 0\]/,
	);
});

test('Get and Archive use the QR code ID from the locator', async () => {
	const { ctx, output } = await run(
		[
			{ resource: 'qrCode', operation: 'get', qrCodeId: { mode: 'list', value: 'km0yYX0' } },
			{ resource: 'qrCode', operation: 'archive', qrCodeId: { mode: 'id', value: ' CNrqFwwf ' } },
		],
		[created(), created({ status: 'archived' })],
	);
	assert.equal(ctx.calls[0].method, 'GET');
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/qr-codes/km0yYX0');
	assert.equal(ctx.calls[1].method, 'POST');
	assert.equal(ctx.calls[1].url, 'http://api.test/api/v1/qr-codes/CNrqFwwf/archive');
	assert.equal(output[1].json.status, 'archived');
	assert.deepEqual(output[1].pairedItem, { item: 1 });
});

test('Get Many applies filters and the limit, returning one item per code', async () => {
	const { ctx, output } = await run(
		{
			resource: 'qrCode',
			operation: 'getAll',
			returnAll: false,
			limit: 3,
			filters: { status: 'archived', folder: { mode: 'id', value: '6' } },
		},
		[
			ok({ data: [{ id: 'a' }, { id: 'b' }], meta: { next_cursor: 'c2' } }),
			ok({
				data: [{ id: 'c' }, { id: 'd', type: 'gs1_digital_link' }],
				meta: { next_cursor: null },
			}),
		],
	);
	assert.deepEqual(ctx.calls[0].qs, { status: 'archived', folder_id: 6 });
	assert.deepEqual(
		output.map((o) => o.json.id),
		['a', 'b', 'c'],
	);
	assert.ok(output.every((o) => o.pairedItem.item === 0));
});

test('Continue On Fail returns the error on the failing item and keeps going', async () => {
	const { output } = await run(
		[
			create({ type: 'url', url: 'https://openqr.io' }),
			create({ type: 'url', url: 'https://openqr.io' }),
		],
		[{ statusCode: 403, headers: {}, body: { message: 'Plan limit reached' } }, created()],
		{ continueOnFail: true },
	);
	assert.match(output[0].json.error, /Plan limit reached \[item 0\]/);
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.equal(output[1].json.id, 'km0yYX0');
});

test('the QR code list search filters by name and passes the cursor on', async () => {
	const ctx = makeContext(
		[{}],
		[
			ok({
				data: [
					{ id: 'a', name: 'Spring menu', type: 'url' },
					{ id: 'b', name: 'Office Wi-Fi', type: 'wifi_static' },
				],
				meta: { next_cursor: 'c2' },
			}),
		],
	);
	const result = await node.methods.listSearch.searchQrCodes.call(ctx, 'menu');
	assert.deepEqual(result, {
		results: [{ name: 'Spring menu (url, a)', value: 'a' }],
		paginationToken: 'c2',
	});
});

// Update: GET the live code first, keep what can be read back, replace content and design.
const live = (extra = {}) =>
	ok({
		data: {
			id: 'km0yYX0',
			name: 'Spring menu',
			type: 'url',
			qr_code_folder_id: 6,
			domain_id: 3,
			...extra,
		},
	});
const update = (extra) => ({
	resource: 'qrCode',
	operation: 'update',
	qrCodeId: { mode: 'list', value: 'km0yYX0' },
	type: 'url',
	...extra,
});

test('Update changing only the URL keeps the name, folder and domain', async () => {
	const { ctx, output } = await run(update({ url: 'https://openqr.io/new' }), [live(), created()]);
	assert.equal(ctx.calls[0].method, 'GET');
	assert.equal(ctx.calls[0].url, 'http://api.test/api/v1/qr-codes/km0yYX0');
	assert.equal(ctx.calls[1].method, 'POST');
	assert.equal(ctx.calls[1].url, 'http://api.test/api/v1/qr-codes/km0yYX0');
	assert.deepEqual(ctx.calls[1].body, {
		name: 'Spring menu',
		data: { url: 'https://openqr.io/new' },
		qr_code_folder_id: 6,
		domain_id: 3,
	});
	assert.equal(output[0].json.id, 'km0yYX0');
});

test('Update keeps null folder and domain as null', async () => {
	const { ctx } = await run(update({ url: 'https://openqr.io' }), [
		live({ qr_code_folder_id: null, domain_id: null }),
		created(),
	]);
	assert.equal(ctx.calls[1].body.qr_code_folder_id, null);
	assert.equal(ctx.calls[1].body.domain_id, null);
});

test('Update Fields override name, folder and domain, and Design is sent', async () => {
	const { ctx } = await run(
		update({
			url: 'https://openqr.io',
			updateFields: { name: 'Summer menu', folder: { mode: 'id', value: '9' }, domainId: 0 },
			design: { module: 'dots', foregroundColor: '#1f2937' },
		}),
		[live(), created()],
	);
	assert.deepEqual(ctx.calls[1].body, {
		name: 'Summer menu',
		data: { url: 'https://openqr.io' },
		qr_code_folder_id: 9,
		domain_id: null,
		design: { module: 'dots', foreground_color: '#1f2937' },
	});
});

test('Remove From Folder sends a null folder, even with a folder picked', async () => {
	const { ctx } = await run(
		update({
			url: 'https://openqr.io',
			updateFields: { removeFromFolder: true, folder: { mode: 'id', value: '9' } },
		}),
		[live(), created()],
	);
	assert.equal(ctx.calls[1].body.qr_code_folder_id, null);
});

test('Update stops after the GET when Type does not match the code', async () => {
	await assert.rejects(
		run(update({ type: 'url_static', url: 'https://openqr.io' }), [live()]),
		/type is url, but Type is set to url_static \[item 0\]/,
	);
});

test('Update stops on dashboard-only types such as pdf', async () => {
	await assert.rejects(
		run(update({ url: 'https://openqr.io' }), [live({ type: 'pdf' })]),
		/This pdf code can only be edited in the OpenQR\.io dashboard/,
	);
});

test('Update of a dynamic vCard keeps the current page unless a new one is given', async () => {
	const { ctx } = await run(
		[update({ type: 'vcard' }), update({ type: 'vcard', updateFields: { pageId: 15 } })],
		[live({ type: 'vcard' }), created(), live({ type: 'vcard' }), created()],
	);
	assert.deepEqual(ctx.calls[1].body.data, {});
	assert.equal('qr_page_id' in ctx.calls[1].body, false);
	assert.equal(ctx.calls[3].body.qr_page_id, 15);
});

test('Update checks a new name before sending', async () => {
	await assert.rejects(
		run(update({ url: 'https://openqr.io', updateFields: { name: 'Hi' } }), [live()]),
		/5 to 255 characters long/,
	);
});
