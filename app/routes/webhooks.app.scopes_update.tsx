import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { processAppScopesUpdateRequest } from "../webhooks/app-scopes-update";

export const action = async ({ request }: ActionFunctionArgs) => {
  return processAppScopesUpdateRequest(request, {
    authenticate,
    db,
  });
};
