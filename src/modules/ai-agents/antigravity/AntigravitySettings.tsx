import { Button } from "../../../components/ui/button";
import { Block, Row } from "../../../components/ui/card";
import { Input } from "../../../components/ui/form";
import { Chip, Chips } from "../../../components/ui/text";
import { providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { type AntigravityState, PROVIDER } from "./useAntigravity";

/** Antigravity's exe (the default install unless changed) and whether it was found. */
export function AntigravitySettings() {
	const state = useProvider<Pick<AntigravityState, "available" | "exe" | "defaultExe">>(PROVIDER);
	const t = useT();

	// Empty or the default path: back to following the default install.
	const save = (exe: string) => {
		const path = exe.trim();
		if (path === state?.exe) return;
		providerAction(PROVIDER, "setExe", path && path !== state?.defaultExe ? path : null);
	};
	const pick = async () => {
		const exe = await providerAction<string | null>(PROVIDER, "pickExe");
		if (exe) save(exe);
	};

	return (
		<Block>
			<Row label={t("antigravity.integration.title")} desc={t("antigravity.integration.desc")} />
			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					save(new FormData(e.currentTarget).get("exe") as string);
				}}
			>
				{/* Keyed: shows the new path once the backend took it (picked, reset…). */}
				<Input
					key={state?.exe}
					name="exe"
					className="flex-1"
					defaultValue={state?.exe}
					placeholder={state?.defaultExe}
					spellCheck={false}
					onBlur={(e) => save(e.target.value)}
				/>
				<Button type="button" onClick={pick}>
					{t("antigravity.integration.choose")}
				</Button>
			</form>
			<Chips>
				<Chip ok={!!state?.available}>
					{state?.available ? t("antigravity.integration.found") : t("antigravity.integration.missing")}
				</Chip>
			</Chips>
		</Block>
	);
}
