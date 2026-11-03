import { Collapsible } from "../../../../components/ui/card";
import type { AgentDefinition } from "../types";

/** Each agent's settings folded under its own name. */
export function AgentsSettings({ agents }: { agents: AgentDefinition[] }) {
	return (
		<>
			{agents.map(
				(a) =>
					a.SettingsSection && (
						<Collapsible
							key={a.id}
							title={a.name}
							icon={
								<span className="flex text-(--agent)" style={{ "--agent": a.color } as React.CSSProperties}>
									<a.Icon size={16} />
								</span>
							}
						>
							<a.SettingsSection />
						</Collapsible>
					),
			)}
		</>
	);
}
