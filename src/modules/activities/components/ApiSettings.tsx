import { Block, Desc, Row } from "../../../components/ui/card";
import { Chip, Chips, Code } from "../../../components/ui/text";
import { useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { ACTIVITIES_PROVIDER, type ActivitiesState } from "../types";

/** Where the local API listens, with a ready-to-paste example. */
export function ApiSettings() {
	const t = useT();
	const state = useProvider<ActivitiesState>(ACTIVITIES_PROVIDER);
	const port = state?.apiPort;
	const example = `curl -X POST http://127.0.0.1:${port ?? 5199}/notify -H "Content-Type: application/json" -d "{\\"title\\":\\"Deploy done\\",\\"icon\\":\\"check\\",\\"color\\":\\"#30D158\\"}"`;
	return (
		<Block>
			<Row label={t("activities.server.title")} desc={t("activities.server.desc")}>
				<Chips>
					<Chip ok={!!port}>{port ? `127.0.0.1:${port}` : t("activities.server.down")}</Chip>
				</Chips>
			</Row>
			<Code>{example}</Code>
			<Desc>{t("activities.server.routes")}</Desc>
		</Block>
	);
}
