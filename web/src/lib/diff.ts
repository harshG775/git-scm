export type DiffLineKind = "meta" | "hunk" | "add" | "del" | "context";

/** Classifies one line of unified diff output for colouring. */
export function classifyDiffLine(line: string, inHunk: boolean): DiffLineKind {
    if (line.startsWith("@@")) return "hunk";
    // Inside a hunk every line starts with " ", "+", "-" or "\"; "---"/"+++" there are real content.
    if (inHunk) {
        if (line.startsWith("+")) return "add";
        if (line.startsWith("-")) return "del";
        return "context";
    }
    return "meta"; // diff --git, index, new file mode, ---/+++ headers, rename info, ...
}

export interface DiffLine {
    text: string;
    kind: DiffLineKind;
}

export function parseDiff(diff: string): DiffLine[] {
    const lines = diff.split("\n");
    if (lines.at(-1) === "") lines.pop();
    let inHunk = false;
    return lines.map((text) => {
        if (text.startsWith("diff --git") || text.startsWith("diff --cc")) inHunk = false;
        const kind = classifyDiffLine(text, inHunk);
        if (kind === "hunk") inHunk = true;
        return { text, kind };
    });
}
