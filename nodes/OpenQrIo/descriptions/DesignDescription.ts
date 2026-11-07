import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';

const shape = (value: string, name?: string): INodePropertyOptions => ({
	name:
		name ??
		value
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' '),
	value,
});

const moduleShapes: INodePropertyOptions[] = [
	shape('diamond'),
	shape('dots'),
	shape('fish'),
	shape('fourTriangles', 'Four Triangles'),
	shape('horizontal-lines'),
	shape('rhombus'),
	shape('roundness', 'Rounded'),
	shape('square'),
	shape('star-5', 'Star (5 Points)'),
	shape('star-7', 'Star (7 Points)'),
	shape('tree'),
	shape('triangle'),
	shape('triangle-end'),
	shape('twoTrianglesWithCircle', 'Two Triangles With Circle'),
	shape('vertical-lines'),
];

const finderShapes: INodePropertyOptions[] = [
	shape('circle'),
	shape('circle-dots'),
	shape('default', 'Square'),
	shape('dotted-square'),
	shape('eye-shaped'),
	shape('octagon'),
	shape('rounded-corners'),
	shape('rounded-square'),
	shape('rounded-top-right'),
	shape('tilted-square'),
	shape('twisted-star'),
	shape('water-drop'),
	shape('wavy-square'),
	shape('whirlpool'),
	shape('zigzag'),
];

const finderDotShapes: INodePropertyOptions[] = [
	shape('circle'),
	shape('default', 'Square'),
	shape('distorted-square'),
	shape('eye-shaped'),
	shape('octagon'),
	shape('rounded-corners'),
	shape('tilted-square'),
	shape('water-drop'),
	shape('whirlpool'),
	shape('zigzag'),
];

/** Design collection shared by Create, Preview, Save Preview and (later) Update. */
export function designCollection(show: Record<string, string[]>): INodeProperties {
	return {
		displayName: 'Design',
		name: 'design',
		type: 'collection',
		placeholder: 'Add Design Option',
		default: {},
		description: 'How the QR code looks. Anything left out uses the OpenQR.io default.',
		displayOptions: { show },
		options: [
			{
				displayName: 'Background Color',
				name: 'backgroundColor',
				type: 'color',
				default: '#FFFFFF',
			},
			{
				displayName: 'Corner Inner Color',
				name: 'eyeInternalColor',
				type: 'color',
				default: '#000000',
				description: 'Color of the inner dot of the three corner markers',
			},
			{
				displayName: 'Corner Inner Shape',
				name: 'finderDot',
				type: 'options',
				options: finderDotShapes,
				default: 'default',
				description: 'Shape of the inner dot of the three corner markers',
			},
			{
				displayName: 'Corner Outer Color',
				name: 'eyeExternalColor',
				type: 'color',
				default: '#000000',
				description: 'Color of the outer part of the three corner markers',
			},
			{
				displayName: 'Corner Outer Shape',
				name: 'finder',
				type: 'options',
				options: finderShapes,
				default: 'default',
				description: 'Shape of the outer part of the three corner markers',
			},
			{
				displayName: 'Foreground Color',
				name: 'foregroundColor',
				type: 'color',
				default: '#000000',
				description: 'Color of the modules, the small squares that make up the code',
			},
			{
				displayName: 'Frame',
				name: 'frame',
				type: 'options',
				options: [
					{ name: 'Arrow, Text Below', value: 'arrow-text-bottom-frame' },
					{ name: 'Border, Text Above', value: 'border-around-text-top' },
					{ name: 'Border, Text Below', value: 'border-around-text-bottom' },
					{ name: 'None', value: 'none' },
					{ name: 'Text Above', value: 'simple-text-top' },
					{ name: 'Text Below', value: 'simple-text-bottom' },
				],
				default: 'none',
				description: 'Frame around the code, with a call to action such as "SCAN ME"',
			},
			{
				displayName: 'Frame Color',
				name: 'frameColor',
				type: 'color',
				default: '#000000',
			},
			{
				displayName: 'Frame Font Family',
				name: 'frameFontFamily',
				type: 'string',
				default: 'Raleway',
				placeholder: 'e.g. Raleway',
				description: 'A Google Fonts family name. Letters, numbers and spaces only.',
			},
			{
				displayName: 'Frame Font Variant',
				name: 'frameFontVariant',
				type: 'string',
				default: '',
				placeholder: 'e.g. 700',
				description: 'Font weight or style, such as regular, 700 or 900italic',
			},
			{
				displayName: 'Frame Text',
				name: 'frameText',
				type: 'string',
				default: 'SCAN ME',
			},
			{
				displayName: 'Frame Text Background Color',
				name: 'frameTextBackgroundColor',
				type: 'color',
				default: '#000000',
			},
			{
				displayName: 'Frame Text Color',
				name: 'frameTextColor',
				type: 'color',
				default: '#000000',
			},
			{
				displayName: 'Frame Text Size',
				name: 'frameTextSize',
				type: 'options',
				options: [
					{ name: 'Small', value: 0 },
					{ name: 'Medium', value: 1 },
					{ name: 'Large', value: 2 },
				],
				default: 0,
			},
			{
				displayName: 'Logo Background Color',
				name: 'logoBackgroundFill',
				type: 'color',
				default: '#FFFFFF',
				description: 'Color of the area behind the logo',
			},
			{
				displayName: 'Logo Background Shape',
				name: 'logoBackgroundShape',
				type: 'options',
				options: [
					{ name: 'Circle', value: 'circle' },
					{ name: 'Square', value: 'square' },
				],
				default: 'circle',
				description: 'Shape of the area behind the logo',
			},
			{
				displayName: 'Logo Name or ID',
				name: 'logoId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLogos' },
				default: '',
				description:
					'Logo in the middle of the code. Upload your own with Logo > Upload. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Module Shape',
				name: 'module',
				type: 'options',
				options: moduleShapes,
				default: 'square',
				description: 'Shape of the modules, the small squares that make up the code',
			},
			{
				displayName: 'Transparent Background',
				name: 'transparentBackground',
				type: 'boolean',
				default: false,
				description: 'Whether to leave out the background. Overrides Background Color.',
			},
		],
	};
}

/** Maps the Design collection to the API's `design` object, leaving out anything not set. */
export function toApiDesign(design: IDataObject): IDataObject | undefined {
	const map: Record<string, string> = {
		backgroundColor: 'background_color',
		foregroundColor: 'foreground_color',
		eyeExternalColor: 'eye_external_color',
		eyeInternalColor: 'eye_internal_color',
		module: 'module',
		finder: 'finder',
		finderDot: 'finder_dot',
		frame: 'frame',
		frameColor: 'frame_color',
		frameText: 'frame_text',
		frameTextColor: 'frame_text_color',
		frameTextBackgroundColor: 'frame_text_background_color',
		frameTextSize: 'frame_text_size',
		frameFontFamily: 'frame_font_family',
		frameFontVariant: 'frame_font_variant',
		logoId: 'logo_id',
		logoBackgroundFill: 'logo_background_fill',
		logoBackgroundShape: 'logo_background_shape',
	};

	const result: IDataObject = {};
	for (const [param, key] of Object.entries(map)) {
		const value = design[param];
		if (value === undefined || value === null || value === '') continue;
		result[key] = value;
	}
	if (design.transparentBackground === true) result.background_color = 'transparent';

	return Object.keys(result).length > 0 ? result : undefined;
}
