import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Block, Desc, Row } from "../../../components/ui/card";
import { Chip, Chips } from "../../../components/ui/text";
import { providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { NOTIFICATIONS_PROVIDER, type NotificationsState } from "../types";

/** Access status, and the one-time setup that lets the island read notifications. */
export function NotificationsSettings() {
	const t = useT();
	const state = useProvider<NotificationsState>(NOTIFICATIONS_PROVIDER);
	const [busy, setBusy] = useState(false);
	const access = state?.access ?? "noIdentity";

	return (
		<Block>
			<Row label={t("notifications.access.title")} desc={t(`notifications.access.${access}`)}>
				{access === "noIdentity" && (
					<Button
						variant="primary"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							try {
								// Restarts the app on success.
								await providerAction(NOTIFICATIONS_PROVIDER, "enable");
							} catch {
								setBusy(false);
							}
						}}
					>
						{busy ? t("notifications.access.enabling") : t("notifications.access.enable")}
					</Button>
				)}
				{access === "denied" && (
					<Button onClick={() => providerAction(NOTIFICATIONS_PROVIDER, "openPrivacy")}>
						{t("notifications.access.openPrivacy")}
					</Button>
				)}
				{access === "allowed" && (
					<Chips>
						<Chip ok>{t("notifications.access.on")}</Chip>
					</Chips>
				)}
			</Row>
			{access === "noIdentity" && <Desc>{t("notifications.access.how")}</Desc>}
			{state?.error && (
				<>
					<Desc tone="error">{state.error}</Desc>
					<Button
						style={{ alignSelf: "flex-start" }}
						onClick={() => providerAction(NOTIFICATIONS_PROVIDER, "openDeveloper")}
					>
						{t("notifications.access.openDeveloper")}
					</Button>
				</>
			)}
		</Block>
	);
}
