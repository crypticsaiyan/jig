# the agent's tests must pass on the real code and fail on every broken copy
set -e
test -f src/duration.test.ts
bun test ./src/duration.test.ts > /dev/null 2>&1 || { echo "tests fail on the real code"; exit 1; }
cp src/duration.ts .duration.orig
survived=0
for mutant in tests_hidden/mutants/*.ts; do
  cp "$mutant" src/duration.ts
  if bun test ./src/duration.test.ts > /dev/null 2>&1; then
    echo "not caught: $(basename "$mutant" .ts)"
    survived=1
  fi
done
cp .duration.orig src/duration.ts
exit $survived
