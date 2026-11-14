import { price } from "../src/math.js";
declare namespace JSX { interface IntrinsicElements { strong: { children?: string } } }
export function Page() { return <strong>{String(price)}</strong>; }
