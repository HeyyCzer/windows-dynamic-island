import { useState } from "react";

/**
 * `useState` kept in this window's localStorage under `key`: for view state
 * that's only a convenience (folded panels and the like), not a setting.
 */
export function usePersisted<T>(key: string, initial: T) {
	const [value, setValue] = useState<T>(() => {
		const saved = localStorage.getItem(key);
		return saved === null ? initial : (JSON.parse(saved) as T);
	});
	const set = (next: T) => {
		localStorage.setItem(key, JSON.stringify(next));
		setValue(next);
	};
	return [value, set] as const;
}
