export const maxCaseCsvRows = 100;
export const maxCaseCsvBytes = 90000;

export const caseCsvTemplate = [
  'Type,Title,Severity,Steps,Expected,Actual,Developer',
  'test_case,Guest restaurant search,medium,Search for pizza,Matching restaurants appear,,',
  'bug,Empty results message is missing,high,Search for an unknown term,A no-results message appears,The results area is blank,',
].join('\r\n') + '\r\n';

const headers = new Map([
  ['type','kind'], ['case type','kind'], ['kind','kind'],
  ['title','title'], ['case title','title'], ['severity','severity'],
  ['steps','steps'], ['steps to reproduce','steps'], ['steps to reproduce / execute','steps'],
  ['expected','expected'], ['expected result','expected'],
  ['actual','actual'], ['actual result','actual'],
  ['developer','developer'], ['assigned developer','developer'],
]);

function csvRecords(input: string) {
  const csv = input.replace(/^\uFEFF/, '');
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\n|\r|$)/gy;
  const records: {line: number; cells: string[]}[] = [];
  let line = 1;
  while (field.lastIndex < csv.length) {
    const start = line;
    const cells: string[] = [];
    let delimiter: string;
    do {
      const match = field.exec(csv);
      if (!match) throw Error(`Line ${line}: invalid CSV quoting or delimiter.`);
      cells.push(match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'));
      line += (match[0].match(/\r\n|\n|\r/g) ?? []).length;
      delimiter = match[3];
    } while (delimiter === ',');
    if (cells.some(cell => cell.trim())) records.push({line: start, cells});
    if (records.length > maxCaseCsvRows + 1) throw Error(`Import up to ${maxCaseCsvRows} cases per file.`);
  }
  return records;
}

export function parseCaseCsv(csv: string) {
  if (new TextEncoder().encode(csv).byteLength > maxCaseCsvBytes) throw Error('Choose a CSV file under 90 KB.');
  const [header, ...records] = csvRecords(csv);
  if (!header || !records.length) throw Error('Include a header and at least one case.');
  const columns = header.cells.map(cell => headers.get(cell.trim().toLowerCase()));
  const names = columns.filter(Boolean);
  if (new Set(names).size !== names.length) throw Error('Each case column can appear only once.');
  for (const required of ['kind','title','steps','expected']) {
    if (!names.includes(required)) throw Error(`Missing required column: ${required === 'kind' ? 'Type' : required}.`);
  }
  return records.map(({line,cells}) => {
    if (cells.length !== columns.length) throw Error(`Line ${line}: expected ${columns.length} columns, found ${cells.length}.`);
    const values = Object.fromEntries(columns.flatMap((key,i) => key ? [[key,cells[i].trim()]] : []));
    for (const [key,label] of [['title','Title'],['steps','Steps'],['expected','Expected']]) {
      if (!values[key]) throw Error(`Line ${line}: ${label} is required.`);
    }
    return {
      line,
      kind: values.kind.toLowerCase().replace(/[ -]+/g,'_'),
      title: values.title,
      severity: values.severity?.toLowerCase() || 'medium',
      steps: values.steps,
      expected: values.expected,
      actual: values.actual || '',
      developer: values.developer || '',
    };
  });
}
