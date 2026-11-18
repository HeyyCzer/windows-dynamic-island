# Security policy

## Supported versions

Only the latest release gets security fixes. The app updates itself, so a fix reaches users with the next release.

| Version          | Supported |
| ---------------- | --------- |
| Latest release   | Yes       |
| Older releases   | No        |

## Reporting a vulnerability

**Please don't open a public issue or pull request for a security problem.** Until a fixed release is out, a public report shows everyone how to attack people running the app.

Report it privately through GitHub instead: **[Report a vulnerability](https://github.com/HeyyCzer/windows-dynamic-island/security/advisories/new)** (Security tab → Report a vulnerability). Only the maintainer sees the report.

Please include:

- what an attacker can do, and what they need first (a web page the user visits, a local program, a file the user opens…);
- the steps or a proof of concept, and the version you tested;
- a fix, if you have one. It can be shared in the advisory's private fork instead of a public pull request.

You can expect a first answer within a week. Once a fix is released, the advisory is published, crediting you unless you'd rather not be named.

## Scope

The island runs with the user's rights and touches sensitive things, so these are in scope:

- the local HTTP servers (the activities API and the Claude Code hooks server): requests from web pages or from other users;
- credentials the app reads or stores (Claude Code's OAuth token, the GitHub token in the Windows Credential Manager, Spotify);
- paths and files taken from outside input (hook payloads, the shelf, the clipboard, plugins);
- the updater and the installers.

Out of scope: problems that need an attacker who already runs code as the same Windows user, and bugs in third-party apps or services the island only displays.
