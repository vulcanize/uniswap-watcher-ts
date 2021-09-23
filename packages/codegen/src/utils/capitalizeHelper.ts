export function capitalizeHelper (value: string, options: any): string {
  const tillIndex = options.hash.tillIndex || value.length;
  const result = `${value.slice(0, tillIndex).toUpperCase()}${value.slice(tillIndex, value.length)}`;

  return result;
}
