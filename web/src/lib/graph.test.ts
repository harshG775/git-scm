import { expect, test } from "vite-plus/test";
import { layoutGraph, type GraphInput } from "./graph";

const n = (id: string, ...parents: string[]): GraphInput => ({ id, parents });

test("a linear history stays in one lane with one colour", () => {
    const rows = layoutGraph([n("c", "b"), n("b", "a"), n("a")]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(new Set(rows.map((r) => r.color)).size).toBe(1);
    expect(rows[0].incoming).toEqual([]); // the tip starts here
    expect(rows[0].outgoing).toEqual([{ to: 0, color: rows[0].color }]);
    expect(rows[1].incoming).toEqual([{ from: 0, color: rows[0].color }]);
    expect(rows[2].outgoing).toEqual([]); // the root ends the line
});

test("a merge opens a second lane and the branch point closes it", () => {
    // M merges m1 (first parent, the branch merged into) and f1; both come from base
    const rows = layoutGraph([n("M", "m1", "f1"), n("m1", "base"), n("f1", "base"), n("base")]);
    const [M, m1, f1, base] = rows;

    expect(M.lane).toBe(0);
    expect(M.outgoing.map((o) => o.to)).toEqual([0, 1]);
    expect(M.outgoing[0].color).not.toBe(M.outgoing[1].color); // the merged-in branch has its own colour

    expect(m1.lane).toBe(0);
    expect(m1.pass).toEqual([{ lane: 1, color: M.outgoing[1].color }]); // the f1 line runs past it

    expect(f1.lane).toBe(1);
    expect(f1.pass).toEqual([{ lane: 0, color: m1.color }]); // the main line runs past it
    expect(f1.outgoing).toEqual([{ to: 0, color: m1.color }]); // f1 joins the main line

    expect(base.lane).toBe(0);
    expect(base.incoming).toEqual([{ from: 0, color: m1.color }]);
    expect(base.lanes).toBe(1); // lane 1 is gone
});

test("two tips sharing a parent converge at it", () => {
    const rows = layoutGraph([n("A", "X"), n("B", "X"), n("X")]);
    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(1); // B cannot use lane 0: it is waiting for X
    expect(rows[1].outgoing).toEqual([{ to: 0, color: rows[0].color }]);
    expect(rows[2].lane).toBe(0);
    expect(rows[2].incoming).toHaveLength(1);
});

test("a freed lane is reused by the next tip", () => {
    const rows = layoutGraph([n("A", "X"), n("B", "X"), n("X"), n("C", "Y"), n("Y")]);
    expect(rows[3].lane).toBe(0); // everything above ended at X, so lanes are free again
    expect(rows[3].lanes).toBe(1);
});

test("an octopus merge opens one lane per extra parent", () => {
    const rows = layoutGraph([n("M", "a", "b", "c"), n("a"), n("b"), n("c")]);
    expect(rows[0].outgoing.map((o) => o.to)).toEqual([0, 1, 2]);
    expect(new Set(rows[0].outgoing.map((o) => o.color)).size).toBe(3);
});

test("a root commit closes its line and leaves nothing waiting", () => {
    const rows = layoutGraph([n("b", "a"), n("a"), n("z")]);
    expect(rows[1].outgoing).toEqual([]);
    expect(rows[2].lane).toBe(0);
    expect(rows[2].pass).toEqual([]);
});

test("parents outside the loaded window keep their line open to the bottom", () => {
    const rows = layoutGraph([n("b", "a-not-loaded")]);
    expect(rows[0].outgoing).toEqual([{ to: 0, color: rows[0].color }]);
});

test("a pseudo-node (stash, uncommitted changes) hangs off an existing line", () => {
    // main: head -> base. The stash was made on `base`, so it joins the main line at `base`.
    const rows = layoutGraph([n("head", "base"), n("stash", "base"), n("base")]);
    expect(rows[1].lane).toBe(1);
    expect(rows[1].outgoing).toEqual([{ to: 0, color: rows[0].color }]);
});

test("empty input", () => {
    expect(layoutGraph([])).toEqual([]);
});

// ---- property: whatever the history looks like, the lines must connect row to row ----

function rng(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
}

/** Random DAG in valid order: each node's parents are drawn from the nodes after it. */
function randomHistory(size: number, rand: () => number): GraphInput[] {
    const ids = Array.from({ length: size }, (_, i) => `n${i}`);
    return ids.map((id, i) => {
        const later = ids.slice(i + 1);
        const parents: string[] = [];
        // mostly linear, sometimes a merge, sometimes a root, parents sometimes far away
        const count = later.length === 0 ? 0 : rand() < 0.08 ? 0 : rand() < 0.25 ? 2 : 1;
        for (let k = 0; k < count; k++) {
            const pick =
                rand() < 0.7
                    ? later[Math.min(later.length - 1, Math.floor(rand() * 3))]
                    : later[Math.floor(rand() * later.length)];
            if (!parents.includes(pick)) parents.push(pick);
        }
        return { id, parents };
    });
}

test("lines connect row to row for random histories", () => {
    for (let seed = 1; seed <= 300; seed++) {
        const rand = rng(seed);
        const nodes = randomHistory(5 + Math.floor(rand() * 40), rand);
        const rows = layoutGraph(nodes);

        rows.forEach((row, i) => {
            const where = `seed ${seed}, row ${i} (${nodes[i].id})`;
            // the node never sits on a line that merely passes by
            expect(
                row.pass.map((p) => p.lane),
                where,
            ).not.toContain(row.lane);
            // pass-through lanes are distinct
            expect(new Set(row.pass.map((p) => p.lane)).size, where).toBe(row.pass.length);
            // one outgoing line per parent
            expect(row.outgoing, where).toHaveLength(nodes[i].parents.length);

            if (i === rows.length - 1) return;
            // What leaves the bottom of this row must be exactly what enters the top of the next:
            // continuing lines plus this node's outgoing lines, versus the next row's through
            // lines plus its incoming lines. Compared as (column, colour) pairs.
            const bottom = [
                ...row.pass.map((p) => `${p.lane}:${p.color}`),
                ...row.outgoing.map((o) => `${o.to}:${o.color}`),
            ];
            const next = rows[i + 1];
            const top = [
                ...next.pass.map((p) => `${p.lane}:${p.color}`),
                ...next.incoming.map((e) => `${e.from}:${e.color}`),
            ];
            expect(new Set(top), where).toEqual(new Set(bottom));
        });

        // every commit that is some other commit's parent has exactly the line(s) it was promised
        const seen = new Set<string>();
        nodes.forEach((node, i) => {
            const isParentOfEarlier = nodes.slice(0, i).some((m) => m.parents.includes(node.id));
            if (isParentOfEarlier) expect(rows[i].incoming.length, `seed ${seed} ${node.id}`).toBeGreaterThan(0);
            else expect(rows[i].incoming, `seed ${seed} ${node.id} is a tip`).toEqual([]);
            seen.add(node.id);
        });
    }
});
