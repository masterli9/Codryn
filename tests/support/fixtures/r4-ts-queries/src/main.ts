import { duplicate as twice } from "./math.js";
import { identity, price, receipt } from "./math.js";
export const total = twice(price);
export const heading = identity("Title");
export const amount = receipt.amount;
