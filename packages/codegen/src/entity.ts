import fs from 'fs';
import Handlebars from 'handlebars';

const main = async (): Promise<void> => {
  const templateString = fs.readFileSync('src/entityTemplate.handlebars').toString();

  Handlebars.registerHelper('indexHelper', function (context) {
    let toReturn = '';

    for (let i = 0; i < context.length; i++) {
      toReturn = `${toReturn}@Index(['`;
      toReturn = `${toReturn}${context[i].columns.join('\', \'')}`;
      toReturn = `${toReturn}']`;
      toReturn = `${toReturn} { unique: ${context[i].unique} })`;
    }
    return new Handlebars.SafeString(toReturn);
  });

  Handlebars.registerHelper('columnHelper', function (context) {
    let toReturn = '';

    for (let i = 0; i < context.length; i++) {
      toReturn = `${toReturn}@Column('`;
      // TODO Prepare a GraphQL -> postgres typemapping.
      toReturn = `${toReturn}${context[i].columnType}', `;
      toReturn = context[i].length ? `${toReturn}{ length: ${context[i].length} })\n` : ')\n';
      // TODO Prepare a GraphQL -> ts typemapping.
      toReturn = `${toReturn}\t${context[i].columnName}!: ${context[i].columnType};\n\n\t`;
    }
    return new Handlebars.SafeString(toReturn);
  });

  const temp = Handlebars.compile(templateString);
  const obj = {
    indexOn: [
      {
        columns: [
          'blockHash',
          'token'
        ],
        unique: true
      }
    ],
    className: 'Allowance',
    columns: [
      {
        columnName: 'blockHash',
        columnType: 'string',
        length: 66
      },
      {
        columnName: 'token',
        columnType: 'string',
        length: 42
      }
    ]
  };
  console.log(temp(obj));
};

main().catch(err => {
  console.error(err);
});
