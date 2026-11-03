/** Obsidian's common date tokens, in local time, without a date-library bundle. */
export function dailyNoteName(date: Date, format = "YYYY-MM-DD") {
	const pattern = format.trim() || "YYYY-MM-DD";
	const tokens: Record<string, string> = {
		YYYY: String(date.getFullYear()),
		MM: String(date.getMonth() + 1).padStart(2, "0"),
		DD: String(date.getDate()).padStart(2, "0"),
	};
	const name = pattern.replace(/YYYY|MM|DD/g, (token) => tokens[token]);
	if (
		/[A-Za-z<>:"|?*]/.test(name) ||
		Array.from(name).some((char) => char.charCodeAt(0) < 32) ||
		/(^|[\\/])\.{1,2}([\\/]|$)/.test(name) ||
		/^[\\/]/.test(name) ||
		/[\\/]$/.test(name)
	)
		throw Error("日记命名仅支持 YYYY、MM、DD 及相对路径分隔符，不能包含非法文件名字符");
	return name.replace(/\\/g, "/");
}

/** A unique quick-capture filename that starts with the configured date pattern. */
export function quickCaptureName(date: Date, format = "YYYY-MM-DD") {
	const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join("-");
	return `${dailyNoteName(date, format)}-${time}`;
}
