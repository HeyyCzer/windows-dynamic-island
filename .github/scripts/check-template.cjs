// Checks that a pull request or issue follows its template (used by
// .github/workflows/template.yml through actions/github-script).
//
// Off-template: adds the `invalid` label and a comment listing what's missing.
// Fixed on a later edit: removes the label and updates that comment.

const LABEL = "invalid";
// Finds the comment this check left, to edit it instead of piling up new ones.
const MARKER = "<!-- template-check -->";
// The repo owner may skip the templates.
const EXEMPT = ["OWNER"];

/** `text` without HTML comments, repeated until none is left (removing one can form another, as in `<!<!-- -->-- -->`). */
function stripComments(text) {
	let previous;
	let current = text;
	do {
		previous = current;
		current = current.replace(/<!--[\s\S]*?-->/g, "");
	} while (current !== previous);
	return current;
}

/** Text under each `## `/`### ` heading, by heading; HTML comments dropped. */
function sections(body) {
	const map = new Map();
	let current = null;
	for (const line of stripComments(body ?? "").replace(/\r/g, "").split("\n")) {
		const heading = line.match(/^#{2,3}\s+(.*?)\s*$/);
		if (heading) {
			current = heading[1].toLowerCase();
			map.set(current, "");
		} else if (current !== null) {
			map.set(current, `${map.get(current)}${line}\n`);
		}
	}
	for (const [k, v] of map) map.set(k, v.trim());
	return map;
}

/** Problems with a pull request, against .github/pull_request_template.md. */
function checkPull(body) {
	const s = sections(body);
	const problems = [];
	const what = s.get("what does this pr do?");
	const type = s.get("type of change");
	const checklist = s.get("checklist");

	if (what === undefined) problems.push("The **What does this PR do?** section is missing.");
	else if (!what) problems.push("**What does this PR do?** is empty: describe the change.");

	if (type === undefined) problems.push("The **Type of change** section is missing.");
	else if (!/^\s*- \[[xX]\]/m.test(type)) problems.push("Tick at least one box under **Type of change**.");

	if (checklist === undefined) problems.push("The **Checklist** section is missing.");
	else if (!/^\s*- \[[ xX]\]/m.test(checklist))
		problems.push("The **Checklist** items were removed: keep them and tick the ones you did.");

	return { problems, template: "pull_request_template.md", kind: "pull request template" };
}

// The required fields of each issue form in .github/ISSUE_TEMPLATE, by their labels.
const ISSUE_FORMS = [
	{
		file: "bug_report.yml",
		required: [
			"What happened?",
			"What did you expect to happen?",
			"Steps to reproduce",
			"Module",
			"App version",
			"Installed from",
			"Windows version",
		],
	},
	{
		file: "feature_request.yml",
		required: ["What problem would it solve?", "What would you like to happen?"],
	},
];

/** Problems with an issue: it must come from one of the forms, with the required fields filled in. */
function checkIssue(body) {
	const s = sections(body);
	const form = ISSUE_FORMS.find((f) => s.has(f.required[0].toLowerCase()));
	if (!form) {
		return {
			problems: ["It wasn't opened from one of the issue templates (bug report or feature request)."],
			template: "ISSUE_TEMPLATE",
			kind: "issue templates",
		};
	}
	const problems = form.required.flatMap((field) => {
		const value = s.get(field.toLowerCase());
		if (value === undefined) return [`The **${field}** section is missing.`];
		// Forms write "_No response_" for a field left empty.
		if (!value || value === "_No response_") return [`**${field}** is empty.`];
		return [];
	});
	return { problems, template: `ISSUE_TEMPLATE/${form.file}`, kind: "issue template" };
}

/** The PR or issue to check: from the event, or `number` when run by hand. */
async function target(github, context) {
	if (context.eventName !== "workflow_dispatch") {
		const item = context.payload.pull_request ?? context.payload.issue;
		return { item, isPull: !!context.payload.pull_request };
	}
	const issue_number = Number(context.payload.inputs.number);
	// Issues and pull requests share the numbering, and this endpoint serves both.
	const { data } = await github.rest.issues.get({ ...context.repo, issue_number });
	return { item: data, isPull: !!data.pull_request };
}

module.exports = async ({ github, context, core }) => {
	const { item, isPull } = await target(github, context);
	if (item.user.type === "Bot" || EXEMPT.includes(item.author_association)) {
		core.info(`Skipped: opened by ${item.user.login} (${item.author_association}).`);
		return;
	}

	const { problems, template, kind } = isPull ? checkPull(item.body) : checkIssue(item.body);
	const { owner, repo } = context.repo;
	const issue_number = item.number;
	const labels = item.labels.map((l) => l.name);
	const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number });
	const previous = comments.find((c) => c.user.type === "Bot" && c.body.includes(MARKER));
	const what = isPull ? "PR" : "issue";

	if (problems.length) {
		if (!labels.includes(LABEL)) await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [LABEL] });
		const url = `https://github.com/${owner}/${repo}/blob/${context.payload.repository.default_branch}/.github/${template}`;
		const body = [
			MARKER,
			`Hi @${item.user.login}, thanks for the ${what}! It doesn't follow the [${kind}](${url}) yet:`,
			"",
			...problems.map((p) => `- ${p}`),
			"",
			`Please edit the description to follow the template. It's checked again on every edit, and the \`${LABEL}\` label goes away once it passes.`,
		].join("\n");
		if (previous) await github.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
		else await github.rest.issues.createComment({ owner, repo, issue_number, body });
		core.setFailed(`The ${what} doesn't follow the template:\n${problems.join("\n")}`);
		return;
	}

	// Only after this check flagged it: a maintainer may have set the label for another reason.
	if (previous) {
		if (labels.includes(LABEL)) await github.rest.issues.removeLabel({ owner, repo, issue_number, name: LABEL });
		await github.rest.issues.updateComment({
			owner,
			repo,
			comment_id: previous.id,
			body: `${MARKER}\n✅ The ${what} follows the template now, thanks!`,
		});
	}
};

module.exports.checkPull = checkPull;
module.exports.checkIssue = checkIssue;
