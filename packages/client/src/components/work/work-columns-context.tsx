import { createContext, useContext } from "react";
import { WORK_COLUMNS, type WorkColumn } from "../../work-columns.ts";

/** The Work list's columns shown now (`work-columns.ts`), which every row and header of its grid renders. */
export const WorkColumnsContext = createContext<readonly WorkColumn[]>(WORK_COLUMNS);

export const useWorkColumns = () => useContext(WorkColumnsContext);
