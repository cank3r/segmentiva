import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { processAppUninstalledRequest } from "../webhooks/app-uninstalled";

export const action = async ({ request }: ActionFunctionArgs) => {
  return processAppUninstalledRequest(request, {
    authenticate,
    db,
  });
};
