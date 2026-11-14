import { discount } from './discount.js';

export function Price({ total }: { total: number }): string {
  return `${discount(total)} Kč`;
}
