import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenQrIoApi implements ICredentialType {
	name = 'openQrIoApi';

	displayName = 'OpenQR.io API';

	icon: Icon = {
		light: 'file:../nodes/OpenQrIo/openQrIo.svg',
		dark: 'file:../nodes/OpenQrIo/openQrIo.dark.svg',
	};

	documentationUrl = 'https://docs.openqr.io/#tag/Authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create a key at dashboard.openqr.io under your user menu, then API Keys. The key is shown only once.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://api.openqr.io/api/v1',
			description: 'Leave this as it is unless OpenQR support gives you a different address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(new RegExp("/+$"), "")}}',
			url: '/users',
			method: 'GET',
		},
	};
}
