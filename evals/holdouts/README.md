# Holdout Commitments

This directory contains non-revealing commitment records only. Holdout tasks,
fixtures, oracles (including their deterministic rules), and expected outcomes
live in the separately permissioned control root.

A valid commitment must conform to `holdout-commitment.schema.json`, hash the
canonical sealed bundle, and be committed before Adapter implementation begins.
It discloses only a coarse coverage summary that cannot reconstruct answers.

There is intentionally no commitment file yet: the repository has no `HEAD`, so
`authoringBaseRevision` cannot be recorded truthfully. Until an evaluator steward
seals a holdout bundle and the owner commits its commitment, Slice 1 is not
frozen and Slice 2 remains closed.
