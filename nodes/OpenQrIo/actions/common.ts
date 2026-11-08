import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/** The ` [item N]` suffix the UX guidelines ask for in error messages. */
export const suffix = (i: number) => ` [item ${i}]`;

/** Reads a resource locator value, whether it arrives as `{ mode, value }` or a plain value. */
export function locatorValue(raw: unknown): string {
	if (raw && typeof raw === 'object' && 'value' in raw) {
		return String((raw as { value: unknown }).value ?? '').trim();
	}
	return raw === undefined || raw === null ? '' : String(raw).trim();
}

export function folderIdFrom(this: IExecuteFunctions, raw: unknown, i: number): number | undefined {
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

/** Checks a QR code or folder name against the API's 5 to 255 character rule. */
export function checkName(this: IExecuteFunctions, name: string, i: number): void {
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
