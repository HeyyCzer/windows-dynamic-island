# Privacy Policy — Island for Windows

*Last updated: October 26, 2026*

Island for Windows ("the app") is a free, open-source desktop app published at [github.com/HeyyCzer/windows-island](https://github.com/HeyyCzer/windows-island). This policy explains what data the app touches, where it goes and how to remove it.

## The short version

- The app runs entirely on your computer. **There is no server of ours**: no account, no analytics, no telemetry, no ads, no crash reporting.
- We (the developers) **never receive any of your data**.
- When a feature needs an online service (Google Calendar, Spotify, GitHub, Anthropic, YouTube, update checks), the app talks to that service directly from your computer, and only after you turn that feature on.
- We do not sell, rent or share your data with anyone.

## What stays on your computer

| Data | Where | Why |
| --- | --- | --- |
| Settings | `%APPDATA%\com.heyyczer.dynamicisland\settings.json` | Remember your preferences |
| Tokens and private links (Google Calendar and Spotify refresh tokens, GitHub token, private calendar feed URLs) | Windows Credential Manager | Keep secrets out of plain-text files |
| Shelf items (paths to files you dropped, not the files) | `%APPDATA%\com.heyyczer.dynamicisland\shelf.json` | Keep the shelf between restarts |
| Screenshots and attachments for Ask Claude, clipboard pictures | `%APPDATA%\com.heyyczer.dynamicisland\` and, when you choose to keep a picture, *Pictures\Screenshots* | Attach them to a question or let you drag them out |
| Calendar events, clipboard text, mirrored notifications, now-playing info, system stats, the text read off the screen by Find on screen | Memory only | Show them in the island; gone when the app closes |

The app reads, without uploading anywhere, information Windows and other apps already keep on your computer: media playback info, Windows notifications (only after you enable the Notifications module), the clipboard (anything copied by password managers is ignored), battery, volume, Bluetooth devices, performance counters, and Claude Code's local transcripts and settings in `~/.claude`.

## How your data is protected

Because the app has no server, none of your data ever reaches us, so there is no database of ours that could leak. On your computer and on the way to the services you connect, the app protects it like this:

- **Encrypted in transit.** Every request to Google, GitHub, Anthropic and YouTube uses HTTPS (TLS). Google user data is never sent over an unencrypted connection.
- **Encrypted at rest.** Secrets (the Google refresh token, the GitHub token and private calendar feed URLs) are kept only in the Windows Credential Manager, which encrypts them with Windows Data Protection (DPAPI) tied to your Windows user account. They are never written to settings files, logs or any other plain-text file, and other Windows users on the same computer cannot read them.
- **Secure sign-in.** Google sign-in happens on Google's own page; the app never sees your password. It uses OAuth with PKCE (S256) and a random `state` value, and the browser returns to a one-time server on `127.0.0.1` (a random port, reachable only from your computer) that closes as soon as sign-in finishes or after three minutes.
- **Least privilege.** The app requests only the read-only scope `calendar.readonly`, so it cannot change or delete anything in your Google account.
- **Short-lived, memory-only access.** Google access tokens expire after about an hour and are kept in memory only. Calendar events are kept in memory only, are never written to disk, logs or caches, and are discarded when the app closes or you disconnect.
- **Local only.** The app's built-in servers (the local API, the Claude Code bridge and the sign-in redirect) listen on `127.0.0.1` only and cannot be reached from your network or the internet.
- **Sensitive clipboard content skipped.** Anything password managers mark as private is never read, and clipboard pictures saved for dragging are deleted every time the app starts.
- **Revocation.** **Disconnect** revokes the Google token with Google and deletes it from your computer.
- **Open source.** All of the app's code is public at [github.com/HeyyCzer/windows-island](https://github.com/HeyyCzer/windows-island), so anyone can check how data is handled. Security problems can be reported through the repository's issues.

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

### Spotify

If Spotify plays on another device (a phone, a speaker, another computer), you can connect your Spotify account in the Music settings so the island's volume slider controls that device. You create your own Spotify app, paste its Client ID, and sign in on Spotify's own page, granting the scopes `user-read-playback-state` and `user-modify-playback-state`.

- **What is accessed:** the device your account is playing on (its name and volume), read every few seconds while the music panel shows Spotify playing elsewhere.
- **How it is used:** only to show that volume next to the island's gear and to change it when you move the slider. Nothing else in your account is read or changed.
- **Where it goes:** requests go directly from your computer to Spotify (`accounts.spotify.com`, `api.spotify.com`) over HTTPS. Sign-in uses OAuth with PKCE (S256) and a random `state`; the browser returns to `127.0.0.1:43821` (fixed, because Spotify requires a registered redirect), reachable only from your computer and closed when sign-in ends or after three minutes.
- **Storage:** the Client ID and the refresh token are stored in the Windows Credential Manager. Access tokens are kept in memory only.
- **Disconnecting:** **Disconnect** deletes the token from your computer (Spotify has no endpoint to revoke it). You can remove the app's access at any time at [spotify.com/account/apps](https://www.spotify.com/account/apps/).

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

When the app talks to Google, Spotify, GitHub, Anthropic or YouTube, those companies process the request under their own privacy policies. We have no access to that data.

## Deleting your data

- Disconnect Google Calendar or Spotify, or remove GitHub tokens and feeds, in **Settings**.
- Uninstall the app and delete `%APPDATA%\com.heyyczer.dynamicisland`.
- Disabling the Claude Code integration in **Settings** restores your previous `~/.claude/settings.json`.

## Children

The app is not directed at children under 13 and does not knowingly collect data from them.

## Changes

Changes to this policy are published in this file, with the date at the top updated. The full history is in the repository's commit log.

## Contact

Questions or requests: open an issue at [github.com/HeyyCzer/windows-island/issues](https://github.com/HeyyCzer/windows-island/issues).
