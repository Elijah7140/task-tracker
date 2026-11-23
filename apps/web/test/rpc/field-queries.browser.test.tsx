import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { DialogHost } from "../../src/dialogs/dialog-host.js";
import { rpcProtocolLayer } from "../../src/rpc-client.js";
import { effectiveFieldsAtom, fieldChoicesAtom } from "../../src/rpc/field-queries.js";
import { rpcProtocolAtom } from "../../src/rpc/task-tracker-client.js";
import { FieldManagerCard } from "../../src/settings/field-manager-card.js";
import { FakeProjectStore, startFakeServer } from "../support/fake-task-tracker-server.js";

const TEST_CONNECTION = { port: 49152, credential: "T".repeat(43) };

/** Stands in for an item editor picker that lists a project's fields and one field's choices. */
function PickerProbe({
  projectId,
  fieldId,
}: {
  readonly projectId: string;
  readonly fieldId: string;
}) {
  const fields = useAtomValue(effectiveFieldsAtom(projectId));
  const choices = useAtomValue(fieldChoicesAtom(fieldId));
  const fieldNames = AsyncResult.isSuccess(fields)
    ? fields.value.map((field) => field.displayName).join(", ")
    : "";
  const choiceLabels = AsyncResult.isSuccess(choices)
    ? choices.value
        .filter((choice) => !choice.isArchived)
        .map((choice) => choice.label)
        .join(", ")
    : "";
  return (
    <div>
      <p data-testid="picker-fields">{fieldNames}</p>
      <p data-testid="picker-choices">{choiceLabels}</p>
    </div>
  );
}

async function renderManagerWithPicker() {
  const store = new FakeProjectStore([{ name: "Billing DB" }]);
  const projectId = store.summaries[0]!.project.id;
  store.customFields.addFieldSeed("Effort", "Number");
  const status = store.customFields.addFieldSeed("Stage", "Choice");
  store.customFields.addChoiceSeed(status.id, "Ready");
  store.customFields.addChoiceSeed(status.id, "Blocked");
  store.customFields.addFieldSeed("Customer", "Text", { projectId });
  const server = await startFakeServer(store);
  onTestFinished(() => server.close());
  const protocol = rpcProtocolLayer(TEST_CONNECTION, { fetch: server.fetch });
  await render(
    <RegistryProvider initialValues={[[rpcProtocolAtom, protocol]]}>
      <FieldManagerCard projectId={null} />
      <PickerProbe projectId={projectId} fieldId={status.id} />
      <DialogHost />
    </RegistryProvider>,
  );
  await expect
    .element(page.getByTestId("picker-fields"))
    .toHaveTextContent("Effort, Stage, Customer");
  await expect.element(page.getByTestId("picker-choices")).toHaveTextContent("Ready, Blocked");
  return { store };
}

const fieldRow = (name: string) =>
  page.getByTestId("field-manager").getByRole("listitem", { name, exact: true });

describe("field queries", () => {
  it("Refreshes mounted field pickers after fields are added, renamed, reordered and archived", async () => {
    await renderManagerWithPicker();

    await page.getByTestId("field-new-name").fill("Review date");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByTestId("picker-fields"))
      .toHaveTextContent("Effort, Stage, Review date, Customer");

    await fieldRow("Effort").getByTestId("field-rename").click();
    await userEvent.keyboard("{Control>}a{/Control}Story points{Enter}");
    await expect
      .element(page.getByTestId("picker-fields"))
      .toHaveTextContent("Story points, Stage, Review date, Customer");

    await fieldRow("Review date").getByTestId("field-move-up").click();
    await expect
      .element(page.getByTestId("picker-fields"))
      .toHaveTextContent("Story points, Review date, Stage, Customer");

    await fieldRow("Story points").getByTestId("field-archive").click();
    await expect
      .element(page.getByTestId("picker-fields"))
      .toHaveTextContent("Review date, Stage, Customer");
  });

  it("Refreshes mounted choice pickers after choices are added, renamed, reordered and archived", async () => {
    await renderManagerWithPicker();
    await fieldRow("Stage").getByTestId("field-choices-toggle").click();
    const status = () => fieldRow("Stage");

    await status().getByTestId("choice-new-label").fill("Done");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByTestId("picker-choices"))
      .toHaveTextContent("Ready, Blocked, Done");

    await status().getByRole("listitem", { name: "Ready" }).getByTestId("choice-rename").click();
    await userEvent.keyboard("{Control>}a{/Control}Queued{Enter}");
    await expect
      .element(page.getByTestId("picker-choices"))
      .toHaveTextContent("Queued, Blocked, Done");

    await status().getByRole("listitem", { name: "Done" }).getByTestId("choice-move-up").click();
    await expect
      .element(page.getByTestId("picker-choices"))
      .toHaveTextContent("Queued, Done, Blocked");

    await status().getByRole("listitem", { name: "Blocked" }).getByTestId("choice-archive").click();
    await expect.element(page.getByTestId("picker-choices")).toHaveTextContent("Queued, Done");
  });
});
