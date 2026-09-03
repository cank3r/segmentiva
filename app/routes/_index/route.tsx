import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Segmentiva</h1>
        <p className={styles.text}>
          Turn customer data into personalized shopping. Log in with your
          Shopify store to continue.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Declared preferences</strong>. Learn directly from customers
            instead of relying only on inferred behavior.
          </li>
          <li>
            <strong>Shopify-native activation</strong>. Uses customer
            metafields, tags, and native saved segments.
          </li>
          <li>
            <strong>Privacy by design</strong>. Preference data stays in Shopify
            and personal data is minimized.
          </li>
        </ul>
      </div>
    </div>
  );
}
