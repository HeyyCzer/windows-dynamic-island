import icon from "../../../assets/antigravity-icon.svg";

export function AntigravityIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
	return <img src={icon} width={size} height={size} className={className} alt="Antigravity" />;
}
