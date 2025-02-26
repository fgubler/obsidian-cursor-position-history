export function copySerializable<T>(objectToCopy: T): T {
	return JSON.parse(JSON.stringify(objectToCopy));
}
