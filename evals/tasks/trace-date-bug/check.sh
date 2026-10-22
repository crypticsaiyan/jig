set -e
# the visible tests must stay exactly as they were
echo "967f1288acf18cec582060eaf153f1c6a0c629b513ca0c9e4b1349141d266fda  src/invoice.test.ts" | sha256sum -c --quiet
bun test ./src ./tests_hidden
