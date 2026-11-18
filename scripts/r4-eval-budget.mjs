import { Buffer } from 'node:buffer';

/** One reservation authorizes one transport delegation. No usage refund. */
export class R4RequestBudget {
  requests = 0;
  reservedUsd = 0;
  constructor({maxRequests,maxCostUsd,inputPrice,outputPrice}) {
    if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>100
      ||![maxCostUsd,inputPrice,outputPrice].every(value=>Number.isFinite(value)&&value>0))throw new Error('R4_EVAL_NOT_AUTHORIZED');
    this.maxRequests=maxRequests;
    this.maxCostUsd=maxCostUsd;
    this.inputPrice=inputPrice;
    this.outputPrice=outputPrice;
  }
  reserve(body) {
    const upperInput=Buffer.byteLength(JSON.stringify(body))+16384;
    const cost=(upperInput*this.inputPrice+4096*this.outputPrice)/1_000_000;
    if(this.requests>=this.maxRequests||!Number.isFinite(cost)||this.reservedUsd+cost>this.maxCostUsd)throw new Error('R4_EVAL_BUDGET_EXHAUSTED');
    this.requests++;
    this.reservedUsd+=cost;
  }
}
