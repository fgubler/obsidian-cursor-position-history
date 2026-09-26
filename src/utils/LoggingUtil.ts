export function serializeError(error: unknown, printStack: boolean = false): string {
	if (!error) {
		return '[empty-error]';
	} else if (typeof error === 'string') {
		return error;
	} else if (error instanceof Error) {
		return serializeErrorObject(error, printStack);
	} else {
		const attempt = JSON.stringify(error);
		if (attempt === '{}') {
			return serializeErrorObject(error, printStack);
		} else {
			return attempt;
		}
	}
}

function serializeErrorObject(error: unknown, printStack: boolean): string {
	const serializableError: SerializableError = {};

	if (isRecord(error)) {
		if ('message' in error) {
			serializableError.message = error.message ?? '[no message]';
		}
		if ('stack' in error) {
			const stackTrace = error.stack ?? '[no stack]';
			serializableError.stack = printStack ? stackTrace : '[removed]';
		}
		if ('cause' in error) {
			serializableError.cause = serializeError(error.cause, printStack);
		}
	}

	return JSON.stringify(serializableError);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

interface SerializableError {
	message?: unknown;
	stack?: unknown;
	cause?: string;
}
