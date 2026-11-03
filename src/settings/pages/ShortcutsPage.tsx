import { Card } from "../../components/ui/card";
import { useT } from "../../core/i18n";
import { modules } from "../../modules";
import { Title } from "../components/Heading";
import { ShortcutRow } from "../components/ShortcutRow";

export function ShortcutsPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const actionNames = Object.fromEntries(
		modules.map((module) => [module.shortcut ?? `module:${module.id}`, t(module.title)]),
	);

	return (
		<>
			<Title>{t("shortcuts.title")}</Title>
			<Card>
				{modules.map((module) => (
					<ShortcutRow
						key={module.id}
						id={module.shortcut ?? `module:${module.id}`}
						values={values}
						actionLabel={t(module.title)}
						actionNames={actionNames}
					/>
				))}
			</Card>
		</>
	);
}
