# The Basics

Let us imagine we are building a simple software that checks whether a given
number is prime or not. We may come up with the following implementation as
`v1.0` of our software.

```ts
export function is_prime(input: number): boolean {
  for (let i = 2; i < input; i++) {
    if (input % i === 0) {
      return false;
    }
  }
  return 1 < input;
}
```

Prime numbers are so magical that we can spend years improving the correctness
and efficiency of our implementation. But when people rely on our product to
work, we need to make sure that our future improvements do not introduce
unexpected side-effects.

> Touca helps us see, in near real-time, how our code changes impact the
> behavior and performance of our overall software.

## Getting Started

If we were to write unit tests for our `is_prime` function, we could start with
the following code.

```ts
import { is_prime } from 'is_prime';

test('test is_prime', () => {
  expect(is_prime(13)).toEqual(true);
  expect(is_prime(17)).toEqual(true);
  expect(is_prime(51)).toEqual(false);
});
```

Unit tests are very effective but they require calling our code under test with
a hard-coded set of inputs and comparing the return value of our function
against a hard-coded set of expected values.

Touca takes a very different approach than unit testing:

```ts
import { touca } from '@touca/node';
import { is_prime } from './is_prime';

touca.workflow('is_prime_test', (testcase: string) => {
  const number = Number.parseInt(testcase);
  touca.check('is_prime_output', is_prime(number));
});

touca.run();
```

Where `@touca/node` is the name of our Node.js SDK on NPM.

```bash
npm install @touca/node
```

Notice how our Touca test code does not specify the list of numbers we will be
using to test our `is_prime` function. Similarly, it does not include the
expected return value of our `is_prime` function for different inputs. By
decoupling the test cases from our test logic, we can test our software with any
number of test cases, without changing our test code:

```bash
export TOUCA_API_KEY=<TOUCA_API_KEY>
export TOUCA_API_URL=<TOUCA_API_URL>
node dist/is_prime_test.js --revision v1.0 --testcase 13 17 51
```

Where `TOUCA_API_KEY` and `TOUCA_API_URL` can be obtained from the
[Touca server](https://app.touca.io).

The command above executes our code under test with the specified testcases and
captures the return values of our `is_prime` function. The test tool submits our
captured data to the Touca server and associates them with version `v1.0`.

```text

Touca Test Framework
Suite: is_prime_test/v1.0

 1.  SENT   13    (109 ms)
 2.  SENT   17    (152 ms)
 3.  SENT   51    (127 ms)

Tests:      3 submitted, 3 total
Time:       0.91 s

✨   Ran all test suites.

```

Now if we change the implementation of our `is_prime` function in the future, we
can rerun this test to submit the new information as, say, `v2.0`. The Touca
server compares the new test results against our test results for `v1.0` and
reports any differences in real-time.

## General Model

The pattern used in this example is generally applicable to testing real-world
workflows of any complexity.

```ts
import { touca } from '@touca/node';
// import your code under test here

touca.workflow('name_of_suite', (testcase: string) => {
  // your code goes here
});

touca.run();
```

The code we insert as our workflow under test generally performs the following
operations.

1.  Map a given testcase name to its corresponding input.

    > We did this by calling `Number.parseInt(testcase)`.

2.  Call the code under test with that input.

    > We did this by calling `is_prime(number)`.

3.  Describe the behavior and performance of the code under test.

    > We can do this by capturing values of interesting variables and runtime of
    > important functions.
    >
    > In our example, we captured the return value of our `is_prime` function
    > via `touca.check`. We could also capture runtime of functions and other
    > performance data but our example here was too trivial to showcase all
    > possibilities. See our next example for more details.
