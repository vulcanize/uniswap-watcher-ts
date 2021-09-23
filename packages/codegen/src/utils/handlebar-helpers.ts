import assert from 'assert';

export function compareHelper (lvalue: string, rvalue: string, options: any): boolean {
  assert(lvalue && rvalue, "Handlerbars Helper 'compare' needs at least 2 parameters");

  const operator = options.hash.operator || '===';

  const operators: Map<string, (l:any, r:any) => boolean> = new Map();

  operators.set('===', function (l: any, r: any) { return l === r; });
  operators.set('!==', function (l: any, r: any) { return l !== r; });
  operators.set('<', function (l: any, r: any) { return l < r; });
  operators.set('>', function (l: any, r: any) { return l > r; });
  operators.set('<=', function (l: any, r: any) { return l <= r; });
  operators.set('>=', function (l: any, r: any) { return l >= r; });

  const operatorFunction = operators.get(operator);
  assert(operatorFunction, "Handlerbars Helper 'compare' doesn't know the operator " + operator);
  const result = operatorFunction(lvalue, rvalue);

  return result;
}

export function capitalizeHelper (value: string, options: any): string {
  const tillIndex = options.hash.tillIndex || value.length;
  const result = `${value.slice(0, tillIndex).toUpperCase()}${value.slice(tillIndex, value.length)}`;

  return result;
}
