# Global Instructions for Antigravity

These instructions apply to all changes made in this repository.

## Commit Messages

We follow the **Conventional Commits** specification. All commit messages must be structured as follows:

```
<type>(<scope>): <description>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools and libraries such as documentation generation

### Scope

The scope should be the name of the module affected (e.g., `users`, `auth`, `mails`, `notifications`). If multiple modules are affected, pick the most significant one or omit the scope if it's a broad change.

### Description

- Use the imperative, present tense: "change" not "changed" nor "changes".
- Don't capitalize the first letter.
- No dot (.) at the end.

### Examples

- `feat(users): add verify-email on front side`
- `feat(mails): improve email support`
- `fix(notifications): prevent admin self-notification`
- `chore: removed unused dep`

## Workflow

- **Atomic Commits**: Try to keep commits focused on a single logical change.
- **Descriptive**: The description should clearly state _what_ changed.
