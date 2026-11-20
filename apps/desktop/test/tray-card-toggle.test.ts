import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import { TRAY_CARD_REOPEN_GUARD, makeTrayCardToggle } from "../src/tray-card-toggle.js";

/** A stand-in card window that records whether it is showing. */
function fakeCard() {
  const state = { visible: false, shows: 0 };
  return {
    state,
    window: {
      isVisible: () => state.visible,
      show: () => {
        state.visible = true;
        state.shows++;
      },
      hide: () => {
        state.visible = false;
      },
    },
  };
}

const run = <A>(effect: Effect.Effect<A>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestClock.layer())));

describe("makeTrayCardToggle", () => {
  it("Clicking the icon shows the card and clicking again hides it", async () => {
    const card = fakeCard();
    const toggle = makeTrayCardToggle(card.window);

    const shown = await run(
      Effect.gen(function* () {
        yield* toggle.click;
        const visible = card.state.visible;
        yield* toggle.click;
        return visible;
      }),
    );

    expect(shown).toBe(true);
    expect(card.state.visible).toBe(false);
  });

  it("The click that closed the card does not reopen it, but a later click does", async () => {
    const card = fakeCard();
    const toggle = makeTrayCardToggle(card.window);

    const reopenedAtOnce = await run(
      Effect.gen(function* () {
        yield* toggle.click;
        yield* toggle.hide;
        yield* toggle.click;
        const visible = card.state.visible;
        yield* TestClock.adjust(TRAY_CARD_REOPEN_GUARD);
        yield* toggle.click;
        return visible;
      }),
    );

    expect(reopenedAtOnce).toBe(false);
    expect(card.state.visible).toBe(true);
    expect(card.state.shows).toBe(2);
  });

  it("Hiding a card that is not showing leaves the next click free to show it", async () => {
    const card = fakeCard();
    const toggle = makeTrayCardToggle(card.window);

    await run(
      Effect.gen(function* () {
        yield* toggle.hide;
        yield* toggle.click;
      }),
    );

    expect(card.state.visible).toBe(true);
  });
});
