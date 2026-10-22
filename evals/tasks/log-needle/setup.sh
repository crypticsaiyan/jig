# generates logs/app.log (20k lines) in the work folder
bun "$(dirname "$0")/gen-log.ts"
