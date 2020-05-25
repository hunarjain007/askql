import type { JestEnvironment } from '@jest/environment';
import { createEmptyTestResult } from '@jest/test-result';
import type { AssertionResult, TestResult } from '@jest/test-result';
import type { Config } from '@jest/types';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs.promises';
import type { RuntimeType } from 'jest-runtime';
import { basename, dirname, join } from 'path';
import { askCodeToSource, parse as parseAskCode } from './askcode';
import { parse as parseAskScript, parseToJSON } from './askscript';
import {
  extendOptions,
  Options,
  Resource,
  resource,
  resources,
  runUntyped,
} from './askvm';
import { getTargetPath } from './node-utils';
import { fromEntries } from './utils';
import jasmine2 = require('jest-jasmine2');
import { fromAskScriptAst } from './askjsx';

function compareAsJson(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type TestName = 'starts' | 'compiles' | 'computes';
type TestResults = Partial<Record<TestName, null | AssertionResult>>;

async function askRunner(
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  jestEnvironment: JestEnvironment,
  runtime: RuntimeType,
  testPath: string
): Promise<TestResults> {
  const testResults: TestResults = {
    starts: passed(),
  };

  // console.log({ env: process.env.NODE_ENV, testPath });
  if (process.env.NODE_ENV === 'test' && !testPath.endsWith('.ask')) {
    return testResults;
  }

  Object.assign(testResults, {
    compiles: null,
    computes: null,
  });

  // console.log(1, Object.keys(jestEnvironment.global));
  // const { process } = jestEnvironment.global;
  const source = await readFile(testPath, { encoding: 'utf-8' });
  // console.log('source', source);
  if (source == null) {
    // skip further assertions
    return testResults;
  }

  const askScriptAst = parseToJSON(source);
  const askJson = fromAskScriptAst(askScriptAst, (name, props, ...children) => [
    name,
    props,
    ...children,
  ]);
  const askJsonTargetPath = getTargetPath(testPath, 'askjson', '../src');
  await mkdir(dirname(askJsonTargetPath), { recursive: true });
  await writeFile(askJsonTargetPath, JSON.stringify(askJson, null, 2), {
    encoding: 'utf-8',
  });

  const askCode = parseAskScript(source);
  const askCodeSource = askCodeToSource(askCode);
  const askCodeTargetPath = getTargetPath(testPath, 'askcode', '../src');
  await mkdir(dirname(askCodeTargetPath), { recursive: true });
  await writeFile(askCodeTargetPath, askCodeSource, {
    encoding: 'utf-8',
  });

  testResults.compiles = passed({
    title: 'compiles',
  });

  const baseEnvironment = {
    resources,
  };

  const localEnvPath = join(testPath, '../_environment');
  const rawEnvironment = existsSync(`${localEnvPath}.ts`)
    ? runtime.requireActual<Options>(testPath, localEnvPath)
    : {};

  // Revive objects
  const environment: Options = extendOptions(baseEnvironment, rawEnvironment, {
    resources: fromEntries(
      Object.entries(rawEnvironment.resources ?? {}).map(([key, val]): [
        string,
        Resource<any, any>
      ] => [key, resource(val)])
    ),
  });
  // console.log('environment', environment);

  const name = basename(testPath, '.ask');
  const argsPath = join(testPath, `../${name}.test.args.ts`);
  const args = existsSync(argsPath)
    ? runtime.requireModule<any[]>(argsPath)
    : [];

  // console.log({ resultPath, file: resultStat.isFile() });
  const resultPath = join(testPath, `../${name}.test.result.ts`);
  if (existsSync(resultPath)) {
    // console.log('source for result', source);
    // const code = askCode;
    const code = parseAskCode(askCodeSource);
    const result = await runUntyped(environment, code, args);

    const { expectedResult } = runtime.requireModule<{
      expectedResult: any;
    }>(resultPath);
    const isCorrect = compareAsJson(result, expectedResult);
    testResults.computes = assertionResult({
      status: isCorrect ? 'passed' : 'failed',
      title: 'produces the expected result',
      failureMessages: isCorrect
        ? []
        : [
            `EXPECTED: ${JSON.stringify(expectedResult, null, 2)}
  GOT: ${JSON.stringify(result, null, 2)}`,
          ],
    });
  }
  return testResults;
}

function createEmptyAssertionResult(): AssertionResult {
  return {
    ancestorTitles: [],
    failureMessages: [],
    fullName: '',
    numPassingAsserts: 0,
    status: 'pending',
    title: '',
  };
}

function assertionResult(
  ...options: Partial<AssertionResult>[]
): AssertionResult {
  return Object.assign(createEmptyAssertionResult(), ...options);
}

function passed(...options: Partial<AssertionResult>[]): AssertionResult {
  return assertionResult(...options, {
    numPassingAsserts: 1,
    status: 'passed',
  });
}

function failed(...options: Partial<AssertionResult>[]): AssertionResult {
  return assertionResult(...options, {
    status: 'failed',
  });
}

function todo(...options: Partial<AssertionResult>[]): AssertionResult {
  return assertionResult(...options, {
    status: 'todo',
  });
}

export = async function testFileRunner(
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: JestEnvironment,
  runtime: RuntimeType,
  testPath: string
): Promise<TestResult> {
  const baseEnv = extendOptions(
    {
      resources,
    },
    {}
  );

  environment.global.askvm = async (source, [...args], resolve, reject) => {
    try {
      // console.log('source', source);
      const code = parseAskScript(source);
      // console.log('code', code);
      // console.log('args', args);
      const result = await runUntyped(baseEnv, code, args);
      // console.log('result', result);
      resolve(result);
    } catch (e) {
      console.error(e);
      reject(String(e));
    }
  };

  if (testPath.endsWith('.test.ts')) {
    const askFile = join(
      dirname(testPath),
      `${basename(testPath, '.test.ts')}.ask`
    );
    const source = existsSync(askFile)
      ? await readFile(askFile, { encoding: 'utf-8' })
      : '';
    // console.log({ testPath, askFile, source });
    return jasmine2(
      globalConfig,
      config,
      Object.assign(environment, {
        global: Object.assign(environment.global, {
          runUntyped: (envValue, source: string, args?: any[]) => {
            // console.log(1, envValue);
            // console.log(2, source);

            const env: Options = extendOptions(
              {
                resources,
              },
              {
                resources: fromEntries(
                  Object.entries(envValue.resources ?? {}).map(([key, val]): [
                    string,
                    Resource<any, any>
                  ] => [key, resource(val)])
                ),
              }
            );

            return runUntyped(env, require('./askscript').parse(source), args);
          },
          source,
        }),
      }),
      runtime,
      testPath
    );
  }
  const testResults: AssertionResult[] = Object.entries<
    undefined | null | AssertionResult
  >(
    await askRunner(globalConfig, config, environment, runtime, testPath)
  ).map(([name, testResult]) => ({ ...(testResult || todo()), title: name }));
  return Object.assign(createEmptyTestResult(), {
    testResults,
    failureMessage: testResults
      .map((result) => result.failureMessages)
      .join(''),
    numFailingTests: testResults.filter((result) => result.status === 'failed')
      .length,
    numPassingTests: testResults.filter((result) => result.status === 'passed')
      .length,
    numTodoTests: testResults.filter((result) => result.status === 'todo')
      .length,
  });
};
