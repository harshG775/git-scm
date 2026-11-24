import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";
import { Section } from "./Section";

const render = (open: boolean, extra: Partial<Parameters<typeof Section>[0]> = {}) =>
    renderToStaticMarkup(
        <Section id="remote" title="Remote" open={open} onToggle={() => {}} {...extra}>
            <p>BODY</p>
        </Section>,
    );

test("collapsed: header only, body not rendered, aria says so", () => {
    const html = render(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Remote");
    expect(html).not.toContain("BODY");
});

test("expanded: body is rendered and linked to its header", () => {
    const html = render(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="section-remote"');
    expect(html).toContain('id="section-remote"');
    expect(html).toContain("BODY");
});

test("shows a count only when there is something to count", () => {
    expect(render(true, { count: 3 })).toContain(">3<");
    expect(render(true, { count: 0 })).not.toContain(">0<");
    expect(render(true, { count: undefined })).not.toContain("rounded-full");
});

test("header actions sit outside the toggle button, so they are separate tap targets", () => {
    const html = render(false, { actions: <button aria-label="Fetch from all remotes">x</button> });
    const toggle = html.slice(html.indexOf("<button"), html.indexOf("</button>") + 9);
    expect(toggle).toContain("aria-expanded");
    expect(toggle).not.toContain("Fetch from all remotes");
    expect(html).toContain('aria-label="Fetch from all remotes"');
});
