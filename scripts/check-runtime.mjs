const expectedNode = '24.19.0';
const actualNode = process.versions.node;

if (actualNode !== expectedNode) {
  console.error(`R0 requires Node ${expectedNode}; current runtime is ${actualNode}.`);
  process.exit(1);
}

const npmVersion = process.env.npm_config_user_agent?.match(/npm\/(\d+\.\d+\.\d+)/)?.[1];
if (npmVersion !== undefined && !npmVersion.startsWith('11.')) {
  console.error(`R0 requires npm 11.x; current npm is ${npmVersion}.`);
  process.exit(1);
}

console.log(`Runtime OK: Node ${actualNode}, npm ${npmVersion ?? 'not invoked through npm'}.`);
