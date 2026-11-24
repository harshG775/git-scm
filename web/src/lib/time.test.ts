import { expect, test } from "vite-plus/test";
import { timeAgo } from "./time";

const now = Date.UTC(2026, 10, 24, 12, 0, 0);
const ago = (seconds: number) => timeAgo(now / 1000 - seconds, now);

test("buckets", () => {
    expect(ago(5)).toBe("just now");
    expect(ago(44)).toBe("just now");
    expect(ago(90)).toBe("2 min ago");
    expect(ago(30 * 60)).toBe("30 min ago");
    expect(ago(3 * 3600)).toBe("3 h ago");
    expect(ago(2 * 86400)).toBe("2 d ago");
});

test("a timestamp in the future (clock skew) is 'just now', not negative", () => {
    expect(timeAgo(now / 1000 + 600, now)).toBe("just now");
});

test("older than a month falls back to a date", () => {
    expect(ago(90 * 86400)).toMatch(/\d/);
    expect(ago(90 * 86400)).not.toMatch(/ago/);
});
