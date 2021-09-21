import assert from 'assert';

export function compareHelper (this: any, lvalue: string, rvalue: string, options: any): string {
  assert(lvalue && rvalue, "Handlerbars Helper 'compare' needs 2 parameters");

  const operator: string = options.hash.operator || '===';

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

  if (result) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
}
