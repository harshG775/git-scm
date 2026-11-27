import { GitConfigForm } from "./GitConfigForm";

/**
 * Global git config: the same fields git itself reads from ~/.gitconfig. Only what you change is
 * written, and a bar with Save and Revert appears once something is different from what is saved.
 */
export function GlobalGitSettings() {
    return <GitConfigForm scope="global" />;
}
