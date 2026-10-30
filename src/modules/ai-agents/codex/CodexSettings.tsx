import { Block, Row } from "../../../components/ui/card";
import { Chip, Chips } from "../../../components/ui/text";
import { useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { type CodexState, PROVIDER } from "./useCodex";

/** Codex needs no setup: just says whether its sessions were found. */
export function CodexSettings() {
	const state = useProvider<Pick<CodexState, "available">>(PROVIDER);
	const t = useT();
	const found = !!state?.available;

	return (
		<Block>
			<Row label={t("codex.integration.title")} desc={t("codex.integration.desc", { dir: "~/.codex/sessions" })}></Row>
			<Chips>
				<Chip ok={!!found}>{found ? t("codex.integration.found") : t("codex.integration.missing")}</Chip>
			</Chips>
		</Block>
	);
}
