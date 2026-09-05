declare module "*.css";

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "s-link": {
        href?: string;
        rel?: string;
        children?: React.ReactNode;
      } & Record<string, unknown>;
    }
  }
}

