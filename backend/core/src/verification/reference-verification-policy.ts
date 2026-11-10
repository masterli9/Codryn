export class ReferenceVerificationPolicy {
  assess(input:{changedPaths:readonly string[];observedPaths:readonly string[];complete:boolean;manifestValid:boolean;commandTrusted:boolean}):{profileId:'r2-sum-v1';coveredPaths:readonly string[];uncoveredPaths:readonly string[]} {
    const valid=input.complete&&input.manifestValid&&input.commandTrusted&&['sum.mjs','sum.test.mjs'].every(path=>input.observedPaths.includes(path));
    const coveredPaths:readonly string[]=valid?input.changedPaths.filter(path=>path==='sum.mjs'):[];
    return {profileId:'r2-sum-v1',coveredPaths,uncoveredPaths:input.changedPaths.filter(path=>!coveredPaths.includes(path))};
  }
}
