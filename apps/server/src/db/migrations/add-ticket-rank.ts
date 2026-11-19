import { addColumns } from "./apply-ddl.js";

/** The independent nullable ticket rank. */
export const ticketRankColumns = ['"TicketRank" REAL NULL'];

export default addColumns("TodoItem", ticketRankColumns);
