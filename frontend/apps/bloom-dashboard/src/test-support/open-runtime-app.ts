import { fireEvent, screen, within } from "@testing-library/react";

/** Launches an app from the runtime library: select its row, pick a role (the first when none is remembered), open. */
export async function openRuntimeApp(appName: string, roleName?: string) {
  fireEvent.click(await screen.findByRole("button", { name: appName }));
  const rail = screen.getByRole("complementary", { name: "Open as" });
  if (roleName) {
    fireEvent.click(within(rail).getByRole("button", { name: roleName }));
  }
  const openButton = () => rail.querySelector<HTMLButtonElement>(".runtime-library-open");
  if (openButton()?.disabled) {
    const firstRole = rail.querySelector<HTMLButtonElement>(".runtime-library-roles button");
    if (firstRole) {
      fireEvent.click(firstRole);
    }
  }
  const button = openButton();
  if (!button) {
    throw new Error(`The runtime library offers no way to open ${appName}.`);
  }
  fireEvent.click(button);
}
