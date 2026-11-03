import { queryEverything } from "../src/core/plugins/everythingClient";
import { fetchNavoPathSummary, fetchNavoPathTasks } from "../src/core/plugins/navopathMcp";
import { fetchRecentNotes } from "../src/core/plugins/obsidianClient";
import { dailyNoteName } from "../src/core/plugins/obsidianDailyNote";
import { readVpnSnapshot, vpnConfig } from "../src/core/plugins/vpnClient";

export async function diagnoseNavoPath(settings:Record<string,unknown>) {
	const endpoint=String(settings.mcpEndpoint||"https://navopath-mcp.shawn89890916.workers.dev/mcp");
	const token=String(settings.token||"").trim();if(!token)throw Error("请先填写个人 Token");
	const [summary]=await Promise.all([fetchNavoPathSummary(endpoint,token),fetchNavoPathTasks(endpoint,token,1)]);
	return {status:"success" as const,message:`连接正常，日历共用此配置：${summary.projects} 个项目，${summary.openTasks} 项待办。`};
}
export async function diagnoseVpn(settings:Record<string,unknown>) {
	const state=await readVpnSnapshot(vpnConfig(settings));
	return {status:"success" as const,message:`控制器读取正常：${Object.keys(state.proxies).length} 个节点/策略组，模式 ${state.mode}；本次只读，不切换节点。`};
}
export async function diagnoseObsidian(settings:Record<string,unknown>) {
	const path=String(settings.vaultPath||"");const vault=String(settings.vaultName||path.split(/[\\/]/).pop()||"");
	const name=dailyNoteName(new Date(),String(settings.dailyDateFormat||"YYYY-MM-DD"));
	const notes=await fetchRecentNotes(vault,Number(settings.httpPort||8080),path);
	return {status:"success" as const,message:`索引读取正常：${notes.length} 条近期笔记。今日日记预览 ${name}.md；未创建或打开文件。`};
}
export async function diagnoseEverything(settings:Record<string,unknown>) {
	const result=await queryEverything("",Number(settings.httpPort||8080),1);
	if(!result.ok)throw Error(result.error||"Everything 不可用");
	return {status:"success" as const,message:`Everything 读取正常：已索引 ${result.total} 项。`};
}
