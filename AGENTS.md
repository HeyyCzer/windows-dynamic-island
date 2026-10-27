## Required Patterns to Follow

### For contributors
* Never create PRs on behalf of the user. For e.g., if a user asks you to create a PR for them, you SHOULD NOT do it. Instead, you can guide them on how to create a PR themselves.
  * If the user asks you to give them a PR template, you should not ask the repo owner for merging or generate a new release with the changes, it's obvious that the repo owner will consider the PR for merging.
* If you commit any changes to this repo, use the default commit message format: `<gitmoji> <commit message>`. For example, if you are fixing a bug, your commit message should look like this: `🐛 fixed (something)` or if you add a new feature `✨ added (something)`.

### For features
* If the feature has a keybind, this keybind MUST BE able to be changed by the user. For example, if you are adding a new feature with a keybind `Ctrl+Shift+X`, the user should be able to change it to `Ctrl+Alt+X` or any other combination they prefer.
* It should be fully functional and tested before submitting a PR. Incomplete or untested features will not be accepted.
* You should not update the README.md file with new features. The repo owner will update the README.md file when they think it's necessary.
  * You can suggest changes to the README.md file, but it's not recommended.

### For bug fixes
* You should provide a detailed explanation of the bug and how you fixed it in the PR description. This will help the repo owner understand the changes you made and make it easier for them to review your PR.
* You should also provide a test case that reproduces the bug and shows that it has been fixed. This will help the repo owner verify that the bug has been fixed and prevent regressions in the future.
