<!--
Thanks for contributing! Fill in the summary, link the issue, and tick the checklist.
See CONTRIBUTING.md for project conventions.
-->

## Summary

<!-- What does this change and why? -->

Closes #

## Checklist

- [ ] Tests added or updated (`npm test` passes)
- [ ] `npm run build` and `npm run lint` pass
- [ ] If tools changed: ran `npm run gen:docs` and committed the regenerated README
      table + `bundle/manifest.json` (CI fails on drift)
- [ ] No secrets or real customer data in the diff — test fixtures use `@example.com`
      and placeholder tokens/IDs
- [ ] Any new destructive tool both calls `destructiveOperationGuard()` as its first
      statement **and** declares `destructive: true` on its tool def
- [ ] Docs updated if behavior or configuration changed

## Notes for reviewers

<!-- Anything reviewers should focus on, trade-offs, or follow-ups. Optional. -->
