/** Shared by the server actions and the form that renders their errors. */
export type ActionResult = { error?: string };

export type ServerAction = (state: ActionResult, form: FormData) => Promise<ActionResult>;
