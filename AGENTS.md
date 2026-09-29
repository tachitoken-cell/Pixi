# Production releases

- Deploy normal game releases only through `.github/workflows/production.yml`: push or merge to `main`, or run that workflow on `main`.
- Let the workflow give each realm its five-minute player warning and complete its final save before replacement. Do not push directly to `production`, trigger BBA manually, or deploy from a host for normal releases.
- Verify the completed GitHub run and the expected release, health, configuration, assets, and WebSockets on EU, US, and Asia before reporting deployment complete.
- Manual host rollout is reserved for emergency recovery explicitly authorized by the user. Preserve player data, final-save checks, and backups. See `deploy/PRODUCTION.md` and `deploy/ovh/README.md`.

# Wiki and patch notes

- Include player-facing changes in `wiki/patch-notes.json` with the gameplay change. Review affected guide prose in `wiki/data.ts` against the implemented behavior and run `npm run check:wiki`; imported catalogs rebuild from game source.
- The production workflow publishes the wiki from the same revision only after all three realms are verified. Wiki publishing uses the separate `mossvale-wiki` Worker and cannot restart the game. See `wiki/README.md` for the required CI secret and wiki-only recovery.
