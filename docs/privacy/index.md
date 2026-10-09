# Privacy Policy — Dynamic Island for Windows

*Last updated: October 8, 2026*

Dynamic Island for Windows ("the app") is a free, open-source desktop app published at [github.com/HeyyCzer/windows-dynamic-island](https://github.com/HeyyCzer/windows-dynamic-island). This policy explains what data the app touches, where it goes and how to remove it.

## The short version

- The app runs entirely on your computer. **There is no server of ours**: no account, no analytics, no telemetry, no ads, no crash reporting.
- We (the developers) **never receive any of your data**.
- When a feature needs an online service (Google Calendar, GitHub, Anthropic, YouTube, update checks), the app talks to that service directly from your computer, and only after you turn that feature on.
- We do not sell, rent or share your data with anyone.

## What stays on your computer

| Data | Where | Why |
| --- | --- | --- |
| Settings | `%APPDATA%\com.heyyczer.dynamicisland\settings.json` | Remember your preferences |
| Tokens and private links (Google Calendar refresh token, GitHub token, private calendar feed URLs) | Windows Credential Manager | Keep secrets out of plain-text files |
| Shelf items (paths to files you dropped, not the files) | `%APPDATA%\com.heyyczer.dynamicisland\shelf.json` | Keep the shelf between restarts |
| Screenshots and attachments for Ask Claude, clipboard pictures | `%APPDATA%\com.heyyczer.dynamicisland\` and, when you choose to keep a picture, *Pictures\Screenshots* | Attach them to a question or let you drag them out |
| Calendar events, clipboard text, mirrored notifications, now-playing info, system stats, the text read off the screen by Find on screen | Memory only | Show them in the island; gone when the app closes |

The app reads, without uploading anywhere, information Windows and other apps already keep on your computer: media playback info, Windows notifications (only after you enable the Notifications module), the clipboard (anything copied by password managers is ignored), battery, volume, Bluetooth devices, performance counters, and Claude Code's local transcripts and settings in `~/.claude`.

## Online services

Each one is used only when the related module is enabled.

### Google Calendar

If you click **Connect Google Calendar**, you sign in on Google's own page and grant the app the read-only scope `https://www.googleapis.com/auth/calendar.readonly`.

- **What is accessed:** your calendar list (name, color, whether it is selected/primary) and events within a short window around today (title, start/end, location, description, status, meeting links).
- **How it is used:** only to show your upcoming events and meeting links inside the island. The app cannot create, change or delete anything in your calendar.
- **Where it goes:** requests go directly from your computer to Google (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`). Event data is kept in memory only and is never written to disk or sent to anyone else, including us.
- **Storage:** only the OAuth refresh token is stored, in the Windows Credential Manager.
- **Disconnecting:** **Disconnect** in the app revokes the token with Google and deletes it from your computer. You can also revoke access at any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

The app's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Google user data is not used for advertising, is not sold, is not transferred to third parties, is not used to train AI models, and is not read by humans.

### Calendar feeds (iCal)

Calendar links you add are fetched directly from the server that hosts them. The links are stored in the Windows Credential Manager.

### GitHub

To count open issues for the repositories you follow, the app calls `api.github.com`, anonymously or with your GitHub CLI login or a token you provide (stored in the Windows Credential Manager).

### Claude Code and Anthropic

- **Plan limits:** the app sends the OAuth token that Claude Code already keeps in `~/.claude/.credentials.json` to `api.anthropic.com` only, to read your usage limits.
- **Ask Claude:** questions, and any screenshot or file you attach, are passed to the Claude Code CLI (`claude -p`) installed on your computer, which sends them to Anthropic under your own Claude account. [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) applies to that.
- **Integration:** when you enable it, the app adds hooks and a statusline bridge to `~/.claude/settings.json` (with a backup). These send session status only to the app itself on `127.0.0.1`.

### YouTube

To play a muted copy of a YouTube video you are watching in your browser, the app searches `youtube.com` for the current track's title and artist. YouTube's privacy policy applies to that request.

### Updates

The app checks GitHub Releases for new versions. GitHub sees a normal download request (such as your IP address), as with any website.

### Local API

The app listens on `127.0.0.1:5199`, reachable only from your own computer, so your scripts can send it alerts.

## Third-party services

When the app talks to Google, GitHub, Anthropic or YouTube, those companies process the request under their own privacy policies. We have no access to that data.

## Deleting your data

- Disconnect Google Calendar or remove GitHub tokens and feeds in **Settings**.
- Uninstall the app and delete `%APPDATA%\com.heyyczer.dynamicisland`.
- Disabling the Claude Code integration in **Settings** restores your previous `~/.claude/settings.json`.

## Children

The app is not directed at children under 13 and does not knowingly collect data from them.

## Changes

Changes to this policy are published in this file, with the date at the top updated. The full history is in the repository's commit log.

## Contact

Questions or requests: open an issue at [github.com/HeyyCzer/windows-dynamic-island/issues](https://github.com/HeyyCzer/windows-dynamic-island/issues).
