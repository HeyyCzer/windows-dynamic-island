import { Card } from "../../components/ui/card";
import { useT } from "../../core/i18n";
import { moduleShortcutId } from "../../core/shortcuts";
import { modules } from "../../modules";
import { Lead, Title } from "../components/Heading";
import { ShortcutRow } from "../components/ShortcutRow";

/** Every module's global shortcut in one list (each module's page has its own too). */
export function ShortcutsPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	return (
		<>
			<Title>{t("shortcuts.title")}</Title>
			<Lead>{t("shortcuts.desc")}</Lead>
			<Card>
				{modules.map((module) => (
					<ShortcutRow
						key={module.id}
						id={moduleShortcutId(module)}
						values={values}
						label={t(module.title)}
						icon={module.settingsIcon}
						hint={false}
					/>
				))}
			</Card>
		</>
	);
}
