import { any, extendOptions, resource, run } from '../../lib';

export const fun = resource({
  type: any,
  async compute(options, code, args) {
    // console.log(code.name, code.params, 'args:', args);

    if (!args) {
      return code; // TODO typed needs to understand AskCode
    }

    options = extendOptions(options, {
      code,
    });

    // add simple argument resolvers in the scope
    args.forEach((arg, index) => {
      options.values![`$${index}`] = arg;
    });

    let lastResult: any;
    const { params: statements = [] } = code;
    for (let i = 0; i < statements.length && !('result' in options); i += 1) {
      const statement = statements[i];
      lastResult = await run(options, statement);
    }
    return lastResult;
  },
});
