# 0013 — Tests run real code and fake only the platform

Date: 2026-11-04 · Status: accepted

## Context
Agents write most of the code, and an agent's report is not evidence that the code works. Tests that mock the
project's own logic, or copy it into fixtures, pass while the product is broken.

## Decision
- Tests import and run real product code.
- Only the platform is faked: network, clock, storage, `gh`, and the provider at the SDK boundary.
- Each story has one end-to-end journey test (Playwright on Electron).
- Rule variants are covered by fast unit and integration tests.
- Integration tests use real git repos in temp directories.
- Each acceptance criterion links the test that proves it.
- Every bug fix starts with a regression test that fails before the fix.
- Assertions are never weakened to make a test pass.

## Consequences
- Code must take platform dependencies as parameters so they can be faked (see `docs/coding-standards.md`).
- E2e tests run on Windows and Linux (ADR 0009).
- "Proven" evidence (ADR 0004) can be trusted.
