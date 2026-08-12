import { renderers as panels } from "../admin-panels.mjs";
import { renderers as page } from "../pages/admin-page.mjs";
export const renderers = Object.freeze({ ...panels, ...page });
