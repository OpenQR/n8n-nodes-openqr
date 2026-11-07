import type { INodePropertyOptions } from 'n8n-workflow';

/** The 18 types that `POST /qr-codes` accepts. Lists can also return dashboard-only types. */
export const QR_CODE_TYPES = [
	'call',
	'call_static',
	'email',
	'email_static',
	'event',
	'event_static',
	'geo',
	'geo_static',
	'sms',
	'sms_static',
	'text',
	'text_static',
	'url',
	'url_static',
	'vcard',
	'vcard_static',
	'wifi',
	'wifi_static',
] as const;

export type QrCodeType = (typeof QR_CODE_TYPES)[number];

const LABELS: Record<string, string> = {
	call: 'Call',
	email: 'Email',
	event: 'Event',
	geo: 'Location',
	sms: 'SMS',
	text: 'Text',
	url: 'URL',
	vcard: 'vCard',
	wifi: 'Wi-Fi',
};

const DYNAMIC_HINTS: Record<string, string> = {
	call: 'Calls a phone number. Can be changed later and reports scans.',
	email: 'Opens a new email. Can be changed later and reports scans.',
	event: 'Opens an event landing page built in the OpenQR.io dashboard. Reports scans.',
	geo: 'Opens a map location. Can be changed later and reports scans.',
	sms: 'Opens a new SMS. Can be changed later and reports scans.',
	text: 'Shows plain text. Can be changed later and reports scans.',
	url: 'Opens a website. Can be redirected later and reports scans.',
	vcard: 'Opens a contact landing page built in the OpenQR.io dashboard. Reports scans.',
	wifi: 'Joins a Wi-Fi network. Can be changed later and reports scans.',
};

const STATIC_HINTS: Record<string, string> = {
	call: 'Calls a phone number. Fixed once printed, no scan stats.',
	email: 'Opens a new email. Fixed once printed, no scan stats.',
	event: 'Adds an event to the calendar. Fixed once printed, no scan stats.',
	geo: 'Opens a map location. Fixed once printed, no scan stats.',
	sms: 'Opens a new SMS. Fixed once printed, no scan stats.',
	text: 'Shows plain text. Fixed once printed, no scan stats.',
	url: 'Opens a website. Fixed once printed, no scan stats.',
	vcard: 'Saves a contact. Fixed once printed, no scan stats.',
	wifi: 'Joins a Wi-Fi network. Fixed once printed, no scan stats.',
};

export function isStaticType(type: string): boolean {
	return type.endsWith('_static');
}

export function baseType(type: string): string {
	return type.replace(/_static$/, '');
}

export const qrCodeTypeOptions: INodePropertyOptions[] = QR_CODE_TYPES.map((type) => {
	const base = baseType(type);
	const isStatic = isStaticType(type);
	return {
		name: `${LABELS[base]} (${isStatic ? 'Static' : 'Dynamic'})`,
		value: type,
		description: isStatic ? STATIC_HINTS[base] : DYNAMIC_HINTS[base],
	};
});
