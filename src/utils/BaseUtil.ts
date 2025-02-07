export function copySerializable<T>(objectToCopy: T): T {
	return JSON.parse(JSON.stringify(objectToCopy));
}

export async function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
