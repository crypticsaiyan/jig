# every TODO comment's path:line, in any order
expected="src/api/server.ts:4
src/db/client.ts:2
src/db/client.ts:7
src/main.ts:3
src/ui/render.ts:2"
actual=$(sed 's#^\./##' TODOS.txt | tr -d ' \r' | grep -v '^$' | sort -u)
test "$actual" = "$expected"
