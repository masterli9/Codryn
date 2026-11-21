import ts from 'typescript';

// Bounded eval oracle: supports an exported one-parameter function or arrow
// whose body is one return expression using numeric literals, that parameter,
// parentheses and +, -, *, /, %, or **. It verifies only nextCount(1) === 2;
// unsupported but otherwise valid implementations return "unsupported".
function evaluate(expression, parameter, input) {
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text.replaceAll('_', ''));
    return Number.isFinite(value) ? value : null;
  }
  if (ts.isIdentifier(expression)) return expression.text === parameter ? input : null;
  if (ts.isParenthesizedExpression(expression)) return evaluate(expression.expression, parameter, input);
  if (ts.isPrefixUnaryExpression(expression) && (expression.operator === ts.SyntaxKind.PlusToken || expression.operator === ts.SyntaxKind.MinusToken)) {
    const value = evaluate(expression.operand, parameter, input);
    return value === null ? null : expression.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  if (!ts.isBinaryExpression(expression)) return null;
  const left = evaluate(expression.left, parameter, input), right = evaluate(expression.right, parameter, input);
  if (left === null || right === null) return null;
  switch (expression.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken: return left + right;
    case ts.SyntaxKind.MinusToken: return left - right;
    case ts.SyntaxKind.AsteriskToken: return left * right;
    case ts.SyntaxKind.SlashToken: return right === 0 ? null : left / right;
    case ts.SyntaxKind.PercentToken: return right === 0 ? null : left % right;
    case ts.SyntaxKind.AsteriskAsteriskToken: return left ** right;
    default: return null;
  }
}

function isExported(node) {
  return !!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

export function counterOracle(source, input = 1, expected = 2) {
  const file = ts.createSourceFile('counter.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) return 'unsupported';
  const matches = file.statements.filter(statement =>
    (ts.isFunctionDeclaration(statement) && statement.name?.text === 'nextCount' && isExported(statement)) ||
    (ts.isVariableStatement(statement) && isExported(statement) && statement.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name) && declaration.name.text === 'nextCount')));
  if (matches.length !== 1) return 'unsupported';

  const declaration = matches[0];
  let parameters, expression;
  if (ts.isFunctionDeclaration(declaration)) {
    if (!declaration.body || declaration.asteriskToken || declaration.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword)) return 'unsupported';
    parameters = declaration.parameters;
    if (declaration.body.statements.length !== 1 || !ts.isReturnStatement(declaration.body.statements[0]) || !declaration.body.statements[0].expression) return 'unsupported';
    expression = declaration.body.statements[0].expression;
  } else {
    const variable = declaration.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === 'nextCount');
    const arrow = variable?.initializer;
    if (!arrow || !ts.isArrowFunction(arrow) || arrow.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword)) return 'unsupported';
    parameters = arrow.parameters;
    if (ts.isBlock(arrow.body)) {
      if (arrow.body.statements.length !== 1 || !ts.isReturnStatement(arrow.body.statements[0]) || !arrow.body.statements[0].expression) return 'unsupported';
      expression = arrow.body.statements[0].expression;
    } else expression = arrow.body;
  }

  if (parameters.length !== 1 || !ts.isIdentifier(parameters[0].name) || parameters[0].dotDotDotToken || parameters[0].initializer) return 'unsupported';
  const actual = evaluate(expression, parameters[0].name.text, input);
  return actual === null ? 'unsupported' : actual === expected ? 'verified' : 'mismatch';
}
