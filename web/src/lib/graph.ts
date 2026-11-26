/**
 * Lane layout for a commit graph. Input is a list of nodes newest first, in which every node
 * appears before its parents (`git log --date-order` guarantees this). Output says, per row,
 * which column the node sits in and which lines run through, into and out of it.
 *
 * A "lane" is a column holding one open line: it waits for a specific commit (the parent of
 * something drawn above). When that commit arrives, the line ends at its node.
 */
export interface GraphInput {
    id: string;
    parents: string[];
}

export interface LaneLine {
    lane: number;
    color: number;
}

export interface GraphRow {
    /** Column of this row's node. */
    lane: number;
    color: number;
    /** Lines that run straight through this row, untouched by the node. */
    pass: LaneLine[];
    /** Lines arriving from the row above and ending at this node. `from` is their column up there. */
    incoming: { from: number; color: number }[];
    /** Lines leaving this node for the row below. `to` is their column down there. */
    outgoing: { to: number; color: number }[];
    /** How many columns this row uses (highest column in play + 1). */
    lanes: number;
}

export const COLORS = 8;

type Lane = { id: string; color: number } | null;

export function layoutGraph(nodes: GraphInput[]): GraphRow[] {
    const lanes: Lane[] = [];
    let colorCounter = 0;
    const newColor = () => colorCounter++ % COLORS;
    const firstFree = () => {
        const i = lanes.findIndex((l) => l === null);
        return i === -1 ? lanes.length : i;
    };
    const setLane = (i: number, value: Lane) => {
        while (lanes.length <= i) lanes.push(null);
        lanes[i] = value;
    };

    return nodes.map((node) => {
        // Lines that were waiting for this commit end here. Several can: they are branches that
        // share this parent.
        const expecting: number[] = [];
        lanes.forEach((l, i) => {
            if (l?.id === node.id) expecting.push(i);
        });

        let lane: number;
        let color: number;
        if (expecting.length > 0) {
            lane = expecting[0];
            color = lanes[lane]!.color;
        } else {
            lane = firstFree(); // nothing points at it: a branch tip starts a new line
            color = newColor();
        }

        const pass: LaneLine[] = [];
        lanes.forEach((l, i) => {
            if (l && !expecting.includes(i)) pass.push({ lane: i, color: l.color });
        });
        const incoming = expecting.map((i) => ({ from: i, color: lanes[i]!.color }));
        for (const i of expecting) lanes[i] = null;

        const outgoing: { to: number; color: number }[] = [];
        node.parents.forEach((parent, k) => {
            let target = lanes.findIndex((l) => l?.id === parent);
            if (target === -1) {
                if (k === 0) {
                    target = lane; // the first parent continues this node's own line
                    setLane(target, { id: parent, color });
                } else {
                    target = firstFree(); // other parents (merges) open a new line
                    setLane(target, { id: parent, color: newColor() });
                }
            }
            outgoing.push({ to: target, color: lanes[target]!.color });
        });
        while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

        const used = [lane, ...pass.map((p) => p.lane), ...incoming.map((e) => e.from), ...outgoing.map((e) => e.to)];
        return { lane, color, pass, incoming, outgoing, lanes: Math.max(...used) + 1 };
    });
}
